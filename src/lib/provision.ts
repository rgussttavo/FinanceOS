import { buildSeedCategories } from './categories';
import { db, getSyncState, putRecord, setSyncState } from './db';
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
export async function ensureSpace(): Promise<Space> {
  const d = db();
  const state = await getSyncState();

  if (state.spaceId) {
    const existing = await d.spaces.get(state.spaceId);
    if (existing) return existing;
  }

  const anySpace = await d.spaces.toCollection().first();
  if (anySpace) {
    await setSyncState({ spaceId: anySpace.id });
    return anySpace;
  }

  const at = nowInstant();
  const space: Space = {
    id: uid(),
    ownerId: LOCAL_OWNER,
    name: 'Meu dinheiro',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };

  await d.spaces.put(space);
  await setSyncState({ spaceId: space.id });
  await seedSpace(space.id);
  return space;
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
