import { cardUsage, subscriptionChargeIn } from './cards';
import { type CashSnapshot, remainingByOrigin } from './cashflow';
import { addDaysIso, dateInMonth, diffDays, formatDayShort, isoToParts, monthKeyOf } from './dates';
import { debtProgress } from './debts';
import { goalProgress } from './goals';
import { formatMoney, formatPercent } from './money';
import type { Route } from './nav';
import type { MonthSummary, Occurrence } from './occurrences';
import type { Card, Category, Cents, Debt, Entry, Goal, IsoDate, Subscription } from './types';

/**
 * A leitura do mês, feita sem ninguém perguntar.
 *
 * Tudo aqui sai de conta sobre os números que a pessoa lançou. Nenhuma frase é
 * decoração: cada alerta tem um motivo que dá para conferir e uma ação que leva
 * para onde resolver. Alerta sem ação vira ruído, e ruído ensina a ignorar os
 * avisos que importam.
 */

export type Severity = 'critical' | 'warning' | 'info' | 'positive';

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  action?: { label: string; route: Route };
}

export interface InsightInput {
  snapshot: CashSnapshot;
  /** resumos por competência, do mais antigo ao mês corrente (o último) */
  history: MonthSummary[];
  /** ocorrências do mês corrente, na régua da competência */
  occurrences: Occurrence[];
  entries: Entry[];
  categories: Category[];
  goals: Goal[];
  debts: Debt[];
  cards: Card[];
  subscriptions: Subscription[];
  cardsEnabled: boolean;
}

const money = (v: Cents) => formatMoney(v);
const day = (iso: IsoDate) => Number(isoToParts(iso).d);

function when(today: IsoDate, date: IsoDate): string {
  const d = diffDays(today, date);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d > 1 && d <= 6) return `em ${d} dias`;
  return `dia ${formatDayShort(date)}`;
}

/* ------------------------------------------------------------ a manchete */

export interface Headline {
  tone: 'positive' | 'warning' | 'critical' | 'neutral';
  text: string;
}

/**
 * A frase de cima do Início. Uma só, e a mais importante: risco de ficar no
 * vermelho ganha de saldo apertado, que ganha de "está tudo bem".
 */
export function headline(s: CashSnapshot): Headline {
  if (!s.items.length) {
    return { tone: 'neutral', text: 'Assim que você lançar o salário e as contas, eu mostro quanto sobra.' };
  }

  const stretch = s.negative[0];
  if (stretch) {
    const a = day(stretch.from);
    const b = day(stretch.to);
    return {
      tone: 'critical',
      text:
        a === b
          ? `Há risco de saldo negativo no dia ${a}.`
          : `Há risco de saldo negativo entre os dias ${a} e ${b}.`,
    };
  }

  const low = s.lowest;
  const income = s.monthIn;
  if (low && income > 0 && low.balance < income * 0.1 && low.date !== s.today) {
    return { tone: 'warning', text: `Seu saldo previsto cai para ${money(low.balance)} no dia ${day(low.date)}.` };
  }

  if (s.nextIncome) {
    return {
      tone: 'positive',
      text: `Você tem ${money(Math.max(0, s.safeUntilIncome))} disponíveis até o próximo recebimento.`,
    };
  }

  return { tone: s.endOfMonth >= 0 ? 'positive' : 'critical', text: `Seu mês termina com ${money(s.endOfMonth)}.` };
}

/* --------------------------------------------------------- saúde do mês */

export interface Health {
  /** 0 a 100; null quando não há renda lançada para comparar */
  score: number | null;
  status: 'ok' | 'attention' | 'critical' | 'unknown';
  title: string;
  /** a frase que diz o porquê do estado */
  explanation: string;
  /** o que pesou, com o quanto pesou — nenhum número sem explicação */
  factors: { label: string; impact: number }[];
}

