import { describe, expect, it } from 'vitest';
import { account, card, entry, paid } from '@/test/build';
import { ask, type AssistantContext } from './assistant';
import { cashSnapshot } from './cashflow';
import { normalize } from './categories';
import { isSpendQuestion, parseSpend, spendAmount } from './decision-answers';
import { moneyToDecide, type SafetyBuffer } from './decision';
import type { LedgerInput } from './ledger';
import { formatMoney } from './money';
import { occurrencesInMonth, projectMonth, summarizeMonth } from './occurrences';

/**
 * "Quanto posso gastar?" e "posso gastar R$ X?" no assistente, com o mesmo
 * cenário de `decision.test.ts`: saldo R$ 3.420, R$ 2.180 comprometidos antes
 * do salário, margem de R$ 300 — R$ 940 para gastar.
 */

const TODAY = '2026-09-18';
const nubank = card({ name: 'Nubank', institution: 'Nubank', closingDay: 20, dueDay: 27, limit: 300000 });
const itau = card({ name: 'Itaú', institution: 'Itaú', closingDay: 10, dueDay: 17, limit: 200000 });

const ledger: LedgerInput = {
  today: TODAY,
  accounts: [account({ name: 'Corrente', primary: true, openingBalance: 342000, openingDate: '2026-09-01' })],
  cards: [nubank, itau],
  cardsEnabled: true,
  subscriptions: [],
  debts: [],
  transfers: [],
  entries: [
    entry('out', 150000, '2026-09-20', { description: 'Aluguel' }),
    entry('out', 18000, '2026-09-25', { description: 'Luz' }),
    paid('out', 50000, '2026-09-10', { description: 'Tênis', cardId: nubank.id }),
    entry('in', 500000, '2026-09-30', { description: 'Salário' }),
  ],
};

const buffer: SafetyBuffer = { amount: 30000, mode: 'auto', suggested: 30000, basis: { monthly: 128500, months: ['2026-06', '2026-07', '2026-08'] } };
const cash = cashSnapshot(ledger);
const decide = moneyToDecide(ledger, cash, buffer);
const occurrences = occurrencesInMonth(ledger.entries, '2026-09', TODAY);

function context(cards = ledger.cards): AssistantContext {
  return {
    month: '2026-09',
    entries: ledger.entries,
    summary: summarizeMonth(occurrences, '2026-09', TODAY),
    occurrences,
    projection: projectMonth(occurrences, '2026-09', 0, TODAY),
    history: [],
    categories: [],
    cards,
    subscriptions: [],
    goals: [],
    debts: [],
    market: null,
    today: TODAY,
    cash,
    decision: { decide, transfers: [], cardsEnabled: true },
  };
}

const r = (v: number) => formatMoney(v);

describe('lendo o gasto na pergunta', () => {
  const casos: [string, { amount: number; installments: number } | null][] = [
    ['posso gastar R$ 300?', { amount: 30000, installments: 1 }],
    ['Posso gastar 1.500,00 hoje?', { amount: 150000, installments: 1 }],
    ['dá pra comprar um celular de 2 mil?', { amount: 200000, installments: 1 }],
    ['posso comprar algo de 1.200 em 10x?', { amount: 120000, installments: 10 }],
    ['posso parcelar em 3 vezes de 150?', { amount: 45000, installments: 3 }],
    ['posso gastar 200 no dia 25?', { amount: 20000, installments: 1 }],
    ['posso gastar?', null],
  ];
  for (const [pergunta, esperado] of casos) {
    it(pergunta, () => expect(spendAmount(pergunta)).toEqual(esperado));
  }

  it('só é "posso gastar" com verbo de gasto e valor', () => {
    const q = (s: string) => isSpendQuestion(normalize(s), s);
    expect(q('Posso gastar R$ 300?')).toBe(true);
    expect(q('Consigo comprar um tênis de 400?')).toBe(true);
    expect(q('e se eu gastar 250 no mercado?')).toBe(true);
    expect(q('Vou conseguir pagar tudo?')).toBe(false);
    expect(q('Se eu guardar 500 por mês, quando atinjo minha meta?')).toBe(false);
    expect(q('posso pagar a fatura de 980?')).toBe(false);
    expect(q('quanto posso gastar?')).toBe(false);
  });

  it('cartão: pelo nome, pelas parcelas ou pela palavra; conta pelo pix', () => {
    const p = (s: string) => parseSpend(normalize(s), s, [nubank, itau]);
    expect(p('posso gastar 800 no nubank?')).toMatchObject({ method: 'card', card: nubank });
    expect(p('posso gastar 800 no pix?')).toMatchObject({ method: 'account', card: null });
    expect(p('posso gastar 800?')).toMatchObject({ method: 'account' });
    expect(p('posso gastar 1000 em 3x?')).toMatchObject({ method: 'card', card: null, ambiguous: [nubank, itau], installments: 3 });
    expect(parseSpend('posso gastar 800 no cartao', 'posso gastar 800 no cartão', [nubank])).toMatchObject({ method: 'card', card: nubank });
  });
});

