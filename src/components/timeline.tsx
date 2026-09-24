'use client';

import * as React from 'react';
import { Check, CreditCard, Flag, Receipt, Repeat } from 'lucide-react';
import type { FlowItem } from '@/lib/cashflow';
import { cn } from '@/lib/cn';
import { MONTHS_PT, WEEKDAYS_SHORT_PT, isoToLocalDate, isoToParts } from '@/lib/dates';
import type { Holiday } from '@/lib/holidays';
import { formatMoney } from '@/lib/money';
import type { Category, Cents, IsoDate } from '@/lib/types';

/**
 * A linha do tempo do dinheiro.
 *
 * Cada dia é uma parada com o que entra e o que sai nele — lançamento,
 * fatura, assinatura, parcela e feriado. O marcador "hoje" separa o que já
 * aconteceu do que vem. A cor diz o sentido, mas nunca sozinha: o sinal de
 * mais e menos e o ícone dizem a mesma coisa para quem não enxerga a cor.
 */

const SOURCE_ICON = {
  subscription: Repeat,
  invoice: CreditCard,
  debt: Receipt,
} as const;

const dayLabel = (iso: IsoDate) => {
  const { m, d } = isoToParts(iso);
  return `${String(d).padStart(2, '0')} ${MONTHS_PT[m].slice(0, 3)}`;
};

export function FlowTimeline({
  items,
  holidays = [],
  today,
  categories,
  hidden,
  onOpen,
  balances,
  dense = false,
}: {
  items: FlowItem[];
  holidays?: Holiday[];
  today: IsoDate;
  categories: Category[];
  hidden: boolean;
  onOpen?: (item: FlowItem) => void;
  /** saldo no fim de cada dia, quando a tela quer mostrar */
  balances?: Map<IsoDate, Cents>;
  dense?: boolean;
}) {
  const byId = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const days = React.useMemo(() => {
    const map = new Map<IsoDate, { items: FlowItem[]; holidays: Holiday[] }>();
    for (const i of items) {
      const slot = map.get(i.date) ?? { items: [], holidays: [] };
      slot.items.push(i);
      map.set(i.date, slot);
    }
    for (const h of holidays) {
      const slot = map.get(h.date) ?? { items: [], holidays: [] };
      slot.holidays.push(h);
      map.set(h.date, slot);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [items, holidays]);

  // o marcador de hoje separa passado e futuro; se a lista já começa hoje,
  // o próprio rótulo "Hoje" do dia faz esse papel
  const firstFuture = days.findIndex(([d]) => d >= today);
  const markerAt = firstFuture > 0 || (firstFuture === 0 && days[0][0] !== today) ? firstFuture : -1;

  return (
    <ol className="relative">
      {days.map(([date, slot], idx) => {
        const isToday = date === today;
        const past = date < today;
        const balance = balances?.get(date);
        return (
          <React.Fragment key={date}>
            {idx === markerAt ? <TodayMarker /> : null}
            <li className={cn('relative grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3', dense ? 'pb-3' : 'pb-4')}>
              <div className="pt-0.5 text-right">
                <p className={cn('tnum text-[12px] font-semibold uppercase', isToday ? 'text-accent' : past ? 'text-ink-3' : 'text-ink-2')}>
                  {isToday ? 'Hoje' : dayLabel(date)}
                </p>
                <p className="text-[11px] capitalize text-ink-3">{WEEKDAYS_SHORT_PT[isoToLocalDate(date).getDay()]}</p>
              </div>
              <div className={cn('relative border-l pl-4', past ? 'border-line' : 'border-line-strong')}>
                <span
                  aria-hidden
                  className={cn(
                    'absolute -left-[5px] top-1.5 size-[9px] rounded-full border-2',
                    isToday ? 'border-accent bg-accent' : past ? 'border-line-strong bg-canvas' : 'border-ink-3 bg-canvas',
                  )}
                />
                <ul className="grid gap-1">
                  {slot.holidays.map((h) => (
                    <li key={h.name} className="flex items-center gap-2 text-[13px] text-event">
                      <Flag size={13} aria-hidden />
                      <span>
                        {h.name}
                        {h.bankClosed ? <span className="text-ink-3"> · bancos fechados</span> : null}
                      </span>
                    </li>
                  ))}
                  {slot.items.map((item) => (
                    <TimelineRow
                      key={item.id}
                      item={item}
                      icon={item.categoryId ? byId.get(item.categoryId)?.icon : undefined}
                      hidden={hidden}
                      past={past}
                      onOpen={onOpen}
                    />
                  ))}
                </ul>
                {balance !== undefined ? (
                  <p className={cn('tnum mt-1 text-[11px]', balance < 0 ? 'font-medium text-out' : 'text-ink-3')}>
                    saldo no fim do dia {formatMoney(balance, { hidden })}
                  </p>
                ) : null}
              </div>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function TodayMarker() {
  return (
    <li aria-hidden className="mb-3 flex items-center gap-2 pl-[3.25rem]">
      <span className="h-px flex-1 bg-accent/50" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">hoje</span>
      <span className="h-px w-4 bg-accent/50" />
    </li>
  );
}

function TimelineRow({
  item,
  icon,
  hidden,
  past,
  onOpen,
}: {
  item: FlowItem;
  icon?: string;
  hidden: boolean;
  past: boolean;
  onOpen?: (item: FlowItem) => void;
}) {
  const SourceIcon = item.source === 'entry' ? null : SOURCE_ICON[item.source];
  const sign = item.kind === 'in' ? '+' : '−';
  const tone = item.kind === 'in' ? 'text-in' : item.kind === 'invest' ? 'text-inv' : 'text-ink';
  const detail =
    item.source === 'invoice'
      ? 'fatura do cartão'
      : item.source === 'subscription'
        ? 'assinatura'
        : item.source === 'debt'
          ? `parcela ${item.installment?.index}/${item.installment?.total}`
          : item.installment
            ? `parcela ${item.installment.index}/${item.installment.total}`
            : item.kind === 'invest'
              ? 'investimento'
              : null;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        className="-mx-2 flex min-h-10 w-[calc(100%+1rem)] items-center gap-2.5 rounded-field px-2 py-1 text-left transition-colors hover:bg-surface-2"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] text-ink-3" aria-hidden>
          {item.settled ? <Check size={13} className="text-in" /> : SourceIcon ? <SourceIcon size={13} /> : (icon ?? '•')}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('line-clamp-2 block text-[14px] leading-snug', past && item.settled ? 'text-ink-3' : 'text-ink')}>
            {item.label}
          </span>
          {detail || item.overdue ? (
            <span className={cn('block truncate text-[11px]', item.overdue ? 'font-medium text-out' : 'text-ink-3')}>
              {item.overdue ? 'vencida · sem baixa' : detail}
            </span>
          ) : null}
        </span>
        <span className={cn('tnum shrink-0 text-[14px] font-semibold', tone)}>
          {hidden ? '••••' : `${sign}${formatMoney(item.amount)}`}
        </span>
      </button>
    </li>
  );
}
