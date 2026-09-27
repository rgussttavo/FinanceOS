import { describe, expect, it } from 'vitest';
import { allocate, goalNeeds, goalPlan } from './goal-plan';
import type { MoneyStory } from './money-story';
import type { Goal } from './types';

/**
 * O plano das metas. Os números esperados foram feitos à mão:
 *
 *   Viagem   alta, prazo fixo dez/2026   falta 4.000 em 3 meses  → pede 1.333,34
 *   Carro    média, flexível dez/2027    falta 30.000 em 15 meses → pede 2.000
 *   Celular  baixa, flexível mar/2027    falta 3.000 em 6 meses   → pede 500
 *   Reserva  alta, sem prazo             falta 10.000
 *
 * As metas com prazo pedem 3.833,34 por mês; a sobra média é 3.000.
 */

const TODAY = '2026-09-18';
const MONTH = '2026-09';

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
const celular = goal('Celular', { target: 300000, deadline: '2027-03-31', priority: 'baixa' });
const reserva = goal('Reserva', { target: 1000000, priority: 'alta' });
const goals = [viagem, carro, celular, reserva];

const story = (margin: number, variable = 150000): MoneyStory => ({
  months: ['2026-06', '2026-07', '2026-08'],
  income: 600000,
  fixed: 0,
  installments: 0,
  variable,
  invested: 0,
  margin,
  topVariable: [],
  topFixed: [],
});

const row = (s: ReturnType<typeof goalPlan>['scenarios'][number], g: Goal) => s.rows.find((r) => r.goal.id === g.id)!;

describe('o que as metas pedem', () => {
  it('cada meta com o aporte que o prazo pede; a sem prazo não pede valor fixo', () => {
    const needs = goalNeeds(goals, [], MONTH, TODAY);
    expect(needs.map((n) => [n.goal.name, n.need, n.priority, n.fixed])).toEqual([
      ['Viagem', 133334, 'alta', true],
      ['Carro', 200000, 'media', false],
      ['Celular', 50000, 'baixa', false],
      ['Reserva', null, 'alta', false],
    ]);
  });
});

describe('conflito e cenários', () => {
  const plan = goalPlan(goals, [], story(300000), TODAY);

  it('pedem R$ 3.833,34, sobram R$ 3.000: faltam R$ 833,34 por mês', () => {
    expect(plan).toMatchObject({ capacity: 300000, asked: 383334, conflict: true, gap: 83334, extraCut: 15000 });
    expect(plan.scenarios.map((s) => [s.id, s.budget])).toEqual([
      ['conservador', 210000],
      ['equilibrado', 300000],
      ['acelerado', 315000],
    ]);
  });

  it('equilibrado: a Viagem chega no prazo; o Carro atrasa 4 meses; Celular e Reserva esperam', () => {
    const s = plan.scenarios[1];
    expect(row(s, viagem)).toMatchObject({ monthly: 133334, reaches: '2026-12', onTime: true, delay: 0 });
    expect(row(s, carro)).toMatchObject({ monthly: 166666, reaches: '2028-04', onTime: false, delay: 4 });
    expect(row(s, celular)).toMatchObject({ monthly: 0, reaches: null, onTime: false });
    expect(row(s, reserva)).toMatchObject({ monthly: 0, reaches: null, onTime: null });
    expect(s.leftover).toBe(0);
  });

  it('conservador guarda 30% de folga; acelerado supõe 10% menos nos variáveis', () => {
    // 30.000 ÷ 766,66 = 39,1 → 40 meses
    expect(row(plan.scenarios[0], carro)).toMatchObject({ monthly: 76666, reaches: '2030-01' });
    expect(row(plan.scenarios[2], carro)).toMatchObject({ monthly: 181666, reaches: '2028-02', delay: 2 });
  });

  it('sem conflito, todas no prazo e a sobra vai para a meta sem prazo', () => {
    const folgado = goalPlan(goals, [], story(500000), TODAY);
    expect(folgado).toMatchObject({ conflict: false, gap: 0 });
    const s = folgado.scenarios[1];
    expect([viagem, carro, celular].map((g) => row(s, g).onTime)).toEqual([true, true, true]);
    // 5.000 − 3.833,34 = 1.166,66 para a Reserva: 10.000 em 9 meses
    expect(row(s, reserva)).toMatchObject({ monthly: 116666, reaches: '2027-06' });
  });

  it('sem histórico de sobra, não há capacidade para comparar', () => {
    const vazio = goalPlan(goals, [], null, TODAY);
    expect(vazio).toMatchObject({ capacity: null, conflict: false });
  });
});

describe('a regra de divisão', () => {
  it('na mesma prioridade, prazo fixo antes do flexível', () => {
    const fixa = goal('Casamento', { target: 300000, deadline: '2026-12-31', priority: 'alta', fixedDeadline: true });
    const flex = goal('Curso', { target: 300000, deadline: '2026-12-31', priority: 'alta' });
    const { rows } = allocate(goalNeeds([flex, fixa], [], MONTH, TODAY), 150000, MONTH);
    expect(rows.find((r) => r.goal.id === fixa.id)?.monthly).toBe(100000);
    expect(rows.find((r) => r.goal.id === flex.id)?.monthly).toBe(50000);
  });

  it('metas empatadas dividem na proporção do que pedem', () => {
    const a = goal('A', { target: 300000, deadline: '2026-12-31', priority: 'media' });
    const b = goal('B', { target: 600000, deadline: '2026-12-31', priority: 'media' });
    const { rows } = allocate(goalNeeds([a, b], [], MONTH, TODAY), 150000, MONTH);
    expect(rows.map((r) => r.monthly)).toEqual([50000, 100000]);
  });

  it('as sem prazo dividem o que sobra com peso 3, 2 e 1', () => {
    const alta = goal('Alta', { target: 5000000, priority: 'alta' });
    const baixa = goal('Baixa', { target: 5000000, priority: 'baixa' });
    const { rows, leftover } = allocate(goalNeeds([alta, baixa], [], MONTH, TODAY), 400000, MONTH);
    expect(rows.map((r) => r.monthly)).toEqual([300000, 100000]);
    expect(leftover).toBe(0);
  });
});
