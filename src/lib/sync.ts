'use client';

import { applyRemote, db, getSyncState, liveRows, setSyncState } from './db';
import { requireSupabase, supabase, type CloudRecord } from './supabase';
import type { Mutation, SyncTable } from './types';

/**
 * Sincronização incremental.
 *
 * Duas metades independentes:
 *
 *   push   drena a fila de mutações que a UI deixou ao gravar
 *   pull   traz o que mudou no servidor desde a última marca d'água
 *
 * Nenhuma delas manda o documento inteiro. O CentavOS reenvia toda a conta a
 * cada gravação, e é por isso que ele precisa resolver conflito no documento
 * completo; aqui cada registro viaja sozinho, e dois aparelhos mexendo em
 * coisas diferentes nunca colidem.
 *
 * A marca d'água é a hora do SERVIDOR, não a do aparelho. Relógio de celular
 * erra, e uma marca d'água baseada nele faria o aparelho parar de receber
 * mudanças sem nenhum aviso.
 */

const TABLES: SyncTable[] = [
  'categories',
  'accounts',
  'cards',
  'entries',
  'subscriptions',
  'goals',
  'debts',
  'splits',
  'budgets',
  'assets',
  'attachments',
  'folders',
  'settings',
];

const PAGE = 500;

export type SyncPhase = 'idle' | 'pushing' | 'pulling' | 'done' | 'offline' | 'error';

export interface SyncReport {
  phase: SyncPhase;
  pushed: number;
  pulled: number;
  error: string | null;
  at: string;
}

const idle: SyncReport = { phase: 'idle', pushed: 0, pulled: 0, error: null, at: '' };

/* ------------------------------------------------------------------ push */

/**
 * Sobe as mutações pendentes, na ordem em que aconteceram.
 *
 * A ordem importa: criar e depois apagar tem que chegar nessa sequência, senão
 * o registro ressuscita. Por isso o envio é sequencial por lote e a fila só é
 * limpa depois da confirmação — falhou no meio, o que sobrou tenta de novo.
 */
async function push(spaceId: string): Promise<number> {
  const client = requireSupabase();
  const d = db();
  let sent = 0;

  for (;;) {
    const batch: Mutation[] = await d.mutations.orderBy('seq').limit(PAGE).toArray();
    if (!batch.length) break;

    // o mesmo registro pode ter várias mutações na fila; vale a última
    const byRecord = new Map<string, Mutation>();
    for (const mutation of batch) byRecord.set(`${mutation.table}:${mutation.recordId}`, mutation);

    const rows = [...byRecord.values()].map((mutation) => ({
      space_id: spaceId,
      collection: mutation.table,
      id: mutation.recordId,
      data: mutation.payload,
      deleted_at:
        mutation.op === 'delete'
          ? ((mutation.payload.deletedAt as string | null) ?? new Date().toISOString())
          : ((mutation.payload.deletedAt as string | null) ?? null),
    }));

    const { error } = await client
      .from('records')
      .upsert(rows, { onConflict: 'space_id,collection,id' });

    if (error) throw new Error(error.message);

    const seqs = batch.map((m) => m.seq).filter((s): s is number => typeof s === 'number');
    await d.mutations.bulkDelete(seqs);
    sent += rows.length;

    if (batch.length < PAGE) break;
  }

  return sent;
}

/* ------------------------------------------------------------------ pull */

/**
 * Traz o que mudou desde a última marca d'água.
 *
 * O `data` de cada linha carrega o registro como o outro aparelho o conhece,
 * com o `updatedAt` local dele dentro. É esse campo que decide quem vence —
 * a coluna do servidor serve só para saber até onde já se leu.
 */
async function pull(spaceId: string, since: string | null): Promise<{ applied: number; watermark: string | null }> {
  const client = requireSupabase();

  let cursor = since;
  let applied = 0;
  let watermark = since;

  for (;;) {
    let query = client
      .from('records')
      .select('space_id, collection, id, data, updated_at, deleted_at')
      .eq('space_id', spaceId)
      .order('updated_at', { ascending: true })
      .limit(PAGE);

    if (cursor) query = query.gt('updated_at', cursor);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as CloudRecord[];
    if (!rows.length) break;

    // agrupa por coleção para gravar cada tabela local numa transação só
    const byCollection = new Map<SyncTable, Record<string, unknown>[]>();
    for (const row of rows) {
      const collection = row.collection as SyncTable;
      if (!TABLES.includes(collection)) continue;
      const list = byCollection.get(collection) ?? [];
      list.push(row.data);
      byCollection.set(collection, list);
    }

    for (const [collection, records] of byCollection) {
      applied += await applyRemote(
        collection,
        records as { id: string; spaceId: string; updatedAt: string; deletedAt: string | null }[],
      );
    }

    watermark = rows[rows.length - 1].updated_at;
    cursor = watermark;

    if (rows.length < PAGE) break;
  }

  return { applied, watermark };
}

/* --------------------------------------------------------------- anexos */

