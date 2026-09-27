import { describe, expect, it } from 'vitest';
import { card, debt, entry, subscription } from '@/test/build';
import { ask, type AssistantContext } from './assistant';
import { virtualOccurrences } from './cashflow';
import { formatMoney } from './money';
import { occurrencesInMonth, summarizeMonth } from './occurrences';
import { TESTS } from './story-answers';
import { normalize } from './categories';
import type { Card, Category, Debt, Entry, Goal, Subscription } from './types';

/**
 * As perguntas vagas viram diagnóstico. Os números esperados foram feitos à
 * mão; o texto é conferido nos trechos que carregam número e motivo.
 */

const TODAY = '2026-09-18';
const r = (v: number) => formatMoney(v);

const category = (name: string, patch: Partial<Category> = {}): Category => ({
  id: `cat-${normalize(name).replace(/ /g, '-')}`,
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
const comerFora = category('Comer fora', { budget: 100000 });
const compras = category('Compras');
const assinaturas = category('Assinaturas');
const salario = category('Salário', { kind: 'in' });
const categories = [moradia, mercado, comerFora, compras, assinaturas, salario];

function context(entries: Entry[], extra: { subs?: Subscription[]; debts?: Debt[]; cards?: Card[]; goals?: Goal[] } = {}): AssistantContext {
  const subs = extra.subs ?? [];
  const debts = extra.debts ?? [];
  const expand = (m: string) => [...occurrencesInMonth(entries, m, TODAY), ...virtualOccurrences(subs, debts, m, TODAY, entries)];
  const occurrences = expand('2026-09');
  return {
    month: '2026-09',
    entries,
    summary: summarizeMonth(occurrences, '2026-09', TODAY),
    occurrences,
    projection: [],
    history: [],
    categories,
    cards: extra.cards ?? [],
    subscriptions: subs,
    goals: extra.goals ?? [],
    debts,
    market: null,
    today: TODAY,
    expand,
  };
}

/* -------------------------------------------------------- o cenário */

// renda R$ 5.000; fixos R$ 1.955,90 (aluguel, empréstimo, Netflix); parcela R$ 300;
// variáveis R$ 1.200, R$ 1.400 e R$ 1.300 em jun, jul e ago — média R$ 1.300
const nubank = card({ name: 'Nubank', closingDay: 25, dueDay: 5, limit: 500000 });
const netflix = subscription({ name: 'Netflix', amount: 5590, billingDay: 10, startedAt: '2026-01-01', categoryId: assinaturas.id });
const emprestimo = debt({ name: 'Empréstimo', installment: 40000, installments: 12, startMonth: '2026-05', dueDay: 15, monthlyRate: 3.5 });
const base: Entry[] = [
  entry('in', 500000, '2026-06-05', { description: 'Salário', categoryId: salario.id, repeat: { kind: 'monthly' } }),
  entry('out', 150000, '2026-06-08', { description: 'Aluguel', categoryId: moradia.id, repeat: { kind: 'monthly' } }),
  entry('out', 30000, '2026-06-10', { description: 'Notebook', categoryId: compras.id, cardId: nubank.id, repeat: { kind: 'installments', count: 6, total: 180000 } }),
  entry('out', 80000, '2026-06-12', { description: 'Mercado', categoryId: mercado.id }),
  entry('out', 40000, '2026-06-20', { description: 'Restaurante', categoryId: comerFora.id }),
  entry('out', 80000, '2026-07-12', { description: 'Mercado', categoryId: mercado.id }),
  entry('out', 60000, '2026-07-20', { description: 'Restaurante', categoryId: comerFora.id }),
  entry('out', 80000, '2026-08-12', { description: 'Mercado', categoryId: mercado.id }),
  entry('out', 50000, '2026-08-20', { description: 'Restaurante', categoryId: comerFora.id }),
  // setembro: comer fora e compras acima do normal
  entry('out', 80000, '2026-09-12', { description: 'Mercado', categoryId: mercado.id }),
  entry('out', 120000, '2026-09-14', { description: 'Restaurante', categoryId: comerFora.id }),
  entry('out', 70000, '2026-09-15', { description: 'Roupas', categoryId: compras.id }),
];
const ctx = context(base, { subs: [netflix], debts: [emprestimo], cards: [nubank] });

describe('as perguntas vão para o lugar certo', () => {
  const t = (q: string) => normalize(q);
  it('reconhece a pergunta vaga pelo sentido, não por uma palavra', () => {
    expect(TESTS.dinheiroSome(t('Por que meu dinheiro some?'))).toBe(true);
    expect(TESTS.dinheiroSome(t('pq nunca sobra nada'))).toBe(true);
    expect(TESTS.dinheiroSome(t('Ganho 5000 e não sobra, por quê?'))).toBe(true);
    expect(TESTS.dinheiroSome(t('Para onde vai meu dinheiro?'))).toBe(true);
    expect(TESTS.dinheiroSome(t('Meu salário é suficiente?'))).toBe(true);
    expect(TESTS.gastandoDemais(t('Estou gastando demais?'))).toBe(true);
    expect(TESTS.faturaAlta(t('Por que minha fatura nunca baixa?'))).toBe(true);
    expect(TESTS.faturaAlta(t('Qual minha fatura do mês que vem?'))).toBe(false);
    expect(TESTS.salarioSubiu(t('Meu salário subiu, mas continuo sem dinheiro. Por quê?'))).toBe(true);
    expect(TESTS.metaNaoChega(t('Por que minha meta nunca chega?'))).toBe(true);
    expect(TESTS.qualDivida(t('Qual dívida devo pagar primeiro?'))).toBe(true);
    expect(TESTS.qualDivida(t('Quais são minhas dívidas?'))).toBe(false);
  });
});

describe('por que meu dinheiro some', () => {
  it('fixos, parcelas e variáveis contra a renda: sobram R$ 1.444,10, 29%', () => {
    const a = ask('Por que meu dinheiro some?', ctx);
    expect(a.highlight).toEqual({ label: 'Sobra média por mês', value: r(144410) });
    expect(a.text).toContain(`a renda média foi ${r(500000)}`);
    expect(a.text).toContain(`os gastos fixos (contas que se repetem, assinaturas e dívidas) levaram ${r(195590)}`);
    expect(a.text).toContain(`as compras parceladas ${r(30000)} e os variáveis ${r(130000)}`);
    expect(a.text).toContain(`Sobram ${r(144410)} por mês (29% da renda)`);
    // fixo pesa mais que variável: o conselho é sobre o fixo
    expect(a.text).toContain(`O que mais pesa nos fixos: Aluguel (${r(150000)}), Empréstimo (${r(40000)}) e Netflix (${r(5590)}).`);
    expect(a.list?.map((l) => l.value)).toEqual([r(500000), r(195590), r(30000), r(130000), r(144410)]);
  });

  it('"meu salário é suficiente?" responde primeiro à pergunta', () => {
    expect(ask('Meu salário é suficiente?', ctx).text.startsWith('Pelo que está lançado, cobre as saídas')).toBe(true);
  });
});

describe('estou gastando demais', () => {
  it('setembro 39% acima da média, por comer fora e compras, e acima do teto de comer fora', () => {
    const a = ask('Estou gastando demais?', ctx);
    // setembro R$ 4.955,90 contra média de R$ 3.555,90
    expect(a.text).toContain(`Seu gasto de setembro está 39% acima da média dos últimos 3 meses: ${r(495590)} contra ${r(355590)}`);
    expect(a.text).toContain(`Comer fora (+${r(70000)})`);
    expect(a.text).toContain(`Compras (+${r(70000)})`);
    expect(a.text).toContain(`Fica abaixo da sua renda média (${r(500000)}), com ${r(4410)} de folga.`);
    expect(a.text).toContain(`Passou do orçamento em Comer fora (${r(20000)} acima do teto).`);
    expect(a.highlight).toEqual({ label: 'Contra a sua média', value: '+39%' });
  });
});

describe('por que a fatura está alta', () => {
  it('a próxima fatura, o que é parcela antiga, assinatura e compra nova', () => {
    const spotify = subscription({ name: 'Spotify', amount: 2190, billingDay: 20, startedAt: '2026-01-01', cardId: nubank.id });
    const withCard = [
      ...base,
      entry('out', 60000, '2026-09-02', { description: 'Tênis', categoryId: compras.id, cardId: nubank.id }),
      entry('out', 25000, '2026-09-14', { description: 'Jantar', categoryId: comerFora.id, cardId: nubank.id }),
    ];
    const a = ask('Por que minha fatura está tão alta?', context(withCard, { subs: [netflix, spotify], debts: [emprestimo], cards: [nubank] }));
    // setembro: parcela 4/6 R$ 300 + Spotify R$ 21,90 + Tênis R$ 600 + Jantar R$ 250 = R$ 1.171,90
    // as três anteriores: R$ 300 + R$ 21,90 = R$ 321,90 cada
    expect(a.highlight).toEqual({ label: 'Fatura do Nubank', value: r(117190) });
    expect(a.text).toContain(`está em ${r(117190)}, 264% acima da média das anteriores (${r(32190)})`);
    expect(a.text).toContain(`${r(30000)} são parcelas de compras antigas (vêm até a fatura de novembro)`);
    expect(a.text).toContain(`${r(2190)} assinaturas e ${r(85000)} compras deste ciclo`);
    expect(a.text).toContain(`As maiores compras deste ciclo: Tênis (${r(60000)}) e Jantar (${r(25000)}).`);
  });
});

describe('a renda subiu e o dinheiro não', () => {
  it('renda +R$ 1.000, gastos +R$ 900: o aumento foi absorvido, sobretudo por comer fora', () => {
    const entries: Entry[] = [
      entry('in', 400000, '2026-03-05', { description: 'Salário', categoryId: salario.id, repeat: { kind: 'monthly', until: '2026-05-31' } }),
      entry('in', 500000, '2026-06-05', { description: 'Salário', categoryId: salario.id, repeat: { kind: 'monthly' } }),
      entry('out', 150000, '2026-03-08', { description: 'Aluguel', categoryId: moradia.id, repeat: { kind: 'monthly' } }),
      ...['03', '04', '05'].flatMap((m) => [
        entry('out', 100000, `2026-${m}-12`, { description: 'Mercado', categoryId: mercado.id }),
        entry('out', 50000, `2026-${m}-20`, { description: 'Restaurante', categoryId: comerFora.id }),
      ]),
      ...['06', '07', '08'].flatMap((m) => [
        entry('out', 100000, `2026-${m}-12`, { description: 'Mercado', categoryId: mercado.id }),
        entry('out', 140000, `2026-${m}-20`, { description: 'Restaurante', categoryId: comerFora.id }),
      ]),
    ];
    const a = ask('Meu salário subiu, mas continuo sem dinheiro. Por quê?', context(entries));
    expect(a.text).toContain(`A renda média subiu ${r(100000)}, de ${r(400000)} para ${r(500000)}, e os gastos subiram ${r(90000)} no mesmo período.`);
    expect(a.text).toContain('O aumento foi quase todo absorvido pelos gastos');
    expect(a.text).toContain(`O que mais cresceu: Comer fora (+${r(90000)}).`);
  });

  it('sem três meses completos antes, não inventa aumento', () => {
    // o cenário base começa em junho: não há março, abril e maio para comparar
    expect(ask('Meu salário subiu mas continuo sem dinheiro', ctx).text).toBe('Preciso de seis meses de movimento para comparar o antes e o depois do aumento.');
  });
});

describe('metas e dívidas', () => {
  it('a meta que não chega: o aporte pedido, o ritmo e as saídas', () => {
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
      deposits: ['07', '08', '09'].map((m) => ({ at: `2026-${m}-10T12:00:00.000Z`, amount: 20000 })),
    };
    const a = ask('Por que minha meta nunca chega?', context(base, { goals: [viagem] }));
    expect(a.text).toContain(`Viagem pede ${r(133334)} por mês para chegar até dezembro, e o ritmo dos últimos meses foi ${r(20000)}.`);
    // faltam R$ 4.000 a R$ 200 por mês: 20 meses, maio de 2028
    expect(a.text).toContain('Nesse ritmo, chega em maio de 2028.');
    expect(a.text).toContain(`aumentar o aporte em ${r(113334)} por mês, estender o prazo para maio de 2028, reduzir o valor da meta`);
  });

  it('qual dívida primeiro: os dois critérios, sem decidir pela pessoa', () => {
    const cartao = debt({ name: 'Crédito pessoal', installment: 20000, installments: 4, startMonth: '2026-07', dueDay: 10, monthlyRate: 1.2 });
    const a = ask('Qual dívida devo pagar primeiro?', context(base, { debts: [emprestimo, cartao] }));
    expect(a.text).toContain('Depende do que você quer primeiro.');
    expect(a.text).toContain('Pelo juro, seria Empréstimo (3,5% ao mês)');
    expect(a.text).toContain('Pelo saldo, seria Crédito pessoal');
    expect(a.list).toHaveLength(2);
  });
});

describe('o que já existia continua igual', () => {
  it('fatura do mês que vem, lista de dívidas e quanto falta para a meta', () => {
    expect(ask('Qual minha fatura do mês que vem?', ctx).text).not.toContain('parcelas de compras antigas');
    expect(ask('Quais são minhas dívidas?', ctx).text).not.toContain('Depende do que você quer primeiro');
  });
});
