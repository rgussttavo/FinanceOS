'use client';

import * as React from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  CreditCard,
  FileUp,
  Minus,
  Plus,
  Receipt,
  Repeat,
  ScanLine,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { addDaysIso, formatDayShort, todayIso } from '@/lib/dates';
import { goalProgress } from '@/lib/goals';
import { formatMoney, parseMoney, splitCents } from '@/lib/money';
import type { Route } from '@/lib/nav';
import { deleteRecord } from '@/lib/db';
import {
  confirmRule,
  createEntry,
  depositIntoGoal,
  forgetRule,
  rememberCategory,
  suggestCategory,
} from '@/lib/store';
import type { Account, Card, Category, Cents, Entry, FlowKind, Goal, RepeatKind } from '@/lib/types';
import { CodeScanner } from './entries';
import { Button, Chip, Field, Input, Select, Sheet, toast } from './ui';

/**
 * Registrar algo em poucos segundos.
 *
 * O botão de + abre uma pergunta — "o que você quer registrar?" — e cada
 * resposta pede só o que aquele tipo precisa: quanto e onde. Data, repetição
 * e observação existem, mas ficam guardadas em "mais opções"; a categoria
 * vem sugerida pelo que foi escrito. O formulário de sete campos que existia
 * antes pedia a mesma coisa para um café e para um financiamento.
 */

export type QuickKind = 'out' | 'in' | 'card' | 'invest' | 'goal';

export interface QuickAddRequest {
  kind?: QuickKind;
  /** abre o gasto já com o leitor de boleto/Pix aberto */
  scan?: boolean;
}

const OPTIONS: { kind: QuickKind; label: string; hint: string; icon: LucideIcon; tone: string }[] = [
  { kind: 'out', label: 'Gasto', hint: 'Mercado, conta, compra no débito', icon: Minus, tone: 'bg-out-soft text-out' },
  { kind: 'in', label: 'Receita', hint: 'Salário, freela, reembolso', icon: Plus, tone: 'bg-in-soft text-in' },
  { kind: 'card', label: 'Compra no cartão', hint: 'À vista ou parcelada', icon: CreditCard, tone: 'bg-accent-soft text-accent' },
  { kind: 'invest', label: 'Investimento', hint: 'Aporte em renda fixa, ações…', icon: TrendingUp, tone: 'bg-inv-soft text-inv' },
  { kind: 'goal', label: 'Aporte para meta', hint: 'Guardar para um objetivo', icon: Target, tone: 'bg-event-soft text-event' },
];

const TITLES: Record<QuickKind, string> = {
  out: 'Registrar gasto',
  in: 'Registrar receita',
  card: 'Compra no cartão',
  invest: 'Registrar investimento',
  goal: 'Aporte para meta',
};

const SUBMIT: Record<QuickKind, string> = {
  out: 'Registrar gasto',
  in: 'Registrar receita',
  card: 'Lançar compra',
  invest: 'Registrar investimento',
  goal: 'Guardar na meta',
};

const DONE: Record<QuickKind, string> = {
  out: 'Gasto registrado.',
  in: 'Receita registrada.',
  card: 'Compra lançada no cartão.',
  invest: 'Investimento registrado.',
  goal: 'Aporte guardado na meta.',
};

