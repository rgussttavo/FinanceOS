'use client';

import * as React from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
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
import { subscriptionChargeIn } from '@/lib/cards';
import { cn } from '@/lib/cn';
import { currentMonthKey, monthKeyOf } from '@/lib/dates';
import { formatMoney, parseMoney } from '@/lib/money';
import { identify } from '@/lib/services';
import {
  cancelSubscription,
  createSubscription,
  removeSubscription,
  updateSubscription,
  useAllSubscriptions,
  useCards,
} from '@/lib/store';
import type { Card, Category, MonthKey, Subscription } from '@/lib/types';

/* ---------------------------------------------------------------- resumo */

function Summary({
  monthly,
  yearly,
  priciest,
  count,
  hidden,
}: {
  monthly: number;
  yearly: number;
  priciest: Subscription | null;
  count: number;
  hidden: boolean;
}) {
  return (
    <Panel className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        Assinaturas do mês
      </p>
      <p className="amount mt-1.5 text-[38px] text-ink">
        {hidden ? '••••' : formatMoney(monthly)}
      </p>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <div className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-ink-3">Custo anual</dt>
          <dd className="tnum mt-1 truncate text-[15px] font-semibold text-ink">
            {formatMoney(yearly, { hidden, compact: true })}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-ink-3">Mais cara</dt>
          <dd className="mt-1 truncate text-[15px] font-semibold text-ink">
            {priciest ? priciest.name : '—'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-ink-3">Ativas</dt>
          <dd className="tnum mt-1 text-[15px] font-semibold text-ink">{count}</dd>
        </div>
      </dl>
    </Panel>
  );
}

/* ------------------------------------------------------------------ linha */

function SubscriptionRow({
  sub,
  cards,
  hidden,
  onEdit,
}: {
  sub: Subscription;
  cards: Card[];
  hidden: boolean;
  onEdit: () => void;
}) {
  const identity = identify(sub.name, sub.domain, sub.color);
  const card = cards.find((c) => c.id === sub.cardId) ?? null;
  const canceled = Boolean(sub.canceledAt);

  const where = canceled
    ? 'cancelada'
    : card
      ? `${card.institution || card.name}${card.last4 ? ` ····${card.last4}` : ''}`
      : 'no saldo';

  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <Logo
          domain={identity.domain}
          initials={identity.initials}
          color={identity.color}
          size={40}
          radius={11}
          className={cn(canceled && 'opacity-40 grayscale')}
        />

        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px]', canceled ? 'text-ink-3 line-through' : 'text-ink')}>
            {sub.name}
          </span>
          <span className="block truncate text-[12px] text-ink-3">
            dia {String(sub.billingDay).padStart(2, '0')} · {where}
            {sub.cycle === 'yearly' ? ' · anual' : ''}
          </span>
        </span>

        <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
          {formatMoney(sub.amount, { hidden })}
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------- tela */

export function AssinaturasView({
  spaceId,
  month,
  categories,
  hidden,
}: {
  spaceId: string;
  month: MonthKey;
  categories: Category[];
  hidden: boolean;
}) {
  const all = useAllSubscriptions(spaceId);
  const cards = useCards(spaceId);
  const [sheet, setSheet] = React.useState<{ open: boolean; editing: Subscription | null }>({
    open: false,
    editing: null,
  });

  const active = React.useMemo(
    () => all.filter((s) => !s.canceledAt).sort((a, b) => b.amount - a.amount),
    [all],
  );
  const canceled = React.useMemo(() => all.filter((s) => s.canceledAt), [all]);

  const monthly = active.reduce((sum, s) => sum + subscriptionChargeIn(s, month), 0);
  // o custo anual soma doze meses das mensais mais uma cobrança das anuais
  const yearly = active.reduce((sum, s) => sum + (s.cycle === 'monthly' ? s.amount * 12 : s.amount), 0);
  const priciest = active[0] ?? null;

  if (!all.length) {
    return (
      <div className="pt-2">
        <Panel className="px-5 py-8">
          <EmptyState
            title="Nenhuma assinatura ainda"
            description="Cadastre o que se repete todo mês. Serviços conhecidos já vêm com o logotipo e a cor certos."
            action={
              <Button variant="primary" onClick={() => setSheet({ open: true, editing: null })}>
                <Plus size={16} />
                Adicionar assinatura
              </Button>
            }
          />
        </Panel>
        <SubscriptionSheet
          state={sheet}
          spaceId={spaceId}
          cards={cards}
          categories={categories}
          onClose={() => setSheet({ open: false, editing: null })}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pt-2">
      <Summary
        monthly={monthly}
        yearly={yearly}
        priciest={priciest}
        count={active.length}
        hidden={hidden}
      />

      <Panel className="px-5 py-4">
        <SectionTitle
          action={
            <button
              type="button"
              aria-label="Adicionar assinatura"
              onClick={() => setSheet({ open: true, editing: null })}
              className="grid h-8 w-8 place-items-center rounded-full text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={17} />
            </button>
          }
        >
          Da mais cara à mais barata
        </SectionTitle>

        <ul className="divide-y divide-line">
          {active.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              cards={cards}
              hidden={hidden}
              onEdit={() => setSheet({ open: true, editing: sub })}
            />
          ))}
        </ul>
      </Panel>

      {canceled.length > 0 && (
        <Panel className="px-5 py-4">
          <SectionTitle>Canceladas</SectionTitle>
          <ul className="divide-y divide-line">
            {canceled.map((sub) => (
              <SubscriptionRow
                key={sub.id}
                sub={sub}
                cards={cards}
                hidden={hidden}
                onEdit={() => setSheet({ open: true, editing: sub })}
              />
            ))}
          </ul>
        </Panel>
      )}

      <SubscriptionSheet
        state={sheet}
        spaceId={spaceId}
        cards={cards}
        categories={categories}
        onClose={() => setSheet({ open: false, editing: null })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ folha */

const PALETTE = [
  '#e50914', '#1db954', '#0689b8', '#ff9900', '#00a8e1', '#ea1d2c', '#9146ff', '#0063e5',
  '#ff003c', '#ffd400', '#5865f2', '#4285f4', '#101014', '#fe3c72', '#10a37f', '#f47521',
];

function SubscriptionSheet({
  state,
  spaceId,
  cards,
  categories,
  onClose,
}: {
  state: { open: boolean; editing: Subscription | null };
  spaceId: string;
  cards: Card[];
  categories: Category[];
  onClose: () => void;
}) {
  const editing = state.editing;
  const [name, setName] = React.useState('');
  const [amountText, setAmountText] = React.useState('');
  const [billingDay, setBillingDay] = React.useState('10');
  const [cycle, setCycle] = React.useState<'monthly' | 'yearly'>('monthly');
  const [payment, setPayment] = React.useState<'card' | 'balance'>('card');
  const [cardId, setCardId] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [colorOverride, setColorOverride] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // abrir a folha carrega a assinatura em edição, ou limpa para uma nova
  const [loadedFor, setLoadedFor] = React.useState('');
  const signature = `${state.open}:${editing?.id ?? 'novo'}`;
  if (state.open && loadedFor !== signature) {
    setLoadedFor(signature);
    setName(editing?.name ?? '');
    setAmountText(editing ? String(editing.amount / 100).replace('.', ',') : '');
    setBillingDay(editing ? String(editing.billingDay) : '10');
    setCycle(editing?.cycle ?? 'monthly');
    setPayment(editing?.cardId ? 'card' : editing ? 'balance' : 'card');
    setCardId(editing?.cardId ?? cards[0]?.id ?? '');
    setCategoryId(editing?.categoryId ?? '');
    setColorOverride(editing?.color ?? '');
    setError(null);
  }

  // a identidade se resolve enquanto digita: "netflix" já vira logo vermelho
  const identity = identify(name, '', colorOverride);
  const expenseCategories = categories.filter((c) => c.kind === 'out');

  async function submit() {
    const amount = parseMoney(amountText);
    if (!name.trim()) return setError('Escreva o nome do serviço.');
    if (amount === null || amount <= 0) return setError('Informe um valor maior que zero.');

    setSaving(true);
    try {
      const payload = {
        spaceId,
        name,
        domain: identity.domain,
        amount,
        billingDay: Number(billingDay) || 1,
        cycle,
        color: identity.color,
        cardId: payment === 'card' ? cardId || null : null,
        accountId: null,
        categoryId: categoryId || null,
      };
      if (editing) await updateSubscription(editing, payload);
      else await createSubscription(payload);
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
      title={editing ? 'Editar assinatura' : 'Nova assinatura'}
      footer={
        <div className="grid gap-2">
          <Button variant="primary" size="lg" className="w-full" onClick={submit} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          {editing && (
            <div className="flex gap-2">
              {editing.canceledAt ? (
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={async () => {
                    await updateSubscription(editing, { canceledAt: null });
                    onClose();
                  }}
                >
                  <RotateCcw size={15} />
                  Reativar
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={async () => {
                    await cancelSubscription(editing);
                    onClose();
                  }}
                >
                  Cancelar assinatura
                </Button>
              )}
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm(`Apagar ${editing.name} do histórico?`)) return;
                  await removeSubscription(editing.id);
                  onClose();
                }}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-3">
          <Logo domain={identity.domain} initials={identity.initials} color={identity.color} size={44} radius={12} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">
              {name.trim() || 'Sua assinatura'}
            </p>
            <p className="text-[12px] text-ink-3">
              {identity.known ? 'Serviço reconhecido: logotipo automático' : 'Serviço novo: usa as iniciais'}
            </p>
          </div>
        </div>

        <Field label="Nome do serviço" htmlFor="sub-name" hint="Ex.: Netflix, Spotify, Smart Fit">
          <Input
            id="sub-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor" htmlFor="sub-amount">
            <Input
              id="sub-amount"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="decimal"
              className="tnum"
              placeholder="0,00"
            />
          </Field>
          <Field label="Cobrança (dia)" htmlFor="sub-day">
            <Input
              id="sub-day"
              value={billingDay}
              onChange={(e) => setBillingDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              className="tnum"
            />
          </Field>
        </div>

        <Segmented
          label="Ciclo"
          value={cycle}
          onChange={setCycle}
          options={[
            { value: 'monthly', label: 'Todo mês' },
            { value: 'yearly', label: 'Todo ano' },
          ]}
        />

        <Segmented
          label="Forma de pagamento"
          value={payment}
          onChange={setPayment}
          options={[
            { value: 'card', label: 'Cartão de crédito' },
            { value: 'balance', label: 'Saldo' },
          ]}
        />

        {payment === 'card' && (
          <Field
            label="Cartão"
            htmlFor="sub-card"
            hint={cards.length ? 'A assinatura entra na fatura deste cartão.' : undefined}
            error={cards.length ? null : 'Cadastre um cartão primeiro, ou escolha Saldo.'}
          >
            <Select id="sub-card" value={cardId} onChange={(e) => setCardId(e.target.value)}>
              <option value="">Selecione</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.institution || c.name} {c.last4 ? `····${c.last4}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Categoria" htmlFor="sub-cat">
          <Select id="sub-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Cor</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColorOverride('')}
              aria-pressed={colorOverride === ''}
              className={cn(
                'h-9 rounded-full border px-3 text-[12px] font-medium transition-colors',
                colorOverride === ''
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-3 hover:text-ink',
              )}
            >
              Automática
            </button>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColorOverride(c)}
                aria-pressed={colorOverride === c}
                aria-label={`Cor ${c}`}
                className={cn(
                  'h-9 w-9 rounded-full ring-offset-2 ring-offset-surface transition-all',
                  colorOverride === c ? 'ring-2 ring-accent' : 'ring-1 ring-line',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        {editing?.canceledAt && (
          <p className="rounded-field bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
            Cancelada em {monthKeyOf(editing.canceledAt) === currentMonthKey() ? 'este mês' : editing.canceledAt}. Ela
            continua no histórico dos meses em que pesou.
          </p>
        )}

        {error && <p className="text-[13px] text-out">{error}</p>}
      </div>
    </Sheet>
  );
}