export function monthHealth(s: CashSnapshot): Health {
  if (s.monthIn <= 0) {
    return {
      score: null,
      status: 'unknown',
      title: 'Falta a renda do mês',
      explanation: 'Lance o que entra neste mês para eu comparar com o que sai.',
      factors: [],
    };
  }

  const factors: { label: string; impact: number }[] = [];
  const committed = s.monthOut / s.monthIn;

  let fromRatio = 0;
  if (committed > 1) fromRatio = 35 + Math.min(30, (committed - 1) * 100);
  else if (committed > 0.9) fromRatio = 15 + ((committed - 0.9) / 0.1) * 20;
  else if (committed > 0.7) fromRatio = ((committed - 0.7) / 0.2) * 15;
  if (fromRatio > 0) {
    factors.push({
      label: `Os gastos do mês somam ${formatPercent(committed)} do que entra`,
      impact: -Math.round(fromRatio),
    });
  }

  const negativeDays = s.negative.reduce((n, st) => n + diffDays(st.from, st.to) + 1, 0);
  if (negativeDays > 0) {
    factors.push({
      label: `O saldo fica negativo em ${negativeDays} ${negativeDays === 1 ? 'dia' : 'dias'}`,
      impact: -Math.min(35, 15 + negativeDays * 3),
    });
  }

  const overdue = s.items.filter((i) => i.overdue && i.kind !== 'in');
  if (overdue.length) {
    factors.push({
      label: `${overdue.length} ${overdue.length === 1 ? 'conta vencida' : 'contas vencidas'} sem baixa`,
      impact: -Math.min(15, overdue.length * 5),
    });
  }

  const invested = s.items.filter((i) => i.kind === 'invest' && i.date <= s.monthEnd).reduce((t, i) => t + i.amount, 0);
  if (invested > 0) factors.push({ label: `Você guardou ${money(invested)} neste mês`, impact: 5 });

  const score = Math.max(0, Math.min(100, Math.round(100 + factors.reduce((t, f) => t + f.impact, 0))));
  const status = score >= 80 ? 'ok' : score >= 55 ? 'attention' : 'critical';

  const explanation =
    status === 'ok'
      ? committed <= 0.9
        ? `Você está dentro do planejado: sobra ${money(s.endOfMonth)} no fim do mês.`
        : 'Você está dentro do planejado, mas com pouca folga.'
      : status === 'attention'
        ? `Seus compromissos consomem ${formatPercent(committed)} da sua renda do mês.`
        : negativeDays > 0
          ? 'As contas do mês passam do que entra em alguns dias. Vale remanejar antes.'
          : `O que sai passa do que entra: ${money(s.monthOut - s.monthIn)} a mais.`;

  return {
    score,
    status,
    title: status === 'ok' ? 'Dentro do planejado' : status === 'attention' ? 'Atenção' : 'Mês apertado',
    explanation,
    factors: factors.sort((a, b) => a.impact - b.impact),
  };
}

/* --------------------------------------------------------------- alertas */

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };

export function buildInsights(input: InsightInput): Insight[] {
  const { snapshot: s, cardsEnabled } = input;
  const today = s.today;
  const out: Insight[] = [];
  const catName = new Map(input.categories.map((c) => [c.id, c.name]));

  // 1. o saldo vai ficar negativo
  const stretch = s.negative[0];
  if (stretch) {
    out.push({
      id: 'negative',
      severity: 'critical',
      title:
        stretch.from === stretch.to
          ? `Saldo negativo previsto no dia ${day(stretch.from)}`
          : `Saldo negativo entre os dias ${day(stretch.from)} e ${day(stretch.to)}`,
      detail: `Chega a ${money(stretch.lowest)}. Adiar uma conta ou antecipar uma entrada resolve.`,
      action: { label: 'Ver o mês', route: { view: 'calendario' } },
    });
  }

  // 2. contas vencidas sem baixa
  const overdue = s.items.filter((i) => i.overdue && i.kind !== 'in');
  if (overdue.length) {
    const total = overdue.reduce((t, i) => t + i.amount, 0);
    out.push({
      id: 'overdue',
      severity: 'warning',
      title:
        overdue.length === 1
          ? `${overdue[0].label} venceu e não foi marcada como paga`
          : `${overdue.length} contas venceram e não foram marcadas como pagas`,
      detail: `Somam ${money(total)}. Se já pagou, marque como paga para o saldo bater.`,
      action: { label: 'Ver despesas', route: { view: 'movimentos', param: 'saidas' } },
    });
  }

  // 3. fatura vencendo
  if (cardsEnabled) {
    for (const inv of s.items.filter((i) => i.source === 'invoice' && i.date >= today)) {
      const d = diffDays(today, inv.date);
      if (d > 5) continue;
      out.push({
        id: `invoice-${inv.id}`,
        severity: d <= 1 ? 'warning' : 'info',
        title: `${inv.label} vence ${when(today, inv.date)}`,
        detail: `${money(inv.amount)} saem da conta nesse dia.`,
        action: { label: 'Ver cartão', route: { view: 'cartoes' } },
      });
    }
  }

  // 4. o que ainda sai antes do salário
  if (s.nextIncome && s.dueBeforeIncome > 0 && !stretch) {
    out.push({
      id: 'due-before-income',
      severity: 'info',
      title: `${money(s.dueBeforeIncome)} em contas antes do próximo recebimento`,
      detail: `${s.dueBeforeIncomeCount} ${s.dueBeforeIncomeCount === 1 ? 'conta' : 'contas'} até ${formatDayShort(s.nextIncome.date)}, quando entra ${s.nextIncome.label}.`,
      action: { label: 'Ver o que vem', route: { view: 'calendario' } },
    });
  }

  // 5. assinatura cobrada hoje ou amanhã, no cartão ou na conta
  for (const sub of input.subscriptions) {
    if (sub.deletedAt || sub.canceledAt) continue;
    for (const date of [today, addDaysIso(today, 1)]) {
      const m = monthKeyOf(date);
      if (!subscriptionChargeIn(sub, m) || dateInMonth(m, sub.billingDay) !== date) continue;
      const onCard = Boolean(sub.cardId) && cardsEnabled;
      out.push({
        id: `sub-${sub.id}-${date}`,
        severity: 'info',
        title: `${sub.name} será cobrada ${date === today ? 'hoje' : 'amanhã'}`,
        detail: `${money(sub.amount)} ${onCard ? 'no cartão' : 'da conta'}.`,
        action: { label: 'Ver assinaturas', route: { view: 'assinaturas' } },
      });
    }
  }

  // 6. categoria acima da média dos meses anteriores
  const past = input.history.slice(0, -1).filter((m) => m.count > 0).slice(-3);
  if (past.length >= 2) {
    const spentSoFar = new Map<string, Cents>();
    for (const o of input.occurrences) {
      if (o.kind !== 'out' || o.date > today) continue;
      const key = o.categoryId ?? 'sem-categoria';
      spentSoFar.set(key, (spentSoFar.get(key) ?? 0) + o.amount);
    }
    let worst: { id: string; pct: number; spent: Cents; avg: Cents } | null = null;
    for (const [id, spent] of spentSoFar) {
      if (id === 'sem-categoria' || !catName.has(id)) continue;
      const avg = past.reduce((t, m) => t + (m.byCategory.get(id) ?? 0), 0) / past.length;
      if (avg < 5000) continue;
      const pct = spent / avg - 1;
      if (pct >= 0.18 && spent - avg >= 5000 && (!worst || pct > worst.pct)) {
        worst = { id, pct, spent, avg: Math.round(avg) };
      }
    }
    if (worst) {
      out.push({
        id: `category-${worst.id}`,
        severity: 'warning',
        title: `Seu gasto com ${catName.get(worst.id) ?? 'uma categoria'} já está ${formatPercent(worst.pct)} acima da média`,
        detail: `${money(worst.spent)} até agora, contra ${money(worst.avg)} de média nos últimos ${past.length} meses.`,
        action: { label: 'Ver despesas', route: { view: 'movimentos', param: 'saidas' } },
      });
    }
  }

  // 7. metas: atrasada, quase lá
  const month = monthKeyOf(today);
  for (const goal of input.goals) {
    if (goal.archivedAt || goal.pausedAt || goal.deletedAt) continue;
    const p = goalProgress(goal, input.entries, month, today);
    if (p.reached) continue;
    if (p.late) {
      out.push({
        id: `goal-late-${goal.id}`,
        severity: 'warning',
        title: `Sua meta ${goal.name} passou do prazo`,
        detail: `Faltam ${money(p.missing)}. Dá para ajustar o prazo ou o valor.`,
        action: { label: 'Ajustar meta', route: { view: 'metas' } },
      });
    } else if (p.ratio >= 0.9) {
      out.push({
        id: `goal-near-${goal.id}`,
        severity: 'positive',
        title: `Falta pouco para ${goal.name}`,
        detail: `Só ${money(p.missing)} para chegar lá.`,
        action: { label: 'Ver meta', route: { view: 'metas' } },
      });
    }
  }

  // 8. dívida cara
  const pricey = input.debts
    .filter((d) => !d.deletedAt && !d.settledAt && d.monthlyRate >= 3 && !debtProgress(d, month).done)
    .sort((a, b) => b.monthlyRate - a.monthlyRate)[0];
  if (pricey) {
    out.push({
      id: `debt-${pricey.id}`,
      severity: 'warning',
      title: `${pricey.name} cobra ${pricey.monthlyRate.toLocaleString('pt-BR')}% ao mês`,
      detail: 'É a dívida mais cara. Pagar um pouco a mais nela rende mais que qualquer investimento.',
      action: { label: 'Simular', route: { view: 'dividas' } },
    });
  }

  // 9. cartão com limite quase todo comprometido
  if (cardsEnabled) {
    for (const card of input.cards) {
      if (card.deletedAt || card.archived || card.limit <= 0) continue;
      const usage = cardUsage(card, input.entries, input.subscriptions, month, today);
      if (usage.ratio < 0.8) continue;
      out.push({
        id: `limit-${card.id}`,
        severity: 'warning',
        title: `${card.name || card.institution}: ${formatPercent(usage.ratio)} do limite comprometido`,
        detail: `Restam ${money(usage.available)}, contando as parcelas que ainda vêm.`,
        action: { label: 'Ver cartão', route: { view: 'cartoes' } },
      });
    }
  }

  // 10. sobra no fim do mês, perto do fim do mês
  const remaining = remainingByOrigin(s);
  const lateInMonth = diffDays(today, s.monthEnd) <= 10;
  if (!stretch && lateInMonth && s.endOfMonth >= 20000 && remaining.entry + remaining.invoice < s.endOfMonth) {
    const hasGoal = input.goals.some((g) => !g.archivedAt && !g.pausedAt && !g.deletedAt);
    out.push({
      id: 'surplus',
      severity: 'positive',
      title: `Sobram ${money(s.endOfMonth)} neste mês`,
      detail: hasGoal ? 'Quer direcionar uma parte para uma meta?' : 'Dinheiro sem destino costuma sumir. Que tal criar uma meta?',
      action: { label: hasGoal ? 'Ver metas' : 'Criar meta', route: { view: 'metas' } },
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
