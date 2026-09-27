import { describe, expect, it } from 'vitest';
import { account, card, entry, paid, transfer } from '@/test/build';
import { cashSnapshot } from './cashflow';
import {
  availableLines,
  checkSpend,
  essentialAverage,
  isEssential,
  moneyToDecide,
  safetyBuffer,
  suggestBuffer,
} from './decision';
import type { LedgerInput } from './ledger';
import type { MonthSummary } from './occurrences';
import type { Category } from './types';

/**
 * Dinheiro para decidir, com o exemplo do próprio documento de produto:
 * R$ 3.420 hoje, R$ 2.180 comprometidos antes do salário, R$ 1.240
 * realmente disponíveis. Os números esperados foram feitos à mão.
 */

const category = (name: string, patch: Partial<Category> = {}): Category => ({
  id: `cat-${name}`,
  spaceId: 'espaco-teste',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  name,
  kind: 'out',
  icon: '',
  color: '',
  system: true,
  order: 0,
  budget: 0,
  ...patch,
});

const moradia = category('Moradia');
const mercado = category('Mercado');
const lazer = category('Lazer');
const farmacia = category('Farmácia', { essential: true, system: false });
const transporte = category('Transporte', { essential: false });
const salario = category('Salário', { kind: 'in' });
const categories = [moradia, mercado, lazer, farmacia, transporte, salario];

const month = (key: string, byCategory: [Category, number][], count = 10): MonthSummary => ({
  month: key,
  income: 0,
  expense: 0,
  invested: 0,
  balance: 0,
  opening: 0,
  settledIncome: 0,
  settledExpense: 0,
  pendingExpense: 0,
  overdueExpense: 0,
  byCategory: new Map(byCategory.map(([c, v]) => [c.id, v])),
  count,
});

// essencial por mês: moradia 1.000 + mercado 250 + farmácia 35 = R$ 1.285
const normal = (key: string) =>
  month(key, [
    [moradia, 100000],
    [mercado, 25000],
    [farmacia, 3500],
    [lazer, 40000],
    [transporte, 30000],
  ]);
const history = [normal('2026-06'), normal('2026-07'), normal('2026-08'), month('2026-09', [[moradia, 999999]])];

const TODAY = '2026-09-18';
const corrente = account({ name: 'Corrente', primary: true, openingBalance: 342000, openingDate: '2026-09-01' });
// fecha dia 20 e vence dia 27: a compra de hoje cai na fatura de setembro, antes do salário
const nubank = card({ name: 'Nubank', closingDay: 20, dueDay: 27, limit: 300000 });
// fecha dia 10 e vence dia 17: a compra de hoje só vence em outubro, depois do salário
const itau = card({ name: 'Itaú', closingDay: 10, dueDay: 17, limit: 200000 });

const base: LedgerInput = {
  today: TODAY,
  accounts: [corrente],
  cards: [nubank, itau],
  cardsEnabled: true,
  subscriptions: [],
  debts: [],
  transfers: [],
  entries: [
    entry('out', 150000, '2026-09-20', { description: 'Aluguel', categoryId: moradia.id }),
    entry('out', 18000, '2026-09-25', { description: 'Luz', categoryId: moradia.id }),
    paid('out', 50000, '2026-09-10', { description: 'Tênis', cardId: nubank.id, categoryId: lazer.id }),
    entry('in', 500000, '2026-09-30', { description: 'Salário', categoryId: salario.id }),
  ],
};

const cash = cashSnapshot(base);
const buffer = safetyBuffer(null, history, categories, TODAY);
const decide = moneyToDecide(base, cash, buffer);
const cardData = { entries: base.entries, subscriptions: [], transfers: [] };

describe('despesa essencial e margem de segurança', () => {
  it('essencial: a marca da pessoa vale; sem marca, o padrão pelo nome', () => {
    expect(isEssential(moradia)).toBe(true);
    expect(isEssential(mercado)).toBe(true);
    expect(isEssential(lazer)).toBe(false);
    expect(isEssential(farmacia)).toBe(true); // marcada
    expect(isEssential(transporte)).toBe(false); // desmarcada
    expect(isEssential(salario)).toBe(false); // receita nunca
  });

  it('média dos três últimos meses completos, sem o mês corrente', () => {
    expect(essentialAverage(history, categories, TODAY)).toEqual({ monthly: 128500, months: ['2026-06', '2026-07', '2026-08'] });
  });

  it('margem sugerida: 7 dias de R$ 1.285, arredondado a R$ 10 = R$ 300', () => {
    expect(suggestBuffer({ monthly: 128500, months: [] })).toBe(30000);
    expect(buffer).toMatchObject({ amount: 30000, mode: 'auto', suggested: 30000 });
  });

  it('a margem escolhida pela pessoa vale, inclusive zero', () => {
    expect(safetyBuffer({ safetyBuffer: { mode: 'manual', amount: 50000 } }, history, categories, TODAY).amount).toBe(50000);
    expect(safetyBuffer({ safetyBuffer: { mode: 'manual', amount: 0 } }, history, categories, TODAY)).toMatchObject({ amount: 0, suggested: 30000 });
  });

  it('sem histórico, não há sugestão e a margem automática é zero', () => {
    expect(safetyBuffer(null, [], categories, TODAY)).toMatchObject({ amount: 0, suggested: null, basis: null });
  });
});

