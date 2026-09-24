'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, CreditCard, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { db, deleteRecord, restoreRecord } from '@/lib/db';
import { addDaysIso, formatDateFull, formatMonthLabel, formatRelativeDay, monthKeyOf, todayIso } from '@/lib/dates';
import { formatMoney, parseMoney } from '@/lib/money';
import type { Occurrence } from '@/lib/occurrences';
import { changeEntryFrom, rememberCategory, toggleSettled, updateEntry } from '@/lib/store';
import type { Card, Category, Entry, RepeatKind } from '@/lib/types';
import { Badge, Button, Field, Input, Select, Sheet, confirmAction, toast } from './ui';

/**
 * Um lançamento aberto: ver, dar baixa, editar e apagar.
 *
 * Até esta folha existir não havia como corrigir um valor digitado errado nem
 * apagar um lançamento — a lista só sabia marcar como pago. Editar uma
 * repetição pergunta o alcance ("todos os meses" ou "daqui para frente"),
 * porque o aluguel que subiu em março não pode reescrever janeiro.
 */

const REPEAT_LABELS: Record<RepeatKind, string> = {
  once: 'Não repete',
  monthly: 'Todo mês',
  weekly: 'Toda semana',
  yearly: 'Todo ano',
  installments: 'Parcelado',
};

const SOURCE_LABEL: Partial<Record<Entry['source'], string>> = {
  ofx: 'Importado de extrato OFX',
  csv: 'Importado de extrato CSV',
  qif: 'Importado de extrato QIF',
  xlsx: 'Importado de planilha',
  boleto: 'Lido de um boleto',
  pix: 'Lido de um Pix',
};

