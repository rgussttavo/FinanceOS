import Dexie, { type Table } from 'dexie';
import { nowInstant } from './dates';
import type {
  Account,
  Asset,
  Attachment,
  Card,
  Category,
  Budget,
  Debt,
  Entry,
  Folder,
  Goal,
  Mutation,
  Settings,
  Split,
  Space,
  SpaceMember,
  Subscription,
  SyncState,
  SyncTable,
} from './types';
import type { LearnedRule } from './categories';

/**
 * Base local do FinanceCS.
 *
 * A UI le e escreve SEMPRE aqui, nunca direto na rede. Cada escrita deixa uma
 * mutacao na fila `mutations`, e o sync drena essa fila quando houver conexao.
 *
 * E a diferenca central em relacao ao CentavOS, que mantem o documento inteiro
 * num unico item de localStorage e o reenvia por completo a cada gravacao:
 * quanto mais a conta cresce, mais pesada fica toda e qualquer alteracao, e
 * dois aparelhos escrevendo juntos sempre colidem no documento todo.
 */

/** arquivo binario de comprovante, enquanto nao subiu (ou como cache do que ja subiu) */
export interface StoredFile {
  id: string;
  blob: Blob;
  savedAt: string;
}

export class NorteDB extends Dexie {
  spaces!: Table<Space, string>;
  members!: Table<SpaceMember, string>;
  categories!: Table<Category, string>;
  accounts!: Table<Account, string>;
  cards!: Table<Card, string>;
  entries!: Table<Entry, string>;
  subscriptions!: Table<Subscription, string>;
  goals!: Table<Goal, string>;
  debts!: Table<Debt, string>;
  splits!: Table<Split, string>;
  budgets!: Table<Budget, string>;
  assets!: Table<Asset, string>;
  attachments!: Table<Attachment, string>;
  folders!: Table<Folder, string>;
  settings!: Table<Settings, string>;
  learned!: Table<LearnedRule & { id: string }, string>;
  files!: Table<StoredFile, string>;
  mutations!: Table<Mutation, number>;
  syncState!: Table<SyncState, string>;

  constructor() {
    super('norte');

    this.version(1).stores({
      spaces: 'id, ownerId, updatedAt',
      members: 'id, spaceId, userId, updatedAt',
      categories: 'id, spaceId, kind, order, updatedAt, deletedAt',
      accounts: 'id, spaceId, archived, updatedAt, deletedAt',
      cards: 'id, spaceId, archived, updatedAt, deletedAt',
      // [spaceId+date] e o indice que serve a tela do mes, que e 90% das leituras
      entries: 'id, spaceId, date, kind, categoryId, cardId, accountId, externalId, updatedAt, deletedAt, [spaceId+date]',
      subscriptions: 'id, spaceId, billingDay, canceledAt, updatedAt, deletedAt',
      attachments: 'id, spaceId, folderId, uploaded, updatedAt, deletedAt',
      folders: 'id, spaceId, order, updatedAt, deletedAt',
      settings: 'id, spaceId, updatedAt',
      learned: 'id, pattern, categoryId',
      files: 'id',
      mutations: '++seq, table, recordId, queuedAt',
      syncState: 'id',
    });

    // metas e dívidas chegaram depois da versão 1; Dexie migra sozinho quem já
    // tinha a base aberta, sem tocar no que já estava gravado
    this.version(2).stores({
      goals: 'id, spaceId, archivedAt, updatedAt, deletedAt',
      debts: 'id, spaceId, startMonth, settledAt, updatedAt, deletedAt',
    });

    this.version(3).stores({
      splits: 'id, spaceId, date, closedAt, updatedAt, deletedAt',
      budgets: 'id, spaceId, updatedAt, deletedAt',
    });

    this.version(4).stores({
      assets: 'id, spaceId, kind, updatedAt, deletedAt',
    });
  }
}

let _db: NorteDB | null = null;

/**
 * A base so existe no navegador. Chamar isto durante render de servidor e um
 * erro de uso, e falhar alto aqui evita um bug silencioso mais tarde.
 */
export function db(): NorteDB {
  if (typeof window === 'undefined') {
    throw new Error('A base local do FinanceCS só existe no navegador.');
  }
  if (!_db) _db = new NorteDB();
  return _db;
}

/* ------------------------------------------------------------------ escrita */

/** tabelas que participam do sync, mapeadas para a tabela local correspondente */
const SYNC_TABLES: Record<SyncTable, keyof NorteDB> = {
  categories: 'categories',
  accounts: 'accounts',
  cards: 'cards',
  entries: 'entries',
  subscriptions: 'subscriptions',
  goals: 'goals',
  debts: 'debts',
  splits: 'splits',
  budgets: 'budgets',
  assets: 'assets',
  attachments: 'attachments',
  folders: 'folders',
  settings: 'settings',
};

type Syncable = { id: string; spaceId: string; updatedAt: string; deletedAt: string | null };

/**
 * Grava um registro e enfileira a mutacao, numa transacao so.
 *
 * Se a gravacao entrar e a fila nao, o outro aparelho nunca ve a mudanca; se a
 * fila entrar e a gravacao nao, sobe algo que nao existe. As duas juntas ou
 * nenhuma.
 */