export function QuickAddSheet({
  open,
  request,
  onClose,
  spaceId,
  categories,
  cards,
  goals,
  entries,
  cardsEnabled,
  onGo,
  accounts = [],
}: {
  open: boolean;
  request: QuickAddRequest | null;
  onClose: () => void;
  spaceId: string;
  categories: Category[];
  cards: Card[];
  goals: Goal[];
  entries: Entry[];
  cardsEnabled: boolean;
  onGo: (route: Route) => void;
  /** contas não arquivadas: com mais de uma, o lançamento diz de qual é */
  accounts?: Account[];
}) {
  const [picked, setPicked] = React.useState<{ kind: QuickKind; scan: boolean; fromMenu: boolean } | null>(null);

  // cada abertura recomeça do pedido que a abriu
  const [seenRequest, setSeenRequest] = React.useState<QuickAddRequest | null>(null);
  if (open && request !== seenRequest) {
    setSeenRequest(request);
    setPicked(request?.kind ? { kind: request.kind, scan: Boolean(request.scan), fromMenu: false } : null);
  }

  const close = React.useCallback(() => {
    setSeenRequest(null);
    onClose();
  }, [onClose]);

  const activeGoals = goals.filter((g) => !g.archivedAt && !g.pausedAt && !g.deletedAt);
  const kind = picked?.kind;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={kind ? TITLES[kind] : 'O que você quer registrar?'}
      description={kind ? undefined : 'Escolha e preencha só o essencial.'}
    >
      {!kind ? (
        <Menu
          cardsAvailable={cardsEnabled}
          hasCards={cards.length > 0}
          hasGoals={activeGoals.length > 0}
          onPick={(k, scan = false) => setPicked({ kind: k, scan, fromMenu: true })}
          onGo={(route) => {
            close();
            onGo(route);
          }}
        />
      ) : (
        <QuickForm
          key={`${kind}-${picked?.scan}`}
          kind={kind}
          startScan={picked?.scan ?? false}
          onBack={picked?.fromMenu ? () => setPicked(null) : undefined}
          spaceId={spaceId}
          categories={categories}
          cards={cards}
          goals={activeGoals}
          entries={entries}
          accounts={accounts}
          onDone={close}
          onGo={(route) => {
            close();
            onGo(route);
          }}
        />
      )}
    </Sheet>
  );
}

/* -------------------------------------------------------------------- menu */

