'use client';

import * as React from 'react';
import { ArrowUpRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import {
  Button,
  Chip,
  EmptyState,
  Field,
  Input,
  Panel,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  confirmAction,
  toast,
} from '@/components/ui';
import { subscriptionChargeIn } from '@/lib/cards';
import { cn } from '@/lib/cn';
import { addMonthsToKey, currentMonthKey, dateInMonth, formatDayShort, formatRelativeDay, monthKeyOf, todayIso } from '@/lib/dates';
import { formatMoney, parseMoney } from '@/lib/money';
import { identify } from '@/lib/services';
import type { FinanceBase } from '@/lib/picture';
import { cancelSubscription, createSubscription, removeSubscription, updateSubscription } from '@/lib/store';
import type { Card, Category, Cents, Subscription } from '@/lib/types';

/**
 * Assinaturas: quanto custa manter seu estilo de vida digital.
 *
 * A tela abre com a resposta — por mês e por ano — e cada serviço diz quando
 * cobra de novo, em qual cartão e se subiu de preço. Marcar o que é
 * dispensável mostra quanto daria para economizar; cancelar continua sendo
 * decisão da pessoa, feita no serviço, nunca pelo app.
 */

/** a próxima cobrança a partir de hoje, respeitando o ciclo anual */
export function nextCharge(sub: Subscription, today = todayIso()): string | null {
  if (sub.canceledAt) return null;
  let month = monthKeyOf(today);
  for (let i = 0; i < 13; i++) {
    if (subscriptionChargeIn(sub, month)) {
      const date = dateInMonth(month, sub.billingDay);
      if (date >= today && date >= sub.startedAt) return date;
    }
    month = addMonthsToKey(month, 1);
  }
  return null;
}

const yearlyOf = (s: Subscription): Cents => (s.cycle === 'monthly' ? s.amount * 12 : s.amount);
const monthlyOf = (s: Subscription): Cents => (s.cycle === 'monthly' ? s.amount : Math.round(s.amount / 12));

/* ---------------------------------------------------------------- resumo */

function Summary({ active, hidden }: { active: Subscription[]; hidden: boolean }) {
  const monthly = active.reduce((t, s) => t + monthlyOf(s), 0);
  const yearly = active.reduce((t, s) => t + yearlyOf(s), 0);
  const dispensable = active.filter((s) => s.essential === false);
  const saving = dispensable.reduce((t, s) => t + monthlyOf(s), 0);
  const unrated = active.filter((s) => s.essential == null).length;

  return (
    <Panel className="p-5">
      <p className="text-[13px] text-ink-3">Quanto custa manter seu estilo de vida digital</p>
      <p className="amount mt-1.5 text-[42px] text-ink">
        {formatMoney(monthly, { hidden })}
        <span className="ml-1.5 font-sans text-[15px] text-ink-3">/ mês</span>
      </p>
      <p className="mt-1 text-[15px] text-ink-2">
        <strong className="font-semibold text-ink">{formatMoney(yearly, { hidden })}</strong> por ano, em {active.length}{' '}
        {active.length === 1 ? 'assinatura' : 'assinaturas'}
      </p>

      {saving > 0 ? (
        <p className="mt-4 rounded-card bg-in-soft px-4 py-3 text-[14px] leading-snug text-ink">
          Você pode economizar <strong className="text-in">{formatMoney(saving, { hidden })}/mês</strong> (
          {formatMoney(saving * 12, { hidden })} por ano) cancelando as {dispensable.length} marcadas como dispensáveis.
        </p>
      ) : unrated > 0 ? (
        <p className="mt-4 rounded-card bg-surface-2 px-4 py-3 text-[13px] leading-snug text-ink-2">
          Marque o que é essencial e o que é dispensável: eu mostro quanto daria para economizar.
        </p>
      ) : null}
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
  const next = nextCharge(sub);
  const previous = sub.priceHistory?.[sub.priceHistory.length - 1];
  const raise = previous ? sub.amount - previous.amount : 0;

  const where = canceled
    ? `cancelada em ${formatDayShort(sub.canceledAt!)}`
    : card
      ? `${card.name || card.institution}${card.last4 ? ` ····${card.last4}` : ''}`
      : 'débito na conta';

  async function rate(value: boolean | null) {
    await updateSubscription(sub, { essential: value });
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Logo
            domain={identity.domain}
            initials={identity.initials}
            color={identity.color}
            size={42}
            radius={11}
            className={cn(canceled && 'opacity-40 grayscale')}
          />
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-[15px]', canceled ? 'text-ink-3 line-through' : 'text-ink')}>{sub.name}</span>
            <span className="block truncate text-[12px] text-ink-3">
              {next ? `cobra ${formatRelativeDay(next)}` : ''}
              {next ? ' · ' : ''}
              {where}
              {sub.cycle === 'yearly' ? ' · anual' : ''}
            </span>
          </span>
        </button>
        <span className="shrink-0 text-right">
          <span className="tnum block text-[15px] font-semibold text-ink">{formatMoney(sub.amount, { hidden })}</span>
          <span className="tnum block text-[11px] text-ink-3">{formatMoney(yearlyOf(sub), { hidden, compact: true })}/ano</span>
        </span>
      </div>

      {!canceled ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[54px]">
          <Chip active={sub.essential === true} onClick={() => void rate(sub.essential === true ? null : true)} className="h-8 px-3 text-[12px]">
            Essencial
          </Chip>
          <Chip active={sub.essential === false} onClick={() => void rate(sub.essential === false ? null : false)} className="h-8 px-3 text-[12px]">
            Dispensável
          </Chip>
          {raise > 0 && previous ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warn">
              <ArrowUpRight size={13} aria-hidden /> subiu {formatMoney(raise, { hidden })} desde {formatDayShort(previous.until)}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------- tela */

export function AssinaturasView({
  spaceId,
  base,
  categories,
  hidden,
  startNew = false,
}: {
  spaceId: string;
  base: FinanceBase;
  categories: Category[];
  hidden: boolean;
  startNew?: boolean;
}) {
  const all = base.subscriptions;
  const cards = base.cards;
  const [sheet, setSheet] = React.useState<{ open: boolean; editing: Subscription | null }>({
    open: false,
    editing: null,
  });
  const [autoOpened, setAutoOpened] = React.useState(false);
  if (startNew && !autoOpened) {
    setAutoOpened(true);
    setSheet({ open: true, editing: null });
  }
  const [order, setOrder] = React.useState<'valor' | 'data'>('valor');

  const active = React.useMemo(() => {
    const list = all.filter((s) => !s.canceledAt);
    return order === 'valor'
      ? list.sort((a, b) => monthlyOf(b) - monthlyOf(a))
      : list.sort((a, b) => ((nextCharge(a) ?? '9') < (nextCharge(b) ?? '9') ? -1 : 1));
  }, [all, order]);
  const canceled = React.useMemo(() => all.filter((s) => s.canceledAt), [all]);

  const sheetEl = (
    <SubscriptionSheet
      state={sheet}
      spaceId={spaceId}
      cards={cards}
      categories={categories}
      onClose={() => setSheet({ open: false, editing: null })}
    />
  );

  if (!base.ready) {
    return (
      <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Skeleton className="h-[180px] rounded-panel" />
        <Skeleton className="h-[320px] rounded-panel" />
      </div>
    );
  }

  if (!all.length) {
    return (
      <div className="pt-2">
        <Panel className="px-5 py-4">
          <EmptyState
            title="Ainda não há assinaturas"
            description="Cadastre o que se repete todo mês e veja quanto custa por ano. Serviços conhecidos já vêm com logotipo e cor."
            action={
              <Button variant="primary" onClick={() => setSheet({ open: true, editing: null })}>
                <Plus size={16} />
                Adicionar assinatura
              </Button>
            }
          />
        </Panel>
        {sheetEl}
      </div>
    );
  }

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start lg:gap-6">
      <Summary active={active} hidden={hidden} />

      <div className="grid gap-4">
        <Panel className="px-5 py-4">
          <SectionTitle
            action={
              <span className="flex items-center gap-1">
                <Segmented
                  label="Ordenar"
                  value={order}
                  onChange={setOrder}
                  options={[
                    { value: 'valor', label: 'Valor' },
                    { value: 'data', label: 'Próxima' },
                  ]}
                  className="w-[150px] p-0.5"
                />
                <Button size="sm" variant="soft" aria-label="Adicionar assinatura" onClick={() => setSheet({ open: true, editing: null })}>
                  <Plus size={16} />
                </Button>
              </span>
            }
          >
            Ativas
          </SectionTitle>

          <ul className="divide-y divide-line">
            {active.map((sub) => (
              <SubscriptionRow key={sub.id} sub={sub} cards={cards} hidden={hidden} onEdit={() => setSheet({ open: true, editing: sub })} />
            ))}
          </ul>
        </Panel>

        {canceled.length > 0 && (
          <Panel className="px-5 py-4">
            <SectionTitle>Canceladas</SectionTitle>
            <ul className="divide-y divide-line">
              {canceled.map((sub) => (
                <SubscriptionRow key={sub.id} sub={sub} cards={cards} hidden={hidden} onEdit={() => setSheet({ open: true, editing: sub })} />
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {sheetEl}
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
      if (editing) {
        // mudou o preço: o antigo vai para o histórico, e a lista mostra o reajuste
        const history =
          amount !== editing.amount
            ? [...(editing.priceHistory ?? []), { amount: editing.amount, until: todayIso() }].slice(-6)
            : editing.priceHistory;
        await updateSubscription(editing, { ...payload, priceHistory: history });
        toast(amount > editing.amount ? `${name.trim()} atualizada. O reajuste fica registrado.` : 'Assinatura atualizada.');
      } else {
        await createSubscription(payload);
        toast('Assinatura adicionada.');
      }
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
                    toast('Assinatura reativada.');
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
                    toast(`${editing.name} marcada como cancelada. Lembre de cancelar no próprio serviço.`, {
                      action: { label: 'Desfazer', onClick: () => void updateSubscription(editing, { canceledAt: null }) },
                    });
                    onClose();
                  }}
                >
                  Marcar como cancelada
                </Button>
              )}
              <Button
                variant="danger"
                aria-label={`Apagar ${editing.name}`}
                onClick={async () => {
                  const ok = await confirmAction({
                    title: `Apagar ${editing.name}?`,
                    description: 'Ela some também dos meses em que já pesou. Para parar de contar daqui para frente, use "Marcar como cancelada".',
                    confirmLabel: 'Apagar',
                    danger: true,
                  });
                  if (!ok) return;
                  await removeSubscription(editing.id);
                  toast('Assinatura apagada.');
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
