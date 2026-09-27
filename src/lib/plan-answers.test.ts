import { describe, expect, it } from 'vitest';
import { entry } from '@/test/build';
import { ask, type AssistantContext } from './assistant';
import { virtualOccurrences } from './cashflow';
import { formatMoney } from './money';
import { occurrencesInMonth, summarizeMonth } from './occurrences';
import { horizonIn, isGoalQuestion } from './plan-answers';
import { normalize } from './categories';
import type { Entry, Goal } from './types';

/**
 * Objetivos e cenários no assistente. Em junho, julho e agosto entraram
 * R$ 5.000 e saíram R$ 2.000 (aluguel de R$ 1.500 e mercado de R$ 500):
 * sobram R$ 3.000 por mês. A Viagem (alta, prazo fixo em dezembro) já pede
 * R$ 1.333,34; ficam R$ 1.666,66 livres. Contas feitas à mão.
 */

const TODAY = '2026-09-18';
const r = (v: number) => formatMoney(v);

const goal = (name: string, patch: Partial<Goal>): Goal => ({
  id: `meta-${name}`,
  spaceId: 'espaco-teste',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
  name,
  icon: '',
  target: 0,
  source: 'manual',
  categoryId: null,
  saved: 0,
  deadline: null,
  color: '',
  archivedAt: null,
  pausedAt: null,
  ...patch,
});
const viagem = goal('Viagem', { target: 500000, saved: 100000, deadline: '2026-12-31', priority: 'alta', fixedDeadline: true });
const carro = goal('Carro', { target: 3000000, deadline: '2027-12-31', priority: 'media' });

const entries: Entry[] = [
  entry('in', 500000, '2026-06-05', { description: 'Salário', repeat: { kind: 'monthly' } }),
  entry('out', 150000, '2026-06-08', { description: 'Aluguel', repeat: { kind: 'monthly' } }),
  ...['06', '07', '08', '09'].map((m) => entry('out', 50000, `2026-${m}-12`, { description: 'Mercado' })),
];

function context(goals: Goal[]): AssistantContext {
  const expand = (m: string) => [...occurrencesInMonth(entries, m, TODAY), ...virtualOccurrences([], [], m, TODAY, entries)];
  const occurrences = expand('2026-09');
  return {
    month: '2026-09',
    entries,
    summary: summarizeMonth(occurrences, '2026-09', TODAY),
    occurrences,
    projection: [],
    history: [],
    categories: [],
    cards: [],
    subscriptions: [],
    goals,
    debts: [],
    market: null,
    today: TODAY,
    expand,
  };
}

describe('o prazo dito na pergunta', () => {
  const h = (q: string) => horizonIn(normalize(q), TODAY);
  it('mês, mês com ano, "daqui a" e "em N meses"', () => {
    expect(h('quero viajar em dezembro')).toBe('2026-12');
    expect(h('consigo juntar ate junho de 2027')).toBe('2027-06');
    expect(h('em setembro')).toBe('2027-09'); // dito em setembro: o do ano que vem
    expect(h('daqui a 2 anos')).toBe('2028-09');
    expect(h('em 18 meses')).toBe('2028-03');
    expect(h('posso gastar 300 em 10x')).toBeNull();
  });

  it('é objetivo só com verbo de plano e prazo no futuro', () => {
    const q = (s: string) => isGoalQuestion(normalize(s), TODAY);
    expect(q('Quero viajar em dezembro com R$ 8 mil, consigo?')).toBe(true);
    expect(q('Consigo juntar 10 mil até junho de 2027?')).toBe(true);
    expect(q('Quanto gastei em agosto?')).toBe(false);
    expect(q('Vou conseguir pagar tudo?')).toBe(false);
    expect(q('Posso gastar R$ 300?')).toBe(false);
  });
});

