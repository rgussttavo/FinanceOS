'use client';

import * as React from 'react';
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
} from '@/components/ui';
import {
  BANKS,
  BRANDS,
  FINISHES,
  buildInvoice,
  cardLook,
  cardUsage,
  matchBank,
  type Invoice,
} from '@/lib/cards';
import { cn } from '@/lib/cn';
import { addMonthsToKey, formatDayShort, formatMonthLabel, todayIso } from '@/lib/dates';
import { formatMoney, formatPercent, parseMoney } from '@/lib/money';
import {
  createCard,
  createEntry,
  removeCard,
  updateCard,
  useCardsData,
} from '@/lib/store';
import type { Card, Category, MonthKey } from '@/lib/types';

/* --------------------------------------------------------------- bandeiras */

function BrandMark({ brand }: { brand: Card['brand'] }) {
  if (brand === 'mastercard') {
    return (
      <svg viewBox="0 0 46 28" className="h-6 w-10" aria-label="Mastercard">
        <circle cx="18" cy="14" r="11" fill="#eb001b" />
        <circle cx="28" cy="14" r="11" fill="#f79e1b" />
        <path d="M23 6.2a11 11 0 0 1 0 15.6 11 11 0 0 1 0-15.6z" fill="#ff5f00" />
      </svg>
    );
  }
  const label =
    brand === 'visa' ? 'VISA' : brand === 'elo' ? 'elo' : brand === 'amex' ? 'AMEX' : brand === 'hipercard' ? 'Hiper' : '';
  if (!label) return null;
  return (
    <span className="text-[13px] font-bold uppercase tracking-[0.14em] opacity-90">{label}</span>
  );
}

/* ------------------------------------------------------------- o plástico */

