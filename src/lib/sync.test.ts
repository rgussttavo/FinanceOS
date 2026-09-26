import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeServer } from '@/test/fake-supabase';

/**
 * Dois aparelhos e um servidor.
 *
 * Cada aparelho é uma base local própria (a mesma troca que o modo
 * demonstração usa); o servidor é o falso em memória. O que se prova aqui é o
 * que a pessoa sente: o que foi feito num aparelho aparece inteiro no outro, e
 * nenhum dos dois apaga o trabalho do outro.
 */

const server = vi.hoisted(() => ({ current: null as FakeServer | null }));

vi.mock('./supabase', () => ({
  cloudConfigured: () => true,
  RECEIPTS_BUCKET: 'receipts',
  supabase: () => server.current?.client() ?? null,
  requireSupabase: () => {
    if (!server.current) throw new Error('sem servidor');
    return server.current.client();
  },
}));

import { db, putRecord, putRecords, selectDatabase } from './db';
import { runSync } from './sync';
import type { Entry } from './types';

const SPACE = 'espaco-1';
let seq = 0;

function entry(description: string, amount = 1000): Entry {
  seq += 1;
  const at = new Date().toISOString();
  return {
    id: `e-${seq}-${Math.random().toString(36).slice(2, 8)}`,
    spaceId: SPACE,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    kind: 'out',
    description,
    amount,
    date: '2026-09-10',
    categoryId: null,
    accountId: null,
    cardId: null,
    repeat: { kind: 'once' },
    settled: {},
    notes: '',
    tags: [],
    source: 'manual',
    externalId: null,
    attachmentIds: [],
  };
}

async function device(name: string) {
  selectDatabase(name);
  const state = await db().syncState.get('singleton');
  if (!state) await db().syncState.put({ id: 'singleton', pulledAt: null, lastPushAt: null, spaceId: SPACE, userId: 'u1' });
}

async function sync(name: string) {
  await device(name);
  const report = await runSync();
  expect(report.error).toBeNull();
  return report;
}

const liveEntries = async () => (await db().entries.toArray()).filter((e) => !e.deletedAt);

beforeEach(async () => {
  server.current = new FakeServer();
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  // bases novas a cada teste
  for (const name of ['aparelho-a', 'aparelho-b']) {
    selectDatabase(name);
    await db().delete();
    selectDatabase('reset');
    selectDatabase(name);
  }
});

afterEach(() => {
  vi.useRealTimers();
});