export function EntrySheet({
  occurrence,
  onClose,
  categories,
  cards,
  hidden,
}: {
  occurrence: Occurrence | null;
  onClose: () => void;
  categories: Category[];
  cards: Card[];
  hidden: boolean;
}) {
  const entryId = occurrence && !occurrence.virtual ? occurrence.entryId : null;
  const entry = useLiveQuery(async () => (entryId ? ((await db().entries.get(entryId)) ?? null) : null), [entryId]);
  const [editing, setEditing] = React.useState(false);

  // trocar de lançamento sempre abre na leitura, nunca no meio de uma edição
  const [seen, setSeen] = React.useState<string | null>(null);
  const key = occurrence ? `${occurrence.entryId}:${occurrence.key}` : null;
  if (key !== seen) {
    setSeen(key);
    setEditing(false);
  }

  const open = Boolean(occurrence) && entry !== null;
  if (!occurrence || !entry) {
    return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Editar lançamento' : 'Lançamento'}>
      {editing ? (
        <EditForm
          entry={entry}
          occurrence={occurrence}
          categories={categories}
          cards={cards}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onClose();
          }}
        />
      ) : (
        <Details
          entry={entry}
          occurrence={occurrence}
          categories={categories}
          cards={cards}
          hidden={hidden}
          onEdit={() => setEditing(true)}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ leitura */

function Details({
  entry,
  occurrence,
  categories,
  cards,
  hidden,
  onEdit,
  onClose,
}: {
  entry: Entry;
  occurrence: Occurrence;
  categories: Category[];
  cards: Card[];
  hidden: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const category = categories.find((c) => c.id === entry.categoryId) ?? null;
  const card = cards.find((c) => c.id === entry.cardId) ?? null;
  const settlement = entry.settled[occurrence.key] ?? null;
  const overdue = !settlement && occurrence.date < todayIso();
  const recurring = entry.repeat.kind !== 'once';
  const tone = entry.kind === 'in' ? 'text-in' : entry.kind === 'invest' ? 'text-inv' : 'text-ink';
  const paidWord = entry.kind === 'in' ? 'recebido' : 'pago';

  const rows: [string, React.ReactNode][] = [
    ['Data', `${formatDateFull(occurrence.date)} · ${formatRelativeDay(occurrence.date)}`],
    ['Categoria', category ? `${category.icon} ${category.name}` : 'Sem categoria'],
    [
      'Situação',
      settlement ? (
        <Badge tone="in">
          <Check size={12} /> {paidWord === 'pago' ? 'Pago' : 'Recebido'}
        </Badge>
      ) : overdue ? (
        <Badge tone="out">Vencido</Badge>
      ) : (
        <Badge>Pendente</Badge>
      ),
    ],
  ];
  if (recurring) {
    rows.push([
      'Repetição',
      entry.repeat.kind === 'installments' && occurrence.installment
        ? `Parcela ${occurrence.installment.index} de ${occurrence.installment.total}`
        : `${REPEAT_LABELS[entry.repeat.kind]} desde ${formatMonthLabel(monthKeyOf(entry.date))}${entry.repeat.until ? `, até ${formatMonthLabel(monthKeyOf(entry.repeat.until))}` : ''}`,
    ]);
  }
  if (card) {
    rows.push([
      'Cartão',
      <span key="c" className="inline-flex items-center gap-1.5">
        <CreditCard size={14} /> {card.name || card.institution}
      </span>,
    ]);
  }
  if (SOURCE_LABEL[entry.source]) rows.push(['Origem', SOURCE_LABEL[entry.source]]);
  if (entry.notes) rows.push(['Observação', entry.notes]);

  async function remove(scope: 'all' | 'from') {
    if (scope === 'from') {
      const ok = await confirmAction({
        title: 'Encerrar a partir deste mês?',
        description: `Os meses anteriores continuam como estão. A partir de ${formatMonthLabel(monthKeyOf(occurrence.date))}, ${entry.description} deixa de aparecer.`,
        confirmLabel: 'Encerrar',
      });
      if (!ok) return;
      const before = entry;
      if (entry.repeat.kind === 'installments' && occurrence.installment) {
        await updateEntry(entry, { repeat: { kind: 'installments', count: Math.max(1, occurrence.installment.index - 1) } });
      } else {
        await updateEntry(entry, { repeat: { ...entry.repeat, until: addDaysIso(occurrence.date, -1) } });
      }
      toast('Repetição encerrada.', { action: { label: 'Desfazer', onClick: () => void updateEntry(before, {}) } });
      onClose();
      return;
    }

    const ok = await confirmAction({
      title: recurring ? 'Apagar a série inteira?' : 'Apagar este lançamento?',
      description: recurring
        ? 'Some de todos os meses, inclusive dos que já passaram.'
        : `${entry.description} · ${formatMoney(entry.amount)}`,
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    await deleteRecord('entries', entry.id);
    toast('Lançamento apagado.', { action: { label: 'Desfazer', onClick: () => void restoreRecord('entries', entry.id) } });
    onClose();
  }

  return (
    <div className="grid gap-5">
      <div className="text-center">
        <p className="text-[14px] text-ink-2">{entry.description}</p>
        <p className={cn('amount mt-2 text-[40px]', tone)}>
          {hidden ? '••••' : `${entry.kind === 'in' ? '+' : entry.kind === 'out' ? '−' : ''}${formatMoney(occurrence.amount)}`}
        </p>
        {settlement?.amount != null && settlement.amount !== entry.amount ? (
          <p className="mt-1 text-[12px] text-ink-3">previsto {formatMoney(entry.amount, { hidden })}</p>
        ) : null}
      </div>

      <dl className="divide-y divide-line rounded-card border border-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-[13px] text-ink-3">{label}</dt>
            <dd className="min-w-0 text-right text-[14px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-2">
        <Button
          variant={settlement ? 'ghost' : 'primary'}
          size="lg"
          onClick={async () => {
            await toggleSettled(entry, occurrence.key);
            toast(settlement ? 'Baixa desfeita.' : `Marcado como ${paidWord}.`);
            onClose();
          }}
        >
          <Check size={17} />
          {settlement ? 'Desfazer baixa' : `Marcar como ${paidWord}`}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onEdit}>
            <Pencil size={15} /> Editar
          </Button>
          <Button variant="danger" className="border border-out/30" onClick={() => void remove('all')}>
            <Trash2 size={15} /> {recurring ? 'Apagar série' : 'Apagar'}
          </Button>
        </div>
        {recurring && occurrence.date > entry.date ? (
          <Button variant="quiet" onClick={() => void remove('from')}>
            Encerrar a partir deste mês
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- edição */

function EditForm({
  entry,
  occurrence,
  categories,
  cards,
  onCancel,
  onSaved,
}: {
  entry: Entry;
  occurrence: Occurrence;
  categories: Category[];
  cards: Card[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = React.useState(entry.description);
  const [amountText, setAmountText] = React.useState(String(entry.amount / 100).replace('.', ','));
  const [date, setDate] = React.useState(entry.date);
  const [categoryId, setCategoryId] = React.useState(entry.categoryId ?? '');
  const [cardId, setCardId] = React.useState(entry.cardId ?? '');
  const [repeatKind, setRepeatKind] = React.useState<RepeatKind>(entry.repeat.kind);
  const [count, setCount] = React.useState(String(entry.repeat.count ?? 12));
  const [notes, setNotes] = React.useState(entry.notes);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const recurring = entry.repeat.kind !== 'once';
  const canSplit = recurring && occurrence.date > entry.date;
  const options = categories.filter((c) => c.kind === entry.kind);

  function patch(): Partial<Entry> | null {
    const amount = parseMoney(amountText);
    if (!description.trim()) {
      setError('Escreva o que foi.');
      return null;
    }
    if (amount === null || amount <= 0) {
      setError('Informe um valor maior que zero.');
      return null;
    }
    return {
      description: description.trim(),
      amount,
      categoryId: categoryId || null,
      cardId: cardId || null,
      notes,
      ...(recurring ? {} : { date }),
      repeat:
        repeatKind === entry.repeat.kind && repeatKind !== 'installments'
          ? entry.repeat
          : repeatKind === 'installments'
            ? { kind: 'installments', count: Math.max(2, Number(count) || 2) }
            : { kind: repeatKind },
    };
  }

  async function save(scope: 'all' | 'from') {
    const changes = patch();
    if (!changes) return;
    setSaving(true);
    try {
      if (scope === 'from') await changeEntryFrom(entry, occurrence.date, changes);
      else await updateEntry(entry, changes);
      if (changes.categoryId && changes.categoryId !== entry.categoryId) {
        await rememberCategory(changes.description ?? entry.description, changes.categoryId);
      }
      toast(scope === 'from' ? 'Alterado daqui para frente.' : 'Lançamento atualizado.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save('all');
      }}
    >
      <Field label="O que foi" htmlFor="edit-desc">
        <Input id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={entry.repeat.kind === 'installments' ? 'Valor da parcela' : 'Valor'} htmlFor="edit-amount">
          <Input id="edit-amount" value={amountText} onChange={(e) => setAmountText(e.target.value)} inputMode="decimal" className="tnum font-semibold" />
        </Field>
        <Field label="Data" htmlFor="edit-date" hint={recurring ? 'A data da série não muda aqui.' : undefined}>
          <Input id="edit-date" type="date" value={recurring ? occurrence.date : date} disabled={recurring} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Categoria" htmlFor="edit-cat">
        <Select id="edit-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sem categoria</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repete" htmlFor="edit-repeat">
          <Select id="edit-repeat" value={repeatKind} onChange={(e) => setRepeatKind(e.target.value as RepeatKind)}>
            {(Object.keys(REPEAT_LABELS) as RepeatKind[]).map((k) => (
              <option key={k} value={k}>
                {REPEAT_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        {repeatKind === 'installments' ? (
          <Field label="Parcelas" htmlFor="edit-count">
            <Input id="edit-count" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="tnum" />
          </Field>
        ) : entry.kind === 'out' && cards.length ? (
          <Field label="Cartão" htmlFor="edit-card">
            <Select id="edit-card" value={cardId} onChange={(e) => setCardId(e.target.value)}>
              <option value="">Conta (sem cartão)</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.institution}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <Field label="Observação" htmlFor="edit-notes">
        <Input id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} autoComplete="off" />
      </Field>

      {error ? (
        <p role="alert" className="rounded-field bg-out-soft px-3 py-2 text-[13px] text-out">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2">
        {canSplit ? (
          <>
            <Button type="button" variant="primary" size="lg" disabled={saving} onClick={() => void save('from')}>
              Salvar daqui para frente
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save('all')}>
              Salvar em todos os meses
            </Button>
          </>
        ) : (
          <Button type="submit" variant="primary" size="lg" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        )}
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
