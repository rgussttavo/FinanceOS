import { BRAND } from './brand';
import type { IsoDate, MonthKey } from './types';

export const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

export const WEEKDAYS_SHORT_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Datas civis sao tratadas como texto AAAA-MM-DD do comeco ao fim.
 * new Date de uma string ISO curta e interpretada em UTC e vira o dia
 * anterior em Sao Paulo: esse deslocamento e a fonte silenciosa de erro
 * em app financeiro. Por isso tudo aqui passa por ano, mes e dia locais.
 */
export function todayIso(): IsoDate {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoToParts(iso: IsoDate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

export const partsToIso = (y: number, m: number, d: number): IsoDate =>
  `${y}-${pad(m + 1)}-${pad(d)}`;

/** Date local, a meia-noite. So para calculo, nunca para guardar. */
export function isoToLocalDate(iso: IsoDate): Date {
  const { y, m, d } = isoToParts(iso);
  return new Date(y, m, d);
}

export const monthKeyOf = (iso: IsoDate): MonthKey => iso.slice(0, 7);

export const currentMonthKey = (): MonthKey => todayIso().slice(0, 7);

export function monthKeyParts(key: MonthKey): { y: number; m: number } {
  const [y, m] = key.split('-').map(Number);
  return { y, m: m - 1 };
}

export const makeMonthKey = (y: number, m: number): MonthKey => `${y}-${pad(m + 1)}`;

export function addMonthsToKey(key: MonthKey, delta: number): MonthKey {
  const { y, m } = monthKeyParts(key);
  const total = y * 12 + m + delta;
  return makeMonthKey(Math.floor(total / 12), ((total % 12) + 12) % 12);
}

/** quantos meses de `from` ate `to`; negativo quando `to` e anterior */
export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const a = monthKeyParts(from);
  const b = monthKeyParts(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

export const daysInMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate();

/** dia 31 em fevereiro vira 28 (ou 29). Vencimento nao pode cair no vazio. */
export function clampDayToMonth(day: number, y: number, m: number): number {
  const max = daysInMonth(y, m);
  return Math.min(Math.max(Math.trunc(day) || 1, 1), max);
}

/** a data do dia `day` dentro da competencia `key`, ja ajustada ao mes */
export function dateInMonth(key: MonthKey, day: number): IsoDate {
  const { y, m } = monthKeyParts(key);
  return partsToIso(y, m, clampDayToMonth(day, y, m));
}

export function addDaysIso(iso: IsoDate, days: number): IsoDate {
  const d = isoToLocalDate(iso);
  d.setDate(d.getDate() + days);
  return partsToIso(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatMonthLabel(key: MonthKey, opts: { short?: boolean } = {}): string {
  const { y, m } = monthKeyParts(key);
  const name = MONTHS_PT[m] ?? '';
  const label = opts.short ? name.slice(0, 3) : name;
  const sameYear = monthKeyParts(currentMonthKey()).y === y;
  return sameYear ? label : `${label} de ${y}`;
}

const dayFmt = new Intl.DateTimeFormat(BRAND.locale, { day: '2-digit', month: 'short' });
const fullFmt = new Intl.DateTimeFormat(BRAND.locale, { day: '2-digit', month: 'long', year: 'numeric' });

export const formatDayShort = (iso: IsoDate): string =>
  dayFmt.format(isoToLocalDate(iso)).replace('.', '');

export const formatDateFull = (iso: IsoDate): string => fullFmt.format(isoToLocalDate(iso));

export function diffDays(from: IsoDate, to: IsoDate): number {
  const a = isoToLocalDate(from).getTime();
  const b = isoToLocalDate(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "hoje", "ontem", "em 3 dias": relativo e mais legivel que data crua */
export function formatRelativeDay(iso: IsoDate): string {
  const diff = diffDays(todayIso(), iso);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  if (diff > 1 && diff <= 30) return `em ${diff} dias`;
  if (diff < -1 && diff >= -30) return `há ${Math.abs(diff)} dias`;
  return formatDayShort(iso);
}

export const nowInstant = (): string => new Date().toISOString();
