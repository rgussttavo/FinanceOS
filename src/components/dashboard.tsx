'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, CornerUpLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  addMonthsToKey,
  currentMonthKey,
  formatDayShort,
  formatMonthLabel,
  isoToParts,
  monthKeyParts,
} from '@/lib/dates';
import { formatMoney, ratio } from '@/lib/money';
import { firstNegativeDay, type DayPoint, type MonthSummary } from '@/lib/occurrences';
import type { Category, Cents, MonthKey } from '@/lib/types';
import { Panel, SectionTitle } from './ui';

/* ------------------------------------------------------------ navegacao */

export function MonthNav({
  month,
  onChange,
}: {
  month: MonthKey;
  onChange: (month: MonthKey) => void;
}) {
  const isCurrent = month === currentMonthKey();
  const { y } = monthKeyParts(month);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => onChange(addMonthsToKey(month, -1))}
        className="grid h-9 w-9 place-items-center rounded-field text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <ChevronLeft size={18} strokeWidth={2} />
      </button>

      <div className="min-w-[9.5rem] text-center">
        <span className="text-[15px] font-semibold capitalize text-ink">
          {formatMonthLabel(month)}
        </span>
        {!isCurrent && monthKeyParts(currentMonthKey()).y !== y ? null : null}
      </div>

      <button
        type="button"
        aria-label="Próximo mês"
        onClick={() => onChange(addMonthsToKey(month, 1))}
        className="grid h-9 w-9 place-items-center rounded-field text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <ChevronRight size={18} strokeWidth={2} />
      </button>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthKey())}
          className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-field px-2.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          <CornerUpLeft size={13} strokeWidth={2.2} />
          mês atual
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ saldo */

export function BalanceHero({
  summary,
  hidden = false,
}: {
  summary: MonthSummary;
  hidden?: boolean;
}) {
  const positive = summary.balance >= 0;

  return (
    <Panel className="overflow-hidden p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        {positive ? 'Sobra prevista no mês' : 'Falta prevista no mês'}
      </p>

      <p
        className={cn(
          'amount mt-2 text-[44px] sm:text-[52px]',
          positive ? 'text-ink' : 'text-out',
        )}
      >
        {formatMoney(summary.balance, { hidden })}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-card bg-line">
        <Stat label="Entrou" value={summary.income} tone="in" hidden={hidden} />
        <Stat label="Saiu" value={summary.expense} tone="out" hidden={hidden} />
        <Stat label="Investido" value={summary.invested} tone="inv" hidden={hidden} />
      </dl>

      {summary.overdueExpense > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-field bg-warn-soft px-3 py-2 text-[13px] text-warn">
          <span className="font-semibold">{formatMoney(summary.overdueExpense, { hidden })}</span>
          venceu e ainda não foi baixado
        </p>
      )}
    </Panel>
  );
}

function Stat({
  label,
  value,
  tone,
  hidden,
}: {
  label: string;
  value: Cents;
  tone: 'in' | 'out' | 'inv';
  hidden: boolean;
}) {
  const color = tone === 'in' ? 'text-in' : tone === 'out' ? 'text-out' : 'text-inv';
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className={cn('tnum mt-1 text-[15px] font-semibold', color)}>
        {formatMoney(value, { hidden, compact: true })}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------- projecao */

/** caixa do grafico, em unidades do viewBox */
const W = 640;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 22, left: 12 };

/**
 * Curva do saldo ao longo do mes: linha cheia no que ja aconteceu, tracejada na
 * previsao. O ponto que importa e onde ela cruza o zero — saber que o dinheiro
 * acaba no dia 23 muda a decisao de hoje; saber o total do mes, nao.
 */
