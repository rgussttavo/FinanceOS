'use client';

import * as React from 'react';
import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Input, Panel, SectionTitle, Sheet } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoney, parseMoney } from '@/lib/money';
import { uid } from '@/lib/provision';
import { createBudget, removeBudget, updateBudget, useBudgets } from '@/lib/store';
import type { Budget, BudgetItem, Cents } from '@/lib/types';

const BUDGET_ICONS = ['✈️', '🏠', '🎉', '🛠️', '🎓', '🚗', '💍', '🍽️', '🎁', '📦'] as const;
const ITEM_ICONS = ['🎟️', '🏨', '🍽️', '🚕', '🛒', '🎫', '🧾', '🛏️', '⛽', '📦'] as const;

/* ------------------------------------------------------------------ conta */

interface BudgetTotals {
  subtotal: Cents;
  buffer: Cents;
  total: Cents;
  perPerson: Cents;
}

/**
 * Soma do orçamento, com a folga por cima.
 *
 * A folga não é enfeite: orçamento de viagem estoura por definição, e reservar
 * uma porcentagem antes é o que separa "deu certo" de "faltou no último dia".
 */
function totalsOf(budget: Budget): BudgetTotals {
  const subtotal = budget.items.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.quantity * item.unitPrice)),
    0,
  );
  const buffer = Math.round((subtotal * Math.max(0, budget.bufferPercent)) / 100);
  const total = subtotal + buffer;
  const people = Math.max(1, budget.people);
  return { subtotal, buffer, total, perPerson: Math.round(total / people) };
}

/* ------------------------------------------------------------------- tela */

