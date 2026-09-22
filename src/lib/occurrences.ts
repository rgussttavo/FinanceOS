import {
  addDaysIso,
  clampDayToMonth,
  dateInMonth,
  diffDays,
  isoToParts,
  monthKeyOf,
  monthKeyParts,
  monthsBetween,
  partsToIso,
  todayIso,
} from './dates';
import type { Cents, Entry, FlowKind, IsoDate, MonthKey, Settlement } from './types';

/**
 * Uma ocorrencia e um lancamento materializado numa data.
 *
 * O Entry guarda a regra ("todo dia 10", "12 parcelas a partir de marco") e o
 * motor daqui produz as datas. Nada de ocorrencia e gravado no banco: gerar
 * sob demanda evita as milhares de linhas mortas que uma grade pre-expandida
 * cria, e deixa editar a regra sem reescrever o passado.
 */
export interface Occurrence {
  entryId: string;
  /** chave estavel da ocorrencia: AAAA-MM nas mensais, AAAA-MM-DD nas demais */
  key: string;
  date: IsoDate;
  kind: FlowKind;
  description: string;
  /** valor previsto, ou o efetivamente pago quando houve baixa com valor diferente */
  amount: Cents;
  categoryId: string | null;
  accountId: string | null;
  cardId: string | null;
  settlement: Settlement | null;
  /** 3 de 12, quando parcelado */
  installment: { index: number; total: number } | null;
  /** venceu e nao foi baixado */
  overdue: boolean;
}

const MAX_WEEKLY_PER_MONTH = 6;

/** a ocorrencia foi baixada? */
export const isSettled = (o: Occurrence): boolean => o.settlement !== null;

function buildOccurrence(
  entry: Entry,
  key: string,
  date: IsoDate,
  installment: { index: number; total: number } | null,
  today: IsoDate,
): Occurrence {
  const settlement = entry.settled[key] ?? null;
  const amount = settlement?.amount ?? entry.amount;
  return {
    entryId: entry.id,
    key,
    date,
    kind: entry.kind,
    description: entry.description,
    amount,
    categoryId: entry.categoryId,
    accountId: entry.accountId,
    cardId: entry.cardId,
    settlement,
    installment,
    overdue: settlement === null && diffDays(today, date) < 0,
  };
}

/** a regra ainda vale nesta competencia? */
function withinUntil(entry: Entry, date: IsoDate): boolean {
  const until = entry.repeat.until;
  if (!until) return true;
  return date <= until;
}

/**
 * Todas as ocorrencias de UM lancamento dentro de UMA competencia.
 * Devolve lista porque a repeticao semanal produz varias no mesmo mes.
 */
export function occurrencesOf(entry: Entry, month: MonthKey, today = todayIso()): Occurrence[] {
  if (entry.deletedAt) return [];

  const startMonth = monthKeyOf(entry.date);
  const { d: startDay } = isoToParts(entry.date);
  const elapsed = monthsBetween(startMonth, month);

  switch (entry.repeat.kind) {
    case 'once': {
      if (startMonth !== month) return [];
      return [buildOccurrence(entry, month, entry.date, null, today)];
    }

    case 'monthly': {
      if (elapsed < 0) return [];
      const date = dateInMonth(month, startDay);
      if (!withinUntil(entry, date)) return [];
      return [buildOccurrence(entry, month, date, null, today)];
    }

    case 'installments': {
      const total = Math.max(1, Math.trunc(entry.repeat.count ?? 1));
      if (elapsed < 0 || elapsed >= total) return [];
      const date = dateInMonth(month, startDay);
      return [
        buildOccurrence(entry, month, date, { index: elapsed + 1, total }, today),
      ];
    }

    case 'yearly': {
      const { m: startM } = isoToParts(entry.date);
      const { y, m } = monthKeyParts(month);
      if (m !== startM) return [];
      if (y < isoToParts(entry.date).y) return [];
      const date = partsToIso(y, m, clampDayToMonth(startDay, y, m));
      if (!withinUntil(entry, date)) return [];
      return [buildOccurrence(entry, month, date, null, today)];
    }

    case 'weekly': {
      if (elapsed < 0) return [];
      const out: Occurrence[] = [];
      // caminha de 7 em 7 a partir da primeira data ate passar da competencia
      let cursor = entry.date;
      // salto grosseiro para nao iterar semana a semana desde 2019
      const weeksToSkip = Math.max(0, Math.floor((elapsed * 30 - 7) / 7));
      if (weeksToSkip > 0) cursor = addDaysIso(cursor, weeksToSkip * 7);
      while (monthKeyOf(cursor) < month) cursor = addDaysIso(cursor, 7);
      while (monthKeyOf(cursor) === month && out.length < MAX_WEEKLY_PER_MONTH) {
        if (!withinUntil(entry, cursor)) break;
        out.push(buildOccurrence(entry, cursor, cursor, null, today));
        cursor = addDaysIso(cursor, 7);
      }
      return out;
    }

    default:
      return [];
  }
}

