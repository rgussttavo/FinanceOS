import type { CashSnapshot } from './cashflow';
import type { Area, AreaId, Checkup, ConfidenceCheck } from './checkup';
import { addMonthsToKey, formatDayShort, formatMonthLabel, monthKeyOf } from './dates';
import type { MoneyToDecide } from './decision';
import type { GoalPlan } from './goal-plan';
import { goalPace } from './goals';
import { formatMoney } from './money';
import { monthUse, type ExpandMonth, type MoneyStory } from './money-story';
import type { Route } from './nav';
import type { Category, Cents, Entry, Goal, IsoDate, MonthKey, Subscription } from './types';
import { subscriptionChargeIn } from './cards';
import type { Habits } from './behavior';

/**
 * Estratégia e acompanhamento (fase 6): em que etapa a situação está, qual é
 * a próxima melhor ação e como foi o mês que passou.
 *
 * A etapa descreve a situação, nunca a pessoa — "sua situação pede foco em
 * proteger", e não "você é desorganizado". Os números vêm do diagnóstico, do
 * caixa e do plano das metas; nada aqui é calculado de outro jeito.
 */

const money = (v: Cents) => formatMoney(v, { signed: v < 0 });

/* ------------------------------------------------------------- a trilha */

export type StageId = 'estabilizar' | 'proteger' | 'reduzir' | 'objetivos' | 'patrimonio';

export const STAGES: { id: StageId; label: string; aim: string }[] = [
  { id: 'estabilizar', label: 'Estabilizar', aim: 'fechar o mês sem conta descoberta e sem sair mais do que entra' },
  { id: 'proteger', label: 'Proteger', aim: 'ter pelo menos 1 mês de despesas essenciais guardado' },
  { id: 'reduzir', label: 'Reduzir dívidas', aim: 'parcelas até 15% da renda e cartão até 30% do limite' },
  { id: 'objetivos', label: 'Objetivos', aim: 'reserva completa e metas no ritmo' },
  { id: 'patrimonio', label: 'Patrimônio', aim: 'fazer crescer o que já está de pé' },
];

export interface Stage {
  id: StageId;
  index: number;
  label: string;
  /** a frase sobre a situação: "sua situação pede foco em…" */
  situation: string;
  /** o que falta para a próxima etapa */
  next: string;
}

const areaOf = (c: Checkup, id: AreaId): Area | undefined => c.areas.find((a) => a.id === id);
const pressing = (a?: Area) => a?.status === 'alert' || a?.status === 'attention';

export function stageOf(checkup: Checkup): Stage | null {
  const flow = areaOf(checkup, 'fluxo');
  if (!flow || flow.status === 'unknown') return null;
  const reserve = areaOf(checkup, 'reserva');
  const debts = areaOf(checkup, 'dividas');
  const cards = areaOf(checkup, 'cartoes');
  const goals = areaOf(checkup, 'metas');
  const make = (id: StageId, next: string): Stage => {
    const index = STAGES.findIndex((s) => s.id === id);
    const s = STAGES[index];
    return { id, index, label: s.label, situation: `Sua situação pede foco em ${s.label.toLowerCase()}: ${s.aim}.`, next };
  };

  if (pressing(flow)) {
    return make('estabilizar', flow.status === 'alert' ? 'Cobrir as contas até o próximo recebimento.' : `Fechar os meses com as entradas acima das saídas (hoje: ${flow.label}).`);
  }
  const months = reserve?.facts.meses;
  const essential = reserve?.facts.essencialMensal;
  const saved = reserve?.facts.reserva;
  if (typeof months === 'number' && months < 1 && typeof essential === 'number' && typeof saved === 'number') {
    return make('proteger', `Guardar mais ${formatMoney(Math.max(0, essential - saved))} para ter 1 mês de despesas essenciais.`);
  }
  if (pressing(debts) || pressing(cards)) {
    const parts = [
      pressing(debts) ? `levar as parcelas (hoje ${debts!.label}) para até 15% da renda` : '',
      pressing(cards) ? `trazer o cartão (hoje ${cards!.label}) para até 30%` : '',
    ].filter(Boolean);
    return make('reduzir', `${parts.join(' e ').replace(/^./, (c) => c.toUpperCase())}.`);
  }
  if (reserve?.status === 'unknown') return make('objetivos', 'Medir a reserva: falta um mês completo de despesas essenciais.');
  if (reserve?.status === 'attention' || goals?.status === 'attention') {
    const parts = [
      reserve?.status === 'attention' && typeof essential === 'number' && typeof saved === 'number' && typeof reserve.facts.referencia === 'number'
        ? `completar a reserva (faltam ${formatMoney(Math.max(0, reserve.facts.referencia * essential - saved))})`
        : '',
      goals?.status === 'attention' ? 'pôr as metas no ritmo' : '',
    ].filter(Boolean);
    return make('objetivos', `${parts.join(' e ').replace(/^./, (c) => c.toUpperCase())}.`);
  }
  return make('patrimonio', 'Manter a base de pé e dar direção ao que sobra: um objetivo de longo prazo ajuda.');
}

