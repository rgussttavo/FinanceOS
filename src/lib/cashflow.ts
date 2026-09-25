import { realizedCharges, realizedKey, subscriptionCharge } from './cards';
import { addDaysIso, addMonthsToKey, diffDays, monthKeyOf, monthKeyParts, partsToIso } from './dates';
import { DEFAULT_DEBT_DAY, debtInstallmentIn } from './debts';
import {
  balancesAt,
  cashNow,
  ledgerAccounts,
  pendingDay,
  plannedItems,
  realizedPostings,
  type LedgerInput,
  type PlannedItem,
  type Posting,
} from './ledger';
import { OPENING_TAG, type Occurrence } from './occurrences';
import type { Cents, Debt, Entry, FlowKind, IsoDate, MonthKey, Subscription } from './types';

/**
 * O dinheiro no dia em que ele se mexe.
 *
 * A tela de despesas conta a compra no dia da compra: é a visão de "para onde
 * foi o dinheiro". A pergunta "quanto posso gastar até o salário" precisa de
 * outra régua — a da conta. Nela, a compra no cartão só sai quando a fatura é
 * paga, a assinatura sai no dia da cobrança e a parcela da dívida no dia dela.
 *
 * Este módulo é só a apresentação dessa régua: os números vêm todos do
 * livro-caixa (ledger.ts). O que já aconteceu vem das postagens realizadas; o
 * que vem pela frente, do previsto. O saldo de hoje daqui é, por construção, o
 * mesmo saldo das Contas.
 */

export type FlowSource = 'entry' | 'subscription' | 'invoice' | 'debt' | 'transfer' | 'adjustment';

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
  /** já aconteceu */
  settled: boolean;
  /** venceu e não foi baixado */
  overdue: boolean;
  entryId?: string;
  occurrenceKey?: string;
  subscriptionId?: string;
  cardId?: string;
  debtId?: string;
  installment?: { index: number; total: number } | null;
  /** a conta onde o movimento acontece */
  accountId?: string;
  /**
   * Move o saldo mas não é entrada nem saída: o ajuste de saldo. A
   * transferência entre contas suas nem aparece na régua do total, porque não
   * muda o total.
   */
  internal?: boolean;
  /** compatibilidade: o antigo "saldo do mês anterior", que não existe mais */
  opening?: boolean;
}

/** a régua do caixa lê exatamente o mesmo que o livro-caixa */
export type FlowInput = LedgerInput;

export const signed = (item: Pick<FlowItem, 'kind' | 'amount'>): Cents =>
  item.kind === 'in' ? item.amount : -item.amount;

/** meses que um intervalo de datas toca, em ordem */
export function monthsCovering(from: IsoDate, to: IsoDate): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = monthKeyOf(from); m <= monthKeyOf(to); m = addMonthsToKey(m, 1)) out.push(m);
  return out;
}

function fromPosting(p: Posting): FlowItem | null {
  // transferência entre contas suas não muda o total: não é linha desta régua
  if (p.source === 'transfer') return null;
  const inflow = p.amount >= 0;
  const kind: FlowKind = inflow ? 'in' : p.kind === 'invest' ? 'invest' : 'out';
  return {
    id: p.id,
    date: p.date,
    kind,
    source: p.source === 'card-payment' ? 'invoice' : p.source,
    label: p.label,
    amount: Math.abs(p.amount),
    categoryId: p.categoryId ?? null,
    settled: true,
    overdue: false,
    accountId: p.accountId,
    ...(p.source === 'entry' ? { entryId: p.refId, occurrenceKey: p.occurrenceKey } : null),
    ...(p.source === 'subscription' ? { subscriptionId: p.refId } : null),
    ...(p.source === 'debt' ? { debtId: p.refId } : null),
    ...(p.source === 'invoice' ? { cardId: p.refId } : null),
    ...(p.internal ? { internal: true } : null),
  };
}

