import { addMonthsToKey, monthKeyOf } from './dates';
import { goalPace, goalProgress } from './goals';
import type { MoneyStory } from './money-story';
import type { Cents, Entry, Goal, GoalPriority, IsoDate, MonthKey } from './types';

/**
 * O plano das metas: o que elas pedem por mês contra o que sobra, e três
 * cenários de como dividir a sobra.
 *
 * Nada aqui muda meta nenhuma. Os cenários mostram consequências — o novo
 * prazo de cada meta — e a pessoa escolhe o que fazer. A regra de divisão é
 * uma só nos três; muda apenas quanto dinheiro entra nela:
 *
 *   conservador  70% da sobra média; 30% fica de folga
 *   equilibrado  toda a sobra média
 *   acelerado    toda a sobra e mais 10% dos gastos variáveis, se cortados
 *
 * A divisão: prioridade alta primeiro, depois média, depois baixa. Dentro da
 * mesma prioridade, prazo fixo antes de prazo flexível; metas empatadas
 * dividem o que houver na proporção do que pedem. Meta sem prazo recebe o
 * que sobrar depois das com prazo, com peso pela prioridade (3, 2, 1).
 */

export const PRIORITIES: GoalPriority[] = ['alta', 'media', 'baixa'];
export const PRIORITY_LABEL: Record<GoalPriority, string> = { alta: 'alta', media: 'média', baixa: 'baixa' };
const WEIGHT: Record<GoalPriority, number> = { alta: 3, media: 2, baixa: 1 };

export const priorityOf = (g: Goal): GoalPriority => g.priority ?? 'media';

export interface GoalNeed {
  goal: Goal;
  priority: GoalPriority;
  fixed: boolean;
  current: Cents;
  target: Cents;
  missing: Cents;
  /** quanto o prazo pede por mês; null sem prazo */
  need: Cents | null;
  /** ritmo real: a média dos aportes dos últimos três meses */
  pace: Cents;
  deadline: MonthKey | null;
  late: boolean;
}

/** as metas ativas que ainda não chegaram */
export function goalNeeds(goals: Goal[], entries: Entry[], month: MonthKey, today: IsoDate): GoalNeed[] {
  return goals
    .filter((g) => !g.archivedAt && !g.pausedAt && !g.deletedAt)
    .map((goal) => {
      const p = goalProgress(goal, entries, month, today);
      return {
        goal,
        priority: priorityOf(goal),
        fixed: !!goal.fixedDeadline && !!goal.deadline,
        current: p.current,
        target: p.target,
        missing: p.missing,
        need: p.perMonth,
        pace: goalPace(goal, entries, month, today).pace,
        deadline: goal.deadline ? monthKeyOf(goal.deadline) : null,
        late: p.late,
      };
    })
    .filter((n) => n.missing > 0);
}

export interface Allocation {
  goal: Goal;
  priority: GoalPriority;
  fixed: boolean;
  /** o que este cenário põe na meta por mês */
  monthly: Cents;
  /** o mês em que ela chega com esse aporte; null se não recebe nada */
  reaches: MonthKey | null;
  /** chega até o prazo? null sem prazo */
  onTime: boolean | null;
  /** meses de atraso em relação ao prazo; 0 no prazo */
  delay: number | null;
}

const monthsBetween = (from: MonthKey, to: MonthKey) => {
  const [a, b] = [from, to].map((k) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)));
  return b - a;
};

/** reparte `amount` na proporção dos pesos, em centavos inteiros (o resto fica de fora) */
function share(amount: Cents, weights: number[]): Cents[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  return weights.map((w) => Math.floor((amount * w) / total));
}

export function allocate(needs: GoalNeed[], budget: Cents, month: MonthKey): { rows: Allocation[]; leftover: Cents } {
  let remaining = Math.max(0, budget);
  const monthly = new Map<string, Cents>();

  // as metas com prazo, em grupos: prioridade, e dentro dela o prazo fixo antes
  for (const priority of PRIORITIES) {
    for (const fixed of [true, false]) {
      const group = needs.filter((n) => n.need !== null && n.priority === priority && n.fixed === fixed);
      if (!group.length) continue;
      const asked = group.reduce((t, n) => t + (n.need ?? 0), 0);
      const parts = remaining >= asked ? group.map((n) => n.need ?? 0) : share(remaining, group.map((n) => n.need ?? 0));
      group.forEach((n, i) => monthly.set(n.goal.id, parts[i]));
      remaining -= parts.reduce((a, b) => a + b, 0);
    }
  }

  // as sem prazo dividem o que sobrou, pesadas pela prioridade e limitadas ao que falta
  const open = needs.filter((n) => n.need === null);
  if (open.length && remaining > 0) {
    const parts = share(remaining, open.map((n) => WEIGHT[n.priority]));
    open.forEach((n, i) => {
      const part = Math.min(parts[i], n.missing);
      monthly.set(n.goal.id, part);
      remaining -= part;
    });
  }

  const rows = needs.map((n) => {
    const m = monthly.get(n.goal.id) ?? 0;
    const reaches = m > 0 ? addMonthsToKey(month, Math.ceil(n.missing / m)) : null;
    const delay = n.deadline ? (reaches ? Math.max(0, monthsBetween(n.deadline, reaches)) : null) : null;
    return {
      goal: n.goal,
      priority: n.priority,
      fixed: n.fixed,
      monthly: m,
      reaches,
      onTime: n.deadline ? reaches !== null && reaches <= n.deadline : null,
      delay,
    };
  });
  return { rows, leftover: remaining };
}

export type ScenarioId = 'conservador' | 'equilibrado' | 'acelerado';

export interface Scenario {
  id: ScenarioId;
  label: string;
  /** o que entra na divisão por mês */
  budget: Cents;
  rows: Allocation[];
  /** o que fica sem destino depois das metas */
  leftover: Cents;
}

export interface GoalPlan {
  /** a sobra média por mês, dos meses completos; null sem histórico */
  capacity: Cents | null;
  months: MonthKey[];
  needs: GoalNeed[];
  /** o que as metas com prazo pedem por mês, somado */
  asked: Cents;
  /** as metas com prazo pedem mais do que sobra? */
  conflict: boolean;
  /** quanto falta por mês para todas no prazo (0 sem conflito) */
  gap: Cents;
  /** o corte de 10% nos variáveis que o cenário acelerado supõe */
  extraCut: Cents;
  scenarios: Scenario[];
}

export function goalPlan(goals: Goal[], entries: Entry[], story: MoneyStory | null, today: IsoDate): GoalPlan {
  const month = monthKeyOf(today);
  const needs = goalNeeds(goals, entries, month, today);
  const asked = needs.reduce((t, n) => t + (n.need ?? 0), 0);
  const capacity = story ? story.margin : null;
  const base = Math.max(0, capacity ?? 0);
  const extraCut = story ? Math.round(Math.max(0, story.variable) * 0.1) : 0;
  const budgets: [ScenarioId, string, Cents][] = [
    ['conservador', 'Conservador', Math.round(base * 0.7)],
    ['equilibrado', 'Equilibrado', base],
    ['acelerado', 'Acelerado', base + extraCut],
  ];
  const scenarios = budgets.map(([id, label, budget]) => {
    const { rows, leftover } = allocate(needs, budget, month);
    return { id, label, budget, rows, leftover };
  });
  return {
    capacity,
    months: story?.months ?? [],
    needs,
    asked,
    conflict: capacity !== null && asked > Math.max(0, capacity),
    gap: capacity !== null ? Math.max(0, asked - Math.max(0, capacity)) : 0,
    extraCut,
    scenarios,
  };
}
