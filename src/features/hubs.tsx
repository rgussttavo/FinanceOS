'use client';

import * as React from 'react';
import { ArrowLeftRight, Calculator, ChevronRight, Flame, Landmark, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { VIEW_ICONS } from '@/components/shell';
import { Meter, Panel, SectionTitle, Skeleton } from '@/components/ui';
import { buildInvoice, cardUsage, subscriptionChargeIn } from '@/lib/cards';
import type { CashSnapshot } from '@/lib/cashflow';
import { cn } from '@/lib/cn';
import { addMonthsToKey, formatDayShort, formatRelativeDay, monthKeyOf } from '@/lib/dates';
import { debtProgress } from '@/lib/debts';
import { goalProgress } from '@/lib/goals';
import { formatMoney } from '@/lib/money';
import { VIEW_META, type Route, type SubId, type ViewId } from '@/lib/nav';
import type { FinanceBase } from '@/lib/picture';
import { useBudgets } from '@/lib/store';
import { investedUntil } from '@/lib/wealth';
import { LoanSheet, OverdraftSheet, PayoffSheet } from './dividas';
import { CambioSheet, FireSheet, InvestimentoSheet } from './simuladores';

/* ------------------------------------------------------------ planejamento */

/**
 * O que vem por aí e o que você quer alcançar.
 *
 * Cada cartão responde a pergunta da ferramenta antes de abri-la: quanto custam
 * as assinaturas, quanto vem de fatura, quanto falta nas metas. Abrir é para
 * mexer, não para descobrir o número.
 */
export function PlanejamentoView({
  spaceId,
  base,
  cash,
  hidden,
  cardsEnabled,
  onGo,
}: {
  spaceId: string;
  base: FinanceBase;
  cash: CashSnapshot;
  hidden: boolean;
  cardsEnabled: boolean;
  onGo: (route: Route) => void;
}) {
  const budgets = useBudgets(spaceId);
  const today = cash.today;
  const month = monthKeyOf(today);
  const money = (v: number) => formatMoney(v, { hidden });

  if (!base.ready) {
    return (
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-panel" />
        ))}
      </div>
    );
  }

  const next = cash.items.filter((i) => i.date >= today && !(i.date === today && i.settled)).slice(0, 3);

  const goals = base.goals.filter((g) => !g.pausedAt);
  const goalRows = goals.map((g) => ({ g, p: goalProgress(g, base.entries, month, today) }));
  const goalTarget = goalRows.reduce((t, r) => t + r.p.target, 0);
  const goalCurrent = goalRows.reduce((t, r) => t + Math.min(r.p.current, r.p.target), 0);
  const late = goalRows.filter((r) => r.p.late).length;

  const activeSubs = base.subscriptions.filter((s) => !s.canceledAt);
  const subsMonthly = activeSubs.reduce((t, s) => t + subscriptionChargeIn(s, month), 0);
  const subsYearly = activeSubs.reduce((t, s) => t + (s.cycle === 'monthly' ? s.amount * 12 : s.amount), 0);

  // a próxima fatura de cada cartão: a primeira que ainda não venceu
  const invoices = base.cards
    .map((c) =>
      [month, addMonthsToKey(month, 1)]
        .map((m) => buildInvoice(c, base.entries, base.subscriptions, m, today))
        .find((i) => i.dueOn >= today && i.total > 0),
    )
    .filter((i): i is NonNullable<typeof i> => Boolean(i));
  const invoiceTotal = invoices.reduce((t, i) => t + i.total, 0);
  const nextDue = invoices.sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1))[0];
  const usage = base.cards.map((c) => cardUsage(c, base.entries, base.subscriptions, month, today));
  const limit = base.cards.reduce((t, c) => t + c.limit, 0);
  const used = usage.reduce((t, u) => t + u.used, 0);

  const openDebts = base.debts.filter((d) => !d.settledAt).map((d) => ({ d, p: debtProgress(d, month) })).filter((r) => !r.p.done);
  const debtLeft = openDebts.reduce((t, r) => t + r.p.outstanding, 0);
  const debtMonthly = openDebts.reduce((t, r) => t + r.d.installment, 0);

  const cards: { id: SubId; value: React.ReactNode; detail: React.ReactNode; meter?: { value: number; tone: 'accent' | 'warn' | 'out' | 'in' } }[] = [
    {
      id: 'calendario',
      value: next.length ? `${next.length === 3 ? 'Próximos' : 'Próximo'}` : 'Nada previsto',
      detail: next.length ? (
        <ul className="mt-1 grid gap-0.5">
          {next.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span className="truncate">
                {i.label} <span className="text-ink-3">· {formatRelativeDay(i.date)}</span>
              </span>
              <span className={cn('tnum shrink-0', i.kind === 'in' ? 'text-in' : 'text-ink-2')}>
                {i.kind === 'in' ? '+' : '−'}
                {money(i.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        'Lance salário e contas para ver o mês dia a dia.'
      ),
    },
    {
      id: 'metas',
      value: goals.length ? `${money(goalCurrent)} de ${money(goalTarget)}` : 'Nenhuma meta',
      detail: goals.length
        ? `${goals.length} ${goals.length === 1 ? 'meta ativa' : 'metas ativas'}${late ? ` · ${late} atrasada${late > 1 ? 's' : ''}` : ''}`
        : 'Crie uma e veja quanto guardar por mês.',
      meter: goalTarget > 0 ? { value: goalCurrent / goalTarget, tone: late ? 'warn' : 'accent' } : undefined,
    },
    {
      id: 'assinaturas',
      value: activeSubs.length ? `${money(subsMonthly)} por mês` : 'Nenhuma assinatura',
      detail: activeSubs.length ? `${money(subsYearly)} por ano · ${activeSubs.length} ativas` : 'Veja quanto custa seu estilo de vida digital.',
    },
    ...(cardsEnabled
      ? [
          {
            id: 'cartoes' as SubId,
            value: base.cards.length ? (invoiceTotal ? `${money(invoiceTotal)} nas próximas faturas` : 'Nenhuma fatura a vencer') : 'Nenhum cartão',
            detail: base.cards.length
              ? nextDue
                ? `A primeira vence ${formatDayShort(nextDue.dueOn)} · ${money(used)} do limite comprometido`
                : `${money(used)} do limite comprometido`
              : 'Faturas e parcelas se montam sozinhas.',
            meter: limit > 0 ? { value: used / limit, tone: (used / limit >= 0.8 ? 'warn' : 'accent') as 'warn' | 'accent' } : undefined,
          },
        ]
      : []),
    {
      id: 'dividas',
      value: openDebts.length ? `${money(debtLeft)} a pagar` : 'Nenhuma dívida',
      detail: openDebts.length ? `${money(debtMonthly)} por mês em ${openDebts.length} ${openDebts.length === 1 ? 'dívida' : 'dívidas'}` : 'Registre e simule como sair mais rápido.',
    },
    {
      id: 'orcamento',
      value: budgets.length ? `${budgets.length} ${budgets.length === 1 ? 'orçamento' : 'orçamentos'}` : 'Nenhum orçamento',
      detail: budgets.length ? budgets.slice(0, 2).map((b) => b.name).join(', ') : 'Viagem, festa, reforma: orce antes de gastar.',
    },
  ];

  return (
    <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <HubCard key={c.id} id={c.id} value={c.value} detail={c.detail} meter={c.meter} onGo={onGo} />
      ))}
    </div>
  );
}