describe('o assistente responde', () => {
  it('"quanto posso gastar?": R$ 940, com a conta que chega nele', () => {
    const a = ask('Quanto posso gastar?', context());
    expect(a.highlight).toEqual({ label: 'Disponível para gastar', value: r(94000) });
    expect(a.text).toContain(`Você pode gastar ${r(94000)} até dia 30, quando entra Salário`);
    expect(a.list?.map((l) => l.value)).toEqual([r(342000), r(218000), r(124000), r(30000), r(94000)]);
  });

  it('"posso gastar R$ 300?": cabe, e sobram R$ 640', () => {
    const a = ask('posso gastar R$ 300?', context());
    expect(a.text.startsWith('Cabe.')).toBe(true);
    expect(a.highlight).toEqual({ label: 'Sobra para gastar depois', value: r(64000) });
    expect(a.list?.slice(-2).map((l) => l.value)).toEqual([r(30000), r(64000)]);
  });

  it('"posso gastar 1.000?": cabe, mas entra na margem, e diz quanto cabe sem ela', () => {
    const a = ask('posso gastar 1.000?', context());
    expect(a.text).toContain('entra na margem de segurança');
    expect(a.text).toContain(`Um gasto de até ${r(94000)} cabe sem tocar a margem.`);
  });

  it('"posso comprar um tênis de 1.500?": não cabe, falta R$ 260 no dia 27', () => {
    const a = ask('posso comprar um tênis de 1.500?', context());
    expect(a.text).toContain(`Não cabe sem descobrir uma conta: dia 27 o saldo previsto ficaria em ${formatMoney(-26000, { signed: true })}.`);
    expect(a.highlight).toEqual({ label: 'Faltaria', value: r(26000) });
    expect(a.text).toContain('esperar Salário, que entra dia 30');
    // a lista termina na falta, e fecha: 1.240 − 1.500 = −260
    expect(a.list?.slice(-3).map((l) => [l.label, l.value])).toEqual([
      ['= Disponível sem deixar conta descoberta', r(124000)],
      ['− Este gasto, hoje', r(150000)],
      ['= Falta para cobrir as contas', formatMoney(-26000, { signed: true })],
    ]);
  });

  it('no cartão: a fatura em que entra e o limite', () => {
    const a = ask('posso gastar 800 no nubank?', context());
    expect(a.text).toContain('A compra entra na fatura que vence dia 27.');
    expect(a.text).toContain(`O limite disponível cai de ${r(250000)} para ${r(170000)}.`);
  });

  it('parcelado sem dizer o cartão, com dois cadastrados: pergunta qual', () => {
    const a = ask('posso gastar 1000 em 3x?', context());
    expect(a.text).toMatch(/^Em qual cartão: Nubank ou Itaú\?/);
  });

  it('"posso gastar 1.000?": a lista refaz a margem com o que sobra', () => {
    const a = ask('posso gastar 1.000?', context());
    expect(a.list?.slice(-4).map((l) => [l.label, l.value, l.detail])).toEqual([
      ['− Este gasto, hoje', r(100000), ''],
      ['= Sobra depois das contas', r(24000), ''],
      ['− Margem de segurança', r(24000), `de ${r(30000)}: o que sobra não completa a margem`],
      ['= Sobra para gastar depois', r(0), ''],
    ]);
    expect(a.highlight).toEqual({ label: 'Sobra para gastar depois', value: r(0) });
  });

  it('fim de mês apertado: sobra menor que a margem vira zero, não negativo', () => {
    const apertado: LedgerInput = {
      today: TODAY,
      accounts: [account({ name: 'Corrente', primary: true, openingBalance: 4195, openingDate: '2026-09-01' })],
      cards: [],
      cardsEnabled: true,
      subscriptions: [],
      debts: [],
      transfers: [],
      entries: [entry('in', 180000, '2026-09-19', { description: 'Freela' })],
    };
    const c2 = cashSnapshot(apertado);
    const d2 = moneyToDecide(apertado, c2, { ...buffer, amount: 87000, suggested: 87000 });
    expect(d2).toMatchObject({ available: 4195, reserved: 4195, spendable: 0 });
    const ctx2 = { ...context([]), cash: c2, decision: { decide: d2, transfers: [], cardsEnabled: true } };

    const disponivel = ask('quanto posso gastar?', ctx2);
    expect(disponivel.highlight).toEqual({ label: 'Disponível para gastar', value: r(0) });
    expect(disponivel.text).toContain(`Até amanhã, quando entra Freela, sobram ${r(4195)} depois das contas`);

    const gasto = ask('posso gastar 300?', ctx2);
    expect(gasto.text).toBe(
      [
        `Não cabe hoje: o saldo nas contas é ${r(4195)}, e o gasto deixaria ${formatMoney(-25805, { signed: true })}.`,
        `Até ${r(4195)} não descobre nenhuma conta, mas já sai da margem de segurança.`,
        'Outra saída é esperar Freela, que entra amanhã.',
      ].join(' '),
    );
  });

  it('as perguntas que já existiam continuam indo para o lugar certo', () => {
    expect(ask('Vou conseguir pagar tudo?', context()).text).toMatch(/^Pelo que está lançado/);
    expect(ask('quanto tenho?', context()).highlight?.label).toBe('Nas contas, hoje');
  });
});