export function CardPlastic({
  card,
  usedRatio,
  compact = false,
}: {
  card: Card;
  usedRatio?: number;
  compact?: boolean;
}) {
  const look = cardLook(card);
  const bank = matchBank(card.institution);
  const light = look.ink === 'light';

  return (
    <div
      className={cn(
        'relative flex w-full flex-col justify-between overflow-hidden rounded-[18px] p-4 shadow-e2',
        compact ? 'aspect-[16/7]' : 'aspect-[1.586/1]',
        light ? 'text-white' : 'text-[#14140f]',
      )}
      style={{ background: look.gradient }}
    >
      {/* brilho diagonal: o que faz o retângulo parecer plástico e não caixa */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          background:
            'linear-gradient(115deg, transparent 28%, rgba(255,255,255,0.9) 46%, transparent 62%)',
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          {bank?.domain ? (
            <Logo
              domain={bank.domain}
              initials={(bank.name[0] ?? '?').toUpperCase()}
              color="rgba(255,255,255,0.14)"
              size={26}
              radius={7}
            />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">
              {card.institution || card.name || 'Cartão'}
            </span>
            {card.institution && card.name ? (
              <span className="block truncate text-[11px] opacity-75">{card.name}</span>
            ) : null}
          </span>
        </span>
        <BrandMark brand={card.brand} />
      </div>

      {!compact && (
        <span
          aria-hidden
          className="relative h-7 w-10 rounded-[6px] opacity-80"
          style={{
            background: 'linear-gradient(135deg,#e6d08a,#b9954a)',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)',
          }}
        />
      )}

      <div className="relative">
        <p className="tnum text-[15px] tracking-[0.18em] opacity-90">
          •••• {card.last4 || '••••'}
        </p>

        {card.limit > 0 && usedRatio != null && (
          <div className="mt-2">
            <div
              className="h-1 overflow-hidden rounded-full"
              style={{ background: light ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-[var(--t-slow)] ease-[var(--ease-out)]"
                style={{
                  width: `${Math.max(2, usedRatio * 100)}%`,
                  background: light ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.65)',
                }}
              />
            </div>
            <p className="mt-1 text-[11px] opacity-80">
              {formatPercent(usedRatio)} do limite usado
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pilha */

/**
 * A pilha de cartões.
 *
 * O da frente é o selecionado; os outros aparecem atrás, deslocados, como um
 * baralho. Tocar em um de trás o traz para a frente — é mais direto do que uma
 * lista quando se tem três ou quatro cartões.
 */
function CardStack({
  cards,
  activeId,
  onPick,
  usageById,
}: {
  cards: Card[];
  activeId: string;
  onPick: (id: string) => void;
  usageById: Map<string, number>;
}) {
  const ordered = React.useMemo(() => {
    const active = cards.find((c) => c.id === activeId);
    const rest = cards.filter((c) => c.id !== activeId);
    return active ? [active, ...rest] : cards;
  }, [cards, activeId]);

  const behind = ordered.length - 1;

  return (
    <div className="relative" style={{ paddingBottom: behind ? Math.min(behind, 3) * 14 : 0 }}>
      {ordered
        .slice(0, 4)
        .map((card, i) => i)
        .reverse()
        .map((i) => {
          const card = ordered[i];
          const front = i === 0;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onPick(card.id)}
              aria-label={front ? `${card.name}, cartão da frente` : `Trazer ${card.name} para a frente`}
              aria-current={front ? 'true' : undefined}
              className={cn(
                'w-full text-left transition-transform duration-[var(--t-slow)] ease-[var(--ease)]',
                front ? 'relative z-10' : 'absolute inset-x-0 top-0',
              )}
              style={
                front
                  ? undefined
                  : {
                      transform: `translateY(${i * 14}px) scale(${1 - i * 0.035})`,
                      zIndex: 10 - i,
                      filter: `brightness(${1 - i * 0.16})`,
                    }
              }
            >
              <CardPlastic card={card} usedRatio={front ? usageById.get(card.id) : undefined} />
            </button>
          );
        })}

      {cards.length > 1 && (
        <p className="relative z-10 mt-3 text-center text-[12px] text-ink-3">
          Toque na pilha para trocar o cartão da frente
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- fatura */

function InvoicePanel({
  invoice,
  card,
  categories,
  hidden,
  onAddPurchase,
}: {
  invoice: Invoice;
  card: Card;
  categories: Category[];
  hidden: boolean;
  onAddPurchase: () => void;
}) {
  const byId = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  return (
    <Panel className="px-5 py-4">
      <SectionTitle
        action={
          <span className={cn('text-[12px]', invoice.closed ? 'text-warn' : 'text-ink-3')}>
            {invoice.closed ? 'fechada' : `fecha ${formatDayShort(invoice.closesOn)}`}
          </span>
        }
      >
        Fatura de {formatMonthLabel(invoice.month).replace(/ de \d{4}$/, '')}
      </SectionTitle>

      <div className="flex items-end justify-between gap-3">
        <p className="amount text-[34px] text-ink">
          {hidden ? '••••' : formatMoney(invoice.total)}
        </p>
        <p className="pb-1 text-right text-[12px] text-ink-3">
          vence
          <br />
          <span className="text-ink-2">{formatDayShort(invoice.dueOn)}</span>
        </p>
      </div>

      {card.limit > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-3">
          Limite de {formatMoney(card.limit, { hidden, compact: true })}
        </p>
      )}

      {invoice.lines.length ? (
        <ul className="mt-2 divide-y divide-line">
          {invoice.lines.map((line) => {
            const category = line.categoryId ? byId.get(line.categoryId) : null;
            return (
              <li key={line.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[15px]">
                  {line.subscription ? '\u{1F501}' : (category?.icon ?? '\u{1F4B3}')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{line.description}</span>
                  <span className="block text-[12px] text-ink-3">
                    {formatDayShort(line.date)}
                    {line.installment ? ` · ${line.installment.index}/${line.installment.total}` : ''}
                    {line.subscription ? ' · assinatura' : ''}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                  {formatMoney(line.amount, { hidden })}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-[14px] text-ink-3">
          Sem compras nesta fatura.
        </p>
      )}

      <Button variant="ghost" size="md" className="mt-3 w-full" onClick={onAddPurchase}>
        <Plus size={16} />
        Lançar compra no cartão
      </Button>
    </Panel>
  );
}

/* ------------------------------------------------------------------- tela */

export function CartoesView({
  spaceId,
  month,
  categories,
  hidden,
  startNew = false,
}: {
  spaceId: string;
  month: MonthKey;
  categories: Category[];
  hidden: boolean;
  /** veio do "novo cartão" de outra tela: abre o cadastro direto */
  startNew?: boolean;
}) {
  const { cards, subscriptions, entries } = useCardsData(spaceId, addMonthsToKey(month, 1));
  const [activeId, setActiveId] = React.useState('');
  const [cardSheet, setCardSheet] = React.useState<{ open: boolean; editing: Card | null }>({
    open: false,
    editing: null,
  });
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);
  const [autoOpened, setAutoOpened] = React.useState(false);
  if (startNew && !autoOpened) {
    setAutoOpened(true);
    setCardSheet({ open: true, editing: null });
  }

  const active = cards.find((c) => c.id === activeId) ?? cards[0] ?? null;
  const today = todayIso();

  const usageById = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const card of cards) {
      map.set(card.id, cardUsage(card, entries, subscriptions, month, today).ratio);
    }
    return map;
  }, [cards, entries, subscriptions, month, today]);

  const invoice = React.useMemo(
    () => (active ? buildInvoice(active, entries, subscriptions, month, today) : null),
    [active, entries, subscriptions, month, today],
  );

  const usage = React.useMemo(
    () => (active ? cardUsage(active, entries, subscriptions, month, today) : null),
    [active, entries, subscriptions, month, today],
  );

  if (!cards.length) {
    return (
      <div className="pt-2">
        <Panel className="px-5 py-8">
          <EmptyState
            title="Nenhum cartão ainda"
            description="Cadastre um cartão para acompanhar o limite, lançar compras parceladas e ver a fatura se montar sozinha."
            action={
              <Button variant="primary" onClick={() => setCardSheet({ open: true, editing: null })}>
                <Plus size={16} />
                Adicionar cartão
              </Button>
            }
          />
        </Panel>
        <CardSheet
          state={cardSheet}
          spaceId={spaceId}
          onClose={() => setCardSheet({ open: false, editing: null })}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pt-2">
      <CardStack
        cards={cards}
        activeId={active?.id ?? ''}
        onPick={setActiveId}
        usageById={usageById}
      />

      {active && usage && (
        <Panel className="p-5">
          <SectionTitle
            action={
              <span className="flex gap-1">
                <button
                  type="button"
                  aria-label="Editar cartão"
                  onClick={() => setCardSheet({ open: true, editing: active })}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Remover cartão"
                  onClick={() => {
                    if (confirm(`Remover o cartão ${active.name || active.institution}?`)) {
                      void removeCard(active.id);
                      setActiveId('');
                    }
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-out-soft hover:text-out"
                >
                  <Trash2 size={15} />
                </button>
              </span>
            }
          >
            Limite
          </SectionTitle>

          <dl className="grid grid-cols-3 gap-3">
            <Stat label="Disponível" value={formatMoney(usage.available, { hidden, compact: true })} tone="in" />
            <Stat label="Usado" value={formatMoney(usage.used, { hidden, compact: true })} tone="out" />
            <Stat label="Total" value={formatMoney(active.limit, { hidden, compact: true })} />
          </dl>

          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            O limite usado conta todas as parcelas ainda em aberto, não só a fatura do mês.
          </p>
        </Panel>
      )}

      {active && invoice && (
        <InvoicePanel
          invoice={invoice}
          card={active}
          categories={categories}
          hidden={hidden}
          onAddPurchase={() => setPurchaseOpen(true)}
        />
      )}

      <Button variant="ghost" className="w-full" onClick={() => setCardSheet({ open: true, editing: null })}>
        <CreditCard size={16} />
        Adicionar outro cartão
      </Button>

      <CardSheet
        state={cardSheet}
        spaceId={spaceId}
        onClose={() => setCardSheet({ open: false, editing: null })}
      />

      {active && (
        <PurchaseSheet
          open={purchaseOpen}
          onClose={() => setPurchaseOpen(false)}
          spaceId={spaceId}
          card={active}
          categories={categories}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'in' | 'out' }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] uppercase tracking-wider text-ink-3">{label}</dt>
      <dd
        className={cn(
          'tnum mt-1 truncate text-[15px] font-semibold',
          tone === 'in' ? 'text-in' : tone === 'out' ? 'text-out' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------- folha do cartão */

function CardSheet({
  state,
  spaceId,
  onClose,
}: {
  state: { open: boolean; editing: Card | null };
  spaceId: string;
  onClose: () => void;
}) {
  const editing = state.editing;
  const [name, setName] = React.useState('');
  const [institution, setInstitution] = React.useState('');
  const [brand, setBrand] = React.useState<Card['brand']>('other');
  const [last4, setLast4] = React.useState('');
  const [limitText, setLimitText] = React.useState('');
  const [color, setColor] = React.useState('');
  const [closingDay, setClosingDay] = React.useState('');
  const [dueDay, setDueDay] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // abrir a folha carrega o cartão em edição, ou limpa para um novo
  const [loadedFor, setLoadedFor] = React.useState('');
  const signature = `${state.open}:${editing?.id ?? 'novo'}`;
  if (state.open && loadedFor !== signature) {
    setLoadedFor(signature);
    setName(editing?.name ?? '');
    setInstitution(editing?.institution ?? '');
    setBrand(editing?.brand ?? 'other');
    setLast4(editing?.last4 ?? '');
    setLimitText(editing ? String(editing.limit / 100).replace('.', ',') : '');
    setColor(editing?.color ?? '');
    setClosingDay(editing ? String(editing.closingDay) : '');
    setDueDay(editing ? String(editing.dueDay) : '');
    setError(null);
  }

  const preview: Card = {
    id: 'preview',
    spaceId,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    name,
    institution,
    brand,
    last4,
    color,
    limit: parseMoney(limitText) ?? 0,
    closingDay: Number(closingDay) || 1,
    dueDay: Number(dueDay) || 1,
    accountId: null,
    archived: false,
  };

  async function submit() {
    if (!institution.trim() && !name.trim()) {
      setError('Dê ao menos um nome ou o banco do cartão.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        spaceId,
        name,
        institution,
        brand,
        last4,
        color,
        limit: parseMoney(limitText) ?? 0,
        closingDay: Number(closingDay) || 1,
        dueDay: Number(dueDay) || 1,
      };
      if (editing) await updateCard(editing, payload);
      else await createCard(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={state.open}
      onClose={onClose}
      title={editing ? 'Editar cartão' : 'Novo cartão'}
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={submit} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      }
    >
      <div className="grid gap-4">
        <CardPlastic card={preview} compact />

        <Field label="Apelido" htmlFor="card-name" hint="Ex.: Nubank roxinho, Inter Black">
          <Input id="card-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>

        <Field label="Banco" htmlFor="card-bank">
          <Input
            id="card-bank"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            list="banks-list"
            autoComplete="off"
            placeholder="Nubank, Inter, Itaú…"
          />
          <datalist id="banks-list">
            {BANKS.map((b) => (
              <option key={b.key} value={b.name} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bandeira" htmlFor="card-brand">
            <Select id="card-brand" value={brand} onChange={(e) => setBrand(e.target.value as Card['brand'])}>
              {BRANDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="4 últimos" htmlFor="card-last4" hint="Só os 4 finais.">
            <Input
              id="card-last4"
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              className="tnum"
              placeholder="1234"
            />
          </Field>
        </div>

        <Field label="Limite" htmlFor="card-limit">
          <Input
            id="card-limit"
            value={limitText}
            onChange={(e) => setLimitText(e.target.value)}
            inputMode="decimal"
            className="tnum"
            placeholder="0,00"
          />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Acabamento</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor('')}
              aria-pressed={color === ''}
              className={cn(
                'h-9 rounded-full border px-3 text-[12px] font-medium transition-colors',
                color === ''
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-3 hover:text-ink',
              )}
            >
              Automático
            </button>
            {FINISHES.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setColor(f.key)}
                aria-pressed={color === f.key}
                aria-label={f.label}
                title={f.label}
                className={cn(
                  'h-9 w-9 rounded-full ring-offset-2 ring-offset-surface transition-all',
                  color === f.key ? 'ring-2 ring-accent' : 'ring-1 ring-line',
                )}
                style={{ background: f.gradient }}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha dia" htmlFor="card-close">
            <Input
              id="card-close"
              value={closingDay}
              onChange={(e) => setClosingDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              className="tnum"
              placeholder="25"
            />
          </Field>
          <Field label="Vence dia" htmlFor="card-due">
            <Input
              id="card-due"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              className="tnum"
              placeholder="5"
            />
          </Field>
        </div>

        <p className="text-[12px] leading-relaxed text-ink-3">
          Compra feita depois do fechamento entra na fatura do mês seguinte, como no seu banco.
        </p>

        {error && <p className="text-[13px] text-out">{error}</p>}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------- compra no cartão */

function PurchaseSheet({
  open,
  onClose,
  spaceId,
  card,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  card: Card;
  categories: Category[];
}) {
  const [description, setDescription] = React.useState('');
  const [totalText, setTotalText] = React.useState('');
  const [installments, setInstallments] = React.useState('1');
  const [date, setDate] = React.useState(todayIso());
  const [categoryId, setCategoryId] = React.useState('');
  const [mode, setMode] = React.useState<'total' | 'parcela'>('total');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const expenseCategories = categories.filter((c) => c.kind === 'out');
  const count = Math.max(1, Number(installments) || 1);
  const typed = parseMoney(totalText) ?? 0;
  // o valor digitado é o total da compra ou o de cada parcela, conforme a
  // escolha; guardar sempre a parcela evita arredondar duas vezes
  const perInstallment = mode === 'total' ? Math.round(typed / count) : typed;
  const total = mode === 'total' ? typed : typed * count;

  async function submit() {
    if (!description.trim()) return setError('Escreva o que foi comprado.');
    if (perInstallment <= 0) return setError('Informe um valor maior que zero.');

    setSaving(true);
    try {
      await createEntry({
        spaceId,
        kind: 'out',
        description,
        amount: perInstallment,
        date,
        categoryId: categoryId || null,
        cardId: card.id,
        repeat: count > 1 ? { kind: 'installments', count } : { kind: 'once' },
      });
      setDescription('');
      setTotalText('');
      setInstallments('1');
      setCategoryId('');
      setError(null);
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
      title="Compra no cartão"
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={submit} disabled={saving}>
          {saving ? 'Salvando…' : 'Lançar compra'}
        </Button>
      }
    >
      <div className="grid gap-4">
        <p className="rounded-field bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
          No cartão <strong className="font-semibold text-ink">{card.name || card.institution}</strong>
          {card.last4 ? ` ····${card.last4}` : ''}
        </p>

        <Field label="O que foi" htmlFor="buy-desc">
          <Input
            id="buy-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Fone bluetooth, mercado…"
            autoComplete="off"
          />
        </Field>

        <Segmented
          label="O valor informado é"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'total', label: 'Valor total' },
            { value: 'parcela', label: 'Valor da parcela' },
          ]}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === 'total' ? 'Total' : 'Cada parcela'} htmlFor="buy-value">
            <Input
              id="buy-value"
              value={totalText}
              onChange={(e) => setTotalText(e.target.value)}
              inputMode="decimal"
              className="tnum"
              placeholder="0,00"
            />
          </Field>
          <Field label="Parcelas" htmlFor="buy-inst">
            <Input
              id="buy-inst"
              value={installments}
              onChange={(e) => setInstallments(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              className="tnum"
              placeholder="1"
            />
          </Field>
        </div>

        {typed > 0 && count > 1 && (
          <p className="rounded-field bg-accent-soft px-3 py-2.5 text-[13px] text-accent">
            {count}× de {formatMoney(perInstallment)} · total {formatMoney(total)}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data da compra" htmlFor="buy-date">
            <Input id="buy-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Categoria" htmlFor="buy-cat">
            <Select id="buy-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error && <p className="text-[13px] text-out">{error}</p>}
      </div>
    </Sheet>
  );
}