function HubCard({
  id,
  value,
  detail,
  meter,
  onGo,
}: {
  id: ViewId;
  value: React.ReactNode;
  detail: React.ReactNode;
  meter?: { value: number; tone: 'accent' | 'warn' | 'out' | 'in' };
  onGo: (route: Route) => void;
}) {
  const Icon = VIEW_ICONS[id];
  return (
    <button
      type="button"
      onClick={() => onGo({ view: id })}
      className="group flex flex-col rounded-panel border border-line bg-surface p-4 text-left shadow-e1 transition-colors hover:border-line-strong"
    >
      <span className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon size={17} aria-hidden />
        </span>
        <span className="flex-1 text-[15px] font-medium text-ink">{VIEW_META[id].title}</span>
        <ChevronRight size={17} className="text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
      <span className="mt-3 block text-[17px] font-semibold text-ink">{value}</span>
      <span className="mt-1 block text-[13px] leading-snug text-ink-3">{detail}</span>
      {meter ? <Meter value={meter.value} tone={meter.tone} label={VIEW_META[id].title} className="mt-3" height={6} /> : null}
    </button>
  );
}

/* --------------------------------------------------------------------- mais */

const MAIS_GROUPS: { label: string; items: SubId[] }[] = [
  { label: 'Ferramentas', items: ['importar', 'simuladores', 'rateio', 'comprovantes', 'news'] },
  { label: 'Consultar', items: ['busca', 'ia'] },
  { label: 'Configurações', items: ['ajustes', 'categorias'] },
];

