'use client';

import * as React from 'react';
import { Check, Pause, Pencil, Play, Plus, Target, Trash2 } from 'lucide-react';
import type { QuickAddRequest } from '@/components/quick-add';
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
  Skeleton,
  Switch,
  confirmAction,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { currentMonthKey, formatDateFull, formatMonthLabel, todayIso } from '@/lib/dates';
import { PRIORITY_LABEL, goalPlan, priorityOf, type Allocation, type GoalPlan, type ScenarioId } from '@/lib/goal-plan';
import { GOAL_ICONS, goalPace, goalProgress } from '@/lib/goals';
import { formatMoney, formatPercent, parseMoney } from '@/lib/money';
import { moneyStory } from '@/lib/money-story';
import { monthOccurrences, type FinanceBase } from '@/lib/picture';
import { createGoal, depositIntoGoal, removeGoal, setGoalPaused, updateGoal } from '@/lib/store';
import type { Category, Entry, Goal, GoalPriority, GoalSource, MonthKey } from '@/lib/types';

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

/**
 * Metas: o que você quer alcançar, e se está no ritmo.
 *
 * Cada meta mostra quanto já tem, quanto falta, quanto precisa guardar por mês
 * para chegar no prazo e — o que motiva — quando chega mantendo o ritmo de
 * agora. Pausar tira a meta dos alertas sem apagar nada.
 */