/** todas as ocorrencias de uma lista de lancamentos numa competencia, em ordem de data */
export function occurrencesInMonth(
  entries: Entry[],
  month: MonthKey,
  today = todayIso(),
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const entry of entries) out.push(...occurrencesOf(entry, month, today));
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ------------------------------------------------------------------ resumo */

export interface MonthSummary {
  month: MonthKey;
  income: Cents;
  expense: Cents;
  invested: Cents;
  /** o que sobra: entrou menos saiu menos investido */
  balance: Cents;
  /** ja baixado */
  settledIncome: Cents;
  settledExpense: Cents;
  /** ainda por acontecer, do hoje em diante */
  pendingExpense: Cents;
  overdueExpense: Cents;
  byCategory: Map<string, Cents>;
  count: number;
}

export function summarizeMonth(
  occurrences: Occurrence[],
  month: MonthKey,
  today = todayIso(),
): MonthSummary {
  const s: MonthSummary = {
    month,
    income: 0,
    expense: 0,
    invested: 0,
    balance: 0,
    settledIncome: 0,
    settledExpense: 0,
    pendingExpense: 0,
    overdueExpense: 0,
    byCategory: new Map(),
    count: occurrences.length,
  };

  for (const o of occurrences) {
    if (o.kind === 'in') {
      s.income += o.amount;
      if (isSettled(o)) s.settledIncome += o.amount;
    } else if (o.kind === 'out') {
      s.expense += o.amount;
      if (isSettled(o)) s.settledExpense += o.amount;
      else if (o.overdue) s.overdueExpense += o.amount;
      else if (diffDays(today, o.date) >= 0) s.pendingExpense += o.amount;
    } else {
      s.invested += o.amount;
    }

    if (o.kind !== 'in') {
      const key = o.categoryId ?? 'sem-categoria';
      s.byCategory.set(key, (s.byCategory.get(key) ?? 0) + o.amount);
    }
  }

  s.balance = s.income - s.expense - s.invested;
  return s;
}

/* -------------------------------------------------------------- projecao */

export interface DayPoint {
  date: IsoDate;
  /** saldo acumulado no fim do dia */
  balance: Cents;
  /** o ponto ja aconteceu ou e previsao? */
  projected: boolean;
}

/**
 * Curva de saldo do mes, dia a dia, a partir de um saldo inicial.
 *
 * E o que o CentavOS nao faz: ele mostra o mes fechado, nunca a trajetoria.
 * Saber que o saldo cruza o zero no dia 23 vale mais do que saber o total.
 */
export function projectMonth(
  occurrences: Occurrence[],
  month: MonthKey,
  openingBalance: Cents,
  today = todayIso(),
): DayPoint[] {
  const { y, m } = monthKeyParts(month);
  const days = new Date(y, m + 1, 0).getDate();

  const delta = new Map<IsoDate, Cents>();
  for (const o of occurrences) {
    const signed = o.kind === 'in' ? o.amount : -o.amount;
    delta.set(o.date, (delta.get(o.date) ?? 0) + signed);
  }

  const points: DayPoint[] = [];
  let running = openingBalance;
  for (let d = 1; d <= days; d++) {
    const date = partsToIso(y, m, d);
    running += delta.get(date) ?? 0;
    points.push({ date, balance: running, projected: date > today });
  }
  return points;
}

/** primeiro dia em que o saldo projetado fica negativo, se houver */
export function firstNegativeDay(points: DayPoint[]): DayPoint | null {
  return points.find((p) => p.balance < 0) ?? null;
}