for (const lww of [false, true])
describe(`sincronização entre aparelhos (servidor ${lww ? 'com' : 'sem'} a guarda da 0005)`, () => {
  beforeEach(() => {
    (server.current as FakeServer).lww = lww;
  });

  it('um lançamento feito em A aparece em B', async () => {
    await device('aparelho-a');
    await putRecord('entries', entry('Mercado'));
    await sync('aparelho-a');
    await sync('aparelho-b');
    expect((await liveEntries()).map((e) => e.description)).toEqual(['Mercado']);
  });

  it('um extrato grande chega inteiro ao outro aparelho', async () => {
    // 300 lançamentos, depois um import de 800: o servidor carimba cada lote
    // com uma hora só, e a página do pull corta no meio de um lote
    await device('aparelho-a');
    await putRecords('entries', Array.from({ length: 300 }, (_, i) => entry(`antigo ${i}`)));
    await sync('aparelho-a');
    await device('aparelho-a');
    await putRecords('entries', Array.from({ length: 800 }, (_, i) => entry(`extrato ${i}`)));
    await sync('aparelho-a');

    await sync('aparelho-b');
    expect(await liveEntries()).toHaveLength(1100);
  });

  it('o aparelho que ficou offline não apaga a edição mais nova do outro', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));

    await device('aparelho-a');
    const original = await putRecord('entries', entry('Aluguel', 150000));
    await sync('aparelho-a');
    await sync('aparelho-b');

    // A edita às 10:05, offline
    vi.setSystemTime(new Date('2026-09-24T10:05:00Z'));
    await device('aparelho-a');
    const inA = (await db().entries.get(original.id)) as Entry;
    await putRecord('entries', { ...inA, amount: 160000, description: 'Aluguel (editado em A)' });

    // B edita às 10:10 e sincroniza
    vi.setSystemTime(new Date('2026-09-24T10:10:00Z'));
    await device('aparelho-b');
    const inB = (await db().entries.get(original.id)) as Entry;
    await putRecord('entries', { ...inB, amount: 170000, description: 'Aluguel (editado em B)' });
    await sync('aparelho-b');

    // A volta a ter rede
    vi.setSystemTime(new Date('2026-09-24T10:15:00Z'));
    await sync('aparelho-a');
    await sync('aparelho-b');

    // vale a última edição, e os dois aparelhos concordam com o servidor
    const serverRow = [...(server.current as FakeServer).rows.values()].find((r) => r.id === original.id);
    expect(serverRow?.data.description).toBe('Aluguel (editado em B)');
    await device('aparelho-a');
    expect((await db().entries.get(original.id))?.description).toBe('Aluguel (editado em B)');
    await device('aparelho-b');
    expect((await db().entries.get(original.id))?.description).toBe('Aluguel (editado em B)');
  });

  it('a edição feita offline sobe quando é a mais nova', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    await device('aparelho-a');
    const original = await putRecord('entries', entry('Luz', 20000));
    await sync('aparelho-a');
    await sync('aparelho-b');

    vi.setSystemTime(new Date('2026-09-24T10:20:00Z'));
    await device('aparelho-a');
    await putRecord('entries', { ...((await db().entries.get(original.id)) as Entry), amount: 21450 });
    await sync('aparelho-a');
    await sync('aparelho-b');
    expect((await db().entries.get(original.id))?.amount).toBe(21450);
  });

  it('excluir em um aparelho exclui no outro', async () => {
    await device('aparelho-a');
    const e = await putRecord('entries', entry('Assinatura cancelada'));
    await sync('aparelho-a');
    await sync('aparelho-b');
    const { deleteRecord } = await import('./db');
    await device('aparelho-b');
    await deleteRecord('entries', e.id);
    await sync('aparelho-b');
    await sync('aparelho-a');
    expect(await liveEntries()).toHaveLength(0);
  });

  it('sincronizar duas vezes não duplica nada', async () => {
    await device('aparelho-a');
    await putRecords('entries', Array.from({ length: 20 }, (_, i) => entry(`linha ${i}`)));
    await sync('aparelho-a');
    await sync('aparelho-a');
    await sync('aparelho-b');
    await sync('aparelho-b');
    expect(await liveEntries()).toHaveLength(20);
    expect((server.current as FakeServer).rows.size).toBe(20);
  });
});

describe('troca de versão (FIN-004)', () => {
  beforeEach(() => {
    (server.current as FakeServer).lww = true;
  });

  it('aparelho que rodou a versão sem transferências recebe as que pulou, depois de atualizar', async () => {
    const { transfer, account } = await import('@/test/build');
    await device('aparelho-a');
    const a = await putRecord('accounts', account({ id: 'c1', spaceId: SPACE, primary: true }));
    const b = await putRecord('accounts', account({ id: 'c2', spaceId: SPACE }));
    await putRecord('transfers', transfer({ kind: 'account', amount: 30000, date: '2026-09-10', fromAccountId: a.id, toAccountId: b.id, spaceId: SPACE }));
    await sync('aparelho-a');

    // B rodou a versão antiga: desceu as contas, pulou a transferência (coleção
    // que ela não conhecia) e guardou uma marca d'água posterior a ela
    const rows = [...(server.current as FakeServer).rows.values()];
    const last = rows.map((r) => r.updated_at).sort().at(-1) as string;
    selectDatabase('aparelho-b');
    for (const r of rows) if (r.collection === 'accounts') await db().accounts.put(r.data as never);
    const later = new Date(Date.parse(last) + 10 * 60_000).toISOString();
    await db().syncState.put({ id: 'singleton', pulledAt: later, lastPushAt: null, spaceId: SPACE, userId: 'u1' });

    await sync('aparelho-b');
    expect(await db().transfers.count()).toBe(1);
  });

  it('a releitura completa acontece uma vez só, não a cada sincronização', async () => {
    await device('aparelho-a');
    await putRecords('entries', Array.from({ length: 5 }, (_, i) => entry(`linha ${i}`)));
    await sync('aparelho-a');
    await sync('aparelho-b');
    const first = await sync('aparelho-b');
    expect(first.pulled).toBe(0);
  });
});

