import { dayBalances } from './cashflow';
import { normalize } from './categories';
import { addDaysIso, addMonthsToKey, dateInMonth, formatDayShort, monthKeyOf } from './dates';
import type { MoneyToDecide, SpendCheck } from './decision';
import type { LedgerInput } from './ledger';
import { formatMoney } from './money';
import { monthUse, type ExpandMonth } from './money-story';
import type { Cents, Entry, Goal, IsoDate, MonthKey } from './types';

/**
 * Comportamento observado e as poucas frases do app (fase 7).
 *
 * As frases aparecem só em momentos — a meta batida, a compra grande antes de
 * salvar, o primeiro aporte na reserva, o fechamento do mês — uma por vez e
 * sempre ao lado de um número. Nenhuma fica fixa na tela: frase que aparece
 * todo dia vira papel de parede, e o app deixa de ser ouvido.
 *
 * O comportamento é o que os dados mostram (sequências, regularidade),
 * celebrado com evidência. Nunca "você é disciplinado": "3 meses seguidos com
 * as entradas acima das saídas".
 */

export const MOMENT_PHRASES = {
  compraGrande: 'Antes de comprar, olhe o impacto no restante do mês.',
  metaBatida: 'Você não chegou aqui por acaso: o padrão que você manteve fez diferença.',
  reservaInicio: 'Primeiro construa segurança. Depois amplie seus objetivos.',
} as const;

const monthsBetween = (from: MonthKey, to: MonthKey) => {
  const [a, b] = [from, to].map((k) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)));
  return b - a;
};

export const isReserveGoal = (goal: Pick<Goal, 'name'>) => normalize(goal.name).startsWith('reserva');

/**
 * A mensagem de um aporte em meta, quando é um momento: a meta batida (com
 * quanto e em quanto tempo) ou o primeiro aporte da reserva. Fora disso,
 * null — e vale a confirmação de sempre.
 */
export function depositMessage(goal: Goal, before: Cents, amount: Cents, target: Cents, today: IsoDate): string | null {
  const after = before + amount;
  if (target > 0 && before < target && after >= target) {
    const months = Math.max(1, monthsBetween(monthKeyOf(goal.createdAt.slice(0, 10)), monthKeyOf(today)));
    return `Meta ${goal.name} batida: ${formatMoney(target)} juntados em ${months} ${months === 1 ? 'mês' : 'meses'}. ${MOMENT_PHRASES.metaBatida}`;
  }
  if (before <= 0 && amount > 0 && isReserveGoal(goal)) {
    return `Primeiro aporte da ${goal.name}: ${formatMoney(amount)}. ${MOMENT_PHRASES.reservaInicio}`;
  }
  return null;
}

/* ------------------------------------------------------- compra grande */

/** a compra é grande o bastante para merecer o aviso antes de salvar? */
export function isBigSpend(check: SpendCheck, decide: MoneyToDecide): boolean {
  return check.verdict !== 'fits' || check.amount >= Math.max(1, decide.spendable) * 0.3;
}

/** o impacto de um gasto, numa frase, para o lançamento rápido */
export function spendImpact(check: SpendCheck, decide: MoneyToDecide): string {
  const until = decide.income ? `até ${formatDayShort(decide.income.date)}` : 'até o fim do mês';
  if (check.shortBy === 'limit' && check.limit) return `Passa do limite disponível do cartão em ${formatMoney(-check.limit.after)}.`;
  if (check.shortBy === 'cash') {
    return `Ele deixaria conta descoberta: ${formatDayShort(check.tightestAfter.date)} o saldo previsto ficaria em ${formatMoney(check.tightestAfter.balance, { signed: true })}.`;
  }
  if (check.shortBy === 'later' && check.laterAfter) {
    return `Depois do recebimento falta dinheiro: ${formatDayShort(check.laterAfter.date)} o saldo previsto ficaria em ${formatMoney(check.laterAfter.balance, { signed: true })}.`;
  }
  const hitsBefore = check.schedule.filter((s) => s.date < decide.until).reduce((t, s) => t + s.amount, 0);
  if (hitsBefore === 0) return `Só pesa na fatura de ${formatDayShort(check.schedule[0].date)}, depois do recebimento: até lá, o disponível para gastar continua ${formatMoney(decide.spendable)}.`;
  if (check.verdict === 'uses-buffer') {
    return `Ele entra na margem de segurança: sobrariam ${formatMoney(Math.max(0, check.availableAfter))} ${until}, abaixo da margem de ${formatMoney(decide.buffer.amount)}.`;
  }
  return `Depois dele, sobram ${formatMoney(Math.max(0, check.freeAfter))} para gastar ${until}.`;
}

/* ------------------------------------------------------------- hábitos */

export interface Habits {
  /** meses completos seguidos, até o anterior, com as entradas acima das saídas */
  positiveStreak: number;
  /** meses completos seguidos sem nenhum dia de saldo negativo nas contas */
  noNegativeStreak: number;
  /** em quantos dos últimos meses completos houve aporte */
  saving: { months: number; of: number };
}

const LOOKBACK = 6;

export function habitsOf(expand: ExpandMonth, entries: Entry[], ledger: LedgerInput, today: IsoDate): Habits {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const current = monthKeyOf(today);
  const firstEntry = entries.reduce<IsoDate | null>((min, e) => (!e.deletedAt && (!min || e.date < min) ? e.date : min), null);

  // os meses completos com movimento, do mais recente para trás, até o primeiro buraco
  const months: { key: MonthKey; result: Cents; invested: Cents }[] = [];
  for (let i = 1; i <= LOOKBACK; i++) {
    const m = addMonthsToKey(current, -i);
    if (firstEntry && dateInMonth(m, 31) < firstEntry) break;
    const use = monthUse(expand(m), byId, m);
    if (!(use.income || use.fixed || use.installments || use.variable || use.invested)) break;
    months.push({ key: m, result: use.income - use.fixed - use.installments - use.variable, invested: use.invested });
  }
  if (!months.length) return { positiveStreak: 0, noNegativeStreak: 0, saving: { months: 0, of: 0 } };

  // o saldo dia a dia da janela inteira, numa conta só (e não uma por mês)
  const oldest = months[months.length - 1].key;
  const { days } = dayBalances(ledger, `${oldest}-01`, addDaysIso(`${current}-01`, -1));
  const negative = new Set(days.filter((d) => d.balance < 0).map((d) => monthKeyOf(d.date)));

  const streak = (ok: (m: (typeof months)[number]) => boolean) => {
    let n = 0;
    for (const m of months) {
      if (!ok(m)) break;
      n += 1;
    }
    return n;
  };
  return {
    positiveStreak: streak((m) => m.result >= 0),
    noNegativeStreak: streak((m) => !negative.has(m.key)),
    saving: { months: months.filter((m) => m.invested > 0).length, of: months.length },
  };
}

/** os hábitos que valem ser ditos: só sequência de dois ou mais */
export function habitLines(h: Habits): string[] {
  const out: string[] = [];
  if (h.positiveStreak >= 2) out.push(`${h.positiveStreak} meses seguidos com as entradas acima das saídas.`);
  if (h.noNegativeStreak >= 2) out.push(`${h.noNegativeStreak} meses seguidos sem saldo negativo.`);
  if (h.saving.months >= 2) out.push(`Guardou dinheiro em ${h.saving.months} dos últimos ${h.saving.of} meses.`);
  return out;
}