/* --------------------------------------------------- a próxima ação */

export interface NextAction {
  id: string;
  title: string;
  /** por que agora, em números */
  reason: string;
  /** o que muda se fizer */
  impact: string;
  route: Route;
  /** maior = mais urgente */
  priority: number;
}

export interface StrategyInput {
  checkup: Checkup;
  cash: CashSnapshot;
  decide: MoneyToDecide;
  story: MoneyStory | null;
  plan: GoalPlan;
  subscriptions: Subscription[];
  categories: Category[];
  today: IsoDate;
}

const CHECK_TITLE: Record<ConfidenceCheck['id'], string> = {
  saldo: 'Informar o saldo de hoje das contas',
  conferido: 'Conferir as contas com o banco',
  categorias: 'Categorizar os gastos recentes',
  renda: 'Lançar o próximo recebimento',
  conferencia: 'Resolver os problemas da conferência dos dados',
  recente: 'Registrar os gastos da semana',
};

/** as ações possíveis agora, da mais urgente para a menos */
export function nextActions(input: StrategyInput): NextAction[] {
  const { checkup, cash, decide, story, plan } = input;
  const out: NextAction[] = [];
  const flow = areaOf(checkup, 'fluxo');
  const reserve = areaOf(checkup, 'reserva');
  const debts = areaOf(checkup, 'dividas');
  const cards = areaOf(checkup, 'cartoes');
  const goals = areaOf(checkup, 'metas');
  const stage = stageOf(checkup);
  const catName = (id: string) => input.categories.find((c) => c.id === id)?.name ?? 'Sem categoria';

  if (cash.overdueCount > 0) {
    out.push({
      id: 'vencidas',
      title: `Resolver ${cash.overdueCount} ${cash.overdueCount === 1 ? 'conta vencida' : 'contas vencidas'}`,
      reason: `${formatMoney(cash.overdue)} venceram e não foram baixados.`,
      impact: 'Se já foram pagas, dar baixa deixa o saldo certo; se não, pagar evita juros e multa.',
      route: { view: 'calendario' },
      priority: 100,
    });
  }

  if (checkup.confidence.percent < 60) {
    const miss = checkup.confidence.checks.filter((c) => !c.ok).sort((a, b) => b.weight - a.weight)[0];
    if (miss) {
      out.push({
        id: `dados-${miss.id}`,
        title: CHECK_TITLE[miss.id],
        reason: `Os dados estão com confiança ${checkup.confidence.level} (${checkup.confidence.percent}%). ${miss.hint}`,
        impact: 'Com dados completos, o disponível, o diagnóstico e as projeções passam a bater com o banco.',
        route: miss.route ?? { view: 'movimentos' },
        priority: 95,
      });
    }
  }

  if (decide.available < 0) {
    out.push({
      id: 'cobrir',
      title: 'Cobrir as contas até o próximo recebimento',
      reason: `Faltam ${formatMoney(-decide.available)} ${decide.income ? `até ${formatDayShort(decide.income.date)}` : 'até o fim do mês'}.`,
      impact: 'Antecipar uma entrada ou adiar uma saída evita conta atrasada.',
      route: { view: 'calendario' },
      priority: 90,
    });
  } else if (flow?.status === 'attention' && story && story.topVariable[0]) {
    const top = story.topVariable[0];
    out.push({
      id: 'variaveis',
      title: `Rever os gastos com ${catName(top.categoryId)}`,
      reason: `Nos últimos meses, as saídas passaram das entradas em ${formatMoney(Math.max(0, -story.margin))} por mês; ${catName(top.categoryId)} leva ${formatMoney(top.amount)} em média.`,
      impact: `Gastar 20% menos ali libera ${formatMoney(Math.round(top.amount * 0.2))} por mês.`,
      route: { view: 'movimentos', param: 'saidas' },
      priority: 80,
    });
  }

  const month = monthKeyOf(input.today);
  const subs = input.subscriptions.filter((s) => !s.canceledAt && !s.deletedAt);
  const subsMonthly = subs.reduce((t, s) => t + subscriptionChargeIn(s, month), 0);
  if (subs.length >= 3 && stage && stage.index <= 3) {
    out.push({
      id: 'assinaturas',
      title: `Rever ${subs.length} assinaturas`,
      reason: `Somam ${formatMoney(subsMonthly)} por mês.`,
      impact: `São ${formatMoney(subsMonthly * 12)} por ano: cada uma cancelada vale doze vezes o preço.`,
      route: { view: 'assinaturas' },
      priority: 55,
    });
  }

  const months = reserve?.facts.meses;
  const essential = reserve?.facts.essencialMensal;
  const saved = reserve?.facts.reserva;
  if (typeof months === 'number' && months < 1 && typeof essential === 'number' && typeof saved === 'number') {
    const missing = Math.max(0, essential - saved);
    const pace = story && story.margin > 0 ? Math.min(story.margin, missing) : 0;
    out.push({
      id: 'reserva-1',
      title: 'Começar a reserva',
      reason: `Hoje ela cobre ${reserve!.label} das despesas essenciais; faltam ${formatMoney(missing)} para o primeiro mês.`,
      impact: pace > 0 ? `Guardando ${formatMoney(pace)} por mês, o primeiro mês fica pronto em ${Math.ceil(missing / pace)} ${Math.ceil(missing / pace) === 1 ? 'mês' : 'meses'}.` : 'Guardar um pouco todo mês, mesmo pouco, cria o primeiro colchão.',
      route: { view: 'metas' },
      priority: 70,
    });
  }

  if (pressing(debts)) {
    out.push({
      id: 'dividas',
      title: 'Escolher qual dívida atacar primeiro',
      reason: `As parcelas levam ${debts!.label}.`,
      impact: 'Antecipar parcelas da dívida de juro maior reduz o custo total; a de saldo menor libera parcela antes.',
      route: { view: 'dividas' },
      priority: debts!.status === 'alert' ? 75 : 65,
    });
  }
  if (pressing(cards)) {
    out.push({
      id: 'cartoes',
      title: 'Segurar novas compras no cartão',
      reason: `${cards!.label.replace(/^./, (c) => c.toUpperCase())} está comprometido, contando as parcelas.`,
      impact: 'Cada parcela nova tira limite e pesa nas próximas faturas.',
      route: { view: 'cartoes' },
      priority: cards!.status === 'alert' ? 74 : 64,
    });
  }

  if (plan.conflict && plan.capacity !== null) {
    out.push({
      id: 'metas-conflito',
      title: 'Rever as prioridades das metas',
      reason:
        plan.capacity > 0
          ? `As metas com prazo pedem ${formatMoney(plan.asked)} por mês, e sobram ${formatMoney(plan.capacity)}.`
          : `As metas com prazo pedem ${formatMoney(plan.asked)} por mês, e não está sobrando dinheiro (${money(plan.capacity)} por mês).`,
      impact: 'Os cenários mostram o prazo de cada meta conforme a prioridade.',
      route: { view: 'metas' },
      priority: 50,
    });
  } else if (goals?.status === 'attention') {
    out.push({ id: 'metas-ritmo', title: 'Pôr as metas no ritmo', reason: goals.why, impact: 'Ajustar aporte, prazo ou valor deixa a meta possível.', route: { view: 'metas' }, priority: 45 });
  }

  if (reserve?.status === 'attention' && !(typeof months === 'number' && months < 1)) {
    out.push({ id: 'reserva', title: 'Completar a reserva', reason: reserve.why.split('. ').slice(0, 2).join('. ') + '.', impact: 'A reserva completa é o que deixa um imprevisto não virar dívida.', route: { view: 'metas' }, priority: 40 });
  }

  if (!out.length && stage?.id === 'patrimonio') {
    out.push({
      id: 'longo-prazo',
      title: 'Definir um objetivo de longo prazo',
      reason: 'A base está de pé: fluxo, reserva e dívidas sem pendência.',
      impact: 'Com valor e prazo, o app mostra quanto guardar por mês e acompanha o ritmo.',
      route: { view: 'metas' },
      priority: 10,
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/* ------------------------------------------------- o mês que passou */

export interface MonthReview {
  month: MonthKey;
  income: Cents;
  spent: Cents;
  /** entrou − saiu (sem aportes) */
  result: Cents;
  invested: Cents;
  /** o resultado médio dos três meses anteriores a ele */
  averageResult: Cents | null;
  /** as categorias variáveis que mais mudaram contra a média */
  changes: { categoryId: string; diff: Cents }[];
  /** o que entrou nas metas no mês */
  goalsSaved: Cents;
}

export function monthReview(expand: ExpandMonth, entries: Entry[], goals: Goal[], today: IsoDate, month?: MonthKey): MonthReview | null {
  const target = month ?? addMonthsToKey(monthKeyOf(today), -1);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const use = monthUse(expand(target), byId, target);
  const spent = use.fixed + use.installments + use.variable;
  if (!use.income && !spent) return null;
  const prior = [3, 2, 1]
    .map((i) => addMonthsToKey(target, -i))
    .map((m) => monthUse(expand(m), byId, m))
    .filter((u) => u.income || u.fixed || u.installments || u.variable);
  const averageResult = prior.length
    ? Math.round(prior.reduce((t, u) => t + u.income - u.fixed - u.installments - u.variable, 0) / prior.length)
    : null;
  const avgBy = new Map<string, Cents>();
  for (const u of prior) for (const [k, v] of u.variableByCategory) avgBy.set(k, (avgBy.get(k) ?? 0) + v / prior.length);
  const keys = new Set([...avgBy.keys(), ...use.variableByCategory.keys()]);
  const changes = [...keys]
    .map((k) => ({ categoryId: k, diff: Math.round((use.variableByCategory.get(k) ?? 0) - (avgBy.get(k) ?? 0)) }))
    .filter((c) => Math.abs(c.diff) >= 1000)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3);
  const goalsSaved = goals
    .filter((g) => !g.archivedAt && !g.deletedAt)
    .reduce((t, g) => t + (goalPace(g, entries, monthKeyOf(today), today).history.find((h) => h.month === target)?.amount ?? 0), 0);
  return {
    month: target,
    income: use.income,
    spent,
    result: use.income - spent,
    invested: use.invested,
    averageResult: prior.length ? averageResult : null,
    changes,
    goalsSaved,
  };
}

/** o mês, contado em frases curtas: o resultado, o que mudou, as metas */
export function reviewText(r: MonthReview, categoryName: (id: string) => string): { headline: string; lines: string[]; tone: 'good' | 'neutral' | 'watch' } {
  const month = formatMonthLabel(r.month);
  const lines: string[] = [];
  const vs = r.averageResult !== null ? r.result - r.averageResult : null;
  const headline =
    r.result >= 0
      ? `Em ${month}, entraram ${formatMoney(r.income)} e saíram ${formatMoney(r.spent)}: sobraram ${formatMoney(r.result)}.`
      : `Em ${month}, entraram ${formatMoney(r.income)} e saíram ${formatMoney(r.spent)}: as saídas passaram em ${formatMoney(-r.result)}.`;
  if (vs !== null && Math.abs(vs) >= 1000) {
    lines.push(
      vs > 0
        ? `Foram ${formatMoney(vs)} melhor que a média dos meses anteriores.`
        : `Ficou ${formatMoney(-vs)} abaixo da média dos meses anteriores. Vale ver o que mudou.`,
    );
  }
  const up = r.changes.filter((c) => c.diff > 0);
  const down = r.changes.filter((c) => c.diff < 0);
  if (up.length) lines.push(`Subiram: ${up.map((c) => `${categoryName(c.categoryId)} (+${formatMoney(c.diff)})`).join(', ')}.`);
  if (down.length) lines.push(`Caíram: ${down.map((c) => `${categoryName(c.categoryId)} (${formatMoney(c.diff, { signed: true })})`).join(', ')}.`);
  if (r.goalsSaved > 0) lines.push(`Nas metas, entraram ${formatMoney(r.goalsSaved)}.`);
  const tone = r.result < 0 || (vs !== null && vs < -1000) ? 'watch' : vs !== null && vs > 1000 ? 'good' : 'neutral';
  return { headline, lines, tone };
}

/** o que as telas e o assistente recebem, calculado uma vez */
export interface StrategyView {
  stage: Stage | null;
  actions: NextAction[];
  /** o mês para fechar agora, quando é dia 1 a 7 e ainda não foi visto */
  review: MonthReview | null;
  /** hora de revisar o plano */
  quarterly: boolean;
  /** o comportamento observado, calculado só quando o fechamento do mês aparece */
  habits: Habits | null;
  /** o mesmo cálculo, sob demanda (o assistente pergunta "estou evoluindo?") */
  getHabits: () => Habits;
}

/* ------------------------------------------------------- os check-ins */

/** o fechamento do mês aparece do dia 1 ao 7, até a pessoa dispensar */
export function monthlyDue(today: IsoDate, seen: MonthKey | null | undefined): MonthKey | null {
  const day = Number(today.slice(8, 10));
  const reviewed = addMonthsToKey(monthKeyOf(today), -1);
  if (day > 7 || seen === reviewed) return null;
  return reviewed;
}

/** a revisão do plano volta a cada três meses; na primeira vez, depois de três meses de uso */
export function quarterlyDue(today: IsoDate, last: IsoDate | null | undefined, firstUse: IsoDate | null): boolean {
  const from = last ?? firstUse;
  if (!from) return false;
  const months = (Number(today.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(from.slice(5, 7));
  return months > 3 || (months === 3 && today.slice(8, 10) >= from.slice(8, 10));
}