describe('entrar numa conta que já existe (FIN-006, FIN-007)', () => {
  const REMOTE = 'espaco-da-nuvem';

  async function aparelhoNovo(name: string) {
    selectDatabase(name);
    await db().delete();
    selectDatabase(`${name}-reset`);
    selectDatabase(name);
    const { ensureSpace } = await import('./provision');
    const { ensurePrimaryAccount } = await import('./accounts');
    const local = await ensureSpace();
    const principal = await ensurePrimaryAccount(local.id);
    (server.current as FakeServer).existingSpace = { id: REMOTE, name: 'Meu dinheiro' };
    return { local, principal };
  }

  it('FIN-006: contas e transferências locais não são apagadas ao entrar', async () => {
    const { local, principal } = await aparelhoNovo('entrar-1');
    const { account, transfer } = await import('@/test/build');
    const poupanca = await putRecord('accounts', account({ spaceId: local.id, name: 'Poupança', openingBalance: 100000, openingDate: '2026-09-01' }));
    await putRecord('transfers', transfer({ spaceId: local.id, kind: 'account', amount: 30000, date: '2026-09-10', fromAccountId: principal.id, toAccountId: poupanca.id }));

    const { adoptLocalSpace } = await import('./sync');
    await adoptLocalSpace('u1');

    const accounts = (await db().accounts.toArray()).filter((a) => !a.deletedAt);
    const transfers = (await db().transfers.toArray()).filter((t) => !t.deletedAt);
    expect(accounts.map((a) => [a.name, a.spaceId])).toEqual([['Poupança', REMOTE]]);
    expect(transfers).toHaveLength(1);
    // o lado da principal deste aparelho passa a ser a principal da nuvem
    expect(transfers[0]).toMatchObject({ spaceId: REMOTE, fromAccountId: null, toAccountId: poupanca.id });
  });

  it('FIN-007: a principal deste aparelho não vira uma segunda principal na nuvem', async () => {
    const { local, principal } = await aparelhoNovo('entrar-2');
    await putRecord('accounts', { ...principal, openingBalance: 500000, openingDate: '2026-09-20' });
    await putRecord('entries', { ...entry('Mercado'), spaceId: local.id, accountId: principal.id });
    await putRecord('entries', { ...entry('Padaria'), spaceId: local.id, accountId: null });

    const { adoptLocalSpace } = await import('./sync');
    await adoptLocalSpace('u1');

    const accounts = (await db().accounts.toArray()).filter((a) => !a.deletedAt);
    expect(accounts.filter((a) => a.primary)).toHaveLength(0); // a principal é a da nuvem, que desce no pull
    expect(accounts.find((a) => a.id === principal.id)).toBeUndefined();
    const entries = (await db().entries.toArray()).filter((e) => !e.deletedAt);
    expect(entries.map((e) => [e.description, e.spaceId, e.accountId])).toEqual([
      ['Mercado', REMOTE, null],
      ['Padaria', REMOTE, null],
    ]);
  });

  it('aparelho sem nada além do começo padrão continua sendo descartado', async () => {
    await aparelhoNovo('entrar-3');
    const { adoptLocalSpace } = await import('./sync');
    await adoptLocalSpace('u1');
    expect((await db().accounts.toArray()).filter((a) => !a.deletedAt)).toHaveLength(0);
    expect((await db().entries.toArray()).filter((e) => !e.deletedAt)).toHaveLength(0);
  });
});