export function MaisView({ hiddenViews, onGo }: { hiddenViews: SubId[]; onGo: (route: Route) => void }) {
  return (
    <div className="grid gap-5 pt-2 lg:grid-cols-3 lg:items-start">
      {MAIS_GROUPS.map((group) => (
        <section key={group.label}>
          <SectionTitle>{group.label}</SectionTitle>
          <Panel className="overflow-hidden">
            <ul className="divide-y divide-line">
              {group.items
                .filter((id) => !hiddenViews.includes(id))
                .map((id) => {
                  const Icon = VIEW_ICONS[id];
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onGo({ view: id })}
                        className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-2">
                          <Icon size={17} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] text-ink">{VIEW_META[id].title}</span>
                          <span className="block truncate text-[12.5px] text-ink-3">{VIEW_META[id].description}</span>
                        </span>
                        <ChevronRight size={17} className="shrink-0 text-ink-3" aria-hidden />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </Panel>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- simuladores */

type Sim = 'cambio' | 'invest' | 'fire' | 'loan' | 'overdraft' | 'payoff';

const SIMS: { id: Sim; title: string; question: string; icon: typeof Calculator }[] = [
  { id: 'fire', title: 'Viver de renda', question: 'Quanto falta para o investido pagar suas contas?', icon: Flame },
  { id: 'invest', title: 'Investimentos', question: 'Quanto vira um aporte mensal daqui a alguns anos?', icon: TrendingUp },
  { id: 'payoff', title: 'Quitar dívidas', question: 'Qual dívida atacar primeiro, e quanto tempo economiza?', icon: Receipt },
  { id: 'loan', title: 'Empréstimo', question: 'Qual o custo real antes de assinar?', icon: Landmark },
  { id: 'overdraft', title: 'Cheque especial', question: 'Quanto os juros do limite custam de verdade?', icon: Wallet },
  { id: 'cambio', title: 'Câmbio', question: 'Quanto vale em reais, com a cotação de hoje?', icon: ArrowLeftRight },
];

export function SimuladoresView({ base, month }: { base: FinanceBase; month: string }) {
  const [open, setOpen] = React.useState<Sim | null>(null);
  const invested = React.useMemo(
    () => investedUntil(base.entries, month, `${month}-28`),
    [base.entries, month],
  );

  return (
    <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
      {SIMS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setOpen(s.id)}
          className="flex items-start gap-3 rounded-panel border border-line bg-surface p-4 text-left shadow-e1 transition-colors hover:border-line-strong"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <s.icon size={18} aria-hidden />
          </span>
          <span>
            <span className="block text-[15px] font-medium text-ink">{s.title}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{s.question}</span>
          </span>
        </button>
      ))}

      <CambioSheet open={open === 'cambio'} onClose={() => setOpen(null)} />
      <InvestimentoSheet open={open === 'invest'} onClose={() => setOpen(null)} />
      <FireSheet open={open === 'fire'} onClose={() => setOpen(null)} currentWealth={invested} />
      <LoanSheet open={open === 'loan'} onClose={() => setOpen(null)} />
      <OverdraftSheet open={open === 'overdraft'} onClose={() => setOpen(null)} />
      <PayoffSheet open={open === 'payoff'} onClose={() => setOpen(null)} debts={base.debts.filter((d) => !d.settledAt)} month={addMonthsToKey(month, 0)} />
    </div>
  );
}
