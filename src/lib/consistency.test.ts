import { describe, expect, it } from 'vitest';
import { account, card, debt, entry, paid, subscription, transfer } from '@/test/build';
import { ask, type AssistantContext } from './assistant';
import { cashSnapshot, dayBalances, virtualOccurrences } from './cashflow';
import { balancesAt, type LedgerInput } from './ledger';
import { formatMoney } from './money';
import { occurrencesInMonth, projectMonth, summarizeMonth } from './occurrences';
import { wealthNow } from './wealth';

/**
 * A regra de ouro: o mesmo valor em qualquer tela.
 *
 * Um espaço com um pouco de tudo — duas contas, transferência, cartão com
 * fatura paga e aberta, assinatura, dívida, conta vencida, receita futura — e
 * a mesma pergunta feita a cada tela. Se duas respostas diferirem, é bug.
 */

const corrente = account({ name: 'Corrente', primary: true, openingBalance: 250000, openingDate: '2026-08-01' });
const reserva = account({ name: 'Reserva', kind: 'savings', openingBalance: 1000000, openingDate: '2026-08-01' });
const nubank = card({ closingDay: 25, dueDay: 5, limit: 800000 });

const ledger: LedgerInput = {
  today: '2026-09-18',
  accounts: [corrente, reserva],
  cards: [nubank],
  cardsEnabled: true,
  subscriptions: [subscription({ amount: 5590, billingDay: 12 }), subscription({ amount: 2190, billingDay: 3, cardId: nubank.id })],
  debts: [debt({ installment: 38000, installments: 12, startMonth: '2026-04', dueDay: 25 })],
  entries: [
    paid('in', 620000, '2026-09-05', { description: 'Salário' }),
    paid('out', 185000, '2026-09-06', { description: 'Aluguel' }),
    entry('out', 21990, '2026-09-10', { description: 'Luz' }), // vencida, sem baixa
    entry('in', 180000, '2026-09-28', { description: 'Freela' }), // futura
    entry('out', 45000, '2026-08-20', { description: 'Mercado', cardId: nubank.id }),
    entry('out', 30000, '2026-09-14', { description: 'Jantar', cardId: nubank.id, repeat: { kind: 'installments', count: 3, total: 90000 } }),
    paid('invest', 60000, '2026-09-08', { description: 'Aporte' }),
  ],
  transfers: [transfer({ kind: 'account', amount: 100000, date: '2026-09-09', fromAccountId: reserva.id, toAccountId: corrente.id })],
};

const month = '2026-09';
const occurrences = [
  ...occurrencesInMonth(ledger.entries, month, ledger.today),
  ...virtualOccurrences(ledger.subscriptions, ledger.debts, month, ledger.today, ledger.entries),
];
const cash = cashSnapshot(ledger);
const contas = balancesAt(ledger, ledger.today);

const assistant: AssistantContext = {
  month,
  entries: ledger.entries,
  summary: summarizeMonth(occurrences, month, ledger.today),
  occurrences,
  projection: projectMonth(occurrences, month, 0, ledger.today),
  history: [],
  categories: [],
  cards: ledger.cards,
  subscriptions: ledger.subscriptions,
  goals: [],
  debts: ledger.debts,
  market: null,
  today: ledger.today,
  cash,
  accounts: contas.accounts.map((r) => ({ name: r.account.name, balance: r.balance })),
};

describe('o mesmo número em toda tela', () => {
  it('saldo de hoje: Início = Contas = curva do mês = Patrimônio = assistente', () => {
    const inicio = cash.balanceNow;
    const curva = dayBalances(ledger, '2026-09-01', '2026-09-30').days.find((d) => d.date === ledger.today)?.balance;
    const patrimonio = wealthNow(ledger, []).cash;
    const resposta = ask('Quanto tenho?', assistant);

    expect(contas.total).toBe(inicio);
    expect(curva).toBe(inicio);
    expect(patrimonio).toBe(inicio);
    expect(resposta.highlight?.value).toBe(formatMoney(inicio));
    expect(ask('qual meu saldo', assistant).highlight?.value).toBe(formatMoney(inicio));
  });

  it('fim do mês: Início = curva = assistente', () => {
    const curva = dayBalances(ledger, '2026-09-01', '2026-09-30').days.at(-1)?.balance;
    expect(curva).toBe(cash.endOfMonth);
    const resposta = ask('Por que estou fechando no vermelho?', assistant);
    expect(resposta.highlight?.value).toBe(formatMoney(cash.endOfMonth, { signed: cash.endOfMonth < 0 }));
  });

  it('a conta de cada saldo fecha, linha por linha, desde o saldo inicial de 01/08', () => {
    const c = contas.accounts.find((r) => r.account.id === corrente.id);
    // a luz venceu e não foi paga: ainda está na conta
    const agosto = -2190 /* fatura de julho, paga em 05/08 */ - 5590 /* assinatura 12/08 */ - 38000; /* parcela 25/08 */
    const setembro =
      -45000 - 2190 /* fatura de agosto, paga em 05/09 */ + 620000 - 185000 - 60000 /* aporte */ + 100000 /* da reserva */ - 5590; /* assinatura 12/09 */
    const esperado = 250000 + agosto + setembro;
    expect(c?.balance).toBe(esperado);
    expect(contas.accounts.find((r) => r.account.id === reserva.id)?.balance).toBe(900000);
  });

  it('"quanto sobra" é o resultado do mês e diz que não é o saldo', () => {
    const r = ask('quanto sobra esse mes', assistant);
    expect(r.highlight?.label).toBe('Resultado do mês');
    expect(r.text).toContain('não o saldo da conta');
    expect(r.text).toContain(formatMoney(cash.balanceNow));
  });

  it('o diagnóstico do vermelho lista as maiores saídas que ainda vêm', () => {
    const r = ask('Por que estou fechando no vermelho?', assistant);
    expect(r.list?.[0]?.value).toBeDefined();
    const pendentes = r.list?.map((l) => l.label) ?? [];
    expect(pendentes).toContain('Luz');
  });
});

describe('saldo inicial informado no meio do mês', () => {
  it('a curva do mês parte dele, e o que veio antes não conta de novo', () => {
    // a pessoa lançou um gasto no dia 10 e só no dia 24 disse "hoje eu tenho 5.000"
    const c = account({ primary: true, openingBalance: 500000, openingDate: '2026-09-24' });
    const i: LedgerInput = {
      today: '2026-09-24',
      accounts: [c],
      cards: [],
      cardsEnabled: true,
      subscriptions: [],
      debts: [],
      entries: [paid('out', 20000, '2026-09-10'), entry('in', 400000, '2026-10-05', { description: 'Salário' })],
      transfers: [],
    };
    const snap = cashSnapshot(i);
    expect(snap.balanceNow).toBe(500000);
    expect(snap.days.find((d) => d.date === '2026-09-24')?.balance).toBe(500000);
    // nada previsto até o fim do mês: o fim do mês é o saldo de hoje
    expect(snap.endOfMonth).toBe(500000);
    expect(snap.safeUntilIncome).toBe(500000);
  });
});