/**
 * Sobe os arquivos de comprovante que ainda só existem neste aparelho.
 *
 * É a parte que o CentavOS não faz: lá só o nome do comprovante viaja, e a
 * foto fica presa no celular onde foi tirada — então "achei o IPVA em
 * segundos" só vale no aparelho que guardou. Aqui o arquivo vai junto.
 *
 * O caminho começa com o id do espaço porque é assim que a política do Storage
 * decide quem pode ler: sem o espaço no caminho, não há como autorizar sem
 * consultar o banco a cada download.
 */
async function pushAttachments(spaceId: string): Promise<number> {
  const client = requireSupabase();
  const d = db();

  const pendentes = (await liveRows<{ id: string; spaceId: string; uploaded: boolean; mime: string; updatedAt: string; deletedAt: string | null }>(
    'attachments',
    spaceId,
  )).filter((a) => !a.uploaded);

  let sent = 0;

  for (const attachment of pendentes) {
    const file = await d.files.get(attachment.id);
    if (!file) continue; // metadado sem arquivo: veio de outro aparelho

    const path = `${spaceId}/${attachment.id}`;
    const { error } = await client.storage
      .from('receipts')
      .upload(path, file.blob, { contentType: attachment.mime, upsert: true });

    // arquivo já lá é sucesso, não erro
    if (error && !/exists/i.test(error.message)) continue;

    const row = await d.attachments.get(attachment.id);
    if (row) await d.attachments.put({ ...row, storagePath: path, uploaded: true });
    sent += 1;
  }

  return sent;
}

/**
 * Baixa um comprovante que veio de outro aparelho.
 *
 * Sob demanda, não no sync: baixar todas as fotos de uma conta antiga na
 * primeira abertura gastaria dados de quem talvez nunca abra nenhuma.
 */
export async function fetchAttachment(spaceId: string, attachmentId: string): Promise<Blob | null> {
  const client = supabase();
  if (!client) return null;

  const { data, error } = await client.storage.from('receipts').download(`${spaceId}/${attachmentId}`);
  if (error || !data) return null;

  await db().files.put({ id: attachmentId, blob: data, savedAt: new Date().toISOString() });
  return data;
}

/* ------------------------------------------------------------------ ciclo */

/** roda um ciclo completo; devolve o que aconteceu, sem lançar */
export async function runSync(): Promise<SyncReport> {
  const at = new Date().toISOString();
  const client = supabase();
  if (!client) return { ...idle, phase: 'offline', at };

  const state = await getSyncState();
  if (!state.spaceId || !state.userId) return { ...idle, phase: 'offline', at };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ...idle, phase: 'offline', at };
  }

  try {
    const pushed = await push(state.spaceId);
    // os arquivos vão depois dos metadados: assim nenhum comprovante fica no
    // Storage sem o registro que diz de quem ele é
    await pushAttachments(state.spaceId);
    const { applied, watermark } = await pull(state.spaceId, state.pulledAt);

    await setSyncState({ pulledAt: watermark, lastPushAt: at });
    return { phase: 'done', pushed, pulled: applied, error: null, at };
  } catch (err: unknown) {
    return {
      ...idle,
      phase: 'error',
      error: err instanceof Error ? err.message : 'Falha ao sincronizar.',
      at,
    };
  }
}

/* --------------------------------------------------------- primeiro login */

/**
 * Liga o espaço local à conta recém-autenticada.
 *
 * O ponto delicado é o que já existe no aparelho. Quem usou o app antes de
 * criar conta tem lançamentos, categorias e cartões locais — e perdê-los no
 * login seria o pior momento possível para perder dados. Então tudo que está
 * local é enfileirado para subir, e só depois o pull começa.
 */
export async function adoptLocalSpace(userId: string): Promise<void> {
  const client = requireSupabase();
  const state = await getSyncState();
  const d = db();

  const local = state.spaceId ? await d.spaces.get(state.spaceId) : await d.spaces.toCollection().first();
  if (!local) throw new Error('Não encontrei o espaço local para vincular.');

  const { error } = await client.rpc('create_space', {
    space_id: local.id,
    space_name: local.name,
  });
  if (error) throw new Error(error.message);

  await d.spaces.put({ ...local, ownerId: userId });
  await setSyncState({ spaceId: local.id, userId });

  // nada do que já existe aqui pode ficar para trás
  await queueEverything(local.id);
}

/** coloca todo o conteúdo local na fila, para o primeiro sync levar tudo */
async function queueEverything(spaceId: string): Promise<void> {
  const d = db();
  const now = new Date().toISOString();

  for (const table of TABLES) {
    const rows = await liveRows<{ id: string; spaceId: string; updatedAt: string; deletedAt: string | null }>(
      table,
      spaceId,
    );
    if (!rows.length) continue;

    await d.mutations.bulkAdd(
      rows.map((row) => ({
        table,
        op: 'put' as const,
        recordId: row.id,
        payload: row as unknown as Record<string, unknown>,
        queuedAt: now,
        attempts: 0,
        lastError: null,
      })),
    );
  }
}

/**
 * Desliga a conta neste aparelho.
 *
 * Os dados locais ficam. Sair da conta não é apagar o que é seu — e quem quer
 * apagar tem o botão próprio nas configurações, que diz o que faz.
 */
export async function detachCloud(): Promise<void> {
  const client = supabase();
  if (client) await client.auth.signOut();
  await setSyncState({ userId: null, pulledAt: null });
}
