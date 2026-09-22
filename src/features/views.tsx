'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, CornerUpLeft, Eye, EyeOff } from 'lucide-react';
import { Donut, MonthBars, MonthCalendar, categorySlices } from '@/components/charts';
import { OccurrenceList } from '@/components/entries';
import { EmptyState, Panel, SectionTitle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { addMonthsToKey, currentMonthKey, formatMonthLabel, monthKeyParts } from '@/lib/dates';
import { formatMoney, formatPercent, ratio } from '@/lib/money';
import type { MonthSummary, Occurrence } from '@/lib/occurrences';
import { firstNegativeDay, type DayPoint } from '@/lib/occurrences';
import type { Category, Cents, MonthKey } from '@/lib/types';

/* ------------------------------------------------------------- navegação */

export function MonthStrip({
  month,
  onChange,
}: {
  month: MonthKey;
  onChange: (month: MonthKey) => void;
}) {
  const { y } = monthKeyParts(month);
  const isCurrent = month === currentMonthKey();

  return (
    <div className="flex items-center justify-center gap-1 py-1">
      <Arrow label="Mês anterior" onClick={() => onChange(addMonthsToKey(month, -1))}>
        <ChevronLeft size={18} />
      </Arrow>

      <span className="min-w-[10.5rem] text-center text-[16px] font-semibold capitalize text-ink">
        {formatMonthLabel(month, { short: false }).replace(/ de \d{4}$/, '')}{' '}
        <span className="tnum font-normal text-ink-3">{y}</span>
      </span>

      <Arrow label="Próximo mês" onClick={() => onChange(addMonthsToKey(month, 1))}>
        <ChevronRight size={18} />
      </Arrow>

      {!isCurrent && (
        <button
          type="button"
          onClick={() => onChange(currentMonthKey())}
          className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          <CornerUpLeft size={13} strokeWidth={2.2} />
          hoje
        </button>
      )}
    </div>
  );
}

function Arrow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ peças */

export function Hero({
  label,
  value,
  hidden,
  onToggleHidden,
  tone = 'ink',
}: {
  label: string;
  value: Cents;
  hidden: boolean;
  onToggleHidden: () => void;
  tone?: 'ink' | 'in' | 'out' | 'inv';
}) {
  const color =
    tone === 'in' ? 'text-in' : tone === 'out' ? 'text-out' : tone === 'inv' ? 'text-inv' : 'text-ink';

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={onToggleHidden}
        className="flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink-2"
        aria-label={hidden ? 'Mostrar valores' : 'Esconder valores'}
      >
        {label}
        {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>

      <p className={cn('amount mt-1.5 text-[46px]', color)}>
        {hidden ? '••••' : formatMoney(value)}
      </p>
    </div>
  );
}

export interface StatItem {
  label: string;
  value: Cents;
  tone?: 'in' | 'out' | 'inv' | 'ink';
  /** quando o valor não é dinheiro (ex.: porcentagem) */
  text?: string;
}

export function StatRow({ items, hidden }: { items: StatItem[]; hidden: boolean }) {
  return (
    <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
      {items.map((s) => (
        <div key={s.label} className="min-w-0">
          <dt className="truncate text-[11px] uppercase tracking-wider text-ink-3">{s.label}</dt>
          <dd
            className={cn(
              'tnum mt-1 truncate text-[15px] font-semibold',
              s.tone === 'in'
                ? 'text-in'
                : s.tone === 'out'
                  ? 'text-out'
                  : s.tone === 'inv'
                    ? 'text-inv'
                    : 'text-ink',
            )}
          >
            {s.text ?? formatMoney(s.value, { hidden, compact: true })}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** curva de saldo do mês, com o dia em que cruza o zero */
export function Trajectory({ points, hidden }: { points: DayPoint[]; hidden: boolean }) {
  const W = 620;
  const H = 150;
  const PAD = 10;

  const geo = React.useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.balance);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    const realCount = points.filter((p) => !p.projected).length;
    const realPath = points
      .slice(0, Math.max(realCount, 1))
      .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`)
      .join(' ');
    const area = `${path} L${x(points.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;

    const neg = firstNegativeDay(points);
    return { path, realPath, area, zeroY: y(0), x, y, neg, negIndex: neg ? points.indexOf(neg) : -1, hasReal: realCount > 1 };
  }, [points]);

  if (!geo) return null;

  const last = points[points.length - 1];

  return (
    <Panel className="p-5">
      <SectionTitle
        action={
          <span className="tnum text-[13px] font-semibold text-ink-2">
            {formatMoney(last.balance, { hidden, compact: true })} no fim
          </span>
        }
      >
        Trajetória do mês
      </SectionTitle>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" role="img" aria-label="Saldo ao longo do mês">
        <defs>
          <linearGradient id="norte-traj" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={geo.area} fill="url(#norte-traj)" />
        <line
          x1={PAD}
          x2={W - PAD}
          y1={geo.zeroY}
          y2={geo.zeroY}
          stroke="var(--line-strong)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <path d={geo.path} fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeDasharray="4 4" opacity="0.6" strokeLinecap="round" />
        {geo.hasReal && (
          <path d={geo.realPath} fill="none" stroke="var(--accent)" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {geo.neg && geo.negIndex >= 0 && (
          <>
            <circle cx={geo.x(geo.negIndex)} cy={geo.y(geo.neg.balance)} r="8" fill="var(--out)" opacity="0.18" />
            <circle cx={geo.x(geo.negIndex)} cy={geo.y(geo.neg.balance)} r="4" fill="var(--out)" />
          </>
        )}
      </svg>

      {geo.neg ? (
        <p className="mt-1 text-[13px] text-out">
          O saldo cruza o zero no dia <strong className="font-semibold">{Number(geo.neg.date.slice(8))}</strong>.
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-ink-3">O saldo não fica negativo em nenhum dia do mês.</p>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ Início */

export interface ViewContext {
  month: MonthKey;
  setMonth: (m: MonthKey) => void;
  summary: MonthSummary;
  occurrences: Occurrence[];
  projection: DayPoint[];
  categories: Category[];
  hidden: boolean;
  toggleHidden: () => void;
  onToggleOccurrence: (o: Occurrence) => void;
  history: MonthSummary[];
}

export function InicioView(ctx: ViewContext) {
  const recent = ctx.occurrences.slice(0, 6);

  return (
    <div className="grid gap-4">
      <Hero
        label="Saldo do mês"
        value={ctx.summary.balance}
        hidden={ctx.hidden}
        onToggleHidden={ctx.toggleHidden}
        tone={ctx.summary.balance < 0 ? 'out' : 'ink'}
      />
      <StatRow
        hidden={ctx.hidden}
        items={[
          { label: 'Receitas', value: ctx.summary.income, tone: 'in' },
          { label: 'Despesas', value: ctx.summary.expense, tone: 'out' },
          { label: 'Investido', value: ctx.summary.invested, tone: 'inv' },
        ]}
      />

      <Trajectory points={ctx.projection} hidden={ctx.hidden} />

      <Panel className="p-5">
        <SectionTitle>Calendário</SectionTitle>
        <MonthCalendar month={ctx.month} occurrences={ctx.occurrences} />
      </Panel>

      <Panel className="px-5 py-4">
        <SectionTitle>Últimos lançamentos</SectionTitle>
        {recent.length ? (
          <OccurrenceList
            occurrences={recent}
            categories={ctx.categories}
            hidden={ctx.hidden}
            onToggle={ctx.onToggleOccurrence}
          />
        ) : (
          <EmptyState
            title="O mês está em branco"
            description="Comece pelo que você já sabe: o aluguel, o salário, a assinatura que cai todo dia 12."
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- Receitas */

export function ReceitasView(ctx: ViewContext) {
  const incomes = ctx.occurrences.filter((o) => o.kind === 'in');
  const received = ctx.summary.settledIncome;
  const toReceive = ctx.summary.income - received;

  return (
    <div className="grid gap-4">
      <Hero
        label="Recebido no mês"
        value={received}
        hidden={ctx.hidden}
        onToggleHidden={ctx.toggleHidden}
        tone="in"
      />
      <StatRow
        hidden={ctx.hidden}
        items={[
          { label: 'Previsto', value: ctx.summary.income },
          { label: 'A receber', value: toReceive, tone: 'in' },
          {
            label: 'Do previsto',
            value: 0,
            text: formatPercent(ratio(received, ctx.summary.income)),
          },
        ]}
      />

      <Panel className="px-5 py-4">
        <SectionTitle action={<span className="tnum text-[12px] text-ink-3">{incomes.length}</span>}>
          Lançamentos
        </SectionTitle>
        {incomes.length ? (
          <OccurrenceList
            occurrences={incomes}
            categories={ctx.categories}
            hidden={ctx.hidden}
            onToggle={ctx.onToggleOccurrence}
          />
        ) : (
          <EmptyState
            title="Nenhuma receita neste mês"
            description="Registre o salário e o que mais entra. Marcando como recorrente, ele se repete sozinho."
          />
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- Despesas */

export function DespesasView(ctx: ViewContext) {
  const expenses = ctx.occurrences.filter((o) => o.kind === 'out');
  const slices = React.useMemo(
    () => categorySlices(ctx.summary, ctx.categories),
    [ctx.summary, ctx.categories],
  );
  const totalOut = ctx.summary.expense + ctx.summary.invested;

  return (
    <div className="grid gap-4">
      <Hero
        label="Despesas pagas no mês"
        value={ctx.summary.settledExpense}
        hidden={ctx.hidden}
        onToggleHidden={ctx.toggleHidden}
        tone="out"
      />
      <StatRow
        hidden={ctx.hidden}
        items={[
          { label: 'Previsto', value: ctx.summary.expense },
          { label: 'Pendente', value: ctx.summary.pendingExpense, tone: 'out' },
          { label: 'Vencido', value: ctx.summary.overdueExpense, tone: 'out' },
        ]}
      />

      {slices.length > 0 && (
        <Panel className="p-5">
          <SectionTitle>Gastos por categoria</SectionTitle>
          <Donut slices={slices} total={totalOut} caption="Gastos por categoria" />
        </Panel>
      )}

      <Panel className="p-5">
        <SectionTitle>Últimos 6 meses</SectionTitle>
        <MonthBars months={ctx.history} hidden={ctx.hidden} />
      </Panel>

      <Panel className="px-5 py-4">
        <SectionTitle action={<span className="tnum text-[12px] text-ink-3">{expenses.length}</span>}>
          Lançamentos
        </SectionTitle>
        {expenses.length ? (
          <OccurrenceList
            occurrences={expenses}
            categories={ctx.categories}
            hidden={ctx.hidden}
            onToggle={ctx.onToggleOccurrence}
          />
        ) : (
          <EmptyState
            title="Nenhuma despesa neste mês"
            description="Lance a primeira e a categoria já vem preenchida pela descrição."
          />
        )}
      </Panel>
    </div>
  );
}

/* ----------------------------------------------------------- Investimentos */

export function InvestimentosView(ctx: ViewContext) {
  const contributions = ctx.occurrences.filter((o) => o.kind === 'invest');
  const slices = React.useMemo(() => {
    const byId = new Map(ctx.categories.map((c) => [c.id, c]));
    const totals = new Map<string, Cents>();
    for (const o of contributions) {
      const key = o.categoryId ?? 'sem-categoria';
      totals.set(key, (totals.get(key) ?? 0) + o.amount);
    }
    return Array.from(totals.entries())
      .map(([id, value]) => ({
        id,
        label: byId.get(id)?.name ?? 'Sem categoria',
        value,
        color: byId.get(id)?.color ?? 'var(--inv)',
      }))
      .sort((a, b) => b.value - a.value);
  }, [contributions, ctx.categories]);

  // acumulado da janela que a tela já carrega; o total de todos os tempos
  // entra quando a carteira com posições reais existir
  const accumulated = ctx.history.reduce((sum, m) => sum + m.invested, 0);
  const shareOfIncome = ratio(ctx.summary.invested, ctx.summary.income);

  return (
    <div className="grid gap-4">
      <Hero
        label="Investido no período"
        value={accumulated}
        hidden={ctx.hidden}
        onToggleHidden={ctx.toggleHidden}
        tone="inv"
      />
      <StatRow
        hidden={ctx.hidden}
        items={[
          { label: 'Aportes do mês', value: ctx.summary.invested, tone: 'inv' },
          { label: '% da renda', value: 0, text: formatPercent(shareOfIncome) },
          { label: 'Aportes', value: 0, text: String(contributions.length) },
        ]}
      />

      {slices.length > 0 && (
        <Panel className="p-5">
          <SectionTitle>Alocação do mês</SectionTitle>
          <Donut slices={slices} total={ctx.summary.invested} caption="Alocação do mês" />
        </Panel>
      )}

      <Panel className="px-5 py-4">
        <SectionTitle action={<span className="tnum text-[12px] text-ink-3">{contributions.length}</span>}>
          Aportes de {formatMonthLabel(ctx.month).replace(/ de \d{4}$/, '')}
        </SectionTitle>
        {contributions.length ? (
          <OccurrenceList
            occurrences={contributions}
            categories={ctx.categories}
            hidden={ctx.hidden}
            onToggle={ctx.onToggleOccurrence}
          />
        ) : (
          <EmptyState
            title="Nenhum aporte neste mês"
            description="Registre o quanto foi para renda fixa, ações ou reserva. A alocação aparece aqui na hora."
          />
        )}
      </Panel>
    </div>
  );
}
