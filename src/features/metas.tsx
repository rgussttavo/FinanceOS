'use client';

import * as React from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  SectionTitle,
  Select,
  Sheet,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateFull } from '@/lib/dates';
import { GOAL_ICONS, goalProgress } from '@/lib/goals';
import { formatMoney, formatPercent, parseMoney } from '@/lib/money';
import {
  createGoal,
  depositIntoGoal,
  removeGoal,
  updateGoal,
  useEntriesUpTo,
  useGoals,
} from '@/lib/store';
import type { Category, Goal, GoalSource, MonthKey } from '@/lib/types';

/* ------------------------------------------------------------------- anel */

/**
 * Anel de progresso.
 *
 * Preferido à barra porque a meta é um número só, e o círculo deixa o emoji
 * morar no meio — a meta passa a ter cara antes de ter valor.
 */
function ProgressRing({
  ratio,
  icon,
  color,
  size = 62,
}: {
  ratio: number;
  icon: string;
  color: string;
  size?: number;
}) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${ratio * c} ${c}`}
          className="transition-[stroke-dasharray] duration-[var(--t-slow)] ease-[var(--ease-out)]"
        />
      </svg>
      <span className="text-[20px]" aria-hidden>
        {icon}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------- tela */

export function MetasView({
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
  startNew?: boolean;
}) {
  const goals = useGoals(spaceId);
  const entries = useEntriesUpTo(spaceId, month);
  const [sheet, setSheet] = React.useState<{ open: boolean; editing: Goal | null }>({
    open: false,
    editing: null,
  });
  const [autoOpened, setAutoOpened] = React.useState(false);
  if (startNew && !autoOpened) {
    setAutoOpened(true);
    setSheet({ open: true, editing: null });
  }

  if (!goals.length) {
    return (
      <div className="pt-2">
        <Panel className="px-5 py-8">
          <EmptyState
            title="Nenhuma meta ainda"
            description='Crie uma meta como "juntar R$ 5.000 até dezembro" e acompanhe o progresso aqui. Ligada aos aportes, ela sobe sozinha.'
            action={
              <Button variant="primary" onClick={() => setSheet({ open: true, editing: null })}>
                <Plus size={16} />
                Criar meta
              </Button>
            }
          />
        </Panel>
        <GoalSheet
          state={sheet}
          spaceId={spaceId}
          categories={categories}
          onClose={() => setSheet({ open: false, editing: null })}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pt-2">
      <Panel className="px-5 py-4">
        <SectionTitle
          action={
            <button
              type="button"
              aria-label="Criar meta"
              onClick={() => setSheet({ open: true, editing: null })}
              className="grid h-8 w-8 place-items-center rounded-full text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={17} />
            </button>
          }
        >
          Suas metas
        </SectionTitle>

        <ul className="divide-y divide-line">
          {goals.map((goal) => {
            const p = goalProgress(goal, entries, month);
            return (
              <li key={goal.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, editing: goal })}
                  className="flex w-full items-center gap-3.5 py-4 text-left"
                >
                  <ProgressRing ratio={p.ratio} icon={goal.icon} color={goal.color} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-medium text-ink">{goal.name}</span>
                      <span
                        className={cn(
                          'tnum shrink-0 text-[13px] font-semibold',
                          p.reached ? 'text-in' : 'text-ink-2',
                        )}
                      >
                        {formatPercent(p.ratio)}
                      </span>
                    </span>

                    <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                      {formatMoney(p.current, { hidden, compact: true })} de{' '}
                      {formatMoney(p.target, { hidden, compact: true })}
                    </span>

                    <span className="mt-0.5 block truncate text-[12px]">
                      {p.reached ? (
                        <span className="inline-flex items-center gap-1 text-in">
                          <Check size={12} strokeWidth={2.6} />
                          meta batida
                        </span>
                      ) : p.late ? (
                        <span className="text-out">prazo vencido · faltam {formatMoney(p.missing, { hidden, compact: true })}</span>
                      ) : p.perMonth != null ? (
                        <span className="text-ink-3">
                          {formatMoney(p.perMonth, { hidden, compact: true })} por mês
                          {p.monthsLeft ? ` · faltam ${p.monthsLeft} ${p.monthsLeft === 1 ? 'mês' : 'meses'}` : ''}
                        </span>
                      ) : goal.source === 'manual' ? (
                        <span className="text-ink-3">sem prazo</span>
                      ) : (
                        <span className="text-inv">sobe sozinha a cada aporte</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <GoalSheet
        state={sheet}
        spaceId={spaceId}
        categories={categories}
        onClose={() => setSheet({ open: false, editing: null })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ folha */

const SOURCE_LABELS: { value: string; label: string }[] = [
  { value: 'manual', label: 'Eu atualizo na mão' },
  { value: 'invested', label: 'Patrimônio investido (total)' },
];

function GoalSheet({
  state,
  spaceId,
  categories,
  onClose,
}: {
  state: { open: boolean; editing: Goal | null };
  spaceId: string;
  categories: Category[];
  onClose: () => void;
}) {
  const editing = state.editing;
  const investCategories = categories.filter((c) => c.kind === 'invest');

  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState<string>(GOAL_ICONS[0]);
  const [targetText, setTargetText] = React.useState('');
  const [sourceValue, setSourceValue] = React.useState('manual');
  const [savedText, setSavedText] = React.useState('');
  const [deadline, setDeadline] = React.useState('');
  const [depositText, setDepositText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [loadedFor, setLoadedFor] = React.useState('');
  const signature = `${state.open}:${editing?.id ?? 'novo'}`;
  if (state.open && loadedFor !== signature) {
    setLoadedFor(signature);
    setName(editing?.name ?? '');
    setIcon(editing?.icon ?? GOAL_ICONS[0]);
    setTargetText(editing ? String(editing.target / 100).replace('.', ',') : '');
    setSourceValue(
      editing ? (editing.source === 'category' ? (editing.categoryId ?? 'manual') : editing.source) : 'manual',
    );
    setSavedText(editing ? String(editing.saved / 100).replace('.', ',') : '');
    setDeadline(editing?.deadline ?? '');
    setDepositText('');
    setError(null);
  }

  // o seletor mistura as duas origens fixas com as categorias de investimento:
  // escolher uma categoria já define source 'category' e o vínculo, num toque só
  const resolveSource = (): { source: GoalSource; categoryId: string | null } => {
    if (sourceValue === 'manual') return { source: 'manual', categoryId: null };
    if (sourceValue === 'invested') return { source: 'invested', categoryId: null };
    return { source: 'category', categoryId: sourceValue };
  };

  async function submit() {
    const target = parseMoney(targetText);
    if (!name.trim()) return setError('Dê um nome à meta.');
    if (target === null || target <= 0) return setError('Informe quanto você quer juntar.');

    const { source, categoryId } = resolveSource();
    setSaving(true);
    try {
      const payload = {
        spaceId,
        name,
        icon,
        target,
        source,
        categoryId,
        saved: parseMoney(savedText) ?? 0,
        deadline: deadline || null,
      };
      if (editing) await updateGoal(editing, payload);
      else await createGoal(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui salvar.');
    } finally {
      setSaving(false);
    }
  }

  const isManual = sourceValue === 'manual';

  return (
    <Sheet
      open={state.open}
      onClose={onClose}
      title={editing ? 'Editar meta' : 'Nova meta'}
      footer={
        <div className="grid gap-2">
          <Button variant="primary" size="lg" className="w-full" onClick={submit} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
          {editing && (
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                if (!confirm(`Apagar a meta ${editing.name}?`)) return;
                await removeGoal(editing.id);
                onClose();
              }}
            >
              <Trash2 size={15} />
              Apagar meta
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome da meta" htmlFor="goal-name" hint="Ex.: Viagem, Entrada do carro, Reserva">
          <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Ícone</p>
          <div className="grid grid-cols-8 gap-1.5">
            {GOAL_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                aria-pressed={icon === emoji}
                aria-label={`Ícone ${emoji}`}
                className={cn(
                  'grid h-9 place-items-center rounded-field text-[18px] transition-colors',
                  icon === emoji ? 'bg-accent-soft ring-1 ring-accent' : 'bg-surface-2 hover:bg-surface-3',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <Field label="Quanto quer juntar" htmlFor="goal-target">
          <Input
            id="goal-target"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            inputMode="decimal"
            className="tnum"
            placeholder="0,00"
          />
        </Field>

        <Field
          label="Progresso vem de"
          htmlFor="goal-source"
          hint={
            isManual
              ? 'Você informa quanto já guardou.'
              : 'A barra sobe sozinha a cada aporte registrado.'
          }
        >
          <Select id="goal-source" value={sourceValue} onChange={(e) => setSourceValue(e.target.value)}>
            {SOURCE_LABELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            {investCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </Field>

        {isManual && (
          <Field label="Já guardado" htmlFor="goal-saved">
            <Input
              id="goal-saved"
              value={savedText}
              onChange={(e) => setSavedText(e.target.value)}
              inputMode="decimal"
              className="tnum"
              placeholder="0,00"
            />
          </Field>
        )}

        <Field
          label="Prazo"
          htmlFor="goal-deadline"
          hint={deadline ? `Até ${formatDateFull(deadline)}.` : 'Opcional. Com prazo, o app calcula quanto guardar por mês.'}
        >
          <Input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>

        {editing && editing.source === 'manual' && (
          <div className="rounded-card border border-line bg-surface-2 p-3">
            <p className="text-[13px] font-medium text-ink-2">Guardar mais um tanto</p>
            <div className="mt-2 flex gap-2">
              <Input
                value={depositText}
                onChange={(e) => setDepositText(e.target.value)}
                inputMode="decimal"
                className="tnum flex-1"
                placeholder="0,00"
                aria-label="Valor a guardar"
              />
              <Button
                variant="ghost"
                onClick={async () => {
                  const amount = parseMoney(depositText);
                  if (!amount || amount <= 0) return;
                  await depositIntoGoal(editing, amount);
                  setDepositText('');
                  onClose();
                }}
              >
                Guardar
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-[13px] text-out">{error}</p>}
      </div>
    </Sheet>
  );
}
