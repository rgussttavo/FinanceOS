import { describe, expect, it } from 'vitest';
import { entry } from '@/test/build';
import type { CashSnapshot } from './cashflow';
import type { Area, AreaId, AreaStatus, Checkup, ConfidenceCheck } from './checkup';
import type { MoneyToDecide } from './decision';
import type { GoalPlan } from './goal-plan';
import { formatMoney } from './money';
import type { MoneyStory } from './money-story';
import { occurrencesInMonth, summarizeMonth } from './occurrences';
import { ask, type AssistantContext } from './assistant';
import { monthReview, monthlyDue, nextActions, quarterlyDue, reviewText, stageOf, type StrategyInput } from './strategy';
import type { Category, Entry } from './types';

/**
 * Estratégia e acompanhamento: a etapa da trilha, a próxima ação e o
 * fechamento do mês. Números feitos à mão.
 */

const r = (v: number) => formatMoney(v);
type AreaSpec = [AreaStatus, string, Record<string, number | string | null>?];

function checkup(over: Partial<Record<AreaId, AreaSpec>> = {}, confidence = 90, checks: ConfidenceCheck[] = []): Checkup {
  const base: Record<AreaId, [string, AreaSpec]> = {
    fluxo: ['Fluxo de caixa', ['ok', 'saudável']],
    reserva: ['Reserva', ['ok', '6,5 meses', { reserva: 1300000, essencialMensal: 200000, meses: 6.5, referencia: 6 }]],
    dividas: ['Dívidas', ['ok', 'nenhuma']],
    cartoes: ['Cartões', ['ok', '12% do limite']],
    metas: ['Metas', ['ok', 'no ritmo']],
    patrimonio: ['Patrimônio', ['info', 'estável']],
  };
  const areas: Area[] = (Object.keys(base) as AreaId[]).map((id) => {
    const [title, spec] = base[id];
    const [status, label, facts] = over[id] ?? spec;
    return { id, title, status, label, why: `${title}: ${label}.`, action: null, facts: facts ?? {} };
  });
  return { areas, attention: [], summary: { tone: 'ok', text: '' }, confidence: { percent: confidence, level: confidence >= 85 ? 'alta' : confidence >= 60 ? 'média' : 'baixa', checks } };
}

describe('a trilha', () => {
  it('tudo de pé: patrimônio', () => {
    expect(stageOf(checkup())).toMatchObject({ id: 'patrimonio', index: 4 });
  });

  it('fluxo em alerta vem antes de tudo', () => {
    const s = stageOf(checkup({ fluxo: ['alert', 'conta descoberta'], dividas: ['alert', '40% da renda'] }));
    expect(s).toMatchObject({ id: 'estabilizar', next: 'Cobrir as contas até o próximo recebimento.' });
    expect(s?.situation).toBe('Sua situação pede foco em estabilizar: fechar o mês sem conta descoberta e sem sair mais do que entra.');
  });

  it('menos de 1 mês de reserva: proteger, com quanto falta', () => {
    const s = stageOf(checkup({ reserva: ['attention', '0,4 mês', { reserva: 80000, essencialMensal: 200000, meses: 0.4, referencia: 6 }] }));
    expect(s).toMatchObject({ id: 'proteger', next: `Guardar mais ${r(120000)} para ter 1 mês de despesas essenciais.` });
  });

  it('dívidas ou cartão acima do limite: reduzir', () => {
    const s = stageOf(
      checkup({
        reserva: ['attention', '2,0 meses', { reserva: 400000, essencialMensal: 200000, meses: 2, referencia: 6 }],
        dividas: ['attention', '18% da renda'],
        cartoes: ['alert', '80% do limite'],
      }),
    );
    expect(s).toMatchObject({ id: 'reduzir', next: 'Levar as parcelas (hoje 18% da renda) para até 15% da renda e trazer o cartão (hoje 80% do limite) para até 30%.' });
  });

  it('reserva abaixo da referência: objetivos, com quanto falta para os 6 meses', () => {
    const s = stageOf(checkup({ reserva: ['attention', '2,0 meses', { reserva: 400000, essencialMensal: 200000, meses: 2, referencia: 6 }] }));
    expect(s).toMatchObject({ id: 'objetivos', next: `Completar a reserva (faltam ${r(800000)}).` });
  });

  it('sem dados de fluxo, não há etapa', () => {
    expect(stageOf(checkup({ fluxo: ['unknown', 'sem dados'] }))).toBeNull();
  });
});