function fromPlanned(p: PlannedItem): FlowItem | null {
  if (p.source === 'transfer' && p.internal) return null;
  return {
    id: p.id,
    date: p.date,
    kind: p.kind,
    source: p.source === 'transfer' ? 'invoice' : p.source,
    label: p.label,
    amount: p.amount,
    categoryId: p.categoryId,
    settled: false,
    overdue: p.overdue,
    accountId: p.accountId,
    installment: p.installment ?? null,
    ...(p.source === 'entry' ? { entryId: p.refId, occurrenceKey: p.occurrenceKey } : null),
    ...(p.source === 'subscription' ? { subscriptionId: p.refId } : null),
    ...(p.source === 'debt' ? { debtId: p.refId } : null),
    ...(p.cardId ? { cardId: p.cardId } : null),
  };
}

/**
 * Todos os movimentos de caixa entre duas datas, inclusive: o que já
 * aconteceu até hoje e o que está previsto depois — mais o vencido que
 * ninguém pagou, marcado como tal.
 */
export function buildFlows(input: FlowInput, from: IsoDate, to: IsoDate): FlowItem[] {
  const { today } = input;
  const out: FlowItem[] = [];
  const pastEnd = to < today ? to : today;
  const accounts = ledgerAccounts(input.accounts);
  const opensOn = new Map(accounts.map((a) => [a.id, a.openingDate ?? null]));
  if (from <= pastEnd) {
    for (const p of realizedPostings(input, pastEnd)) {
      if (p.date < from) continue;
      // o que veio antes do saldo inicial da conta já está dentro dele: não soma de novo
      const opens = opensOn.get(p.accountId);
      if (opens && p.date < opens) continue;
      const item = fromPosting(p);
      if (item) out.push(item);
    }
    /**
     * O saldo inicial de uma conta aberta no meio do intervalo. Sem esta linha,
     * a curva do mês nunca somava o "hoje eu tenho 5.000" informado no dia 24,
     * e o Início mostrava saldo de 5.000 com fim do mês em zero. Vale no fim da
     * véspera, a mesma regra do saldo das Contas.
     */
    for (const a of accounts) {
      if (!a.openingDate || !a.openingBalance) continue;
      const day = addDaysIso(a.openingDate, -1);
      if (day < from || day > pastEnd) continue;
      out.push({
        id: `abertura:${a.id}`,
        date: day,
        kind: a.openingBalance >= 0 ? 'in' : 'out',
        source: 'adjustment',
        label: `Saldo inicial · ${a.name}`,
        amount: Math.abs(a.openingBalance),
        categoryId: null,
        settled: true,
        overdue: false,
        accountId: a.id,
        internal: true,
        opening: true,
      });
    }
  }
  for (const p of plannedItems(input, to, from)) {
    const item = fromPlanned(p);
    if (item) out.push(item);
  }
  return out.sort(byDateThenKind);
}

export { DEFAULT_DEBT_DAY };

function byDateThenKind(a: FlowItem, b: FlowItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // no mesmo dia, o que entra vem antes: o salário cobre a conta do dia
  if (a.kind !== b.kind) return a.kind === 'in' ? -1 : b.kind === 'in' ? 1 : 0;
  return b.amount - a.amount;
}

/* ------------------------------------------------- linhas que não são lançamento */

/**
 * Assinaturas e parcelas de dívida como linhas do mês, na régua da
 * competência (a das telas de movimentos).
 *
 * Elas não viram lançamento no banco — continuam sendo editadas na tela
 * delas —, mas pesam no mês como pesam na vida. Quando o extrato trouxe a
 * cobrança real daquele mês, fica só a real.
 */
