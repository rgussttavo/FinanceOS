import { buildSeedCategories } from './categories';
import { buildDemoData, DEMO_SPACE_ID } from './demo';
import { db, deleteRecord, getSyncState, putRecord, setSyncState } from './db';
import { todayIso } from './dates';
import { nowInstant } from './dates';
import type { Settings, Space } from './types';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const LOCAL_OWNER = 'local';

/**
 * Garante que existe um espaco utilizavel neste aparelho.
 *
 * O app funciona inteiro antes de qualquer login: a pessoa abre, lanca e ja
 * tem valor. Entrar na conta depois so amarra este espaco local ao usuario da
 * nuvem — nada do que ela fez se perde nesse caminho. Exigir cadastro antes de
 * mostrar utilidade e o jeito mais eficiente de perder alguem na porta.
 */
/**
 * Duas chamadas ao mesmo tempo precisam virar uma.
 *
 * O React roda os efeitos duas vezes em desenvolvimento, e as duas chamadas
 * chegavam juntas em "não existe espaço" — criando um cada, com um jogo
 * completo de categorias para cada. Guardar a promessa em andamento faz a
 * segunda chamada esperar a primeira em vez de repetir o trabalho.
 */
let inFlight: Promise<Space> | null = null;

export function ensureSpace(): Promise<Space> {
  if (!inFlight) {
    inFlight = provision().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function provision(): Promise<Space> {
  const d = db();
  const state = await getSyncState();

  if (state.spaceId) {
    const existing = await d.spaces.get(state.spaceId);
    if (existing) {
      await consolidateDuplicates(existing.id);
      return existing;
    }
  }

  /**
   * A criação acontece dentro de uma transação que também confere de novo.
   *
   * A promessa acima resolve a corrida dentro desta aba; a transação resolve a
   * corrida entre duas abas abertas ao mesmo tempo, onde cada uma tem a própria
   * cópia deste módulo.
   */
  const space = await d.transaction('rw', d.spaces, async () => {
    const existing = await d.spaces.toCollection().first();
    if (existing) return existing;

    const at = nowInstant();
    const fresh: Space = {
      id: uid(),
      ownerId: LOCAL_OWNER,
      name: 'Meu dinheiro',
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    };
    await d.spaces.put(fresh);
    return fresh;
  });

  await setSyncState({ spaceId: space.id });
  await seedSpace(space.id);
  await consolidateDuplicates(space.id);
  return space;
}

/**
 * Limpa espaços duplicados deixados por uma corrida anterior.
 *
 * Um espaço nascido de corrida só tem as sementes: nenhuma tela chegou a
 * escrever nele. Então, se o duplicado tiver qualquer coisa de verdade —
 * lançamento, cartão, meta —, ele fica intocado e o conserto vira assunto da
 * pessoa. Apagar dado de alguém para arrumar bug meu seria pior que o bug.
 */
async function consolidateDuplicates(keepId: string): Promise<void> {
  const d = db();
  const extras = (await d.spaces.toArray()).filter((s) => s.id !== keepId && !s.deletedAt);
  if (!extras.length) return;

  for (const extra of extras) {
    const real =
      (await d.entries.where('spaceId').equals(extra.id).count()) +
      (await d.cards.where('spaceId').equals(extra.id).count()) +
      (await d.goals.where('spaceId').equals(extra.id).count()) +
      (await d.debts.where('spaceId').equals(extra.id).count()) +
      (await d.subscriptions.where('spaceId').equals(extra.id).count());

    if (real > 0) continue; // tem conteúdo de verdade: não é duplicata de corrida

    // as sementes do duplicado são cópias exatas das que ficam; some com elas
    for (const row of await d.categories.where('spaceId').equals(extra.id).toArray()) {
      await deleteRecord('categories', row.id);
    }
    for (const row of await d.settings.where('spaceId').equals(extra.id).toArray()) {
      await deleteRecord('settings', row.id);
    }
    await d.spaces.put({ ...extra, deletedAt: nowInstant() });
  }
}


/** categorias e preferencias iniciais de um espaco recem-criado */
async function seedSpace(spaceId: string): Promise<void> {
  const d = db();

  const already = await d.categories.where('spaceId').equals(spaceId).count();
  if (already === 0) {
    // passa por putRecord para as sementes tambem entrarem na fila de sync:
    // quando a pessoa criar conta depois, as categorias sobem junto com o resto
    const categories = buildSeedCategories(spaceId, () => uid());
    for (const category of categories) await putRecord('categories', category);
  }

  const settings = await d.settings.where('spaceId').equals(spaceId).first();
  if (!settings) {
    const at = nowInstant();
    const fresh: Settings = {
      id: uid(),
      spaceId,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      theme: 'system',
      privateMode: false,
      monthStartsOn: 1,
      onboardedAt: null,
      displayName: '',
      bio: '',
      birthDate: null,
      location: '',
      phone: '',
      cardsEnabled: true,
      newsEnabled: true,
    };
    await putRecord('settings', fresh);
  }
}

/**
 * Monta o exemplo do zero, a partir do dia de hoje.
 *
 * Roda a cada entrada no modo demonstração: o exemplo não acumula o que a
 * pessoa mexeu da última vez, e as datas acompanham o calendário. Escreve
 * direto nas tabelas, sem fila de sincronização — nada daqui sobe para lugar
 * nenhum.
 */
export async function provisionDemo(): Promise<Space> {
  const d = db();
  const data = buildDemoData(todayIso());
  const at = nowInstant();
  const space: Space = { id: DEMO_SPACE_ID, ownerId: LOCAL_OWNER, name: 'Exemplo', createdAt: at, updatedAt: at, deletedAt: null };

  await d.transaction('rw', d.tables, async () => {
    for (const table of d.tables) await table.clear();
    await d.spaces.put(space);
    await d.categories.bulkPut(data.categories);
    await d.entries.bulkPut(data.entries);
    await d.cards.bulkPut(data.cards);
    await d.subscriptions.bulkPut(data.subscriptions);
    await d.goals.bulkPut(data.goals);
    await d.debts.bulkPut(data.debts);
    await d.assets.bulkPut(data.assets);
    await d.settings.put(data.settings);
    await d.syncState.put({ id: 'singleton', pulledAt: null, lastPushAt: null, spaceId: space.id, userId: null });
  });

  return space;
}
