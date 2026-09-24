import { buildInvoice, subscriptionChargeIn } from './cards';
import {
  addDaysIso,
  addMonthsToKey,
  dateInMonth,
  diffDays,
  monthKeyOf,
  monthKeyParts,
  partsToIso,
} from './dates';
import { occurrencesInMonth, type Occurrence } from './occurrences';
import type { Card, Cents, Debt, Entry, FlowKind, IsoDate, MonthKey, Subscription } from './types';

/**
 * O dinheiro no dia em que ele se mexe.
 *
 * A tela de despesas conta a compra no dia da compra: é a visão de "para onde
 * foi o dinheiro". Mas a pergunta "quanto posso gastar até o salário" precisa
 * de outra régua — a da conta corrente. Nela, a compra no cartão só sai no
 * vencimento da fatura, a assinatura sai no dia da cobrança e a parcela da
 * dívida sai no dia dela.
 *
 * Este módulo monta essa régua. É puro: recebe os registros e o dia de hoje e
 * devolve a linha do tempo; quem desenha é a tela.
 */

export type FlowSource = 'entry' | 'subscription' | 'invoice' | 'debt';

export interface FlowItem {
  /** estável entre renderizações: serve de chave de lista */
  id: string;
  date: IsoDate;
  kind: FlowKind;
  source: FlowSource;
  label: string;
  /** sempre positivo; o sentido vem de `kind` */
  amount: Cents;
  categoryId: string | null;
  /** baixado (lançamento marcado como pago) */
  settled: boolean;
  /** venceu e não foi baixado; só lançamentos têm baixa */
  overdue: boolean;
  entryId?: string;
  occurrenceKey?: string;
  subscriptionId?: string;
  cardId?: string;
  debtId?: string;
  installment?: { index: number; total: number } | null;
}

export interface FlowInput {
  entries: Entry[];
  subscriptions: Subscription[];
  cards: Card[];
  debts: Debt[];
  /** com cartões desligados, compra no cartão volta a ser gasto comum */
  cardsEnabled: boolean;
  today: IsoDate;
}

export const signed = (item: Pick<FlowItem, 'kind' | 'amount'>): Cents =>
  item.kind === 'in' ? item.amount : -item.amount;

/** meses que um intervalo de datas toca, em ordem */
export function monthsCovering(from: IsoDate, to: IsoDate): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = monthKeyOf(from); m <= monthKeyOf(to); m = addMonthsToKey(m, 1)) out.push(m);
  return out;
}

/**
 * Todos os movimentos de caixa entre duas datas, inclusive.
 *
 * `entries` precisa trazer os lançamentos até o último mês do intervalo — a
 * fatura de outubro depende de compras de setembro, e a parcela de hoje, de
 * uma compra do ano passado.
 */