export function virtualOccurrences(
  subscriptions: Subscription[],
  debts: Debt[],
  month: MonthKey,
  today: IsoDate,
  /** os lançamentos: a cobrança que já veio do extrato não aparece duas vezes */
  entries: Entry[] = [],
): Occurrence[] {
  const out: Occurrence[] = [];
  const realized = realizedCharges(entries);

  for (const sub of subscriptions) {
    const charge = subscriptionCharge(sub, month);
    if (!charge || realized.has(realizedKey(sub.id, month))) continue;
    out.push({
      entryId: `sub:${sub.id}`,
      key: month,
      date: charge.date,
      kind: 'out',
      description: sub.name,
      amount: charge.amount,
      categoryId: sub.categoryId,
      accountId: sub.accountId,
      cardId: sub.cardId,
      // cobrança automática: o que já passou foi cobrado
      settlement: charge.date <= today ? { at: `${charge.date}T12:00:00.000Z` } : null,
      installment: null,
      overdue: false,
      virtual: 'subscription',
      refId: sub.id,
    });
  }

  for (const debt of debts) {
    if (!debt.inFlow) continue;
    const inst = debtInstallmentIn(debt, month);
    if (!inst || realized.has(realizedKey(debt.id, month))) continue;
    out.push({
      entryId: `debt:${debt.id}`,
      key: month,
      date: inst.date,
      kind: 'out',
      description: debt.name,
      amount: debt.installment,
      categoryId: null,
      accountId: null,
      cardId: null,
      settlement: inst.date <= today ? { at: `${inst.date}T12:00:00.000Z` } : null,
      installment: { index: inst.index, total: inst.total },
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

/** o dia em que um movimento pesa no saldo: o vencido e não pago pesa amanhã */
const effectiveDay = (item: FlowItem, today: IsoDate) => (item.overdue && !item.settled ? pendingDay(today) : item.date);

/** saldo corrido de `from` a `to`, partindo de `opening` antes do primeiro dia */
export function dailyBalances(items: FlowItem[], from: IsoDate, to: IsoDate, opening: Cents, today: IsoDate): DayBalance[] {
  const byDay = new Map<IsoDate, { inflow: Cents; outflow: Cents }>();
  for (const item of items) {
    const day = effectiveDay(item, today);
    if (day < from || day > to) continue;
    const slot = byDay.get(day) ?? { inflow: 0, outflow: 0 };
    if (item.kind === 'in') slot.inflow += item.amount;
    else slot.outflow += item.amount;
    byDay.set(day, slot);
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

/**
 * O saldo somado das contas, dia a dia: o realizado até hoje e o previsto
 * depois. É a curva que o Início e o Calendário desenham — as duas telas
 * pedem aqui, e o dia de hoje sai igual ao saldo das Contas.
 */
export function dayBalances(input: FlowInput, from: IsoDate, to: IsoDate): { days: DayBalance[]; items: FlowItem[]; opening: Cents } {
  const { today } = input;
  const dayBefore = addDaysIso(from, -1);
  if (dayBefore <= today) {
    const opening = balancesAt(input, dayBefore).total;
    const items = buildFlows(input, from, to);
    return { days: dailyBalances(items, from, to, opening, today), items, opening };
  }
  // começa no futuro: parte do saldo previsto na véspera, encadeado desde hoje
  const chain = buildFlows(input, addDaysIso(today, 1), to);
  let opening = cashNow(input);
  for (const i of chain) if (effectiveDay(i, today) <= dayBefore) opening += signed(i);
  const items = chain.filter((i) => i.date >= from);
  return { days: dailyBalances(items, from, to, opening, today), items, opening };
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
  /** movimentos do começo do mês até 60 dias à frente */
  items: FlowItem[];
  /** saldo corrido do mês corrente, dia a dia */
  days: DayBalance[];
  /** saldo hoje, somando as contas: o mesmo número da tela de Contas */
  balanceNow: Cents;
  /** saldo previsto no último dia do mês */
  endOfMonth: Cents;
  /** o saldo no fim do mês anterior, de onde o mês parte */
  monthOpening: Cents;
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
  /** o que ainda sai até o próximo recebimento (ou até o fim do mês), vencidos inclusos */
  dueBeforeIncome: Cents;
  dueBeforeIncomeCount: number;
  /** vencido e não baixado: não saiu da conta, mas vai sair */
  overdue: Cents;
  overdueCount: number;
  /** totais do mês na régua do caixa, sem transferências e ajustes */
  monthIn: Cents;
  monthOut: Cents;
  /** a pessoa já disse quanto tem (saldo inicial, saldo conferido ou ajuste)? */
  hasOpening: boolean;
}

export { OPENING_TAG };

/**
 * O retrato do dinheiro hoje — o que o Início mostra primeiro.
 *
 * O saldo é o das contas, pelo livro-caixa. Sem saldo inicial informado em
 * nenhuma conta, ele é só a soma do que se realizou, e a tela avisa isso em
 * vez de fingir precisão.
 */
export function cashSnapshot(input: FlowInput): CashSnapshot {
  const { today } = input;
  const month = monthKeyOf(today);
  const { y, m } = monthKeyParts(month);
  const monthStart = partsToIso(y, m, 1);
  const monthEnd = partsToIso(y, m, new Date(y, m + 1, 0).getDate());
  const horizon = addDaysIso(today, 60);
  const windowEnd = horizon > monthEnd ? horizon : monthEnd;

  const { days: allDays, items, opening } = dayBalances(input, monthStart, windowEnd);
  const days = allDays.filter((d) => d.date <= monthEnd);
  const balanceNow = cashNow(input);
  const endOfMonth = days[days.length - 1]?.balance ?? balanceNow;

  const nextIncome = items.find((i) => i.kind === 'in' && !i.internal && !i.settled && i.date > today && i.date <= horizon) ?? null;
  const daysToNextIncome = nextIncome ? diffDays(today, nextIncome.date) : null;

  const ahead = allDays.filter((d) => d.date > today);
  const untilIncome = nextIncome ? ahead.filter((d) => d.date < nextIncome.date) : ahead.filter((d) => d.date <= monthEnd);
  const safeUntilIncome = Math.min(balanceNow, ...untilIncome.map((d) => d.balance));
  const restOfMonth = ahead.filter((d) => d.date <= monthEnd);
  const safeUntilMonthEnd = Math.min(balanceNow, ...restOfMonth.map((d) => d.balance));
  const lowest = restOfMonth.reduce<DayBalance | null>((min, d) => (!min || d.balance < min.balance ? d : min), null);

  const limit = nextIncome ? nextIncome.date : addDaysIso(monthEnd, 1);
  const pending = items.filter((i) => i.kind !== 'in' && !i.internal && !i.settled);
  const due = pending.filter((i) => i.overdue || (i.date > today && i.date < limit));
  const overdueItems = pending.filter((i) => i.overdue);

  const monthItems = items.filter((i) => i.date <= monthEnd && !i.internal);
  const monthIn = monthItems.filter((i) => i.kind === 'in').reduce((s, i) => s + i.amount, 0);
  const monthOut = monthItems.filter((i) => i.kind !== 'in').reduce((s, i) => s + i.amount, 0);

  const hasOpening =
    input.accounts.some((a) => !a.deletedAt && (!!a.openingDate || a.openingBalance !== 0 || (a.checkpoints?.length ?? 0) > 0)) ||
    input.transfers.some((t) => !t.deletedAt && t.kind === 'adjustment');

  return {
    today,
    month,
    monthStart,
    monthEnd,
    items,
    days,
    balanceNow,
    endOfMonth,
    monthOpening: opening,
    nextIncome,
    daysToNextIncome,
    safeUntilIncome,
    safeUntilMonthEnd,
    lowest,
    negative: negativeStretches(days.filter((d) => d.date >= today)),
    dueBeforeIncome: due.reduce((s, i) => s + i.amount, 0),
    dueBeforeIncomeCount: due.length,
    overdue: overdueItems.reduce((s, i) => s + i.amount, 0),
    overdueCount: overdueItems.length,
    monthIn,
    monthOut,
    hasOpening,
  };
}

/** o que ainda sai no mês, por origem: ajuda a explicar a saúde do mês */
export function remainingByOrigin(snapshot: CashSnapshot): Record<FlowSource, Cents> {
  const out: Record<FlowSource, Cents> = { entry: 0, subscription: 0, invoice: 0, debt: 0, transfer: 0, adjustment: 0 };
  for (const i of snapshot.items) {
    if (i.kind === 'in' || i.settled || i.internal || i.date > snapshot.monthEnd) continue;
    out[i.source] += i.amount;
  }
  return out;
}
