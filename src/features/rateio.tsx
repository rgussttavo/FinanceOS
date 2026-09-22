'use client';

import * as React from 'react';
import { ArrowRight, Check, ChevronLeft, Copy, Plus, Trash2, UserPlus } from 'lucide-react';
import { Button, EmptyState, Field, Input, Panel, SectionTitle, Select, Sheet } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDayShort } from '@/lib/dates';
import { formatMoney, parseMoney } from '@/lib/money';
import { uid } from '@/lib/provision';
import { splitAsText, summarizeSplit } from '@/lib/split';
import { createSplit, removeSplit, updateSplit, useSplits } from '@/lib/store';
import type { Split, SplitItem } from '@/lib/types';

const SPLIT_ICONS = ['🔥', '🍕', '✈️', '🏠', '🎁', '🍻', '🎂', '⚽', '🎬', '🚗'] as const;

/* ------------------------------------------------------------------- tela */

export function RateioView({ spaceId, hidden }: { spaceId: string; hidden: boolean }) {
  const splits = useSplits(spaceId);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const current = splits.find((s) => s.id === openId) ?? null;

  if (current) {
    return <SplitDetail split={current} hidden={hidden} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="grid gap-4 pt-2">
      <Panel className="px-5 py-4">
        <SectionTitle
          action={
            <button
              type="button"
              aria-label="Novo rateio"
              onClick={() => setCreating(true)}
              className="grid h-8 w-8 place-items-center rounded-full text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={17} />
            </button>
          }
        >
          Seus rateios
        </SectionTitle>

        {splits.length ? (
          <ul className="divide-y divide-line">
            {splits.map((split) => {
              const summary = summarizeSplit(split);
              return (
                <li key={split.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(split.id)}
                    className="flex w-full items-center gap-3 py-3.5 text-left"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[18px]">
                      {split.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{split.name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {split.participants.length}{' '}
                        {split.participants.length === 1 ? 'pessoa' : 'pessoas'} ·{' '}
                        {formatDayShort(split.date)}
                        {summary.settled && summary.total > 0 ? ' · quitado' : ''}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                      {formatMoney(summary.total, { hidden })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="Nenhum rateio ainda"
            description="Churrasco, viagem, presente coletivo: anote quem participou e quem pagou o quê. O app fecha a conta de cada um no menor número de pagamentos."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={16} />
                Novo rateio
              </Button>
            }
          />
        )}
      </Panel>

      <NewSplitSheet open={creating} spaceId={spaceId} onClose={() => setCreating(false)} onCreated={setOpenId} />
    </div>
  );
}

/* --------------------------------------------------------------- detalhe */

function SplitDetail({
  split,
  hidden,
  onBack,
}: {
  split: Split;
  hidden: boolean;
  onBack: () => void;
}) {
  const summary = React.useMemo(() => summarizeSplit(split), [split]);
  const [itemSheet, setItemSheet] = React.useState<{ open: boolean; editing: SplitItem | null }>({
    open: false,
    editing: null,
  });
  const [personName, setPersonName] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const nameOf = (id: string) => split.participants.find((p) => p.id === id)?.name ?? '?';

  async function addPerson() {
    const name = personName.trim();
    if (!name) return;
    await updateSplit(split, {
      participants: [...split.participants, { id: uid(), name, me: false }],
    });
    setPersonName('');
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(splitAsText(split, summary));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // área de transferência bloqueada: o texto continua visível na tela
    }
  }

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="Voltar aos rateios"
        >
          <ChevronLeft size={19} />
        </button>
        <span className="text-[19px]">{split.icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-ink">{split.name}</h2>
        <button
          type="button"
          onClick={async () => {
            if (!confirm(`Apagar o rateio ${split.name}?`)) return;
            await removeSplit(split.id);
            onBack();
          }}
          aria-label="Apagar rateio"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-out-soft hover:text-out"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <Panel className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Total</p>
        <p className="amount mt-1.5 text-[36px] text-ink">
          {hidden ? '••••' : formatMoney(summary.total)}
        </p>
        <p className="mt-2 text-[13px] text-ink-3">
          {split.participants.length} {split.participants.length === 1 ? 'pessoa' : 'pessoas'} ·{' '}
          {formatMoney(summary.perPerson, { hidden })} em média
        </p>
      </Panel>

      <Panel className="px-5 py-4">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => setItemSheet({ open: true, editing: null })}
              aria-label="Adicionar gasto"
              className="grid h-8 w-8 place-items-center rounded-full text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={17} />
            </button>
          }
        >
          Gastos
        </SectionTitle>

        {split.items.length ? (
          <ul className="divide-y divide-line">
            {split.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setItemSheet({ open: true, editing: item })}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">
                      {item.description || 'Sem descrição'}
                    </span>
                    <span className="block truncate text-[12px] text-ink-3">
                      pago por {nameOf(item.paidBy)}
                      {item.sharedWith.length
                        ? ` · entre ${item.sharedWith.length}`
                        : ' · entre todos'}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                    {formatMoney(item.amount, { hidden })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[14px] text-ink-3">
            Nenhum gasto anotado. Comece pelo primeiro.
          </p>
        )}
      </Panel>

      <Panel className="px-5 py-4">
        <SectionTitle>Como ficou cada um</SectionTitle>
        <ul className="divide-y divide-line">
          {summary.balances.map((b) => (
            <li key={b.participantId} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[15px] text-ink">
                  {b.name}
                  {b.me ? ' (você)' : ''}
                </span>
                <span className="block text-[12px] text-ink-3">
                  pagou {formatMoney(b.paid, { hidden, compact: true })}
                </span>
              </span>
              <span
                className={cn(
                  'tnum shrink-0 text-[14px] font-semibold',
                  b.balance > 0 ? 'text-in' : b.balance < 0 ? 'text-out' : 'text-ink-3',
                )}
              >
                {b.balance === 0
                  ? 'em dia'
                  : b.balance > 0
                    ? `recebe ${formatMoney(b.balance, { hidden })}`
                    : `deve ${formatMoney(-b.balance, { hidden })}`}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2 border-t border-line pt-3">
          <Input
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addPerson();
            }}
            placeholder="Nome de quem entrou"
            aria-label="Nome do participante"
            className="flex-1"
          />
          <Button variant="ghost" onClick={addPerson}>
            <UserPlus size={15} />
          </Button>
        </div>
      </Panel>

      {summary.transfers.length > 0 && (
        <Panel className="px-5 py-4">
          <SectionTitle
            action={
              <button
                type="button"
                onClick={copyText}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'copiado' : 'copiar'}
              </button>
            }
          >
            Acertos no menor caminho
          </SectionTitle>

          <ul className="grid gap-2.5">
            {summary.transfers.map((t, i) => (
              <li
                key={`${t.from}-${t.to}-${i}`}
                className="flex items-center gap-2 rounded-field bg-surface-2 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{t.fromName}</span>
                <ArrowRight size={15} className="shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{t.toName}</span>
                <span className="tnum shrink-0 text-[14px] font-semibold text-ink">
                  {formatMoney(t.amount, { hidden })}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            {summary.transfers.length}{' '}
            {summary.transfers.length === 1 ? 'pagamento fecha' : 'pagamentos fecham'} a conta inteira.
          </p>
        </Panel>
      )}

      <ItemSheet
        state={itemSheet}
        split={split}
        onClose={() => setItemSheet({ open: false, editing: null })}
      />
    </div>
  );
}

/* ----------------------------------------------------------- folha item */

function ItemSheet({
  state,
  split,
  onClose,
}: {
  state: { open: boolean; editing: SplitItem | null };
  split: Split;
  onClose: () => void;
}) {
  const editing = state.editing;
  const [description, setDescription] = React.useState('');
  const [amountText, setAmountText] = React.useState('');
  const [paidBy, setPaidBy] = React.useState('');
  const [sharedWith, setSharedWith] = React.useState<string[]>([]);

  const [loadedFor, setLoadedFor] = React.useState('');
  const signature = `${state.open}:${editing?.id ?? 'novo'}`;
  if (state.open && loadedFor !== signature) {
    setLoadedFor(signature);
    setDescription(editing?.description ?? '');
    setAmountText(editing ? String(editing.amount / 100).replace('.', ',') : '');
    setPaidBy(editing?.paidBy ?? split.participants[0]?.id ?? '');
    setSharedWith(editing?.sharedWith ?? []);
  }

  const toggleSharer = (id: string) =>
    setSharedWith((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  async function submit() {
    const amount = parseMoney(amountText) ?? 0;
    if (amount <= 0) return;

    const item: SplitItem = {
      id: editing?.id ?? uid(),
      description: description.trim(),
      amount,
      paidBy: paidBy || split.participants[0]?.id || '',
      sharedWith,
    };

    const items = editing
      ? split.items.map((i) => (i.id === editing.id ? item : i))
      : [...split.items, item];

    await updateSplit(split, { items });
    onClose();
  }

  return (
    <Sheet
      open={state.open}
      onClose={onClose}
      title={editing ? 'Editar gasto' : 'Novo gasto'}
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
                await updateSplit(split, { items: split.items.filter((i) => i.id !== editing.id) });
                onClose();
              }}
            >
              <Trash2 size={15} />
              Remover gasto
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="O que foi" htmlFor="item-desc">
          <Input
            id="item-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Carne, bebidas, hospedagem…"
            autoComplete="off"
          />
        </Field>

        <Field label="Quanto" htmlFor="item-amount">
          <Input
            id="item-amount"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            className="tnum text-[17px] font-semibold"
            placeholder="0,00"
          />
        </Field>

        <Field label="Quem pagou" htmlFor="item-paid">
          <Select id="item-paid" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {split.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Dividir entre</p>
          <p className="mb-2 text-[12px] text-ink-3">
            {sharedWith.length ? `${sharedWith.length} selecionados` : 'Ninguém marcado: divide entre todos.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {split.participants.map((p) => {
              const on = sharedWith.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleSharer(p.id)}
                  aria-pressed={on}
                  className={cn(
                    'h-9 rounded-full border px-3 text-[13px] font-medium transition-colors',
                    on
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-ink-3 hover:text-ink',
                  )}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------- novo rateio */

function NewSplitSheet({
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
  const [icon, setIcon] = React.useState<string>(SPLIT_ICONS[0]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Novo rateio"
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={async () => {
            const split = await createSplit(spaceId, name, icon);
            setName('');
            onClose();
            onCreated(split.id);
          }}
        >
          Criar
        </Button>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome" htmlFor="split-name" hint="Ex.: Churrasco de sábado, Viagem de fim de ano">
          <Input id="split-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Ícone</p>
          <div className="flex flex-wrap gap-2">
            {SPLIT_ICONS.map((emoji) => (
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
