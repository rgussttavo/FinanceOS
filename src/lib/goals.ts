import { monthKeyOf, monthKeyParts, todayIso } from './dates';
import { occurrencesInMonth } from './occurrences';
import type { Cents, Entry, Goal, MonthKey } from './types';

export interface GoalProgress {
  /** quanto já se tem, em centavos */
  current: Cents;
  target: Cents;
  /** 0 a 1, limitado a 1 mesmo quando passou da meta */
  ratio: number;
  missing: Cents;
  /** meses até o prazo; null quando não há prazo */
  monthsLeft: number | null;
  /** quanto guardar por mês para chegar no prazo; null sem prazo */
  perMonth: Cents | null;
  reached: boolean;
  /** o prazo passou e a meta não foi batida */
  late: boolean;
}

/**
 * Quanto uma meta já tem.
 *
 * Meta manual é o que a pessoa declarou. Meta ligada a investimento é a soma
 * dos aportes — e é essa ligação que faz a barra subir sozinha a cada aporte,
 * em vez de virar um número parado que ninguém volta para atualizar.
 */
export function goalProgress(
  goal: Goal,
  entries: Entry[],
  month: MonthKey,
  today = todayIso(),
): GoalProgress {
  const current = goal.source === 'manual' ? goal.saved : investedFor(goal, entries, month, today);
  const target = Math.max(0, goal.target);
  const missing = Math.max(0, target - current);

  const monthsLeft = goal.deadline ? monthsUntil(monthKeyOf(goal.deadline), month) : null;
  const perMonth =
    monthsLeft != null && monthsLeft > 0 ? Math.ceil(missing / monthsLeft) : monthsLeft === 0 ? missing : null;

  return {
    current,
    target,
    ratio: target > 0 ? Math.min(1, current / target) : 0,
    missing,
    monthsLeft,
    perMonth,
    reached: target > 0 && current >= target,
    late: monthsLeft != null && monthsLeft < 0 && current < target,
  };
}

/**
 * Soma dos aportes acumulados até a competência.
 *
 * A janela é longa de propósito: uma meta de patrimônio vive anos, e cortar em
 * seis meses faria a barra encolher sozinha com o passar do tempo.
 */
function investedFor(goal: Goal, entries: Entry[], month: MonthKey, today: string): Cents {
  const relevant = entries.filter((e) => e.kind === 'invest' && !e.deletedAt);
  if (!relevant.length) return 0;

  const first = relevant.reduce((min, e) => (e.date < min ? e.date : min), relevant[0].date);
  const start = monthKeyOf(first);
  const span = Math.max(0, monthsUntil(month, start));

  let total = 0;
  for (let i = 0; i <= span; i++) {
    const key = shiftMonth(start, i);
    if (key > month) break;
    for (const o of occurrencesInMonth(relevant, key, today)) {
      if (goal.source === 'category' && o.categoryId !== goal.categoryId) continue;
      total += o.amount;
    }
  }
  return total;
}

function monthsUntil(target: MonthKey, from: MonthKey): number {
  const a = monthKeyParts(from);
  const b = monthKeyParts(target);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const { y, m } = monthKeyParts(key);
  const total = y * 12 + m + delta;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** os emojis oferecidos na hora de criar uma meta */
export const GOAL_ICONS = [
  '🎯', '✈️', '🏠', '🚗', '💍', '🎓', '💻', '📱',
  '🏖️', '👶', '🛴', '💰', '🎁', '🏆', '🛠️', '🐶',
  '🩺', '💒', '🐱', '🏗️', '🏍️', '⛵', '📷', '🎸',
  '🏋️', '🧳', '📚', '🛡️', '🦷', '🌿', '🎮', '🛋️',
] as const;
