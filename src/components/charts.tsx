'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import {
  WEEKDAYS_SHORT_PT,
  daysInMonth,
  formatMonthLabel,
  monthKeyParts,
  partsToIso,
  todayIso,
} from '@/lib/dates';
import { formatMoney, formatPercent, ratio } from '@/lib/money';
import type { MonthSummary, Occurrence } from '@/lib/occurrences';
import type { Category, Cents, FlowKind, MonthKey } from '@/lib/types';

/* ------------------------------------------------------------------ rosca */

export interface DonutSlice {
  id: string;
  label: string;
  value: Cents;
  color: string;
}

/**
 * Rosca de composição. O buraco do meio não é enfeite: é onde mora o total,
 * que é o número que a pessoa foi buscar ao olhar o gráfico.
 */
export function Donut({
  slices,
  total,
  caption,
}: {
  slices: DonutSlice[];
  total: Cents;
  caption?: string;
}) {
  const R = 54;
  const STROKE = 16;
  const C = 2 * Math.PI * R;

  const segments = React.useMemo(() => {
    // o deslocamento de cada fatia é a soma das anteriores; acumular assim
    // evita depender de uma variável mutável atravessando o render
    const visible = slices.filter((s) => s.value > 0);
    return visible.map((s, i) => {
      const before = visible.slice(0, i).reduce((sum, p) => sum + ratio(p.value, total), 0);
      const share = ratio(s.value, total);
      return { ...s, share, dash: share * C, offset: before * C };
    });
  }, [slices, total, C]);

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="h-[132px] w-[132px] shrink-0 -rotate-90" role="img" aria-label={caption ?? 'Composição'}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-3)" strokeWidth={STROKE} />
        {segments.map((s) => (
          <circle
            key={s.id}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeDasharray={`${s.dash} ${C - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>

      <ul className="grid min-w-0 flex-1 gap-2">
        {segments.slice(0, 5).map((s) => (
          <li key={s.id} className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-[13px] text-ink-2">{s.label}</span>
            </span>
            <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
              {formatPercent(s.share)}
            </span>
          </li>
        ))}
        {segments.length > 5 && (
          <li className="text-[12px] text-ink-3">e mais {segments.length - 5}</li>
        )}
        {!segments.length && <li className="text-[13px] text-ink-3">Nada para mostrar ainda.</li>}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------- barras de 6 meses */

/**
 * Entrou contra saiu, mês a mês. Duas barras por mês em vez de uma empilhada:
 * comparar alturas lado a lado é imediato, decompor uma pilha não é.
 */
export function MonthBars({
  months,
  hidden = false,
}: {
  months: MonthSummary[];
  hidden?: boolean;
}) {
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));

  return (
    <div>
      <div className="flex h-[132px] items-end gap-2">
        {months.map((m) => (
          <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <Bar value={m.income} max={max} color="var(--in)" label={`Entrou em ${formatMonthLabel(m.month)}`} />
              <Bar value={m.expense} max={max} color="var(--out)" label={`Saiu em ${formatMonthLabel(m.month)}`} />
            </div>
            <span className="truncate text-[11px] text-ink-3">
              {formatMonthLabel(m.month, { short: true })}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-3">
        <Legend color="var(--in)">entrou</Legend>
        <Legend color="var(--out)">saiu</Legend>
        <span className="tnum ml-auto text-ink-2">
          {formatMoney(months[months.length - 1]?.balance ?? 0, { hidden, compact: true })} no mês
        </span>
      </div>
    </div>
  );
}

function Bar({ value, max, color, label }: { value: Cents; max: Cents; color: string; label: string }) {
  const pct = Math.max(value > 0 ? 3 : 0, (value / max) * 100);
  return (
    <div
      role="img"
      aria-label={label}
      className="w-full max-w-[14px] rounded-t-[4px] transition-[height] duration-[var(--t-slow)] ease-[var(--ease-out)]"
      style={{ height: `${pct}%`, background: color, minHeight: value > 0 ? 3 : 0 }}
    />
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- calendário */

const DOT_COLOR: Record<FlowKind, string> = {
  in: 'var(--in)',
  out: 'var(--out)',
  invest: 'var(--inv)',
};

/**
 * O mês em grade, com um ponto por tipo de lançamento no dia.
 * Serve para ver o desenho do mês — onde as contas se amontoam — sem ler lista.
 */
export function MonthCalendar({
  month,
  occurrences,
  onPickDay,
}: {
  month: MonthKey;
  occurrences: Occurrence[];
  onPickDay?: (iso: string) => void;
}) {
  const { y, m } = monthKeyParts(month);
  const total = daysInMonth(y, m);
  const firstWeekday = new Date(y, m, 1).getDay();
  const today = todayIso();

  const kindsByDay = React.useMemo(() => {
    const map = new Map<string, Set<FlowKind>>();
    for (const o of occurrences) {
      const set = map.get(o.date) ?? new Set<FlowKind>();
      set.add(o.kind);
      map.set(o.date, set);
    }
    return map;
  }, [occurrences]);

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, i) => partsToIso(y, m, i + 1)),
  ];

  return (
    <div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS_SHORT_PT.map((d) => (
          <span key={d} className="pb-1 text-[11px] uppercase text-ink-3">
            {d[0]}
          </span>
        ))}

        {cells.map((iso, i) => {
          if (!iso) return <span key={`empty-${i}`} />;
          const day = Number(iso.slice(8));
          const kinds = kindsByDay.get(iso);
          const isToday = iso === today;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPickDay?.(iso)}
              className="flex flex-col items-center gap-1 py-1.5"
              aria-label={`Dia ${day}${kinds ? ', com lançamentos' : ''}`}
            >
              <span
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-full text-[13px] tabular-nums transition-colors',
                  isToday ? 'bg-ink text-canvas font-semibold' : 'text-ink-2 hover:bg-surface-2',
                )}
              >
                {day}
              </span>
              <span className="flex h-1.5 items-center gap-[3px]">
                {kinds &&
                  [...kinds].map((k) => (
                    <span
                      key={k}
                      className="h-1 w-1 rounded-full"
                      style={{ background: DOT_COLOR[k] }}
                    />
                  ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[12px] text-ink-3">
        <Legend color="var(--in)">receita</Legend>
        <Legend color="var(--out)">despesa</Legend>
        <Legend color="var(--inv)">investimento</Legend>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- fatias por categoria */

/** monta as fatias da rosca a partir do resumo do mês */
export function categorySlices(summary: MonthSummary, categories: Category[]): DonutSlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return Array.from(summary.byCategory.entries())
    .map(([id, value]) => {
      const cat = byId.get(id);
      return {
        id,
        label: cat?.name ?? 'Sem categoria',
        value,
        color: cat?.color ?? 'var(--ink-3)',
      };
    })
    .sort((a, b) => b.value - a.value);
}
