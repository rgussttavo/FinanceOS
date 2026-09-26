'use client';

import * as React from 'react';
import { FlowTimeline } from '@/components/timeline';
import { Panel, SectionTitle, Skeleton } from '@/components/ui';
import { dayBalances, type CashSnapshot, type DayBalance, type FlowItem } from '@/lib/cashflow';
import { cn } from '@/lib/cn';
import {
  currentMonthKey,
  daysInMonth,
  formatDayShort,
  monthKeyParts,
  partsToIso,
  WEEKDAYS_SHORT_PT,
} from '@/lib/dates';
import { holidaysBetween } from '@/lib/holidays';
import { formatMoney } from '@/lib/money';
import { ledgerInput, type FinanceBase } from '@/lib/picture';
import type { Category, Cents, IsoDate, MonthKey } from '@/lib/types';
import { MonthStrip } from './views';

/**
 * O mês dia a dia, na régua da conta corrente.
 *
 * A grade mostra onde as contas se amontoam e quais dias ficam no vermelho; a
 * linha do tempo embaixo diz o que acontece em cada dia e com quanto a conta
 * fica no fim dele. Meses futuros partem do saldo previsto do mês anterior —
 * é o "fim do mês visto do começo", um mês adiante.
 */
export function CalendarioView({
  base,
  cash,
  categories,
  hidden,
  cardsEnabled,
  onOpenFlow,
}: {
  base: FinanceBase;
  cash: CashSnapshot;
  categories: Category[];
  hidden: boolean;
  cardsEnabled: boolean;
  onOpenFlow: (item: FlowItem) => void;
}) {
  const [month, setMonth] = React.useState<MonthKey>(currentMonthKey());
  const [picked, setPicked] = React.useState<IsoDate | null>(null);
  const today = cash.today;

  const data = React.useMemo(() => {
    const { y, m } = monthKeyParts(month);
    const start = partsToIso(y, m, 1);
    const end = partsToIso(y, m, daysInMonth(y, m));
    // o mesmo saldo do Início e das Contas: passado pelo realizado, futuro pelo previsto
    const { days, items, opening } = dayBalances(ledgerInput(base, cardsEnabled, today), start, end);
    return { start, end, items, days, opening };
  }, [base, month, cardsEnabled, today]);

  const holidays = React.useMemo(() => holidaysBetween(data.start, data.end), [data.start, data.end]);
  const balances = React.useMemo(() => new Map(data.days.map((d) => [d.date, d.balance])), [data.days]);
  const shownItems = picked ? data.items.filter((i) => i.date === picked) : data.items;
  const shownHolidays = picked ? holidays.filter((h) => h.date === picked) : holidays;

  // ajuste de saldo mexe no saldo, mas não é entrada nem saída
  const totalIn = data.items.filter((i) => i.kind === 'in' && !i.internal).reduce((t, i) => t + i.amount, 0);
  const totalOut = data.items.filter((i) => i.kind !== 'in' && !i.internal).reduce((t, i) => t + i.amount, 0);
  const last = data.days[data.days.length - 1];
  const lowest = data.days.reduce<DayBalance | null>((min, d) => (!min || d.balance < min.balance ? d : min), null);

  if (!base.ready) {
    return (
      <div className="grid gap-4 pt-2">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-[320px] rounded-panel" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pt-1">
      <MonthStrip
        month={month}
        onChange={(m) => {
          setMonth(m);
          setPicked(null);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-6">
        <div className="grid gap-4 lg:sticky lg:top-6">
          <Panel className="p-4 sm:p-5">
            <MonthGrid
              month={month}
              days={data.days}
              items={data.items}
              holidays={holidays.map((h) => h.date)}
              today={today}
              picked={picked}
              onPick={(d) => setPicked((p) => (p === d ? null : d))}
            />
          </Panel>

          <Panel className="p-5">
            <SectionTitle>Como o saldo anda no mês</SectionTitle>
            <BalanceLine days={data.days} today={today} hidden={hidden} />
            <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
              <Stat label="Entra na conta" value={totalIn} tone="text-in" hidden={hidden} />
              <Stat label="Sai da conta" value={totalOut} tone="text-out" hidden={hidden} />
              <Stat label="Fim do mês" value={last?.balance ?? 0} tone={last && last.balance < 0 ? 'text-out' : 'text-ink'} hidden={hidden} />
            </dl>
            {lowest && lowest.balance < 0 ? (
              <p className="mt-3 text-[13px] text-out">
                O menor saldo é {formatMoney(lowest.balance, { hidden })}, no dia {formatDayShort(lowest.date)}.
              </p>
            ) : lowest ? (
              <p className="mt-3 text-[13px] text-ink-3">
                O menor saldo do mês é {formatMoney(lowest.balance, { hidden })}, no dia {formatDayShort(lowest.date)}.
              </p>
            ) : null}
            <p className="mt-1 text-[12px] text-ink-3">
              Parte de {formatMoney(data.opening, { hidden })},{' '}
              {month > cash.month ? 'o saldo previsto para o fim do mês anterior' : 'o saldo das contas no fim do mês anterior'}. Aqui vale o
              dia em que o dinheiro sai da conta: a compra no cartão sai quando a fatura vence, e o aporte, no dia dele — por isso o total pode
              diferir dos gastos do mês em Movimentos.
            </p>
          </Panel>
        </div>

        <Panel className="p-5">
          <SectionTitle
            action={
              picked ? (
                <button type="button" onClick={() => setPicked(null)} className="h-8 text-[12.5px] font-medium text-accent">
                  Ver o mês todo
                </button>
              ) : null
            }
          >
            {picked ? `Dia ${formatDayShort(picked)}` : 'Linha do tempo'}
          </SectionTitle>
          {shownItems.length || shownHolidays.length ? (
            <FlowTimeline
              items={shownItems}
              holidays={shownHolidays}
              today={today}
              categories={categories}
              hidden={hidden}
              onOpen={onOpenFlow}
              balances={balances}
            />
          ) : (
            <p className="py-6 text-center text-[14px] text-ink-3">
              {picked ? 'Nada acontece neste dia.' : 'Nada lançado neste mês ainda.'}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hidden }: { label: string; value: Cents; tone: string; hidden: boolean }) {
  return (
    <div className="rounded-field bg-surface-2 px-3 py-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className={cn('tnum mt-0.5 truncate text-[14px] font-semibold', tone)}>{formatMoney(value, { hidden, compact: true })}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ grade */

function MonthGrid({
  month,
  days,
  items,
  holidays,
  today,
  picked,
  onPick,
}: {
  month: MonthKey;
  days: DayBalance[];
  items: FlowItem[];
  holidays: IsoDate[];
  today: IsoDate;
  picked: IsoDate | null;
  onPick: (d: IsoDate) => void;
}) {
  const { y, m } = monthKeyParts(month);
  const first = new Date(y, m, 1).getDay();
  const byDay = React.useMemo(() => {
    const map = new Map<IsoDate, { in: boolean; out: boolean; invest: boolean }>();
    for (const i of items) {
      const slot = map.get(i.date) ?? { in: false, out: false, invest: false };
      if (i.kind === 'in') slot.in = true;
      else if (i.kind === 'invest') slot.invest = true;
      else slot.out = true;
      map.set(i.date, slot);
    }
    return map;
  }, [items]);
  const holidaySet = new Set(holidays);

  const cells: (DayBalance | null)[] = [...Array.from({ length: first }, () => null), ...days];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS_SHORT_PT.map((d) => (
          <span key={d} className="pb-1 text-[11px] uppercase text-ink-3" aria-hidden>
            {d.slice(0, 1)}
          </span>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <span key={`e-${i}`} />;
          const day = Number(cell.date.slice(8));
          const kinds = byDay.get(cell.date);
          const negative = cell.balance < 0;
          const holiday = holidaySet.has(cell.date);
          const isToday = cell.date === today;
          const label = [
            `Dia ${day}`,
            isToday ? 'hoje' : '',
            holiday ? 'feriado' : '',
            kinds?.in ? 'com entrada' : '',
            kinds?.out ? 'com saída' : '',
            negative ? 'saldo negativo' : '',
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onPick(cell.date)}
              aria-pressed={picked === cell.date}
              aria-label={label}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-[10px] text-[13px] transition-colors',
                negative ? 'bg-out-soft text-out' : 'text-ink-2 hover:bg-surface-2',
                picked === cell.date && 'ring-2 ring-accent',
                isToday && !negative && 'bg-accent-soft font-semibold text-ink',
              )}
            >
              <span className={cn('tnum', holiday && 'underline decoration-event decoration-2 underline-offset-2')}>{day}</span>
              <span className="flex h-1.5 items-center gap-[3px]" aria-hidden>
                {kinds?.in ? <span className="size-1.5 rounded-full bg-in" /> : null}
                {kinds?.out ? <span className="size-1.5 rounded-full bg-out" /> : null}
                {kinds?.invest ? <span className="size-1.5 rounded-full bg-inv" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[11.5px] text-ink-3">
        <Legend className="bg-in">entrada</Legend>
        <Legend className="bg-out">saída</Legend>
        <Legend className="bg-inv">investimento</Legend>
        <span className="flex items-center gap-1.5">
          <span className="underline decoration-event decoration-2 underline-offset-2">12</span> feriado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-out-soft" /> saldo negativo
        </span>
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-1.5 rounded-full', className)} />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ linha de saldo */

/** o saldo no fim de cada dia; a parte tracejada é previsão, a vermelha é abaixo de zero */
function BalanceLine({ days, today, hidden }: { days: DayBalance[]; today: IsoDate; hidden: boolean }) {
  const W = 600;
  const H = 140;
  const P = 8;
  if (days.length < 2) return null;
  const values = days.map((d) => d.balance);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => P + (i / (days.length - 1)) * (W - P * 2);
  const y = (v: number) => P + (1 - (v - min) / span) * (H - P * 2);
  const path = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(' ');
  const todayIndex = days.findIndex((d) => d.date === today);
  const realPath = todayIndex > 0 ? days.slice(0, todayIndex + 1).map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(' ') : '';
  const zero = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[140px] w-full" role="img" aria-label={hidden ? 'Saldo do mês' : `Saldo do mês: termina em ${formatMoney(values[values.length - 1])}`}>
      <defs>
        <clipPath id="cal-below">
          <rect x="0" y={zero} width={W} height={Math.max(0, H - zero)} />
        </clipPath>
      </defs>
      <line x1={P} x2={W - P} y1={zero} y2={zero} stroke="var(--line-strong)" strokeDasharray="3 4" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeDasharray="5 4" opacity="0.7" />
      {realPath ? <path d={realPath} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinejoin="round" /> : null}
      <path d={path} fill="none" stroke="var(--out)" strokeWidth="2.6" clipPath="url(#cal-below)" />
      {todayIndex >= 0 ? (
        <>
          <line x1={x(todayIndex)} x2={x(todayIndex)} y1={P} y2={H - P} stroke="var(--ink-3)" strokeOpacity="0.4" />
          <circle cx={x(todayIndex)} cy={y(days[todayIndex].balance)} r="4.5" fill="var(--accent)" />
        </>
      ) : null}
    </svg>
  );
}
