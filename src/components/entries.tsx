'use client';

import * as React from 'react';
import { Check, CreditCard, Receipt, Repeat, ScanLine } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDayShort, formatRelativeDay, WEEKDAYS_SHORT_PT, isoToLocalDate, todayIso } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Occurrence } from '@/lib/occurrences';
import { SCAN_LABELS, scanCode, type ScanResult } from '@/lib/scan';
import type { Category, FlowKind } from '@/lib/types';
import { Badge, Button, EmptyState } from './ui';

/* --------------------------------------------------------------- listagem */

const TONE: Record<FlowKind, string> = {
  in: 'text-in',
  out: 'text-ink',
  invest: 'text-inv',
};

const SIGN: Record<FlowKind, string> = { in: '+', out: '−', invest: '' };

/**
 * A lista de lançamentos de qualquer tela.
 *
 * O círculo da esquerda dá baixa (marca como pago); tocar no resto abre o
 * lançamento para editar. Assinatura e parcela de dívida aparecem na lista
 * porque pesam no mês, mas se editam na tela delas — por isso levam uma marca
 * e não têm o círculo de baixa.
 */
export function OccurrenceList({
  occurrences,
  categories,
  hidden = false,
  onToggle,
  onOpen,
  groupByDay = false,
  empty,
}: {
  occurrences: Occurrence[];
  categories: Category[];
  hidden?: boolean;
  onToggle: (o: Occurrence) => void;
  onOpen?: (o: Occurrence) => void;
  groupByDay?: boolean;
  empty?: { title: string; description: string; action?: React.ReactNode };
}) {
  const byId = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  if (!occurrences.length) {
    return (
      <EmptyState
        compact
        title={empty?.title ?? 'Nada lançado neste mês'}
        description={empty?.description ?? 'Comece pelo que você já sabe: o aluguel, o salário, a assinatura que cai todo dia 12.'}
        action={empty?.action}
      />
    );
  }

  if (!groupByDay) {
    return (
      <ul className="divide-y divide-line">
        {occurrences.map((o) => (
          <OccurrenceRow key={`${o.entryId}:${o.key}`} o={o} category={o.categoryId ? byId.get(o.categoryId) : undefined} hidden={hidden} onToggle={onToggle} onOpen={onOpen} />
        ))}
      </ul>
    );
  }

  const days: [string, Occurrence[]][] = [];
  for (const o of occurrences) {
    const last = days[days.length - 1];
    if (last && last[0] === o.date) last[1].push(o);
    else days.push([o.date, [o]]);
  }
  const today = todayIso();

  return (
    <div className="grid gap-1">
      {days.map(([date, rows]) => (
        <section key={date} aria-label={formatDayShort(date)}>
          <h3 className="sticky top-14 z-10 -mx-1 flex items-baseline gap-2 bg-surface/95 px-1 pb-1 pt-3 text-[12px] font-medium text-ink-3 backdrop-blur lg:top-0">
            <span className={cn('tnum', date === today && 'text-accent')}>
              {date === today ? 'Hoje' : formatDayShort(date)}
            </span>
            <span className="capitalize">{WEEKDAYS_SHORT_PT[isoToLocalDate(date).getDay()]}</span>
          </h3>
          <ul className="divide-y divide-line">
            {rows.map((o) => (
              <OccurrenceRow key={`${o.entryId}:${o.key}`} o={o} category={o.categoryId ? byId.get(o.categoryId) : undefined} hidden={hidden} onToggle={onToggle} onOpen={onOpen} showDate={false} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function OccurrenceRow({
  o,
  category,
  hidden,
  onToggle,
  onOpen,
  showDate = true,
}: {
  o: Occurrence;
  category: Category | undefined;
  hidden: boolean;
  onToggle: (o: Occurrence) => void;
  onOpen?: (o: Occurrence) => void;
  showDate?: boolean;
}) {
  const settled = o.settlement !== null;
  const overdue = o.overdue && !settled;

  return (
    <li className="flex items-center gap-3 py-2.5">
      {o.virtual ? (
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3"
          aria-hidden
        >
          {o.virtual === 'subscription' ? <Repeat size={16} /> : <Receipt size={16} />}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(o)}
          aria-pressed={settled}
          aria-label={settled ? `Desfazer baixa de ${o.description}` : `Marcar ${o.description} como ${o.kind === 'in' ? 'recebido' : 'pago'}`}
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full border text-[15px] transition-all duration-[var(--t-fast)]',
            settled
              ? 'border-transparent bg-in text-canvas'
              : overdue
                ? 'border-out/50 text-out hover:bg-out-soft'
                : 'border-line text-ink-3 hover:border-line-strong hover:text-ink-2',
          )}
        >
          {settled ? <Check size={17} strokeWidth={2.6} className="motion-safe:animate-[pop-in_var(--t-base)_var(--ease-out)]" /> : <span aria-hidden>{category?.icon ?? '•'}</span>}
        </button>
      )}

      <button
        type="button"
        onClick={() => onOpen?.(o)}
        className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center text-left"
      >
        <span
          className={cn(
            'w-full truncate text-[15px]',
            settled && !o.virtual ? 'text-ink-3' : 'text-ink',
          )}
        >
          {o.description}
        </span>
        <span className="flex w-full min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
          <span className="truncate">{category?.name ?? (o.virtual === 'debt' ? 'Dívida' : 'Sem categoria')}</span>
          {showDate && (
            <>
              <span aria-hidden>·</span>
              <span className={cn('shrink-0', overdue && 'font-medium text-out')}>
                {overdue ? `venceu ${formatRelativeDay(o.date)}` : formatDayShort(o.date)}
              </span>
            </>
          )}
          {!showDate && overdue && <span className="shrink-0 font-medium text-out">· vencida</span>}
          {o.installment && (
            <span className="tnum shrink-0">
              · {o.installment.index}/{o.installment.total}
            </span>
          )}
          {o.cardId && !o.virtual && <CreditCard size={12} className="shrink-0" aria-label="no cartão" />}
        </span>
      </button>

      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            'tnum text-[15px] font-semibold',
            settled && !o.virtual ? 'text-ink-3' : TONE[o.kind],
          )}
        >
          {hidden ? '••••' : `${SIGN[o.kind]}${formatMoney(o.amount, { hidden })}`}
        </span>
        {o.virtual ? (
          <Badge tone="neutral" className="h-5 px-1.5 text-[10px]">
            {o.virtual === 'subscription' ? 'assinatura' : 'parcela'}
          </Badge>
        ) : null}
      </span>
    </li>
  );
}

/* --------------------------------------------------- boleto e Pix colados */

/**
 * Cola do código, leitura local.
 *
 * O boleto traz valor e vencimento; o Pix traz valor e beneficiário. Ler isso
 * do código remove o passo mais chato e mais sujeito a erro do app — e nada
 * sai do aparelho: o código de um boleto é informação bancária de quem está
 * com o papel na mão.
 */
export function CodeScanner({ onRead, startOpen = false }: { onRead: (result: ScanResult) => void; startOpen?: boolean }) {
  const [open, setOpen] = React.useState(startOpen);
  const [text, setText] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'ok' | 'fail'>('idle');
  const [kindLabel, setKindLabel] = React.useState('');

  function read(raw: string) {
    const result = scanCode(raw);
    if (!result) {
      setStatus('fail');
      return;
    }
    setKindLabel(SCAN_LABELS[result.kind]);
    setStatus('ok');
    onRead(result);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-card border border-line bg-surface-2 px-3.5 py-3 text-left transition-colors hover:bg-surface-3"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-accent">
          <ScanLine size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-ink">Boleto ou Pix copia e cola</span>
          <span className="block text-[12px] text-ink-3">Cole o código e eu preencho valor e data</span>
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface-2 p-3">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStatus('idle');
        }}
        rows={3}
        spellCheck={false}
        aria-label="Código do boleto ou Pix"
        placeholder="Cole aqui a linha digitável do boleto ou o código Pix copia e cola"
        className="w-full resize-none rounded-field border border-line bg-surface px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
      />

      <div className="mt-2 flex gap-2">
        <Button variant="primary" size="sm" onClick={() => read(text)} disabled={text.trim().length < 20}>
          Ler código
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={async () => {
            try {
              const clip = await navigator.clipboard.readText();
              setText(clip);
              read(clip);
            } catch {
              // sem permissão de área de transferência: resta colar à mão
              setStatus('fail');
            }
          }}
        >
          Colar
        </Button>
        <Button variant="quiet" size="sm" className="ml-auto" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </div>

      {status === 'ok' && <p className="mt-2 text-[12px] text-in">{kindLabel} lido: preenchi o que dava.</p>}
      {status === 'fail' && (
        <p role="alert" className="mt-2 text-[12px] text-out">
          Não reconheci esse código. Confira se copiou inteiro, ou preencha à mão.
        </p>
      )}
    </div>
  );
}