export function ProjectionChart({
  points,
  hidden = false,
}: {
  points: DayPoint[];
  hidden?: boolean;
}) {
  const geometry = React.useMemo(() => {
    if (points.length < 2) return null;

    const values = points.map((p) => p.balance);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const span = max - min || 1;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
    const y = (v: number) => PAD.top + (1 - (v - min) / span) * innerH;

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');

    const lastRealIndex = Math.max(0, points.findIndex((p) => p.projected) - 1);
    const realPoints = points.slice(0, lastRealIndex + 1);
    const realLine = realPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`)
      .join(' ');

    const area = `${line} L${x(points.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;

    const negative = firstNegativeDay(points);
    const negativeIndex = negative ? points.indexOf(negative) : -1;

    return {
      line,
      realLine,
      area,
      zeroY: y(0),
      x,
      y,
      negative,
      negativeIndex,
      hasReal: realPoints.length > 1,
    };
  }, [points]);

  if (!geometry) {
    return (
      <Panel className="p-6">
        <SectionTitle>Trajetória do mês</SectionTitle>
        <p className="text-[14px] text-ink-3">Lance alguma coisa para a curva aparecer.</p>
      </Panel>
    );
  }

  const last = points[points.length - 1];
  const { negative } = geometry;

  return (
    <Panel className="p-6">
      <SectionTitle
        action={
          <span className="tnum text-[13px] font-semibold text-ink-2">
            {formatMoney(last.balance, { hidden, compact: true })} no fim do mês
          </span>
        }
      >
        Trajetória do mês
      </SectionTitle>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[180px] w-full overflow-visible"
        role="img"
        aria-label={
          negative
            ? `Saldo fica negativo em ${formatDayShort(negative.date)}`
            : 'Saldo positivo durante todo o mês'
        }
      >
        <defs>
          <linearGradient id="norte-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={geometry.area} fill="url(#norte-area)" />

        {/* a linha do zero e a referencia que importa */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={geometry.zeroY}
          y2={geometry.zeroY}
          stroke="var(--line-strong)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />

        {/* previsao tracejada por baixo, realizado cheio por cima */}
        <path
          d={geometry.line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.75"
          strokeDasharray="4 4"
          strokeLinecap="round"
          opacity="0.65"
        />
        {geometry.hasReal && (
          <path
            d={geometry.realLine}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {negative && geometry.negativeIndex >= 0 && (
          <g>
            <circle
              cx={geometry.x(geometry.negativeIndex)}
              cy={geometry.y(negative.balance)}
              r="4"
              fill="var(--out)"
            />
            <circle
              cx={geometry.x(geometry.negativeIndex)}
              cy={geometry.y(negative.balance)}
              r="8"
              fill="var(--out)"
              opacity="0.18"
            />
          </g>
        )}
      </svg>

      {negative ? (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-out">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-out" />
          O saldo cruza o zero em <strong className="font-semibold">{formatDayShort(negative.date)}</strong>
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">O saldo não fica negativo em nenhum dia do mês.</p>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------- categorias */

export function CategoryBreakdown({
  summary,
  categories,
  hidden = false,
  limit = 6,
}: {
  summary: MonthSummary;
  categories: Category[];
  hidden?: boolean;
  limit?: number;
}) {
  const byId = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const rows = React.useMemo(() => {
    const total = Array.from(summary.byCategory.values()).reduce((a, b) => a + b, 0);
    return Array.from(summary.byCategory.entries())
      .map(([id, value]) => ({
        id,
        value,
        share: ratio(value, total),
        category: byId.get(id) ?? null,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }, [summary, byId, limit]);

  if (!rows.length) {
    return null;
  }

  return (
    <Panel className="p-6">
      <SectionTitle>Para onde foi</SectionTitle>
      <ul className="grid gap-3.5">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-[14px] text-ink">
                <span aria-hidden>{row.category?.icon ?? '\u{1F4E6}'}</span>
                {row.category?.name ?? 'Sem categoria'}
              </span>
              <span className="tnum text-[13px] font-semibold text-ink-2">
                {formatMoney(row.value, { hidden, compact: true })}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width] duration-[var(--t-slow)] ease-[var(--ease-out)]"
                style={{
                  width: `${Math.max(2, row.share * 100).toFixed(1)}%`,
                  backgroundColor: row.category?.color ?? 'var(--ink-3)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------ utilitario */

export const dayOfIso = (iso: string): number => isoToParts(iso).d;
