import { describe, expect, it } from 'vitest';
import { account, card, debt, entry, paid } from '@/test/build';
import { ask, type AssistantContext } from './assistant';
import { cashSnapshot } from './cashflow';
import { buildCheckup, type CheckupInput } from './checkup';
import { moneyToDecide, safetyBuffer } from './decision';
import type { LedgerInput } from './ledger';
import { formatMoney } from './money';
import type { MonthSummary } from './occurrences';
import type { Category, Goal } from './types';

/**
 * O diagnóstico por áreas, com os critérios combinados: reserva de 6 meses de
 * essenciais; cartões atenção acima de 30% do limite e alerta acima de 70%;
 * dívidas atenção acima de 15% da renda e alerta acima de 30%; fluxo em
 * atenção com resultado médio negativo e em alerta com conta descoberta.
 * Números feitos à mão.
 */

const TODAY = '2026-09-18';
const r = (v: number) => formatMoney(v);

const category = (name: string, kind: Category['kind'] = 'out'): Category => ({
  id: `cat-${name}`,
  spaceId: 'espaco-teste',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  name,
  kind,
  icon: '',
  color: '',
  system: true,
  order: 0,
  budget: 0,
});
const moradia = category('Moradia');
const mercado = category('Mercado');
const lazer = category('Lazer');
const salario = category('Salário', 'in');
const reservaCat = category('Reserva de emergência', 'invest');
const categories = [moradia, mercado, lazer, salario, reservaCat];

// renda R$ 5.000, saídas R$ 4.200: sobram R$ 800 (16%); essenciais R$ 2.000
const summary = (month: string): MonthSummary => ({
  month,
  income: 500000,
  expense: 420000,
  invested: 0,
  balance: 80000,
  opening: 0,
  settledIncome: 500000,
  settledExpense: 420000,
  pendingExpense: 0,
  overdueExpense: 0,
  byCategory: new Map([
    [moradia.id, 150000],
    [mercado.id, 50000],
    [lazer.id, 220000],
  ]),
  count: 12,
});
const history = [summary('2026-06'), summary('2026-07'), summary('2026-08'), { ...summary('2026-09'), count: 3 }];

const nubank = card({ name: 'Nubank', limit: 100000, closingDay: 25, dueDay: 5 });
const viagem: Goal = {
  id: 'meta-viagem',
  spaceId: 'espaco-teste',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
  name: 'Viagem',
  icon: '',
  target: 500000,
  source: 'manual',
  categoryId: null,
  saved: 100000,
  deadline: '2026-12-31',
  color: '',
  archivedAt: null,
  pausedAt: null,
  deposits: [
    { at: '2026-07-10T12:00:00.000Z', amount: 20000 },
    { at: '2026-08-10T12:00:00.000Z', amount: 20000 },
    { at: '2026-09-10T12:00:00.000Z', amount: 20000 },
  ],
};

function scenario(patch: Partial<LedgerInput> = {}, extra: Partial<CheckupInput> = {}): CheckupInput {
  const ledger: LedgerInput = {
    today: TODAY,
    accounts: [
      account({ name: 'Corrente', primary: true, openingBalance: 300000, openingDate: '2026-06-01' }),
      account({ name: 'Poupança', kind: 'savings', openingBalance: 600000, openingDate: '2026-06-01' }),
    ],
    cards: [nubank],
    cardsEnabled: true,
    subscriptions: [],
    debts: [debt({ name: 'Empréstimo', installment: 90000, installments: 12, startMonth: '2026-04', dueDay: 10 })],
    transfers: [],
    entries: [
      paid('in', 500000, '2026-09-05', { description: 'Salário', categoryId: salario.id }),
      paid('out', 150000, '2026-09-06', { description: 'Aluguel', categoryId: moradia.id }),
      paid('invest', 200000, '2026-08-10', { description: 'Reserva', categoryId: reservaCat.id }),
      paid('out', 80000, '2026-09-10', { description: 'Tênis', categoryId: lazer.id, cardId: nubank.id }),
      paid('out', 5000, '2026-09-12', { description: 'Padaria', createdAt: '2026-09-17T10:00:00.000Z' }),
      entry('out', 30000, '2026-09-25', { description: 'Luz', categoryId: moradia.id }),
      entry('in', 500000, '2026-10-05', { description: 'Salário', categoryId: salario.id }),
    ],
    ...patch,
  };
  const cash = cashSnapshot(ledger);
  return {
    ledger,
    cash,
    decide: moneyToDecide(ledger, cash, safetyBuffer(null, history, categories, TODAY)),
    history,
    categories,
    goals: [viagem],
    assets: [],
    settings: null,
    ...extra,
  };
}

