import { describe, expect, it } from 'vitest';
import { account, card, entry, paid } from '@/test/build';
import { depositMessage, habitLines, habitsOf, isBigSpend, spendImpact } from './behavior';
import { cashSnapshot } from './cashflow';
import { checkSpend, moneyToDecide, type SafetyBuffer } from './decision';
import type { LedgerInput } from './ledger';
import { formatMoney } from './money';
import { occurrencesInMonth } from './occurrences';
import type { Entry, Goal } from './types';

/**
 * Os momentos e o comportamento observado (fase 7). Frase só com número, e
 * sequência só a partir de dois meses.
 */

const r = (v: number) => formatMoney(v);

const goal = (name: string, patch: Partial<Goal> = {}): Goal => ({
  id: `meta-${name}`,
  spaceId: 'espaco-teste',
  createdAt: '2026-04-10T12:00:00.000Z',
  updatedAt: '2026-04-10T12:00:00.000Z',
  deletedAt: null,
  name,
  icon: '',
  target: 500000,
  source: 'manual',
  categoryId: null,
  saved: 0,
  deadline: null,
  color: '',
  archivedAt: null,
  pausedAt: null,
  ...patch,
});

describe('os momentos das metas', () => {
  it('meta batida: o valor e em quanto tempo, com a frase', () => {
    expect(depositMessage(goal('Viagem'), 450000, 60000, 500000, '2026-09-18')).toBe(
      `Meta Viagem batida: ${r(500000)} juntados em 5 meses. Você não chegou aqui por acaso: o padrão que você manteve fez diferença.`,
    );
  });

  it('primeiro aporte da reserva: marca o começo', () => {
    expect(depositMessage(goal('Reserva de emergência'), 0, 20000, 1000000, '2026-09-18')).toBe(
      `Primeiro aporte da Reserva de emergência: ${r(20000)}. Primeiro construa segurança. Depois amplie seus objetivos.`,
    );
  });

  it('aporte comum não é momento', () => {
    expect(depositMessage(goal('Viagem'), 100000, 20000, 500000, '2026-09-18')).toBeNull();
    expect(depositMessage(goal('Reserva de emergência'), 50000, 20000, 1000000, '2026-09-18')).toBeNull();
  });
});

describe('a compra grande, antes de salvar', () => {
  // o cenário da fase 1: disponível R$ 1.240, margem R$ 300, para gastar R$ 940, salário no dia 30
  const nubank = card({ name: 'Nubank', closingDay: 10, dueDay: 17, limit: 300000 });
  const ledger: LedgerInput = {
    today: '2026-09-18',
    accounts: [account({ name: 'Corrente', primary: true, openingBalance: 342000, openingDate: '2026-09-01' })],
    cards: [nubank],
    cardsEnabled: true,
    subscriptions: [],
    debts: [],
    transfers: [],
    entries: [
      entry('out', 150000, '2026-09-20', { description: 'Aluguel' }),
      entry('out', 18000, '2026-09-25', { description: 'Luz' }),
      entry('out', 50000, '2026-09-27', { description: 'Escola' }),
      entry('in', 500000, '2026-09-30', { description: 'Salário' }),
    ],
  };
  const buffer: SafetyBuffer = { amount: 30000, mode: 'auto', suggested: 30000, basis: null };
  const decide = moneyToDecide(ledger, cashSnapshot(ledger), buffer);
  const data = { entries: ledger.entries, subscriptions: [], transfers: [] };
  const check = (amount: number, method: 'account' | 'card' = 'account') =>
    checkSpend(decide, { amount, method, card: method === 'card' ? nubank : null }, data);

  it('pequena não avisa; a partir de 30% do disponível para gastar, avisa com o número', () => {
    expect(decide.spendable).toBe(94000);
    expect(isBigSpend(check(20000), decide)).toBe(false);
    expect(isBigSpend(check(30000), decide)).toBe(true);
    expect(spendImpact(check(30000), decide)).toBe(`Depois dele, sobram ${r(64000)} para gastar até 30 de set.`);
  });

  it('entra na margem ou descobre conta: diz qual das duas', () => {
    expect(spendImpact(check(100000), decide)).toBe(`Ele entra na margem de segurança: sobrariam ${r(24000)} até 30 de set, abaixo da margem de ${r(30000)}.`);
    expect(spendImpact(check(150000), decide)).toBe(`Ele deixaria conta descoberta: 27 de set o saldo previsto ficaria em ${formatMoney(-26000, { signed: true })}.`);
  });

  it('no cartão que só vence depois do salário: o disponível não muda até lá', () => {
    expect(spendImpact(check(80000, 'card'), decide)).toBe(`Só pesa na fatura de 17 de out, depois do recebimento: até lá, o disponível para gastar continua ${r(94000)}.`);
  });
});

describe('o comportamento observado', () => {
  // cada mês de abril a setembro baixado, como a pessoa faz ao pagar
  const everyMonth = Object.fromEntries(['04', '05', '06', '07', '08', '09'].map((m) => [`2026-${m}`, { at: `2026-${m}-10T12:00:00.000Z` }]));
  // abril a agosto: salário 5.000, aluguel 1.500; julho gasta 4.000 a mais (resultado negativo);
  // aportes em junho, julho e agosto
  const entries: Entry[] = [
    entry('in', 500000, '2026-04-05', { description: 'Salário', repeat: { kind: 'monthly' }, settled: everyMonth }),
    entry('out', 150000, '2026-04-08', { description: 'Aluguel', repeat: { kind: 'monthly' }, settled: everyMonth }),
    paid('out', 400000, '2026-07-15', { description: 'Conserto' }),
    ...['06', '07', '08'].map((m) => paid('invest', 50000, `2026-${m}-10`, { description: 'Aporte' })),
  ];
  const ledger: LedgerInput = {
    today: '2026-09-18',
    accounts: [account({ name: 'Corrente', primary: true, openingBalance: 100000, openingDate: '2026-04-01' })],
    cards: [],
    cardsEnabled: true,
    subscriptions: [],
    debts: [],
    transfers: [],
    entries,
  };
  const expand = (m: string) => occurrencesInMonth(entries, m, '2026-09-18');

  it('sequência positiva para no mês negativo; aportes contados nos meses com dado', () => {
    const h = habitsOf(expand, entries, ledger, '2026-09-18');
    // agosto positivo, julho negativo: sequência de 1
    expect(h.positiveStreak).toBe(1);
    // saldo: 1.000 + 3.500/mês − aportes; julho 1.000+… nunca negativo
    expect(h.noNegativeStreak).toBe(5);
    expect(h.saving).toEqual({ months: 3, of: 5 });
    expect(habitLines(h)).toEqual(['5 meses seguidos sem saldo negativo.', 'Guardou dinheiro em 3 dos últimos 5 meses.']);
  });
});