export function OrcamentoView({ spaceId, hidden }: { spaceId: string; hidden: boolean }) {
  const budgets = useBudgets(spaceId);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const current = budgets.find((b) => b.id === openId) ?? null;

  if (current) {
    return <BudgetDetail budget={current} hidden={hidden} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="grid gap-4 pt-2">
      <Panel className="px-5 py-4">
        <SectionTitle
          action={
            <button
              type="button"
              aria-label="Novo orçamento"
              onClick={() => setCreating(true)}
              className="grid h-8 w-8 place-items-center rounded-full text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={17} />
            </button>
          }
        >
          Seus orçamentos
        </SectionTitle>

        {budgets.length ? (
          <ul className="divide-y divide-line">
            {budgets.map((budget) => {
              const t = totalsOf(budget);
              return (
                <li key={budget.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(budget.id)}
                    className="flex w-full items-center gap-3 py-3.5 text-left"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[18px]">
                      {budget.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{budget.name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {budget.items.length} {budget.items.length === 1 ? 'item' : 'itens'}
                        {budget.people > 1 ? ` · ${budget.people} pessoas` : ''}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                      {formatMoney(t.total, { hidden })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="Nenhum orçamento ainda"
            description="Orce uma viagem, uma obra, uma festa: monte a lista, ajuste as quantidades e veja o total na hora."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} />
                Novo orçamento
              </Button>
            }
          />
        )}
      </Panel>

      <NewBudgetSheet open={creating} spaceId={spaceId} onClose={() => setCreating(false)} onCreated={setOpenId} />
    </div>
  );
}

/* --------------------------------------------------------------- detalhe */

function BudgetDetail({
  budget,
  hidden,
  onBack,
}: {
  budget: Budget;
  hidden: boolean;
  onBack: () => void;
}) {
  const t = React.useMemo(() => totalsOf(budget), [budget]);
  const [itemSheet, setItemSheet] = React.useState<{ open: boolean; editing: BudgetItem | null }>({
    open: false,
    editing: null,
  });

  const setPeople = (delta: number) =>
    updateBudget(budget, { people: Math.max(1, budget.people + delta) });

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar aos orçamentos"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronLeft size={19} />
        </button>
        <span className="text-[19px]">{budget.icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-ink">{budget.name}</h2>
        <button
          type="button"
          onClick={async () => {
            if (!confirm(`Apagar o orçamento ${budget.name}?`)) return;
            await removeBudget(budget.id);
            onBack();
          }}
          aria-label="Apagar orçamento"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-out-soft hover:text-out"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <Panel className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Total com folga</p>
        <p className="amount mt-1.5 text-[36px] text-ink">
          {hidden ? '••••' : formatMoney(t.total)}
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">Itens</dt>
            <dd className="tnum mt-1 truncate text-[15px] font-semibold text-ink">
              {formatMoney(t.subtotal, { hidden, compact: true })}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">
              Folga {budget.bufferPercent}%
            </dt>
            <dd className="tnum mt-1 truncate text-[15px] font-semibold text-warn">
              {formatMoney(t.buffer, { hidden, compact: true })}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">Por pessoa</dt>
            <dd className="tnum mt-1 truncate text-[15px] font-semibold text-ink">
              {formatMoney(t.perPerson, { hidden, compact: true })}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-[13px] text-ink-2">Dividir entre</span>
          <span className="flex items-center gap-2">
            <Stepper label="Menos uma pessoa" onClick={() => setPeople(-1)} disabled={budget.people <= 1}>
              <Minus size={15} />
            </Stepper>
            <span className="tnum w-8 text-center text-[15px] font-semibold text-ink">
              {budget.people}
            </span>
            <Stepper label="Mais uma pessoa" onClick={() => setPeople(1)}>
              <Plus size={15} />
            </Stepper>
          </span>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <label htmlFor="buffer" className="text-[13px] text-ink-2">
            Folga de segurança: <strong className="font-semibold text-ink">{budget.bufferPercent}%</strong>
          </label>
          <input
            id="buffer"
            type="range"
            min={0}
            max={30}
            step={5}
            value={budget.bufferPercent}
            onChange={(e) => updateBudget(budget, { bufferPercent: Number(e.target.value) })}
            className="mt-2 w-full accent-[var(--accent)]"
          />
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Orçamento de viagem estoura por definição. Guardar uma folga antes é o que separa
            &quot;deu certo&quot; de &quot;faltou no último dia&quot;.
          </p>
        </div>
      </Panel>

      <Panel className="px-5 py-4">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => setItemSheet({ open: true, editing: null })}
              aria-label="Adicionar item"
              className="grid h-8 w-8 place-items-center rounded-full text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={17} />
            </button>
          }
        >
          Itens
        </SectionTitle>

        {budget.items.length ? (
          <ul className="divide-y divide-line">
            {budget.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setItemSheet({ open: true, editing: item })}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[16px]">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">
                      {item.description || 'Sem descrição'}
                    </span>
                    <span className="tnum block text-[12px] text-ink-3">
                      {item.quantity} × {formatMoney(item.unitPrice, { hidden })}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                    {formatMoney(Math.round(item.quantity * item.unitPrice), { hidden })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[14px] text-ink-3">
            Nenhum item ainda. Monte a lista e o total aparece na hora.
          </p>
        )}
      </Panel>

      <ItemSheet
        state={itemSheet}
        budget={budget}
        onClose={() => setItemSheet({ open: false, editing: null })}
      />
    </div>
  );
}

function Stepper({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ folha item */

function ItemSheet({
  state,
  budget,
  onClose,
}: {
  state: { open: boolean; editing: BudgetItem | null };
  budget: Budget;
  onClose: () => void;
}) {
  const editing = state.editing;
  const [description, setDescription] = React.useState('');
  const [icon, setIcon] = React.useState<string>(ITEM_ICONS[0]);
  const [quantity, setQuantity] = React.useState('1');
  const [priceText, setPriceText] = React.useState('');

  const [loadedFor, setLoadedFor] = React.useState('');
  const signature = `${state.open}:${editing?.id ?? 'novo'}`;
  if (state.open && loadedFor !== signature) {
    setLoadedFor(signature);
    setDescription(editing?.description ?? '');
    setIcon(editing?.icon ?? ITEM_ICONS[0]);
    setQuantity(editing ? String(editing.quantity) : '1');
    setPriceText(editing ? String(editing.unitPrice / 100).replace('.', ',') : '');
  }

  const qty = Math.max(1, Number(quantity) || 1);
  const unit = parseMoney(priceText) ?? 0;

  async function submit() {
    if (unit <= 0) return;
    const item: BudgetItem = {
      id: editing?.id ?? uid(),
      description: description.trim(),
      icon,
      quantity: qty,
      unitPrice: unit,
    };
    const items = editing
      ? budget.items.map((i) => (i.id === editing.id ? item : i))
      : [...budget.items, item];
    await updateBudget(budget, { items });
    onClose();
  }

  return (
    <Sheet
      open={state.open}
      onClose={onClose}
      title={editing ? 'Editar item' : 'Novo item'}
      footer={
        <div className="grid gap-2">
          <Button variant="primary" size="lg" className="w-full" onClick={submit}>
            Salvar
          </Button>
          {editing && (
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                await updateBudget(budget, { items: budget.items.filter((i) => i.id !== editing.id) });
                onClose();
              }}
            >
              <Trash2 size={15} />
              Remover item
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="O que é" htmlFor="bi-desc" hint="Ex.: Passagens, Hospedagem, Alimentação">
          <Input
            id="bi-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Ícone</p>
          <div className="flex flex-wrap gap-2">
            {ITEM_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                aria-pressed={icon === emoji}
                aria-label={`Ícone ${emoji}`}
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-field text-[18px] transition-colors',
                  icon === emoji ? 'bg-accent-soft ring-1 ring-accent' : 'bg-surface-2 hover:bg-surface-3',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade" htmlFor="bi-qty">
            <Input
              id="bi-qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              className="tnum"
            />
          </Field>
          <Field label="Preço unitário" htmlFor="bi-price">
            <Input
              id="bi-price"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              inputMode="decimal"
              className="tnum"
              placeholder="0,00"
            />
          </Field>
        </div>

        {unit > 0 && (
          <p className="rounded-field bg-accent-soft px-3 py-2.5 text-[13px] text-accent">
            {qty} × {formatMoney(unit)} = {formatMoney(qty * unit)}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------- novo orçamento */

function NewBudgetSheet({
  open,
  spaceId,
  onClose,
  onCreated,
}: {
  open: boolean;
  spaceId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState<string>(BUDGET_ICONS[0]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Novo orçamento"
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={async () => {
            const budget = await createBudget(spaceId, name, icon);
            setName('');
            onClose();
            onCreated(budget.id);
          }}
        >
          Criar
        </Button>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome" htmlFor="budget-name" hint="Ex.: Viagem de fim de ano, Reforma da cozinha">
          <Input id="budget-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Ícone</p>
          <div className="flex flex-wrap gap-2">
            {BUDGET_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                aria-pressed={icon === emoji}
                aria-label={`Ícone ${emoji}`}
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-field text-[19px] transition-colors',
                  icon === emoji ? 'bg-accent-soft ring-1 ring-accent' : 'bg-surface-2 hover:bg-surface-3',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