describe('a próxima ação', () => {
  const cash = (overdueCount = 0, overdue = 0) => ({ overdueCount, overdue }) as CashSnapshot;
  const decide = (available = 50000) => ({ available, income: null }) as unknown as MoneyToDecide;
  const plan = (conflict = false) => ({ conflict, capacity: 300000, asked: conflict ? 400000 : 0 }) as unknown as GoalPlan;
  const input = (patch: Partial<StrategyInput>): StrategyInput => ({
    checkup: checkup(),
    cash: cash(),
    decide: decide(),
    story: null,
    plan: plan(),
    subscriptions: [],
    categories: [],
    today: '2026-09-18',
    ...patch,
  });

  it('conta vencida é fato: vem antes de tudo', () => {
    const a = nextActions(input({ cash: cash(2, 45000), checkup: checkup({ dividas: ['alert', '40% da renda'] }) }));
    expect(a[0]).toMatchObject({ id: 'vencidas', title: 'Resolver 2 contas vencidas', reason: `${r(45000)} venceram e não foram baixados.` });
    expect(a[1].id).toBe('dividas');
  });

  it('dado ruim vem antes da estratégia: sem dado certo, o resto não se sustenta', () => {
    const miss: ConfidenceCheck = { id: 'saldo', label: 'Saldo informado em 0 de 1 conta', ok: false, weight: 25, score: 0, hint: 'Informe quanto cada conta tem hoje.', route: { view: 'contas' } };
    const a = nextActions(input({ checkup: checkup({ cartoes: ['alert', '80% do limite'] }, 40, [miss]) }));
    expect(a[0]).toMatchObject({ id: 'dados-saldo', title: 'Informar o saldo de hoje das contas', route: { view: 'contas' } });
  });

  it('saídas acima das entradas: rever a maior categoria variável, com o impacto de 20%', () => {
    const story = { margin: -45000, topVariable: [{ categoryId: 'cat-comer', amount: 60000 }] } as unknown as MoneyStory;
    const categories = [{ id: 'cat-comer', name: 'Comer fora' }] as Category[];
    const a = nextActions(input({ checkup: checkup({ fluxo: ['attention', 'saídas acima das entradas'] }), story, categories }));
    expect(a[0]).toMatchObject({
      id: 'variaveis',
      title: 'Rever os gastos com Comer fora',
      impact: `Gastar 20% menos ali libera ${r(12000)} por mês.`,
    });
  });

  it('tudo de pé: um objetivo de longo prazo', () => {
    expect(nextActions(input({}))[0]).toMatchObject({ id: 'longo-prazo' });
  });

  it('metas competindo pela sobra: rever prioridades', () => {
    expect(nextActions(input({ plan: plan(true) }))[0]).toMatchObject({ id: 'metas-conflito' });
  });
});

describe('o mês que passou', () => {
  // agosto: entrou 5.000; saiu 1.500 (aluguel) + 900 (mercado) + 600 (comer fora) = 3.000; sobrou 2.000
  // maio a julho: mercado 700, comer fora 300 → sobrou 2.500 em média
  const entries: Entry[] = [
    entry('in', 500000, '2026-05-05', { description: 'Salário', repeat: { kind: 'monthly' } }),
    entry('out', 150000, '2026-05-08', { description: 'Aluguel', repeat: { kind: 'monthly' } }),
    ...['05', '06', '07'].flatMap((m) => [
      entry('out', 70000, `2026-${m}-12`, { description: 'Mercado', categoryId: 'mercado' }),
      entry('out', 30000, `2026-${m}-20`, { description: 'Restaurante', categoryId: 'comer' }),
    ]),
    entry('out', 90000, '2026-08-12', { description: 'Mercado', categoryId: 'mercado' }),
    entry('out', 60000, '2026-08-20', { description: 'Restaurante', categoryId: 'comer' }),
  ];
  const expand = (m: string) => occurrencesInMonth(entries, m, '2026-09-03');

  it('resultado, a comparação com a média e o que mudou', () => {
    const rv = monthReview(expand, entries, [], '2026-09-03');
    expect(rv).toMatchObject({ month: '2026-08', income: 500000, spent: 300000, result: 200000, averageResult: 250000 });
    expect(rv?.changes).toEqual([
      { categoryId: 'comer', diff: 30000 },
      { categoryId: 'mercado', diff: 20000 },
    ]);
    const names: Record<string, string> = { comer: 'Comer fora', mercado: 'Mercado' };
    const t = reviewText(rv!, (id) => names[id]);
    expect(t.headline).toBe(`Em agosto, entraram ${r(500000)} e saíram ${r(300000)}: sobraram ${r(200000)}.`);
    expect(t.lines[0]).toBe(`Ficou ${r(50000)} abaixo da média dos meses anteriores. Vale ver o que mudou.`);
    expect(t.lines[1]).toBe(`Subiram: Comer fora (+${r(30000)}), Mercado (+${r(20000)}).`);
    expect(t.tone).toBe('watch');
  });
});