export async function putRecord<T extends Syncable>(table: SyncTable, record: T): Promise<T> {
  const d = db();
  const stamped = { ...record, updatedAt: nowInstant() } as T;
  const target = d[SYNC_TABLES[table]] as unknown as Table<T, string>;

  await d.transaction('rw', target, d.mutations, async () => {
    await target.put(stamped);
    await d.mutations.add({
      table,
      op: 'put',
      recordId: stamped.id,
      payload: stamped as unknown as Record<string, unknown>,
      queuedAt: nowInstant(),
      attempts: 0,
      lastError: null,
    });
  });

  return stamped;
}

/**
 * Exclusao e marca, nao remocao.
 *
 * O registro fica na base com `deletedAt` preenchido. Sem isso, um aparelho que
 * estava offline reenvia a copia velha e o item "volta sozinho" — o defeito que
 * o CentavOS precisou combater com um registro separado de lapides e prazo de
 * validade de 90 dias.
 */
export async function deleteRecord(table: SyncTable, id: string): Promise<void> {
  const d = db();
  const target = d[SYNC_TABLES[table]] as unknown as Table<Syncable, string>;

  await d.transaction('rw', target, d.mutations, async () => {
    const existing = await target.get(id);
    if (!existing) return;
    const stamped: Syncable = { ...existing, deletedAt: nowInstant(), updatedAt: nowInstant() };
    await target.put(stamped);
    await d.mutations.add({
      table,
      op: 'delete',
      recordId: id,
      payload: stamped as unknown as Record<string, unknown>,
      queuedAt: nowInstant(),
      attempts: 0,
      lastError: null,
    });
  });
}

/** desfaz uma exclusao: limpa a marca e sobe de novo */
export async function restoreRecord(table: SyncTable, id: string): Promise<void> {
  const d = db();
  const target = d[SYNC_TABLES[table]] as unknown as Table<Syncable, string>;
  const existing = await target.get(id);
  if (!existing) return;
  await putRecord(table, { ...existing, deletedAt: null });
}

/**
 * Aplica no local o que veio da nuvem, SEM enfileirar mutacao — senao o app
 * devolve ao servidor o que ele mesmo acabou de mandar, em looping.
 *
 * Quem chegou por ultimo vence, comparando `updatedAt`. O registro local que
 * ainda tem mutacao pendente e preservado: o push seguinte o levara.
 */
export async function applyRemote<T extends Syncable>(table: SyncTable, rows: T[]): Promise<number> {
  if (!rows.length) return 0;
  const d = db();
  const target = d[SYNC_TABLES[table]] as unknown as Table<T, string>;

  let applied = 0;
  await d.transaction('rw', target, d.mutations, async () => {
    const pending = new Set(
      (await d.mutations.where('table').equals(table).toArray()).map((m) => m.recordId),
    );
    for (const row of rows) {
      if (pending.has(row.id)) continue;
      const local = await target.get(row.id);
      if (local && local.updatedAt >= row.updatedAt) continue;
      await target.put(row);
      applied += 1;
    }
  });
  return applied;
}

/* --------------------------------------------------------------- leitura */

/** registros vivos de uma tabela, ja sem os excluidos */
export async function liveRows<T extends Syncable>(table: SyncTable, spaceId: string): Promise<T[]> {
  const d = db();
  const target = d[SYNC_TABLES[table]] as unknown as Table<T, string>;
  const rows = await target.where('spaceId').equals(spaceId).toArray();
  return rows.filter((r) => !r.deletedAt);
}

/**
 * Lancamentos que podem aparecer numa competencia.
 *
 * Um lancamento repetido comeca no passado e continua valendo, entao nao da
 * para filtrar por mes no indice: pega-se tudo que comecou ate o fim do mes e
 * o motor de ocorrencias decide o que de fato cai ali.
 */
export async function entriesUpTo(spaceId: string, monthKey: string): Promise<Entry[]> {
  const d = db();
  const limit = `${monthKey}-31`;
  const rows = await d.entries
    .where('[spaceId+date]')
    .between([spaceId, ''], [spaceId, limit], true, true)
    .toArray();
  return rows.filter((e) => !e.deletedAt);
}

/* --------------------------------------------------------------- arquivos */

export async function saveFile(id: string, blob: Blob): Promise<void> {
  await db().files.put({ id, blob, savedAt: nowInstant() });
}

export async function readFile(id: string): Promise<Blob | null> {
  const row = await db().files.get(id);
  return row?.blob ?? null;
}

export async function dropFile(id: string): Promise<void> {
  await db().files.delete(id);
}

/* ------------------------------------------------------------ estado sync */

export async function getSyncState(): Promise<SyncState> {
  const existing = await db().syncState.get('singleton');
  return existing ?? { id: 'singleton', pulledAt: null, lastPushAt: null, spaceId: null, userId: null };
}

export async function setSyncState(patch: Partial<Omit<SyncState, 'id'>>): Promise<SyncState> {
  const current = await getSyncState();
  const next: SyncState = { ...current, ...patch, id: 'singleton' };
  await db().syncState.put(next);
  return next;
}

export async function pendingCount(): Promise<number> {
  return db().mutations.count();
}

/** apaga tudo deste aparelho — usado no logout e no "esquecer este aparelho" */
export async function wipeLocal(): Promise<void> {
  const d = db();
  await d.delete();
  _db = null;
  void d;
}