function Menu({
  cardsAvailable,
  hasCards,
  hasGoals,
  onPick,
  onGo,
}: {
  cardsAvailable: boolean;
  hasCards: boolean;
  hasGoals: boolean;
  onPick: (kind: QuickKind, scan?: boolean) => void;
  onGo: (route: Route) => void;
}) {
  const options = OPTIONS.filter((o) => o.kind !== 'card' || cardsAvailable);

  return (
    <div className="grid gap-5">
      <ul className="grid grid-cols-2 gap-2.5">
        {options.map((o, i) => {
          const Icon = o.icon;
          const missing = (o.kind === 'card' && !hasCards) || (o.kind === 'goal' && !hasGoals);
          return (
            <li key={o.kind} className={cn(options.length % 2 === 1 && i === options.length - 1 && 'col-span-2')}>
              <button
                type="button"
                data-autofocus={i === 0 ? true : undefined}
                onClick={() =>
                  missing
                    ? onGo(o.kind === 'card' ? { view: 'cartoes', param: 'novo' } : { view: 'metas', param: 'novo' })
                    : onPick(o.kind)
                }
                className="flex h-full w-full flex-col items-start gap-2 rounded-card border border-line bg-surface-2 p-3.5 text-left transition-colors hover:border-line-strong hover:bg-surface-3"
              >
                <span className={cn('grid size-9 place-items-center rounded-full', o.tone)}>
                  <Icon size={18} strokeWidth={2.2} aria-hidden />
                </span>
                <span>
                  <span className="block text-[15px] font-medium text-ink">{o.label}</span>
                  <span className="block text-[12px] leading-snug text-ink-3">
                    {missing ? (o.kind === 'card' ? 'Cadastre um cartão primeiro' : 'Crie uma meta primeiro') : o.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Também dá para</p>
        <div className="flex flex-wrap gap-2">
          <Chip onClick={() => onPick('out', true)}>
            <ScanLine size={15} /> Boleto ou Pix
          </Chip>
          <Chip onClick={() => onGo({ view: 'importar' })}>
            <FileUp size={15} /> Importar extrato
          </Chip>
          <Chip onClick={() => onGo({ view: 'contas', param: 'transferir' })}>
            <ArrowLeftRight size={15} /> Transferência entre contas
          </Chip>
          {cardsAvailable ? (
            <Chip onClick={() => onGo({ view: 'cartoes', param: 'novo' })}>
              <CreditCard size={15} /> Novo cartão
            </Chip>
          ) : null}
          <Chip onClick={() => onGo({ view: 'metas', param: 'novo' })}>
            <Target size={15} /> Nova meta
          </Chip>
          <Chip onClick={() => onGo({ view: 'dividas', param: 'novo' })}>
            <Receipt size={15} /> Registrar dívida
          </Chip>
          <Chip onClick={() => onGo({ view: 'assinaturas', param: 'novo' })}>
            <Repeat size={15} /> Nova assinatura
          </Chip>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- formulário */

const REPEAT_LABELS: Record<RepeatKind, string> = {
  once: 'Não repete',
  monthly: 'Todo mês',
  weekly: 'Toda semana',
  yearly: 'Todo ano',
  installments: 'Parcelado',
};

const CATEGORY_KIND: Record<QuickKind, FlowKind> = {
  out: 'out',
  in: 'in',
  card: 'out',
  invest: 'invest',
  goal: 'invest',
};

function QuickForm({
  kind,
  startScan,
  onBack,
  spaceId,
  categories,
  cards,
  goals,
  entries,
  onDone,
  onGo,
  accounts,
}: {
  accounts: Account[];
  kind: QuickKind;
  startScan: boolean;
  onBack?: () => void;
  spaceId: string;
  categories: Category[];
  cards: Card[];
  goals: Goal[];
  entries: Entry[];
  onDone: () => void;
  onGo: (route: Route) => void;
}) {
  const flow = CATEGORY_KIND[kind];
  const [amountText, setAmountText] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [confidence, setConfidence] = React.useState<'alta' | 'média' | null>(null);
  const [date, setDate] = React.useState(todayIso());
  const [cardId, setCardId] = React.useState(cards[0]?.id ?? '');
  const [installments, setInstallments] = React.useState(1);
  const [goalId, setGoalId] = React.useState(goals[0]?.id ?? '');
  const [more, setMore] = React.useState(false);
  const [repeatKind, setRepeatKind] = React.useState<RepeatKind>('once');
  const [notes, setNotes] = React.useState('');
  const [accountId, setAccountId] = React.useState(accounts.find((a) => a.primary)?.id ?? accounts[0]?.id ?? '');
  const [pickCategory, setPickCategory] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const amountRef = React.useRef<HTMLInputElement>(null);

  const options = React.useMemo(() => categories.filter((c) => c.kind === flow), [categories, flow]);
  const category = options.find((c) => c.id === categoryId) ?? null;
  const goal = goals.find((g) => g.id === goalId) ?? null;

  // a categoria se sugere enquanto a pessoa escreve, e para de insistir
  // assim que ela escolhe uma na mão
  React.useEffect(() => {
    if (touched || kind === 'goal' || description.trim().length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      suggestCategory(description, flow, categories).then((r) => {
        if (!alive) return;
        if (!r.categoryId || r.confidence < 0.35) {
          setCategoryId('');
          setConfidence(null);
          return;
        }
        setCategoryId(r.categoryId);
        setConfidence(r.confidence >= 0.7 ? 'alta' : 'média');
      });
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [description, flow, categories, touched, kind]);

  React.useEffect(() => {
    if (!startScan) amountRef.current?.focus();
  }, [startScan]);

  const amount = parseMoney(amountText);
  // a primeira parcela leva a sobra de centavos; o total vai junto com a compra
  const perInstallment = amount && kind === 'card' ? (splitCents(amount, installments)[0] ?? null) : null;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (amount === null || amount <= 0) {
      setError('Informe um valor maior que zero.');
      amountRef.current?.focus();
      return;
    }
    if (kind !== 'goal' && !description.trim()) {
      setError(kind === 'in' ? 'Diga de onde veio.' : 'Diga onde foi, em uma ou duas palavras.');
      return;
    }
    if (kind === 'card' && !cardId) return setError('Escolha o cartão.');
    if (kind === 'goal' && !goal) return setError('Escolha a meta.');

    setSaving(true);
    setError(null);
    try {
      let created: Entry | null = null;

      if (kind === 'goal' && goal) {
        if (goal.source === 'manual') {
          await depositIntoGoal(goal, amount);
        } else {
          // meta ligada a investimento: o aporte é um investimento de verdade
          const invCat = goal.categoryId ?? options[0]?.id ?? null;
          created = await createEntry({
            spaceId,
            kind: 'invest',
            description: `Aporte · ${goal.name}`,
            amount,
            date,
            categoryId: invCat,
            notes,
            paidIfPast: true,
          });
        }
      } else {
        created = await createEntry({
          spaceId,
          kind: flow,
          description,
          amount: kind === 'card' ? (perInstallment ?? amount) : amount,
          date,
          categoryId: categoryId || null,
          cardId: kind === 'card' ? cardId : null,
          // com mais de uma conta, o lançamento sai (ou entra) na conta escolhida
          accountId: kind === 'card' ? null : accountId || null,
          repeat:
            kind === 'card'
              ? installments > 1
                ? { kind: 'installments', count: installments, total: amount }
                : { kind: 'once' }
              : repeatKind === 'installments'
                ? { kind: 'installments', count: 12 }
                : { kind: repeatKind },
          notes,
          paidIfPast: kind !== 'card',
        });
      }

      const undo = created
        ? { label: 'Desfazer', onClick: () => void deleteRecord('entries', created!.id) }
        : undefined;
      toast(DONE[kind], { action: undo });

      // escolher a categoria na mão ensina; na segunda vez igual, pergunta se vira regra
      if (touched && categoryId && description.trim()) {
        const rule = await rememberCategory(description, categoryId);
        if (rule && rule.hits >= 2 && !rule.confirmed && category) {
          const label = description.trim().split(/\s+/).slice(0, 3).join(' ');
          toast(`Você sempre classifica ${label} como ${category.name}. Manter essa regra?`, {
            tone: 'info',
            duration: 9000,
            action: { label: 'Manter', onClick: () => void confirmRule(rule.pattern) },
            secondary: { label: 'Não', onClick: () => void forgetRule(rule.pattern) },
          });
        }
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  const today = todayIso();
  const yesterday = addDaysIso(today, -1);

  return (
    <form onSubmit={submit} className="grid gap-5">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="-mt-2 flex h-9 items-center gap-1 self-start rounded-field pr-2 text-[13px] text-ink-3 hover:text-ink"
        >
          <ChevronLeft size={16} /> Outro tipo
        </button>
      ) : null}

      {kind === 'out' ? (
        <CodeScanner
          startOpen={startScan}
          onRead={(r) => {
            if (r.amount != null) setAmountText(String(r.amount / 100).replace('.', ','));
            if (r.dueDate) setDate(r.dueDate);
            if (!description.trim()) setDescription(r.payee ?? r.description);
          }}
        />
      ) : null}

      <div className="grid gap-1.5">
        <label htmlFor="qa-amount" className="text-[13px] font-medium text-ink-2">
          {kind === 'card' ? 'Quanto foi a compra?' : 'Quanto?'}
        </label>
        <div className="flex items-baseline gap-2 border-b-2 border-line pb-1 focus-within:border-accent">
          <span className="font-display text-[26px] text-ink-3">R$</span>
          <input
            ref={amountRef}
            id="qa-amount"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            autoComplete="off"
            aria-invalid={error?.includes('valor') ? true : undefined}
            className="amount w-full bg-transparent text-[40px] text-ink outline-none placeholder:text-ink-3/50"
          />
        </div>
        {kind === 'card' && perInstallment && installments > 1 ? (
          <p className="text-[12px] text-ink-3">
            {installments}× de {formatMoney(perInstallment)}
          </p>
        ) : null}
      </div>

      {kind === 'goal' ? (
        <div className="grid gap-2">
          <p className="text-[13px] font-medium text-ink-2">Para qual meta?</p>
          <div className="flex flex-wrap gap-2">
            {goals.map((g) => {
              const p = goalProgress(g, entries, today.slice(0, 7), today);
              return (
                <Chip key={g.id} active={g.id === goalId} onClick={() => setGoalId(g.id)}>
                  <span aria-hidden>{g.icon}</span> {g.name}
                  <span className="text-ink-3">· faltam {formatMoney(p.missing, { compact: true })}</span>
                </Chip>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <label htmlFor="qa-desc" className="text-[13px] font-medium text-ink-2">
            {kind === 'in' ? 'De onde veio?' : kind === 'invest' ? 'Onde investiu?' : kind === 'card' ? 'O que comprou?' : 'Onde? O que foi?'}
          </label>
          <Input
            id="qa-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              kind === 'in' ? 'Salário, freela, Pix da Ana…' : kind === 'invest' ? 'CDB, Tesouro, ações…' : 'Uber, mercado, farmácia…'
            }
            autoComplete="off"
            enterKeyHint="done"
          />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPickCategory((v) => !v)}
              aria-expanded={pickCategory}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors',
                category ? 'border-accent/40 bg-accent-soft text-ink' : 'border-dashed border-line-strong text-ink-3',
              )}
            >
              {category ? (
                <>
                  <span aria-hidden>{category.icon}</span> {category.name}
                </>
              ) : (
                'Escolher categoria'
              )}
              <ChevronDown size={14} className={cn('transition-transform', pickCategory && 'rotate-180')} />
            </button>
            {category && !touched && confidence ? (
              <span className="text-[12px] text-ink-3">sugerida · confiança {confidence}</span>
            ) : null}
          </div>

          {pickCategory ? (
            <div className="flex flex-wrap gap-1.5 rounded-card bg-surface-2 p-2" role="listbox" aria-label="Categorias">
              {options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={c.id === categoryId}
                  onClick={() => {
                    setCategoryId(c.id);
                    setTouched(true);
                    setConfidence(null);
                    setPickCategory(false);
                  }}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors',
                    c.id === categoryId ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-2 hover:text-ink',
                  )}
                >
                  <span aria-hidden>{c.icon}</span> {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {kind === 'card' ? (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <p className="text-[13px] font-medium text-ink-2">Em qual cartão?</p>
            <div className="flex flex-wrap gap-2">
              {cards.map((c) => (
                <Chip key={c.id} active={c.id === cardId} onClick={() => setCardId(c.id)}>
                  <CreditCard size={14} /> {c.name || c.institution}
                  {c.last4 ? <span className="text-ink-3">·{c.last4}</span> : null}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-card bg-surface-2 px-3 py-2">
            <span className="text-[14px] text-ink">Parcelas</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Menos uma parcela"
                onClick={() => setInstallments((n) => Math.max(1, n - 1))}
                className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-3"
              >
                <Minus size={16} />
              </button>
              <span className="tnum w-12 text-center text-[16px] font-semibold text-ink" aria-live="polite">
                {installments}×
              </span>
              <button
                type="button"
                aria-label="Mais uma parcela"
                onClick={() => setInstallments((n) => Math.min(48, n + 1))}
                className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-surface-3"
              >
                <Plus size={16} />
              </button>
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <p className="text-[13px] font-medium text-ink-2">Quando?</p>
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={date === today} onClick={() => setDate(today)}>
            Hoje
          </Chip>
          <Chip active={date === yesterday} onClick={() => setDate(yesterday)}>
            Ontem
          </Chip>
          <label className="relative">
            <span className="sr-only">Outra data</span>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className={cn(
                'h-9 rounded-full border px-3 text-[13px] outline-none',
                date !== today && date !== yesterday ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line bg-transparent text-ink-2',
              )}
            />
          </label>
          {date !== today && date !== yesterday ? <span className="text-[12px] text-ink-3">{formatDayShort(date)}</span> : null}
        </div>
      </div>

      {kind !== 'card' && kind !== 'goal' && accounts.length > 1 ? (
        <Field label={kind === 'in' ? 'Entrou em' : 'Saiu de'} htmlFor="qa-account">
          <Select id="qa-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {kind !== 'card' && kind !== 'goal' ? (
        <div>
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="flex h-9 items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink"
          >
            <ChevronDown size={15} className={cn('transition-transform', more && 'rotate-180')} />
            Mais opções {repeatKind !== 'once' ? `· ${REPEAT_LABELS[repeatKind].toLowerCase()}` : ''}
          </button>
          {more ? (
            <div className="mt-2 grid gap-3">
              <Field label="Repete" htmlFor="qa-repeat" hint={repeatKind === 'installments' ? 'O valor informado é o de cada parcela; ajuste o número de parcelas depois, se precisar.' : undefined}>
                <Select id="qa-repeat" value={repeatKind} onChange={(e) => setRepeatKind(e.target.value as RepeatKind)}>
                  {(Object.keys(REPEAT_LABELS) as RepeatKind[]).map((k) => (
                    <option key={k} value={k}>
                      {REPEAT_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Observação" htmlFor="qa-notes">
                <Input id="qa-notes" value={notes} onChange={(e) => setNotes(e.target.value)} autoComplete="off" />
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-field bg-out-soft px-3 py-2 text-[13px] text-out">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={saving}>
          {saving ? 'Salvando…' : SUBMIT[kind]}
          {amount && amount > 0 && !saving ? <span className="font-normal opacity-80">· {formatMoney(amount as Cents)}</span> : null}
        </Button>
        {kind === 'goal' ? (
          <button type="button" onClick={() => onGo({ view: 'metas' })} className="h-9 text-[13px] text-ink-3 hover:text-ink">
            Ver metas
          </button>
        ) : null}
      </div>
    </form>
  );
}
