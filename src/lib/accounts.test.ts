import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPACE, account, card, entry, paid } from '@/test/build';
import { ensurePrimaryAccount, loadLedger, makePrimary, primaryIdFor, removeAccount } from './accounts';
import { db, selectDatabase } from './db';
import { auditAccount, balancesAt, plannedItems } from './ledger';
import type { Account } from './types';

/**
 * A conta principal (FIN-013, FIN-015, FIN-016).
 *
 * Ela responde pelo que não diz de qual conta é: tudo o que foi lançado antes
 * de existirem contas, a fatura de todo cartão. Trocar a principal não pode
 * mudar o passado de nenhuma conta, e ela não pode sumir levando esse
 * dinheiro para outra.
 */

const TODAY = '2026-09-27';
let dbCount = 0;

beforeEach(async () => {
  selectDatabase(`principal-${++dbCount}`);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`)); // meio-dia em Brasília
});

afterEach(() => {
  vi.useRealTimers();
});

async function saldos() {
  const ledger = await loadLedger(SPACE);
  return Object.fromEntries(balancesAt(ledger, TODAY).accounts.map((r) => [r.account.name, r.balance]));
}

const fresh = async (a: Account) => (await db().accounts.get(a.id)) as Account;

describe('a principal não sai (FIN-013, FIN-015)', () => {
  it('nem sendo a única conta', async () => {
    const principal = account({ id: primaryIdFor(SPACE), name: 'Principal', primary: true });
    await db().accounts.put(principal);
    await expect(removeAccount(principal)).rejects.toThrow('A conta principal não pode ser excluída');
    expect((await fresh(principal)).deletedAt).toBeNull();
  });

  it('com lançamentos sem conta: recusa, e o dinheiro não vai para a outra conta', async () => {
    const principal = account({ id: primaryIdFor(SPACE), name: 'Principal', primary: true });
    const poupanca = account({ name: 'Poupança', openingBalance: 50000, openingDate: '2026-09-01' });
    await db().accounts.bulkPut([principal, poupanca]);
    await db().entries.bulkPut([paid('in', 100000, '2026-09-02'), paid('out', 20000, '2026-09-05')]);
    expect(await saldos()).toEqual({ Principal: 80000, Poupança: 50000 });

    // antes: a principal era excluída e a Poupança passava a R$ 1.300
    await expect(removeAccount(principal)).rejects.toThrow();
    expect(await saldos()).toEqual({ Principal: 80000, Poupança: 50000 });

    // outra vira a principal; aí a antiga sai arquivada, com o que era dela
    await makePrimary(poupanca);
    expect(await removeAccount(await fresh(principal))).toBe('archived');
    expect(await saldos()).toEqual({ Principal: 80000, Poupança: 50000 });
  });

  it('conta que nunca foi principal e não tem nada continua sendo excluída', async () => {
    const principal = account({ id: primaryIdFor(SPACE), name: 'Principal', primary: true });
    const vazia = account({ name: 'Vazia' });
    await db().accounts.bulkPut([principal, vazia]);
    await db().entries.put(paid('out', 20000, '2026-09-05'));
    expect(await removeAccount(vazia)).toBe('deleted');
  });
});

describe('trocar a principal não muda o passado (FIN-016)', () => {
  async function cenario() {
    const principal = account({
      id: primaryIdFor(SPACE),
      name: 'Principal',
      primary: true,
      openingBalance: 100000,
      openingDate: '2026-09-01',
      // conferida com o extrato: 1.000 − 200 − 300 da fatura
      checkpoints: [{ date: '2026-09-20', amount: 50000, source: 'extrato', at: '2026-09-20T12:00:00.000Z' }],
    });
    const nova = account({ name: 'Nova', openingBalance: 0, openingDate: '2026-09-01' });
    const cartao = card({ name: 'Cartão', accountId: null, closingDay: 25, dueDay: 5 });
    await db().accounts.bulkPut([principal, nova]);
    await db().cards.put(cartao);
    await db().entries.bulkPut([
      paid('out', 20000, '2026-09-05', { description: 'Mercado' }),
      // fatura que fechou em 25/08 e venceu em 05/09, paga "pela principal"
      paid('out', 30000, '2026-08-20', { description: 'Compra no cartão', cardId: cartao.id }),
      // hoje, antes da troca: também fica
      paid('out', 5000, TODAY, { description: 'Padaria' }),
      // depois da troca, o que não diz a conta vai para a nova
      entry('out', 10000, '2026-10-05', { description: 'Conta de luz' }),
    ]);
    return { principal, nova };
  }

  it('saldos e conferência com o extrato ficam onde estavam', async () => {
    const { principal, nova } = await cenario();
    expect(await saldos()).toEqual({ Principal: 45000, Nova: 0 });

    await makePrimary(nova);

    // antes: Principal R$ 1.000, com R$ 500 de diferença no extrato de 20/09; Nova −R$ 550
    expect(await saldos()).toEqual({ Principal: 45000, Nova: 0 });
    const ledger = await loadLedger(SPACE);
    expect(auditAccount(ledger, principal.id).checkpoints).toEqual([
      expect.objectContaining({ date: '2026-09-20', declared: 50000, computed: 50000, diff: 0 }),
    ]);
    // o que vem depois da troca sem dizer a conta vai para a nova
    const luz = plannedItems(ledger, '2026-10-31').find((p) => p.label === 'Conta de luz');
    expect(luz?.accountId).toBe(nova.id);

    expect(await fresh(principal)).toMatchObject({ primary: false, primaryPeriods: [{ from: null, to: TODAY }] });
    expect(await fresh(nova)).toMatchObject({ primary: true, primaryPeriods: [{ from: '2026-09-28', to: null }] });
  });

  it('trocar e destrocar no mesmo dia não deixa rastro', async () => {
    const { principal, nova } = await cenario();
    await makePrimary(nova);
    await makePrimary(await fresh(principal));

    expect(await saldos()).toEqual({ Principal: 45000, Nova: 0 });
    const ledger = await loadLedger(SPACE);
    expect(plannedItems(ledger, '2026-10-31').find((p) => p.label === 'Conta de luz')?.accountId).toBe(principal.id);
    expect((await fresh(nova)).primaryPeriods).toEqual([]);
  });

  it('a fatura do cartão sem conta que vence depois da troca sai da nova', async () => {
    const { nova } = await cenario();
    const cartao = (await db().cards.toArray())[0];
    await db().entries.put(paid('out', 12000, '2026-09-26', { description: 'Compra depois do fechamento', cardId: cartao.id }));
    await makePrimary(nova);
    const ledger = await loadLedger(SPACE);
    const faturas = plannedItems(ledger, '2026-11-30').filter((p) => p.source === 'invoice');
    expect(faturas.length).toBeGreaterThan(0);
    expect(faturas.every((f) => f.accountId === nova.id)).toBe(true);
  });
});

describe('garantir a principal (FIN-013)', () => {
  it('sem nenhuma marcada, devolve a mesma que o livro-caixa usa: a mais antiga', async () => {
    // a ordem da base é pelo id; a do livro-caixa, pela data de criação
    const nova = account({ id: 'a-nova', name: 'Nova', createdAt: '2026-05-01T00:00:00.000Z' });
    const antiga = account({ id: 'z-antiga', name: 'Antiga', createdAt: '2026-01-01T00:00:00.000Z' });
    await db().accounts.bulkPut([nova, antiga]);
    expect((await ensurePrimaryAccount(SPACE)).id).toBe(antiga.id);
  });

  it('a principal excluída numa versão anterior volta com data de agora, para subir para a nuvem', async () => {
    const principal = account({
      id: primaryIdFor(SPACE),
      name: 'Principal',
      primary: true,
      deletedAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
    });
    await db().accounts.put(principal);

    const revived = await ensurePrimaryAccount(SPACE);
    expect(revived).toMatchObject({ id: principal.id, deletedAt: null, primary: true });
    expect(revived.updatedAt > principal.updatedAt).toBe(true);
    const queued = await db().mutations.where('recordId').equals(principal.id).toArray();
    expect(queued[queued.length - 1]?.payload).toMatchObject({ deletedAt: null });
  });
});