describe('quero X até tal data, consigo?', () => {
  it('não cabe: pede R$ 2.666,67 por mês e ficam R$ 1.666,66 livres', () => {
    const a = ask('Quero viajar em dezembro com R$ 8 mil, consigo?', context([viagem]));
    expect(a.text).toContain(`Para juntar ${r(800000)} até dezembro (3 meses), seriam ${r(266667)} por mês.`);
    expect(a.text).toContain(`sobraram ${r(300000)} por mês, e suas metas com prazo já pedem ${r(133334)}: ficam ${r(166666)} livres.`);
    // 3 × 1.666,66 = 4.999,98; faltariam 3.000,02
    expect(a.text).toContain(`você juntaria ${r(499998)} até dezembro: faltariam ${r(300002)}.`);
    // 8.000 ÷ 1.666,66 = 4,8 → 5 meses, fevereiro
    expect(a.text).toContain(`Com ${r(166666)} por mês, levaria 5 meses, até fevereiro de 2027.`);
    expect(a.text).toContain(`aumentar a sobra em ${r(100001)} por mês, rever a prioridade das metas atuais`);
    expect(a.highlight).toEqual({ label: 'Por mês até dezembro', value: r(266667) });
  });

  it('cabe: R$ 3.000 até dezembro pede R$ 1.000 por mês', () => {
    const a = ask('Consigo juntar 3 mil até dezembro?', context([viagem]));
    expect(a.text).toContain(`Cabe: mantendo esse ritmo, você junta o valor até lá, e ainda sobram ${r(66666)} por mês.`);
  });

  it('sem sobra nenhuma: não repete "juntaria R$ 0" e o aumento cobre as metas atuais', () => {
    const apertado = [...entries, ...['06', '07', '08'].map((m) => entry('out', 300000, `2026-${m}-20`, { description: 'Reforma' }))];
    const ctx = { ...context([viagem]), entries: apertado, expand: (m: string) => occurrencesInMonth(apertado, m, TODAY) };
    const a = ask('Quero viajar em dezembro com R$ 8 mil, consigo?', ctx);
    expect(a.text).toContain('Nos últimos meses não sobrou dinheiro');
    expect(a.text).not.toContain('você juntaria');
    // sobra 0; a Viagem pede 1.333,34 e o objetivo 2.666,67: aumentar 4.000,01
    expect(a.text).toContain(`aumentar a sobra em ${r(400001)} por mês — ou combinar.`);
  });

  it('sem o valor, pergunta só o que falta', () => {
    expect(ask('Quero viajar em dezembro, consigo?', context([viagem])).text).toBe(
      'Quanto vai custar? Com o valor, eu calculo se dá até dezembro com o que sobra por mês.',
    );
  });

  it('comprar daqui a meses é plano, não gasto de hoje', () => {
    expect(ask('Posso comprar um celular de 2 mil em dezembro?', context([])).text).toContain('Para juntar');
    expect(ask('Posso gastar R$ 300?', context([])).text).not.toContain('Para juntar');
  });
});

describe('e se eu economizar?', () => {
  it('R$ 500 a mais por mês: o Carro chega 4 meses antes e o conflito acaba', () => {
    const a = ask('Se eu economizar R$ 500 por mês, o que acontece?', context([viagem, carro]));
    expect(a.text).toContain(`Sua sobra passaria de ${r(300000)} para ${r(350000)} por mês — ${r(600000)} a mais em um ano.`);
    // antes: 1.666,66 por mês para 30.000 → abr/2028; depois: 2.000 → dez/2027
    expect(a.text).toContain('Carro chega em dezembro de 2027, 4 meses antes, no prazo');
    expect(a.text).toContain('E as metas deixam de competir pelo mesmo dinheiro');
    expect(a.list).toEqual([{ label: 'Carro', detail: 'abril de 2028 → dezembro de 2027', value: `${r(200000)}/mês` }]);
  });

  it('"onde posso economizar" e "se eu guardar" continuam com as respostas deles', () => {
    expect(ask('Onde posso economizar?', context([viagem])).text).not.toContain('Sua sobra passaria');
    expect(ask('Se eu guardar 500 por mês, quando atinjo minha meta?', context([viagem])).text).not.toContain('Sua sobra passaria');
  });
});