export function MetasView({
  spaceId,
  base,
  categories,
  hidden,
  startNew = false,
  onQuick,
}: {
  spaceId: string;
  base: FinanceBase;
  categories: Category[];
  hidden: boolean;
  startNew?: boolean;
  onQuick: (request: QuickAddRequest) => void;
}) {
  const month = currentMonthKey();
  const goals = base.goals;
  const entries = base.entries;
  // o que as metas pedem contra o que sobra, e os três cenários
  const plan = React.useMemo(() => {
    const today = todayIso();
    return goalPlan(goals, entries, moneyStory((m) => monthOccurrences(base, m, today), entries, today), today);
  }, [base, goals, entries]);
  const [sheet, setSheet] = React.useState<{ open: boolean; editing: Goal | null }>({
    open: false,
    editing: null,
  });
  const [autoOpened, setAutoOpened] = React.useState(false);
  if (startNew && !autoOpened) {
    setAutoOpened(true);
    setSheet({ open: true, editing: null });
  }

  const sheetEl = (
    <GoalSheet state={sheet} spaceId={spaceId} categories={categories} onClose={() => setSheet({ open: false, editing: null })} />
  );

  if (!base.ready) {
    return (
      <div className="grid gap-4 pt-2 sm:grid-cols-2">
        <Skeleton className="h-[260px] rounded-panel" />
        <Skeleton className="h-[260px] rounded-panel" />
      </div>
    );
  }

  if (!goals.length) {
    return (
      <div className="pt-2">
        <Panel className="px-5 py-4">
          <EmptyState
            icon={<Target size={22} />}
            title="Ainda não existem metas"
            description="Crie sua primeira meta e acompanhe exatamente quanto precisa guardar todos os meses. Ligada a um investimento, ela sobe sozinha a cada aporte."
            action={
              <Button variant="primary" onClick={() => setSheet({ open: true, editing: null })}>
                <Plus size={16} />
                Criar meta
              </Button>
            }
          />
        </Panel>
        {sheetEl}
      </div>
    );
  }

  const active = goals.filter((g) => !g.pausedAt);
  const paused = goals.filter((g) => g.pausedAt);
  const totals = active.reduce(
    (acc, g) => {
      const p = goalProgress(g, entries, month);
      acc.current += Math.min(p.current, p.target);
      acc.target += p.target;
      return acc;
    },
    { current: 0, target: 0 },
  );

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-[14px] text-ink-2">
          {active.length ? (
            <>
              Você já juntou <strong className="font-semibold text-ink">{formatMoney(totals.current, { hidden })}</strong> de{' '}
              {formatMoney(totals.target, { hidden })} nas {active.length} {active.length === 1 ? 'meta ativa' : 'metas ativas'}.
            </>
          ) : (
            'Todas as metas estão pausadas.'
          )}
        </p>
        <Button size="sm" variant="soft" onClick={() => setSheet({ open: true, editing: null })}>
          <Plus size={15} /> Nova meta
        </Button>
      </div>

      {active.length ? <GoalPlanPanel plan={plan} hidden={hidden} /> : null}

      <ul className="grid gap-4 md:grid-cols-2">
        {active.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            entries={entries}
            month={month}
            hidden={hidden}
            onEdit={() => setSheet({ open: true, editing: goal })}
            onQuick={onQuick}
          />
        ))}
      </ul>

      {paused.length ? (
        <Panel className="px-5 py-4">
          <SectionTitle>Pausadas</SectionTitle>
          <ul className="divide-y divide-line">
            {paused.map((goal) => {
              const p = goalProgress(goal, entries, month);
              return (
                <li key={goal.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-[20px]" aria-hidden>
                    {goal.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">{goal.name}</span>
                    <span className="block text-[12px] text-ink-3">
                      {formatMoney(p.current, { hidden })} de {formatMoney(p.target, { hidden })}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={async () => {
                      await setGoalPaused(goal, false);
                      toast(`${goal.name} retomada.`);
                    }}
                  >
                    <Play size={14} /> Retomar
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {sheetEl}
    </div>
  );
}

function GoalCard({
  goal,
  entries,
  month,
  hidden,
  onEdit,
  onQuick,
}: {
  goal: Goal;
  entries: Entry[];
  month: MonthKey;
  hidden: boolean;
  onEdit: () => void;
  onQuick: (request: QuickAddRequest) => void;
}) {
  const p = goalProgress(goal, entries, month);
  const pace = goalPace(goal, entries, month);
  const [depositText, setDepositText] = React.useState('');
  const [depositing, setDepositing] = React.useState(false);
  const maxBar = Math.max(1, ...pace.history.map((h) => h.amount));
  const deadlineMonth = goal.deadline ? goal.deadline.slice(0, 7) : null;
  const onTrack = pace.projected && deadlineMonth ? pace.projected <= deadlineMonth : null;

  async function deposit() {
    const amount = parseMoney(depositText);
    if (!amount || amount <= 0) return;
    await depositIntoGoal(goal, amount);
    setDepositText('');
    setDepositing(false);
    const after = p.current + amount;
    toast(after >= p.target ? `Meta ${goal.name} batida! 🎉` : `${formatMoney(amount)} guardados em ${goal.name}.`);
  }

  return (
    <li>
      <Panel className="h-full p-5">
        <div className="flex items-start gap-4">
          <ProgressRing ratio={p.ratio} icon={goal.icon} color={goal.color || 'var(--accent)'} size={76} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold text-ink">{goal.name}</p>
            <p className="text-[12px] text-ink-3">
              Prioridade {PRIORITY_LABEL[priorityOf(goal)]}
              {goal.fixedDeadline && goal.deadline ? ' · prazo fixo' : ''}
            </p>
            <p className="tnum mt-0.5 text-[14px] text-ink-2">
              {formatMoney(p.current, { hidden })} <span className="text-ink-3">/ {formatMoney(p.target, { hidden })}</span>
            </p>
            <p className={cn('mt-1 text-[14px] font-medium', p.reached ? 'text-in' : p.late ? 'text-out' : 'text-ink')}>
              {p.reached ? (
                <span className="inline-flex items-center gap-1">
                  <Check size={14} strokeWidth={2.6} /> Meta batida
                </span>
              ) : (
                <>
                  {formatPercent(p.ratio)} · faltam {formatMoney(p.missing, { hidden })}
                </>
              )}
            </p>
          </div>
        </div>

        {!p.reached ? (
          <div className="mt-4 grid gap-1.5 rounded-card bg-surface-2 px-4 py-3 text-[13px] leading-snug">
            {pace.pace > 0 && pace.projected ? (
              <p className="text-ink">
                Guardando {formatMoney(pace.pace, { hidden })}/mês → chega em{' '}
                <strong className="font-semibold">{formatMonthLabel(pace.projected)}</strong>
                {onTrack === true ? <span className="text-in"> · dentro do prazo</span> : onTrack === false ? <span className="text-warn"> · depois do prazo</span> : null}
              </p>
            ) : (
              <p className="text-ink-2">Ainda sem aportes nos últimos meses para calcular o ritmo.</p>
            )}
            {p.late ? (
              <p className="text-out">O prazo ({formatDateFull(goal.deadline!)}) passou. Ajuste o prazo ou o valor.</p>
            ) : p.perMonth != null && goal.deadline ? (
              <p className="text-ink-3">
                Para chegar até {formatMonthLabel(goal.deadline.slice(0, 7))}: {formatMoney(p.perMonth, { hidden })} por mês.
              </p>
            ) : goal.source !== 'manual' ? (
              <p className="text-inv">Sobe sozinha a cada aporte em {goal.source === 'category' ? 'uma categoria' : 'investimentos'}.</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider text-ink-3">Aportes dos últimos 6 meses</p>
          <div className="mt-2 flex h-12 items-end gap-1.5" role="img" aria-label={`Aportes: ${pace.history.map((h) => `${formatMonthLabel(h.month, { short: true })} ${formatMoney(h.amount)}`).join(', ')}`}>
            {pace.history.map((h) => (
              <span key={h.month} className="flex h-full flex-1 flex-col justify-end" title={`${formatMonthLabel(h.month)}: ${formatMoney(h.amount)}`}>
                <span
                  className={cn('w-full rounded-t-[3px]', h.amount > 0 ? 'bg-accent' : 'bg-surface-3')}
                  style={{ height: `${h.amount > 0 ? Math.max(8, (h.amount / maxBar) * 100) : 6}%` }}
                />
              </span>
            ))}
          </div>
        </div>

        {depositing ? (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void deposit();
            }}
          >
            <Input
              value={depositText}
              onChange={(e) => setDepositText(e.target.value)}
              inputMode="decimal"
              placeholder="Quanto guardou?"
              aria-label={`Quanto guardou em ${goal.name}`}
              className="tnum"
              autoFocus
            />
            <Button type="submit" variant="primary">
              Guardar
            </Button>
          </form>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {!p.reached ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => (goal.source === 'manual' ? setDepositing((v) => !v) : onQuick({ kind: 'goal' }))}
            >
              <Plus size={14} /> {goal.source === 'manual' ? 'Guardar' : 'Registrar aporte'}
            </Button>
          ) : null}
          <Button size="sm" onClick={onEdit}>
            <Pencil size={14} /> Prazo e valor
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={async () => {
              await setGoalPaused(goal, true);
              toast(`${goal.name} pausada. Ela sai dos alertas até você retomar.`, {
                action: { label: 'Desfazer', onClick: () => void setGoalPaused(goal, false) },
              });
            }}
          >
            <Pause size={14} /> Pausar
          </Button>
        </div>
      </Panel>
    </li>
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
  const [priority, setPriority] = React.useState<GoalPriority>('media');
  const [fixedDeadline, setFixedDeadline] = React.useState(false);
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
    setPriority(editing ? priorityOf(editing) : 'media');
    setFixedDeadline(!!editing?.fixedDeadline);
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
        priority,
        fixedDeadline: !!deadline && fixedDeadline,
      };
      if (editing) await updateGoal(editing, payload);
      else await createGoal(payload);
      toast(editing ? 'Meta atualizada.' : 'Meta criada. Agora é acompanhar o ritmo.');
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
                if (!(await confirmAction({ title: `Apagar a meta ${editing.name}?`, description: 'O que já foi guardado continua nos seus investimentos; só a meta some.', confirmLabel: 'Apagar', danger: true }))) return;
                await removeGoal(editing.id);
                toast('Meta apagada.');
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

        {deadline ? (
          <Switch
            checked={fixedDeadline}
            onChange={setFixedDeadline}
            label="Prazo fixo"
            detail="Data que não muda, como uma viagem marcada. No plano, recebe antes das metas de prazo flexível com a mesma prioridade."
          />
        ) : null}

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Prioridade</p>
          <Segmented
            label="Prioridade"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'alta', label: 'Alta' },
              { value: 'media', label: 'Média' },
              { value: 'baixa', label: 'Baixa' },
            ]}
          />
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">Quando a sobra não dá para todas, a prioridade decide quem recebe primeiro.</p>
        </div>

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

/* ------------------------------------------------------------------ plano */

const SCENARIO_OPTIONS: { value: ScenarioId; label: string }[] = [
  { value: 'conservador', label: 'Conservador' },
  { value: 'equilibrado', label: 'Equilibrado' },
  { value: 'acelerado', label: 'Acelerado' },
];

/** quando a meta chega neste cenário, e se chega no prazo */
function reachText(r: Allocation): string {
  if (!r.reaches) return r.onTime === null ? 'espera a vez' : 'não chega no prazo';
  const when = formatMonthLabel(r.reaches);
  if (r.onTime === true) return `chega em ${when}, no prazo`;
  if (r.onTime === false) return `chega em ${when}, ${r.delay} ${r.delay === 1 ? 'mês' : 'meses'} depois do prazo`;
  return `chega em ${when}`;
}

/**
 * O plano das metas: o que elas pedem contra o que sobra, e três cenários
 * de divisão. Só mostra consequências — nenhuma meta muda sozinha.
 */
function GoalPlanPanel({ plan, hidden }: { plan: GoalPlan; hidden: boolean }) {
  const [id, setId] = React.useState<ScenarioId>('equilibrado');
  if (!plan.needs.length) return null;
  const m = (v: number) => formatMoney(v, { hidden });
  const scenario = plan.scenarios.find((s) => s.id === id) ?? plan.scenarios[1];
  const description: Record<ScenarioId, string> = {
    conservador: `70% da sobra vai para as metas (${m(plan.scenarios[0].budget)} por mês); o resto fica de folga.`,
    equilibrado: `Toda a sobra média (${m(plan.scenarios[1].budget)} por mês) vai para as metas, pela prioridade.`,
    acelerado: `Toda a sobra e mais ${m(plan.extraCut)} por mês — 10% dos gastos variáveis, se você cortar.`,
  };

  if (plan.capacity === null) {
    return (
      <Panel className="px-5 py-4">
        <SectionTitle>Plano das metas</SectionTitle>
        <p className="text-[14px] leading-relaxed text-ink-2">
          Com um mês completo de movimento, eu comparo o que as metas pedem com o que sobra por mês e mostro cenários.
        </p>
      </Panel>
    );
  }

  const months = `nos últimos ${plan.months.length} ${plan.months.length === 1 ? 'mês' : 'meses'}`;
  return (
    <Panel className="px-5 py-4">
      <SectionTitle>Plano das metas</SectionTitle>
      <p className="text-[14px] leading-relaxed text-ink-2">
        {plan.asked > 0 ? <>As metas com prazo pedem <strong className="font-semibold text-ink">{m(plan.asked)}</strong> por mês; </> : 'Nenhuma meta com prazo em aberto; '}
        {plan.capacity > 0 ? (
          <>
            {months} sobraram <strong className="font-semibold text-ink">{m(plan.capacity)}</strong> por mês, em média.
          </>
        ) : (
          <>{months} não sobrou dinheiro ({formatMoney(plan.capacity, { hidden, signed: plan.capacity < 0 })} por mês): as metas dependem de cortar gastos ou aumentar a renda.</>
        )}
      </p>
      {plan.asked > 0 ? (
        <p className={cn('mt-1.5 text-[14px] font-medium', plan.conflict ? 'text-warn' : 'text-in')}>
          {plan.conflict
            ? `Elas competem pelo mesmo dinheiro: faltam ${m(plan.gap)} por mês para todas chegarem no prazo.`
            : 'Cabe: com a sobra atual, todas as metas com prazo chegam a tempo.'}
        </p>
      ) : null}

      <Segmented className="mt-4" label="Cenário" value={id} onChange={setId} options={SCENARIO_OPTIONS} />
      <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{description[id]}</p>

      <ul className="mt-2 divide-y divide-line">
        {scenario.rows.map((r) => (
          <li key={r.goal.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-ink">
                {r.goal.icon} {r.goal.name}
              </span>
              <span className="block text-[12px] text-ink-3">
                prioridade {PRIORITY_LABEL[r.priority]}
                {r.fixed ? ' · prazo fixo' : ''}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="tnum block text-[14px] font-medium text-ink">{r.monthly > 0 ? `${m(r.monthly)}/mês` : 'sem aporte'}</span>
              <span className={cn('block text-[12px]', r.onTime === false ? 'text-warn' : 'text-ink-3')}>{reachText(r)}</span>
            </span>
          </li>
        ))}
      </ul>
      {scenario.leftover > 0 ? <p className="mt-2 text-[12px] text-ink-3">Sobram {m(scenario.leftover)} por mês sem destino.</p> : null}
      <p className="mt-3 border-t border-line pt-2.5 text-[12px] leading-relaxed text-ink-3">
        Nada muda sozinho: para seguir um cenário, ajuste os aportes, os prazos ou as prioridades das metas.
      </p>
    </Panel>
  );
}