export function buildFlows(input: FlowInput, from: IsoDate, to: IsoDate): FlowItem[] {
  const { entries, subscriptions, debts, cardsEnabled, today } = input;
  const cards = cardsEnabled ? input.cards.filter((c) => !c.deletedAt && !c.archived) : [];
  const cardIds = new Set(cards.map((c) => c.id));
  const months = monthsCovering(from, to);
  const within = (d: IsoDate) => d >= from && d <= to;
  const out: FlowItem[] = [];

  // lançamentos da conta; o que foi no cartão entra pela fatura
  const cashEntries = entries.filter((e) => !e.deletedAt && !(e.cardId && cardIds.has(e.cardId)));
  for (const month of months) {
    for (const o of occurrencesInMonth(cashEntries, month, today)) {
      if (!within(o.date)) continue;
      out.push({
        id: `e:${o.entryId}:${o.key}`,
        date: o.date,
        kind: o.kind,
        source: 'entry',
        label: o.description,
        amount: o.amount,
        categoryId: o.categoryId,
        settled: o.settlement !== null,
        overdue: o.overdue,
        entryId: o.entryId,
        occurrenceKey: o.key,
        installment: o.installment,
      });
    }
  }

  // assinaturas pagas pela conta, no dia da cobrança
  for (const sub of subscriptions) {
    if (sub.deletedAt || (sub.cardId && cardIds.has(sub.cardId))) continue;
    for (const month of months) {
      if (!subscriptionChargeIn(sub, month)) continue;
      const date = dateInMonth(month, sub.billingDay);
      if (!within(date) || date < sub.startedAt) continue;
      if (sub.canceledAt && date > sub.canceledAt) continue;
      out.push({
        id: `s:${sub.id}:${month}`,
        date,
        kind: 'out',
        source: 'subscription',
        label: sub.name,
        amount: sub.amount,
        categoryId: sub.categoryId,
        settled: false,
        overdue: false,
        subscriptionId: sub.id,
      });
    }
  }

  // parcela de dívida marcada para entrar no fluxo
  for (const debt of debts) {
    if (debt.deletedAt || debt.settledAt || !debt.inFlow) continue;
    const count = Math.max(1, Math.trunc(debt.installments));
    for (const month of months) {
      const index = monthsBetween(debt.startMonth, month) + 1;
      if (index < 1 || index > count) continue;
      const date = dateInMonth(month, debt.dueDay ?? DEFAULT_DEBT_DAY);
      if (!within(date)) continue;
      out.push({
        id: `d:${debt.id}:${month}`,
        date,
        kind: 'out',
        source: 'debt',
        label: debt.name,
        amount: debt.installment,
        categoryId: null,
        settled: false,
        overdue: false,
        debtId: debt.id,
        installment: { index, total: count },
      });
    }
  }

  // a fatura de cada cartão, no vencimento; a de um mês pode vencer no seguinte
  for (const card of cards) {
    for (const month of [addMonthsToKey(months[0], -1), ...months]) {
      const invoice = buildInvoice(card, entries, subscriptions, month, today);
      if (invoice.total <= 0 || !within(invoice.dueOn)) continue;
      out.push({
        id: `f:${card.id}:${month}`,
        date: invoice.dueOn,
        kind: 'out',
        source: 'invoice',
        label: `Fatura ${card.name || card.institution}`,
        amount: invoice.total,
        categoryId: null,
        settled: false,
        overdue: false,
        cardId: card.id,
      });
    }
  }

  return out.sort(byDateThenKind);
}

/** dia padrão da parcela de dívida cadastrada antes de o dia existir */
export const DEFAULT_DEBT_DAY = 10;

function byDateThenKind(a: FlowItem, b: FlowItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // no mesmo dia, o que entra vem antes: o salário cobre a conta do dia
  if (a.kind !== b.kind) return a.kind === 'in' ? -1 : b.kind === 'in' ? 1 : 0;
  return b.amount - a.amount;
}

