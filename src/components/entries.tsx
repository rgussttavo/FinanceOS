'use client';

import * as React from 'react';
import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDayShort, formatRelativeDay, todayIso } from '@/lib/dates';
import { formatMoney, parseMoney } from '@/lib/money';
import type { Occurrence } from '@/lib/occurrences';
import { createEntry, rememberCategory, suggestCategory } from '@/lib/store';
import type { Category, FlowKind, Repeat, RepeatKind } from '@/lib/types';
import { Button, EmptyState, Field, Input, Panel, SectionTitle, Segmented, Select, Sheet } from './ui';

/* --------------------------------------------------------------- listagem */

const TONE: Record<FlowKind, string> = {
  in: 'text-in',
  out: 'text-ink',
  invest: 'text-inv',
};

export function OccurrenceList({
  occurrences,
  categories,
  hidden = false,
  onToggle,
  onOpen,
}: {
  occurrences: Occurrence[];
  categories: Category[];
  hidden?: boolean;
  onToggle: (o: Occurrence) => void;
  onOpen?: (o: Occurrence) => void;
}) {
  const byId = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  if (!occurrences.length) {
    return (
      <EmptyState
        title="Nada lançado neste mês"
        description="Comece pelo que você já sabe: o aluguel, o salário, a assinatura que cai todo dia 12."
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {occurrences.map((o) => {
        const category = o.categoryId ? byId.get(o.categoryId) : null;
        const settled = o.settlement !== null;

        return (
          <li key={`${o.entryId}:${o.key}`} className="flex items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => onToggle(o)}
              aria-pressed={settled}
              aria-label={settled ? `Desfazer baixa de ${o.description}` : `Dar baixa em ${o.description}`}
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-all duration-[var(--t-fast)]',
                settled
                  ? 'border-transparent bg-in text-white'
                  : o.overdue
                    ? 'border-out/40 text-out hover:bg-out-soft'
                    : 'border-line text-ink-3 hover:border-line-strong hover:text-ink-2',
              )}
            >
              {settled ? <Check size={16} strokeWidth={2.6} /> : <span aria-hidden>{category?.icon ?? '•'}</span>}
            </button>

            <button
              type="button"
              onClick={() => onOpen?.(o)}
              className="flex min-w-0 flex-1 flex-col items-start text-left"
            >
              <span
                className={cn(
                  'w-full truncate text-[15px]',
                  settled ? 'text-ink-3 line-through decoration-ink-3/40' : 'text-ink',
                )}
              >
                {o.description}
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
                <span>{category?.name ?? 'Sem categoria'}</span>
                <span aria-hidden>·</span>
                <span className={cn(o.overdue && !settled && 'text-out')}>
                  {o.overdue && !settled ? `venceu ${formatRelativeDay(o.date)}` : formatDayShort(o.date)}
                </span>
                {o.installment && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tnum">
                      {o.installment.index}/{o.installment.total}
                    </span>
                  </>
                )}
              </span>
            </button>

            <span
              className={cn(
                'tnum shrink-0 text-[15px] font-semibold tabular-nums',
                settled ? 'text-ink-3' : TONE[o.kind],
              )}
            >
              {o.kind === 'in' ? '+' : ''}
              {formatMoney(o.amount, { hidden })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------- novo registro */

const KIND_OPTIONS = [
  { value: 'out' as const, label: 'Saiu', tone: 'out' as const },
  { value: 'in' as const, label: 'Entrou', tone: 'in' as const },
  { value: 'invest' as const, label: 'Investi', tone: 'inv' as const },
];

const REPEAT_LABELS: Record<RepeatKind, string> = {
  once: 'Não repete',
  monthly: 'Todo mês',
  weekly: 'Toda semana',
  yearly: 'Todo ano',
  installments: 'Parcelado',
};

export function NewEntrySheet({
  open,
  onClose,
  spaceId,
  categories,
  defaultDate,
  defaultKind = 'out',
}: {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  categories: Category[];
  defaultDate?: string;
  /** a aba aberta decide o tipo que o + já traz selecionado */
  defaultKind?: FlowKind;
}) {
  const [kind, setKind] = React.useState<FlowKind>(defaultKind);
  const [description, setDescription] = React.useState('');
  const [amountText, setAmountText] = React.useState('');
  const [date, setDate] = React.useState(defaultDate ?? todayIso());
  const [categoryId, setCategoryId] = React.useState<string>('');
  const [repeatKind, setRepeatKind] = React.useState<RepeatKind>('once');
  const [installments, setInstallments] = React.useState('12');
  const [touchedCategory, setTouchedCategory] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const visibleCategories = React.useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  );

  // a categoria se sugere sozinha enquanto a pessoa digita, e para de insistir
  // assim que ela escolhe uma na mao
  React.useEffect(() => {
    if (touchedCategory || description.trim().length < 3) return;
    let alive = true;
    const timer = setTimeout(() => {
      suggestCategory(description, kind, categories).then((result) => {
        if (!alive || !result.categoryId || result.confidence < 0.35) return;
        setCategoryId(result.categoryId);
        setSuggestion(result.reason === 'learned' ? 'como você ensinou' : 'sugerida pela descrição');
      });
    }, 260);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [description, kind, categories, touchedCategory]);

  // trocar o tipo zera a categoria: as listas de entrada, saida e investimento
  // nao se misturam, entao manter a escolha anterior so produziria valor invalido
  const changeKind = React.useCallback((next: FlowKind) => {
    setKind(next);
    setCategoryId('');
    setTouchedCategory(false);
    setSuggestion(null);
  }, []);

  const reset = React.useCallback(() => {
    setKind(defaultKind);
    setDescription('');
    setAmountText('');
    setDate(defaultDate ?? todayIso());
    setCategoryId('');
    setRepeatKind('once');
    setInstallments('12');
    setTouchedCategory(false);
    setSuggestion(null);
    setError(null);
  }, [defaultDate, defaultKind]);

  async function submit() {
    const amount = parseMoney(amountText);
    if (!description.trim()) return setError('Escreva o que foi.');
    if (amount === null || amount <= 0) return setError('Informe um valor maior que zero.');

    const repeat: Repeat =
      repeatKind === 'installments'
        ? { kind: 'installments', count: Math.max(2, Number(installments) || 2) }
        : { kind: repeatKind };

    setSaving(true);
    try {
      await createEntry({
        spaceId,
        kind,
        description,
        amount,
        date,
        categoryId: categoryId || null,
        repeat,
      });
      // escolha manual vira regra: a proxima vez ja nasce certa
      if (touchedCategory && categoryId) await rememberCategory(description, categoryId);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Novo lançamento"
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={submit} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      }
    >
      <div className="grid gap-4">
        <Segmented options={KIND_OPTIONS} value={kind} onChange={changeKind} label="Tipo do lançamento" />

        <Field label="O que foi" htmlFor="entry-description" error={error?.includes('foi') ? error : null}>
          <Input
            id="entry-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mercado, aluguel, salário…"
            autoComplete="off"
          />
        </Field>

        <Field label="Quanto" htmlFor="entry-amount" error={error?.includes('valor') ? error : null}>
          <Input
            id="entry-amount"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="tnum text-[17px] font-semibold"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quando" htmlFor="entry-date">
            <Input
              id="entry-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <Field label="Repete" htmlFor="entry-repeat">
            <Select
              id="entry-repeat"
              value={repeatKind}
              onChange={(e) => setRepeatKind(e.target.value as RepeatKind)}
            >
              {(Object.keys(REPEAT_LABELS) as RepeatKind[]).map((k) => (
                <option key={k} value={k}>
                  {REPEAT_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {repeatKind === 'installments' && (
          <Field label="Quantas parcelas" htmlFor="entry-installments" hint="O valor informado é o de cada parcela.">
            <Input
              id="entry-installments"
              value={installments}
              onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="tnum"
            />
          </Field>
        )}

        <Field
          label="Categoria"
          htmlFor="entry-category"
          hint={suggestion && !touchedCategory ? `Categoria ${suggestion}.` : undefined}
        >
          <Select
            id="entry-category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setTouchedCategory(true);
              setSuggestion(null);
            }}
          >
            <option value="">Sem categoria</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------- botao do + */

export function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Novo lançamento"
      className={cn(
        'fixed right-5 z-40 grid h-14 w-14 place-items-center rounded-full',
        'bg-accent text-accent-ink shadow-e2',
        'transition-transform duration-[var(--t-fast)] ease-[var(--ease)] active:scale-95',
      )}
      style={{ bottom: 'calc(1.25rem + var(--sa-bottom))' }}
    >
      <Plus size={24} strokeWidth={2.4} />
    </button>
  );
}

/* ------------------------------------------------------------- proximos */

export function UpcomingPanel({
  occurrences,
  hidden = false,
}: {
  occurrences: Occurrence[];
  hidden?: boolean;
}) {
  const today = todayIso();
  const upcoming = occurrences
    .filter((o) => o.settlement === null && o.kind === 'out' && o.date >= today)
    .slice(0, 4);

  if (!upcoming.length) return null;

  return (
    <Panel className="p-6">
      <SectionTitle>A pagar</SectionTitle>
      <ul className="grid gap-3">
        {upcoming.map((o) => (
          <li key={`${o.entryId}:${o.key}`} className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[14px] text-ink">{o.description}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="text-[12px] text-ink-3">{formatRelativeDay(o.date)}</span>
              <span className="tnum text-[14px] font-semibold text-ink-2">
                {formatMoney(o.amount, { hidden })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