describe('os três números', () => {
  it('saldo R$ 3.420, comprometido R$ 2.180, disponível R$ 1.240, para gastar R$ 940', () => {
    expect(decide).toMatchObject({
      balance: 342000,
      committed: 218000,
      available: 124000,
      free: 94000,
      reserved: 30000,
      spendable: 94000,
      until: '2026-09-30',
      grounded: true,
    });
    expect(decide.commitments.map((c) => [c.label, c.amount])).toEqual([
      ['Aluguel', 150000],
      ['Luz', 18000],
      ['Fatura Nubank', 50000],
    ]);
    expect(decide.tightest).toMatchObject({ date: '2026-09-27', balance: 124000 });
    expect(decide.income?.label).toBe('Salário');
  });

  it('o disponível é o mesmo número do Início', () => {
    expect(decide.available).toBe(cash.safeUntilIncome);
    expect(decide.balance - decide.committed).toBe(decide.available);
  });

  it('a conta mostrada fecha linha a linha', () => {
    expect(availableLines(decide).map((l) => [l.op, l.amount])).toEqual([
      ['', 342000],
      ['−', 218000],
      ['=', 124000],
      ['−', 30000],
      ['=', 94000],
    ]);
  });
});

describe('quando a sobra não completa a margem, ou falta', () => {
  it('margem maior que a sobra: a margem fica com o que couber, e o livre é zero', () => {
    const d = moneyToDecide(base, cash, { ...buffer, mode: 'manual', amount: 200000 });
    expect(d).toMatchObject({ available: 124000, free: -76000, reserved: 124000, spendable: 0 });
    expect(availableLines(d).slice(-2).map((l) => [l.op, l.amount, l.detail])).toEqual([
      ['−', 124000, 'de R$\u00a02.000,00: o que sobra não completa a margem'],
      ['=', 0, undefined],
    ]);
  });

  it('conta descoberta: a lista termina na falta, sem margem', () => {
    const short: LedgerInput = { ...base, entries: [...base.entries, entry('out', 200000, '2026-09-22', { description: 'Conserto' })] };
    const d = moneyToDecide(short, cashSnapshot(short), buffer);
    expect(d).toMatchObject({ available: -76000, spendable: -76000, reserved: 0 });
    const lines = availableLines(d);
    expect(lines[lines.length - 1]).toEqual({ op: '=', label: 'Falta para cobrir as contas até lá', amount: -76000 });
  });
});

describe('poupança e corretora ficam guardadas', () => {
  const poupanca = account({ name: 'Poupança', kind: 'savings', openingBalance: 600000, openingDate: '2026-09-01' });
  const corretora = account({ name: 'Corretora', kind: 'broker', openingBalance: 250000, openingDate: '2026-09-01' });
  const withSavings: LedgerInput = { ...base, accounts: [corrente, poupanca, corretora] };

  it('o disponível não conta o guardado; o saldo total continua o das Contas', () => {
    const d = moneyToDecide(withSavings, cashSnapshot(withSavings), buffer);
    expect(d).toMatchObject({ total: 1192000, guarded: 850000, balance: 342000, committed: 218000, available: 124000, spendable: 94000 });
    expect(availableLines(d).slice(0, 2)).toEqual([
      { op: '', label: 'Saldo nas contas agora', amount: 1192000 },
      { op: '−', label: 'Guardado em poupança e corretora', amount: 850000 },
    ]);
  });

  it('a principal sempre conta, mesmo sendo poupança', () => {
    const principal = account({ name: 'Poupança principal', kind: 'savings', primary: true, openingBalance: 342000, openingDate: '2026-09-01' });
    const only: LedgerInput = { ...base, accounts: [principal] };
    const d = moneyToDecide(only, cashSnapshot(only), buffer);
    expect(d).toMatchObject({ guarded: 0, balance: 342000, available: 124000 });
  });

  it('mandar para a poupança é compromisso; trazer de volta é entrada', () => {
    const guardar = transfer({ kind: 'account', amount: 40000, date: '2026-09-22', fromAccountId: corrente.id, toAccountId: poupanca.id, description: 'Guardar' });
    const withMove: LedgerInput = { ...withSavings, transfers: [guardar] };
    const d = moneyToDecide(withMove, cashSnapshot(withMove), buffer);
    expect(d.committed).toBe(218000 + 40000);
    expect(d.available).toBe(124000 - 40000);
    expect(d.commitments.map((c) => c.label)).toContain('Guardar');

    const resgate = transfer({ kind: 'account', amount: 40000, date: '2026-09-22', fromAccountId: poupanca.id, toAccountId: corrente.id, description: 'Resgate' });
    const withBack: LedgerInput = { ...withSavings, transfers: [resgate] };
    const d2 = moneyToDecide(withBack, cashSnapshot(withBack), buffer);
    expect(d2).toMatchObject({ committed: 218000, expectedIn: 40000 });
  });

  it('transferência entre duas contas de uso não muda nada', () => {
    const carteira = account({ name: 'Carteira', kind: 'cash', openingBalance: 0, openingDate: '2026-09-01' });
    const saque = transfer({ kind: 'account', amount: 20000, date: '2026-09-22', fromAccountId: corrente.id, toAccountId: carteira.id, description: 'Saque' });
    const withCash: LedgerInput = { ...base, accounts: [corrente, carteira], transfers: [saque] };
    const d = moneyToDecide(withCash, cashSnapshot(withCash), buffer);
    expect(d).toMatchObject({ committed: 218000, expectedIn: 0, available: 124000, guarded: 0 });
  });
});