function monthsBetween(from: MonthKey, to: MonthKey): number {
  const a = monthKeyParts(from);
  const b = monthKeyParts(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/* ------------------------------------------------- linhas que não são lançamento */

/**
 * Assinaturas e parcelas de dívida como linhas do mês, na régua da
 * competência (a das telas de movimentos).
 *
 * Antes, uma assinatura paga no débito nunca entrava nas despesas, e a dívida
 * marcada para "entrar nas despesas" não entrava em lugar nenhum. Elas não
 * viram lançamento no banco — continuam sendo editadas na tela delas —, mas
 * passam a pesar no mês como pesam na vida.
 */
export function virtualOccurrences(
  subscriptions: Subscription[],
  debts: Debt[],
  month: MonthKey,
  today: IsoDate,
): Occurrence[] {
  const out: Occurrence[] = [];

  for (const sub of subscriptions) {
    if (sub.deletedAt || !subscriptionChargeIn(sub, month)) continue;
    const date = dateInMonth(month, sub.billingDay);
    if (date < sub.startedAt || (sub.canceledAt && date > sub.canceledAt)) continue;
    out.push({
      entryId: `sub:${sub.id}`,
      key: month,
      date,
      kind: 'out',
      description: sub.name,
      amount: sub.amount,
      categoryId: sub.categoryId,
      accountId: null,
      cardId: sub.cardId,
      // cobrança automática: o que já passou foi cobrado
      settlement: date <= today ? { at: `${date}T12:00:00.000Z` } : null,
      installment: null,
      overdue: false,
      virtual: 'subscription',
      refId: sub.id,
    });
  }

  for (const debt of debts) {
    if (debt.deletedAt || debt.settledAt || !debt.inFlow) continue;
    const count = Math.max(1, Math.trunc(debt.installments));
    const index = monthsBetween(debt.startMonth, month) + 1;
    if (index < 1 || index > count) continue;
    const date = dateInMonth(month, debt.dueDay ?? DEFAULT_DEBT_DAY);
    out.push({
      entryId: `debt:${debt.id}`,
      key: month,
      date,
      kind: 'out',
      description: debt.name,
      amount: debt.installment,
      categoryId: null,
      accountId: null,
      cardId: null,
      settlement: date <= today ? { at: `${date}T12:00:00.000Z` } : null,
      installment: { index, total: count },
      overdue: false,
      virtual: 'debt',
      refId: debt.id,
    });
  }

  return out;
}

/* ------------------------------------------------------------ saldo dia a dia */

export interface DayBalance {
  date: IsoDate;
  /** saldo no fim do dia */
  balance: Cents;
  inflow: Cents;
  outflow: Cents;
  projected: boolean;
}

/** saldo corrido de `from` a `to`, partindo de `opening` antes do primeiro dia */
export function dailyBalances(items: FlowItem[], from: IsoDate, to: IsoDate, opening: Cents, today: IsoDate): DayBalance[] {
  const byDay = new Map<IsoDate, { inflow: Cents; outflow: Cents }>();
  for (const item of items) {
    if (item.date < from || item.date > to) continue;
    const slot = byDay.get(item.date) ?? { inflow: 0, outflow: 0 };
    if (item.kind === 'in') slot.inflow += item.amount;
    else slot.outflow += item.amount;
    byDay.set(item.date, slot);
  }

  const out: DayBalance[] = [];
  let running = opening;
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const slot = byDay.get(d) ?? { inflow: 0, outflow: 0 };
    running += slot.inflow - slot.outflow;
    out.push({ date: d, balance: running, inflow: slot.inflow, outflow: slot.outflow, projected: d > today });
  }
  return out;
}

/** trechos seguidos de dias no vermelho: [primeiro, último] */
export function negativeStretches(days: DayBalance[]): { from: IsoDate; to: IsoDate; lowest: Cents }[] {
  const out: { from: IsoDate; to: IsoDate; lowest: Cents }[] = [];
  let current: { from: IsoDate; to: IsoDate; lowest: Cents } | null = null;
  for (const d of days) {
    if (d.balance < 0) {
      if (current) {
        current.to = d.date;
        current.lowest = Math.min(current.lowest, d.balance);
      } else {
        current = { from: d.date, to: d.date, lowest: d.balance };
      }
    } else if (current) {
      out.push(current);
      current = null;
    }
  }
  if (current) out.push(current);
  return out;
}

/* ---------------------------------------------------------------- o retrato */

export interface CashSnapshot {
  today: IsoDate;
  month: MonthKey;
  monthStart: IsoDate;
  monthEnd: IsoDate;
  /** movimentos do começo do mês até o fim do mês seguinte */
  items: FlowItem[];
  /** saldo corrido do mês corrente, dia a dia */
  days: DayBalance[];
  /** saldo hoje: tudo que aconteceu no mês até hoje, saldo anterior incluso */
  balanceNow: Cents;
  /** saldo previsto no último dia do mês */
  endOfMonth: Cents;
  /** o próximo dinheiro que entra, se houver nos próximos 60 dias */
  nextIncome: FlowItem | null;
  daysToNextIncome: number | null;
  /**
   * Quanto dá para gastar hoje sem deixar nenhuma conta até o próximo
   * recebimento sem cobertura: o menor saldo previsto nesse intervalo.
   */
  safeUntilIncome: Cents;
  /** o mesmo, olhando até o fim do mês */
  safeUntilMonthEnd: Cents;
  /** o dia de menor saldo daqui até o fim do mês */
  lowest: DayBalance | null;
  negative: { from: IsoDate; to: IsoDate; lowest: Cents }[];
  /** o que ainda sai até o próximo recebimento (ou até o fim do mês) */
  dueBeforeIncome: Cents;
  dueBeforeIncomeCount: number;
  /** totais do mês na régua do caixa */
  monthIn: Cents;
  monthOut: Cents;
  /** já existe saldo anterior informado neste mês? */
  hasOpening: boolean;
}

export const OPENING_TAG = 'saldo-anterior';

/**
 * O retrato do dinheiro hoje — o que o Início mostra primeiro.
 *
 * O saldo parte do "saldo do mês anterior" que a pessoa informou (ou ajustou
 * para bater com o banco). Sem ele, o saldo de hoje é só a soma do que entrou
 * e saiu neste mês, e a tela avisa isso em vez de fingir precisão.
 */
export function cashSnapshot(input: FlowInput): CashSnapshot {
  const { today } = input;
  const month = monthKeyOf(today);
  const { y, m } = monthKeyParts(month);
  const monthStart = partsToIso(y, m, 1);
  const monthEnd = partsToIso(y, m, new Date(y, m + 1, 0).getDate());
  const horizon = addDaysIso(today, 60);
  const windowEnd = horizon > monthEnd ? horizon : monthEnd;

  const items = buildFlows(input, monthStart, windowEnd);
  const monthItems = items.filter((i) => i.date <= monthEnd);
  const days = dailyBalances(monthItems, monthStart, monthEnd, 0, today);

  const balanceNow = days.find((d) => d.date === today)?.balance ?? 0;
  const endOfMonth = days[days.length - 1]?.balance ?? 0;

  const nextIncome = items.find((i) => i.kind === 'in' && i.date > today && i.date <= horizon) ?? null;
  const daysToNextIncome = nextIncome ? diffDays(today, nextIncome.date) : null;

  // saldo corrido de hoje até o horizonte, para achar o menor ponto
  const ahead = dailyBalances(
    items.filter((i) => i.date > today),
    addDaysIso(today, 1),
    windowEnd,
    balanceNow,
    today,
  );
  const untilIncome = nextIncome ? ahead.filter((d) => d.date < nextIncome.date) : ahead.filter((d) => d.date <= monthEnd);
  const safeUntilIncome = Math.min(balanceNow, ...untilIncome.map((d) => d.balance));
  const restOfMonth = ahead.filter((d) => d.date <= monthEnd);
  const safeUntilMonthEnd = Math.min(balanceNow, ...restOfMonth.map((d) => d.balance));

  const lowest = restOfMonth.reduce<DayBalance | null>((min, d) => (!min || d.balance < min.balance ? d : min), null);

  const limit = nextIncome ? nextIncome.date : addDaysIso(monthEnd, 1);
  const due = items.filter((i) => i.kind !== 'in' && i.date > today && i.date < limit);

  const monthIn = monthItems.filter((i) => i.kind === 'in').reduce((s, i) => s + i.amount, 0);
  const monthOut = monthItems.filter((i) => i.kind !== 'in').reduce((s, i) => s + i.amount, 0);

  const hasOpening = input.entries.some(
    (e) => !e.deletedAt && e.tags.includes(OPENING_TAG) && monthKeyOf(e.date) === month,
  );

  return {
    today,
    month,
    monthStart,
    monthEnd,
    items,
    days,
    balanceNow,
    endOfMonth,
    nextIncome,
    daysToNextIncome,
    safeUntilIncome,
    safeUntilMonthEnd,
    lowest,
    negative: negativeStretches(days.filter((d) => d.date >= today)),
    dueBeforeIncome: due.reduce((s, i) => s + i.amount, 0),
    dueBeforeIncomeCount: due.length,
    monthIn,
    monthOut,
    hasOpening,
  };
}

/** o que ainda sai no mês, por origem: ajuda a explicar a saúde do mês */
export function remainingByOrigin(snapshot: CashSnapshot): Record<FlowSource, Cents> {
  const out: Record<FlowSource, Cents> = { entry: 0, subscription: 0, invoice: 0, debt: 0 };
  for (const i of snapshot.items) {
    if (i.kind === 'in' || i.date <= snapshot.today || i.date > snapshot.monthEnd) continue;
    out[i.source] += i.amount;
  }
  return out;
}