describe('quando o acompanhamento aparece', () => {
  it('fechamento do mês: do dia 1 ao 7, até dispensar', () => {
    expect(monthlyDue('2026-10-03', null)).toBe('2026-09');
    expect(monthlyDue('2026-10-03', '2026-09')).toBeNull();
    expect(monthlyDue('2026-10-08', null)).toBeNull();
  });

  it('revisão do plano: três meses depois da última, ou do começo', () => {
    expect(quarterlyDue('2026-09-18', null, '2026-06-18')).toBe(true);
    expect(quarterlyDue('2026-09-17', null, '2026-06-18')).toBe(false);
    expect(quarterlyDue('2026-12-01', '2026-09-20', null)).toBe(false);
    expect(quarterlyDue('2026-12-20', '2026-09-20', null)).toBe(true);
    expect(quarterlyDue('2026-09-18', null, null)).toBe(false);
  });
});

describe('no assistente', () => {
  const entries: Entry[] = [
    entry('in', 500000, '2026-05-05', { description: 'Salário', repeat: { kind: 'monthly' } }),
    entry('out', 150000, '2026-05-08', { description: 'Aluguel', repeat: { kind: 'monthly' } }),
    entry('out', 90000, '2026-08-12', { description: 'Mercado', categoryId: 'mercado' }),
  ];
  const expand = (m: string) => occurrencesInMonth(entries, m, '2026-09-18');
  const occurrences = expand('2026-09');
  const stage = stageOf(checkup({ reserva: ['attention', '0,4 mês', { reserva: 80000, essencialMensal: 200000, meses: 0.4, referencia: 6 }] }));
  const actions = [
    { id: 'reserva-1', title: 'Começar a reserva', reason: 'Hoje ela cobre 0,4 mês.', impact: 'Guardando…', route: { view: 'metas' as const }, priority: 70 },
    { id: 'assinaturas', title: 'Rever 3 assinaturas', reason: 'Somam R$ 90,00 por mês.', impact: '…', route: { view: 'assinaturas' as const }, priority: 55 },
  ];
  const ctx: AssistantContext = {
    month: '2026-09',
    entries,
    summary: summarizeMonth(occurrences, '2026-09', '2026-09-18'),
    occurrences,
    projection: [],
    history: [],
    categories: [{ id: 'mercado', name: 'Mercado' } as Category],
    cards: [],
    subscriptions: [],
    goals: [],
    debts: [],
    market: null,
    today: '2026-09-18',
    expand,
    strategy: { stage, actions },
  };

  it('"o que eu faço agora?": a primeira ação, com o motivo, e as seguintes na lista', () => {
    const a = ask('O que eu faço agora?', ctx);
    expect(a.highlight).toEqual({ label: 'Seu próximo passo', value: 'Começar a reserva' });
    expect(a.text.startsWith('Começar a reserva. Hoje ela cobre 0,4 mês.')).toBe(true);
    expect(a.list?.map((l) => l.label)).toEqual(['Rever 3 assinaturas']);
    expect(a.link?.route).toEqual({ view: 'metas' });
  });

  it('"em que etapa estou?": a trilha, sobre a situação', () => {
    const a = ask('Em que etapa estou?', ctx);
    expect(a.highlight).toEqual({ label: 'Etapa 2 de 5', value: 'Proteger' });
    expect(a.text.startsWith('Sua situação pede foco em proteger')).toBe(true);
  });

  it('"como foi agosto?": o fechamento do mês; "como estou?" continua o resumo', () => {
    // agosto: entrou 5.000, saiu 1.500 + 900 = 2.400, sobrou 2.600
    expect(ask('Como foi agosto?', ctx).text.startsWith(`Em agosto, entraram ${r(500000)} e saíram ${r(240000)}: sobraram ${r(260000)}.`)).toBe(true);
    expect(ask('Como estou?', ctx).highlight?.label).toBe('Resultado do mês');
  });
});