describe('posso gastar?', () => {
  it('R$ 300 na conta: cabe, e sobram R$ 640 para gastar', () => {
    const c = checkSpend(decide, { amount: 30000, method: 'account' });
    expect(c).toMatchObject({ verdict: 'fits', availableAfter: 94000, freeAfter: 64000, shortBy: null });
  });

  it('R$ 1.000 na conta: cabe, mas come R$ 60 da margem', () => {
    const c = checkSpend(decide, { amount: 100000, method: 'account' });
    expect(c).toMatchObject({ verdict: 'uses-buffer', availableAfter: 24000, freeAfter: -6000 });
  });

  it('R$ 1.500 na conta: no dia 27, com a fatura, faltariam R$ 260', () => {
    const c = checkSpend(decide, { amount: 150000, method: 'account' });
    expect(c).toMatchObject({ verdict: 'short', shortBy: 'cash', tightestAfter: { date: '2026-09-27', balance: -26000 } });
    expect(c.maxFree).toBe(94000);
  });

  it('R$ 800 no Nubank: entra na fatura que vence dia 27 e usa o limite', () => {
    const c = checkSpend(decide, { amount: 80000, method: 'card', card: nubank }, cardData);
    expect(c.schedule).toEqual([{ date: '2026-09-27', amount: 80000, invoiceMonth: '2026-09' }]);
    expect(c).toMatchObject({ verdict: 'fits', availableAfter: 44000, freeAfter: 14000 });
    expect(c.limit).toEqual({ available: 250000, after: 170000 });
  });

  it('R$ 1.000 em 3× no Nubank: 33,34 + 33,33 + 33,33, e o limite reserva o total', () => {
    const c = checkSpend(decide, { amount: 100000, method: 'card', card: nubank, installments: 3 }, cardData);
    expect(c.schedule).toEqual([
      { date: '2026-09-27', amount: 33334, invoiceMonth: '2026-09' },
      { date: '2026-10-27', amount: 33333, invoiceMonth: '2026-10' },
      { date: '2026-11-27', amount: 33333, invoiceMonth: '2026-11' },
    ]);
    expect(c.availableAfter).toBe(124000 - 33334);
    expect(c.beyondHorizon).toBe(1); // o app projeta até 17/11
    expect(c.limit).toEqual({ available: 250000, after: 150000 });
  });

  it('R$ 3.000 no Itaú: o caixa aguenta depois do salário, mas passa do limite', () => {
    const c = checkSpend(decide, { amount: 300000, method: 'card', card: itau }, cardData);
    expect(c.schedule).toEqual([{ date: '2026-10-17', amount: 300000, invoiceMonth: '2026-10' }]);
    expect(c).toMatchObject({ verdict: 'short', shortBy: 'limit', availableAfter: 124000 });
    expect(c.limit).toEqual({ available: 200000, after: -100000 });
  });

  it('gasto que cabe antes do salário, mas descobre uma conta grande depois dele', () => {
    const withIpva: LedgerInput = {
      ...base,
      entries: [...base.entries, entry('out', 520000, '2026-10-05', { description: 'IPVA' })],
    };
    const cashIpva = cashSnapshot(withIpva);
    const d = moneyToDecide(withIpva, cashIpva, buffer);
    // depois do salário: 1.240 + 5.000 − 5.200 = R$ 1.040 no dia 5/10
    expect(d.later).toMatchObject({ date: '2026-10-05', balance: 104000 });

    const c = checkSpend(d, { amount: 110000, method: 'account' });
    expect(c.availableAfter).toBe(14000);
    expect(c).toMatchObject({ verdict: 'short', shortBy: 'later', laterAfter: { date: '2026-10-05', balance: -6000 } });
    // o que cabe sem mexer na margem nem descobrir o IPVA
    expect(c.maxFree).toBe(94000);
  });
});