describe('as áreas, pelos critérios combinados', () => {
  const c = buildCheckup(scenario());
  const area = (id: string) => c.areas.find((a) => a.id === id)!;

  it('fluxo: sobram R$ 800 por mês, 16% da renda, e nada fica descoberto', () => {
    expect(area('fluxo')).toMatchObject({ status: 'ok', label: 'saudável' });
    expect(area('fluxo').why).toContain(`sobram ${r(80000)} por mês (16% da renda)`);
  });

  it('reserva: R$ 8.000 cobrem 4,0 meses de R$ 2.000; a referência é 6, faltam R$ 4.000', () => {
    expect(area('reserva')).toMatchObject({ status: 'attention', label: '4,0 meses' });
    expect(area('reserva').facts).toMatchObject({ reserva: 800000, aplicado: 200000, poupanca: 600000, essencialMensal: 200000, referencia: 6 });
    expect(area('reserva').why).toContain(`faltam ${r(400000)}`);
  });

  it('dívidas: R$ 900 de R$ 5.000 é 18%, acima de 15%', () => {
    expect(area('dividas')).toMatchObject({ status: 'attention', label: '18% da renda' });
  });

  it('cartões: R$ 800 de R$ 1.000 é 80%, acima de 70%', () => {
    expect(area('cartoes')).toMatchObject({ status: 'alert', label: '80% do limite' });
  });

  it('metas: a Viagem pede R$ 1.333,34 por mês e o ritmo é R$ 200', () => {
    expect(area('metas')).toMatchObject({ status: 'attention', label: '1 fora do ritmo' });
    expect(area('metas').why).toContain(`Viagem pede ${r(133334)} por mês até o prazo, e o ritmo dos últimos meses é ${r(20000)}.`);
  });

  it('patrimônio só informa, sem julgar', () => {
    expect(area('patrimonio').status).toBe('info');
  });

  it('atenção na ordem: o alerta primeiro, depois proteção, risco e objetivos', () => {
    expect(c.attention.map((a) => a.id)).toEqual(['cartoes', 'reserva', 'dividas', 'metas']);
    expect(c.summary).toEqual({ tone: 'alert', text: 'Um ponto pede ação agora: cartões.' });
  });

  it('conta descoberta põe o fluxo à frente de tudo', () => {
    const s = scenario();
    const c2 = buildCheckup(scenario({ entries: [...s.ledger.entries, entry('out', 100000, '2026-09-28', { description: 'Conserto', categoryId: moradia.id })] }));
    expect(c2.areas.find((a) => a.id === 'fluxo')).toMatchObject({ status: 'alert', label: 'conta descoberta' });
    expect(c2.attention.map((a) => a.id)).toEqual(['fluxo', 'cartoes', 'reserva', 'dividas', 'metas']);
    expect(c2.summary.text).toBe('2 pontos pedem ação agora: fluxo de caixa e cartões.');
  });
});

describe('os limites são inclusivos para o lado bom', () => {
  it('30% do limite e 15% da renda ainda estão ok', () => {
    const c = buildCheckup(
      scenario({
        cards: [{ ...nubank, limit: 266667 }],
        debts: [debt({ installment: 75000, installments: 12, startMonth: '2026-04', dueDay: 10 })],
      }),
    );
    expect(c.areas.find((a) => a.id === 'cartoes')?.status).toBe('ok'); // 80.000 / 266.667 = 29,99…%
    expect(c.areas.find((a) => a.id === 'dividas')).toMatchObject({ status: 'ok', label: '15% da renda' });
  });

  it('a referência da reserva é da pessoa: com 3 meses, 4,0 meses está ok', () => {
    const c = buildCheckup(scenario({}, { settings: { reserveMonths: 3 } }));
    expect(c.areas.find((a) => a.id === 'reserva')).toMatchObject({ status: 'ok', label: '4,0 meses' });
  });
});

describe('confiança dos dados', () => {
  it('cada item com o seu peso, somando a porcentagem', () => {
    const { confidence } = buildCheckup(scenario());
    const byId = Object.fromEntries(confidence.checks.map((ch) => [ch.id, [ch.ok, ch.score]]));
    expect(byId).toEqual({
      saldo: [true, 25],
      conferido: [false, 0],
      categorias: [false, 12], // 4 de 5 gastos recentes com categoria
      renda: [true, 15],
      conferencia: [true, 15],
      recente: [true, 10],
    });
    expect(confidence).toMatchObject({ percent: 77, level: 'média' });
  });

  it('app vazio: o diagnóstico diz que faltam dados, e não que está tudo bem', () => {
    const empty = buildCheckup(
      scenario({ accounts: [], entries: [], cards: [], debts: [] }, { history: [], goals: [] }),
    );
    expect(empty.summary.tone).toBe('unknown');
    expect(empty.confidence.level).toBe('baixa');
  });
});

describe('o assistente', () => {
  it('"como está minha vida financeira?" responde com o mesmo diagnóstico', () => {
    const input = scenario();
    const c = buildCheckup(input);
    const ctx: AssistantContext = {
      month: '2026-09',
      entries: input.ledger.entries,
      summary: history[3],
      occurrences: [],
      projection: [],
      history,
      categories,
      cards: input.ledger.cards,
      subscriptions: [],
      goals: [viagem],
      debts: input.ledger.debts,
      market: null,
      today: TODAY,
      cash: input.cash,
      checkup: c,
    };
    const a = ask('Como está minha vida financeira?', ctx);
    expect(a.text.startsWith('Um ponto pede ação agora: cartões. Cartões: ')).toBe(true);
    expect(a.list?.map((l) => [l.label, l.value])).toEqual(c.areas.map((x) => [x.title, x.label]));
    expect(a.link?.route).toEqual({ view: 'checkup' });
    // "como estou" continua sendo o resumo do mês
    expect(ask('Como estou?', ctx).highlight?.label).toBe('Resultado do mês');
  });
});
