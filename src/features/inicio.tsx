'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  CreditCard,
  FileUp,
  Info,
  Minus,
  Plus,
  Receipt,
  ScanLine,
  Sparkles,
  Target,
  ThumbsUp,
  TrendingUp,
} from 'lucide-react';
import type { QuickAddRequest } from '@/components/quick-add';
import { greetingFor } from '@/components/shell';
import { FlowTimeline } from '@/components/timeline';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Meter,
  Money,
  Panel,
  SectionTitle,
  Select,
  Sheet,
  SignToggle,
  Skeleton,
  toast,
} from '@/components/ui';
import type { CashSnapshot, FlowItem } from '@/lib/cashflow';
import { cn } from '@/lib/cn';
import { addDaysIso, formatDateFull, formatDayShort } from '@/lib/dates';
import { holidaysBetween } from '@/lib/holidays';
import { buildInsights, headline, monthHealth, type Insight, type Severity } from '@/lib/insights';
import { formatMoney, parseMoney } from '@/lib/money';
import type { Route } from '@/lib/nav';
import { ledgerInput, type FinanceBase, type MonthPicture } from '@/lib/picture';
import type { MonthSummary } from '@/lib/occurrences';
import { putRecord } from '@/lib/db';
import { setBalance } from '@/lib/accounts';
import { balancesAt } from '@/lib/ledger';
import type { Category, Cents, Settings } from '@/lib/types';
import { wealthNow } from '@/lib/wealth';
import { NewsList } from './mercado';

/**
 * O Início responde uma pergunta: o que eu preciso saber hoje sobre o meu
 * dinheiro?
 *
 * Na ordem em que a pergunta se desdobra: quanto dá para gastar sem
 * comprometer o resto do mês, o que vai acontecer nos próximos dias, o que
 * merece atenção e como registrar algo agora. O detalhe fica um toque adiante
 * — em movimentos, no calendário, em cada ferramenta.
 */

type CardMode = 'salario' | 'agora' | 'fim' | 'patrimonio';

export interface InicioProps {
  spaceId: string;
  base: FinanceBase;
  cash: CashSnapshot;
  picture: MonthPicture;
  history: MonthSummary[];
  categories: Category[];
  settings: Settings | null;
  hidden: boolean;
  name: string;
  onGo: (route: Route) => void;
  onQuick: (request: QuickAddRequest) => void;
  onOpenFlow: (item: FlowItem) => void;
}

export function InicioView(props: InicioProps) {
  const { base, cash, settings, hidden, onGo } = props;
  const cardsEnabled = settings?.cardsEnabled ?? true;
  const hiddenBlocks = new Set(settings?.hiddenBlocks ?? []);
  const today = cash.today;

  const insights = React.useMemo(
    () =>
      buildInsights({
        snapshot: cash,
        history: props.history,
        occurrences: props.picture.occurrences,
        entries: base.entries,
        categories: props.categories,
        goals: base.goals,
        debts: base.debts,
        cards: base.cards,
        subscriptions: base.subscriptions,
        transfers: base.transfers,
        cardsEnabled,
      }),
    [cash, props.history, props.picture.occurrences, base, props.categories, cardsEnabled],
  );

  if (!base.ready) return <InicioSkeleton />;

  const empty = !base.entries.length && !base.subscriptions.length && !base.debts.length;

  const blocks = {
    timeline: !hiddenBlocks.has('timeline') && !empty && (
      <UpcomingPanel key="timeline" {...props} />
    ),
    atencao: !hiddenBlocks.has('atencao') && insights.length > 0 && (
      <AttentionPanel key="atencao" insights={insights} onGo={onGo} />
    ),
    acoes: !hiddenBlocks.has('acoes') && <QuickActions key="acoes" cardsEnabled={cardsEnabled} onQuick={props.onQuick} onGo={onGo} />,
    saude: !hiddenBlocks.has('saude') && !empty && <HealthPanel key="saude" cash={cash} hidden={hidden} />,
    resumo: !hiddenBlocks.has('resumo') && !empty && <MonthSummaryPanel key="resumo" summary={props.picture.summary} hidden={hidden} onGo={onGo} />,
    news: !hiddenBlocks.has('news') && (settings?.newsEnabled ?? true) && (
      <Panel key="news" className="p-5">
        <SectionTitle action={<LinkButton onClick={() => onGo({ view: 'news' })}>Ver tudo</LinkButton>}>Notícias</SectionTitle>
        <NewsList limit={3} />
      </Panel>
    ),
  };

  return (
    <div className="pb-4">
      <Greeting name={props.name} today={today} />

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="grid gap-4">
          <MainCard {...props} />
          {empty ? <FirstSteps onQuick={props.onQuick} onGo={onGo} /> : null}
          {!empty && !hiddenBlocks.has('cobertura') ? <Coverage {...props} /> : null}
          {blocks.timeline}
          <div className="grid gap-4 lg:hidden">
            {blocks.atencao}
            {blocks.acoes}
            {blocks.saude}
          </div>
          {blocks.resumo}
        </div>
        <div className="hidden gap-4 lg:grid">
          {blocks.atencao}
          {blocks.saude}
          {blocks.acoes}
          {blocks.news}
        </div>
        <div className="grid gap-4 lg:hidden">{blocks.news}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ saudação */

function Greeting({ name, today }: { name: string; today: string }) {
  const hasName = name && name !== 'você';
  return (
    <header className="pt-2 lg:pt-8">
      <p className="text-[13px] text-ink-3">{capitalize(formatDateFull(today).replace(/ de \d{4}$/, ''))}</p>
      <h1 className="mt-1 font-display text-[30px] leading-tight text-ink sm:text-[34px]">
        {greetingFor()}
        {hasName ? `, ${name}` : ''}.
      </h1>
      <p className="mt-0.5 text-[15px] text-ink-2">Veja como está sua vida financeira hoje.</p>
    </header>
  );
}

/* -------------------------------------------------------------- card principal */

const MODES: { id: CardMode; label: string }[] = [
  { id: 'salario', label: 'Até receber' },
  { id: 'agora', label: 'Agora' },
  { id: 'fim', label: 'Fim do mês' },
  { id: 'patrimonio', label: 'Patrimônio' },
];

const HEADLINE_STYLE = {
  positive: { box: 'bg-in-soft text-in', icon: ThumbsUp },
  warning: { box: 'bg-warn-soft text-warn', icon: AlertTriangle },
  critical: { box: 'bg-out-soft text-out', icon: CircleAlert },
  neutral: { box: 'bg-surface-2 text-ink-2', icon: Info },
} as const;

function MainCard({ spaceId, base, cash, settings, hidden, onGo }: InicioProps) {
  const [mode, setMode] = React.useState<CardMode>(cash.nextIncome ? 'salario' : 'fim');
  const [adjusting, setAdjusting] = React.useState(false);
  const cardsEnabled = settings?.cardsEnabled ?? true;
  const line = headline(cash);
  const Style = HEADLINE_STYLE[line.tone];

  const wealth = React.useMemo(
    () =>
      mode === 'patrimonio'
        ? wealthNow(ledgerInput(base, cardsEnabled, cash.today), base.assets)
        : null,
    [mode, base, cash, cardsEnabled],
  );

  const income = cash.nextIncome;
  const view = {
    salario: {
      label: income ? 'Disponível até o próximo recebimento' : 'Disponível até o fim do mês',
      value: income ? cash.safeUntilIncome : cash.safeUntilMonthEnd,
    },
    agora: { label: 'Saldo agora', value: cash.balanceNow },
    fim: { label: 'Saldo previsto no fim do mês', value: cash.endOfMonth },
    patrimonio: { label: 'Patrimônio líquido', value: wealth?.net ?? 0 },
  }[mode];

  const short = mode === 'salario' && view.value < 0;

  return (
    <Panel className="overflow-hidden p-0">
      <div className="px-5 pb-5 pt-4">
        {/* cada aba do tamanho do próprio nome: em 375 px, colunas iguais cortavam "Até receber" */}
        <div className="-mx-1 mb-3 flex gap-1 rounded-full bg-surface-2 p-1" role="tablist" aria-label="O que mostrar">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                'h-8 min-w-0 flex-auto truncate whitespace-nowrap rounded-full px-1.5 text-[12px] font-medium transition-colors max-[360px]:px-0.5 max-[360px]:text-[11px] sm:text-[12.5px]',
                mode === m.id ? 'bg-ink text-canvas shadow-e1' : 'text-ink-3 hover:text-ink-2',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <p className="text-[13px] text-ink-3">{view.label}</p>
        <p className={cn('amount mt-1.5 text-[46px] sm:text-[52px]', short || view.value < 0 ? 'text-out' : 'text-ink')}>
          <Money value={view.value} hidden={hidden} animate />
        </p>

        {mode === 'salario' ? (
          <div className="mt-3 grid gap-1 text-[14px] text-ink-2">
            {income ? (
              <p>
                Próximo recebimento{' '}
                <strong className="font-medium text-ink">
                  {cash.daysToNextIncome === 1 ? 'amanhã' : `em ${cash.daysToNextIncome} dias`}
                </strong>{' '}
                · {income.label}, {formatDayShort(income.date)}
              </p>
            ) : (
              <p>Nenhum recebimento previsto nos próximos 60 dias.</p>
            )}
            {short ? (
              <p className="text-out">
                Faltam <Money value={-view.value} hidden={hidden} /> para cobrir as contas até lá.
              </p>
            ) : null}
            <p>
              Saldo previsto no fim do mês: <Money value={cash.endOfMonth} hidden={hidden} className="font-medium text-ink" />
            </p>
          </div>
        ) : mode === 'agora' ? (
          <p className="mt-3 text-[14px] text-ink-2">
            O que entrou menos o que saiu até hoje, contando o saldo do mês anterior.
          </p>
        ) : mode === 'fim' ? (
          <p className="mt-3 text-[14px] text-ink-2">
            Com tudo o que ainda vai entrar e sair — contas, faturas, assinaturas e parcelas.
          </p>
        ) : wealth ? (
          <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
            <p className="text-ink-3">
              Você tem
              <Money value={wealth.assetsTotal} hidden={hidden} className="block text-[15px] font-semibold text-ink" />
            </p>
            <p className="text-ink-3">
              Você deve
              <Money value={wealth.liabilitiesTotal} hidden={hidden} className="block text-[15px] font-semibold text-ink" />
            </p>
            <button type="button" onClick={() => onGo({ view: 'patrimonio' })} className="col-span-2 flex items-center gap-1 text-left text-[13px] font-medium text-accent">
              Ver seu patrimônio <ArrowRight size={14} />
            </button>
          </div>
        ) : null}
      </div>

      <div className={cn('flex items-start gap-3 px-5 py-3.5', Style.box)}>
        <Style.icon size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p className="text-[14px] font-medium leading-snug">{line.text}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-2.5">
        <p className="text-[12px] text-ink-3">
          {cash.hasOpening ? 'Calculado com o que você lançou.' : 'Falta o saldo com que o mês começou.'}
        </p>
        <button
          type="button"
          onClick={() => setAdjusting(true)}
          className="h-9 rounded-field px-2 text-[13px] font-medium text-accent hover:bg-accent-soft"
        >
          {cash.hasOpening ? 'Não bate com o banco? Ajustar' : 'Informar saldo'}
        </button>
      </div>

      <AdjustBalanceSheet open={adjusting} onClose={() => setAdjusting(false)} spaceId={spaceId} cash={cash} base={base} cardsEnabled={settings?.cardsEnabled ?? true} />
    </Panel>
  );
}

/**
 * "Quanto você tem hoje na conta?"
 *
 * A resposta vira o saldo com que o mês começou, calculado de trás para a
 * frente: saldo informado menos tudo que já entrou e saiu no mês. Assim o
 * saldo de hoje bate com o banco e o resto do mês continua como foi lançado.
 */
function AdjustBalanceSheet({
  open,
  onClose,
  spaceId,
  cash,
  base,
  cardsEnabled,
}: {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  cash: CashSnapshot;
  base: FinanceBase;
  cardsEnabled: boolean;
}) {
  const [text, setText] = React.useState('');
  const [negativeSign, setNegativeSign] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [accountId, setAccountId] = React.useState<string>('');

  // o saldo de cada conta hoje, pelo mesmo livro-caixa do resto do app
  const rows = React.useMemo(
    () => balancesAt(ledgerInput(base, cardsEnabled, cash.today), cash.today).accounts.filter((r) => !r.account.archived),
    [base, cardsEnabled, cash.today],
  );
  const chosen = rows.find((r) => r.account.id === accountId) ?? rows.find((r) => r.account.primary) ?? rows[0];

  async function save() {
    const trimmed = text.trim();
    const negative = negativeSign || /^-|^−/.test(trimmed);
    const parsed = parseMoney(trimmed.replace(/^[-−]/, ''));
    if (parsed === null) return setError('Digite o saldo, por exemplo 1.250,00 ou -80,00.');
    const real = negative ? -parsed : parsed;
    const result = await setBalance({ spaceId, accountId: chosen?.account.id ?? null, balance: real, date: cash.today });
    toast(
      result.kind === 'opening'
        ? 'Saldo informado. A conta parte deste valor.'
        : result.kind === 'none'
          ? 'Já batia: nada a ajustar.'
          : `Ajuste de ${formatMoney(Math.abs(result.diff))} registrado para bater com o banco.`,
    );
    setText('');
    setError(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Quanto você tem hoje na conta?"
      description="O saldo que o banco mostra agora. Se a conta já tem histórico, a diferença vira um ajuste visível — nenhum lançamento é alterado."
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={() => void save()}>
          Conferir saldo
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="grid gap-3"
      >
        {rows.length > 1 ? (
          <Field label="Conta" htmlFor="adjust-account">
            <Select id="adjust-account" value={chosen?.account.id ?? ''} onChange={(e) => setAccountId(e.target.value)}>
              {rows.map((r) => (
                <option key={r.account.id} value={r.account.id}>
                  {r.account.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <SignToggle negative={negativeSign} onChange={setNegativeSign} />
        <Field
          label="Saldo hoje"
          htmlFor="adjust-balance"
          error={error}
          hint={chosen ? `Hoje o app calcula ${formatMoney(chosen.balance)} nesta conta.` : undefined}
        >
          <Input
            id="adjust-balance"
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="tnum text-[20px] font-semibold"
          />
        </Field>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ o que vem */

function UpcomingPanel({ cash, categories, hidden, onGo, onOpenFlow }: InicioProps) {
  const today = cash.today;
  const until = addDaysIso(today, 14);
  const upcoming = cash.items.filter((i) => i.date >= today && i.date <= until && !(i.date === today && i.settled));
  const shown = upcoming.slice(0, 8);
  const holidays = holidaysBetween(today, shown.length ? shown[shown.length - 1].date : until);

  return (
    <Panel className="p-5">
      <SectionTitle action={<LinkButton onClick={() => onGo({ view: 'calendario' })}>Ver o mês</LinkButton>}>
        O que vem por aí
      </SectionTitle>
      {shown.length ? (
        <>
          <FlowTimeline
            items={shown}
            holidays={holidays}
            today={today}
            categories={categories}
            hidden={hidden}
            onOpen={onOpenFlow}
            dense
          />
          {upcoming.length > shown.length ? (
            <button
              type="button"
              onClick={() => onGo({ view: 'calendario' })}
              className="mt-1 flex h-9 items-center gap-1 text-[13px] font-medium text-accent"
            >
              Mais {upcoming.length - shown.length} nos próximos 14 dias <ArrowRight size={14} />
            </button>
          ) : null}
        </>
      ) : (
        <p className="py-4 text-[14px] text-ink-3">Nada previsto para os próximos 14 dias.</p>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- atenção */

const SEVERITY: Record<Severity, { icon: typeof Info; tone: string; label: string }> = {
  critical: { icon: CircleAlert, tone: 'text-out bg-out-soft', label: 'Urgente' },
  warning: { icon: AlertTriangle, tone: 'text-warn bg-warn-soft', label: 'Atenção' },
  info: { icon: Info, tone: 'text-accent bg-accent-soft', label: 'Aviso' },
  positive: { icon: Sparkles, tone: 'text-in bg-in-soft', label: 'Boa notícia' },
};

function AttentionPanel({ insights, onGo }: { insights: Insight[]; onGo: (route: Route) => void }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? insights : insights.slice(0, 4);

  return (
    <Panel className="p-5">
      <SectionTitle>O que merece sua atenção</SectionTitle>
      <ul className="grid gap-3">
        {shown.map((i) => {
          const s = SEVERITY[i.severity];
          return (
            <li key={i.id} className="flex gap-3">
              <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', s.tone)}>
                <s.icon size={15} aria-hidden />
                <span className="sr-only">{s.label}:</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium leading-snug text-ink">{i.title}</p>
                {i.detail ? <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{i.detail}</p> : null}
                {i.action ? (
                  <button
                    type="button"
                    onClick={() => onGo(i.action!.route)}
                    className="mt-1 inline-flex h-8 items-center gap-1 rounded-field text-[13px] font-medium text-accent hover:underline"
                  >
                    {i.action.label} <ArrowRight size={13} />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {insights.length > 4 ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 h-9 text-[13px] font-medium text-ink-3 hover:text-ink">
          {all ? 'Mostrar menos' : `Ver todos (${insights.length})`}
        </button>
      ) : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------- saúde */

function HealthPanel({ cash, hidden }: { cash: CashSnapshot; hidden: boolean }) {
  const h = monthHealth(cash);
  const [why, setWhy] = React.useState(false);
  const tone = h.status === 'ok' ? 'in' : h.status === 'attention' ? 'warn' : h.status === 'critical' ? 'out' : 'neutral';

  return (
    <Panel className="p-5">
      <SectionTitle>Saúde do mês</SectionTitle>
      {h.score === null ? (
        <p className="text-[14px] leading-relaxed text-ink-2">
          <strong className="font-medium text-ink">{h.title}.</strong> {h.explanation}
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-center gap-2 text-[16px] font-semibold text-ink">
              {h.status !== 'ok' ? <AlertTriangle size={16} className={tone === 'out' ? 'text-out' : 'text-warn'} aria-hidden /> : null}
              {h.title}
            </p>
            <p className="tnum text-[15px] font-semibold text-ink-2">{h.score}%</p>
          </div>
          <Meter value={h.score / 100} tone={tone} label="Saúde do mês" valueText={`${h.score} de 100, ${h.title}`} className="mt-2.5" />
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{hidden ? h.explanation.replace(/R\$\s?[\d.,]+/g, '••••') : h.explanation}</p>
          {h.factors.length ? (
            <>
              <button
                type="button"
                onClick={() => setWhy((v) => !v)}
                aria-expanded={why}
                className="mt-2 h-8 text-[13px] font-medium text-accent"
              >
                {why ? 'Esconder o porquê' : 'Por que esse número?'}
              </button>
              {why ? (
                <ul className="mt-1 grid gap-1.5 rounded-card bg-surface-2 p-3">
                  {h.factors.map((f) => (
                    <li key={f.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="text-ink-2">{f.label}</span>
                      <span className={cn('tnum shrink-0 font-semibold', f.impact < 0 ? 'text-out' : 'text-in')}>
                        {f.impact > 0 ? '+' : ''}
                        {f.impact}
                      </span>
                    </li>
                  ))}
                  <li className="border-t border-line pt-1.5 text-[12px] text-ink-3">Começa em 100 e cada fator soma ou subtrai.</li>
                </ul>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- ações rápidas */

function QuickActions({
  cardsEnabled,
  onQuick,
  onGo,
}: {
  cardsEnabled: boolean;
  onQuick: (request: QuickAddRequest) => void;
  onGo: (route: Route) => void;
}) {
  const actions: { label: string; icon: typeof Plus; run: () => void; tone?: string }[] = [
    { label: 'Registrar gasto', icon: Minus, run: () => onQuick({ kind: 'out' }), tone: 'text-out' },
    { label: 'Receita', icon: Plus, run: () => onQuick({ kind: 'in' }), tone: 'text-in' },
    ...(cardsEnabled ? [{ label: 'Compra no cartão', icon: CreditCard, run: () => onQuick({ kind: 'card' }) }] : []),
    { label: 'Investimento', icon: TrendingUp, run: () => onQuick({ kind: 'invest' }), tone: 'text-inv' },
    { label: 'Aporte em meta', icon: Target, run: () => onQuick({ kind: 'goal' }) },
    { label: 'Importar extrato', icon: FileUp, run: () => onGo({ view: 'importar' }) },
    { label: 'Boleto ou Pix', icon: ScanLine, run: () => onQuick({ kind: 'out', scan: true }) },
    { label: 'Registrar dívida', icon: Receipt, run: () => onGo({ view: 'dividas', param: 'novo' }) },
  ];

  return (
    <Panel className="p-5">
      <SectionTitle>Ações rápidas</SectionTitle>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {actions.map((a) => (
          <li key={a.label}>
            <button
              type="button"
              onClick={a.run}
              className="flex min-h-12 w-full items-center gap-2.5 rounded-field border border-line px-3 py-2 text-left text-[13px] font-medium leading-tight text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <a.icon size={16} className={cn('shrink-0', a.tone ?? 'text-accent')} aria-hidden />
              <span className="min-w-0">{a.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------- resumo do mês */

function MonthSummaryPanel({ summary, hidden, onGo }: { summary: MonthSummary; hidden: boolean; onGo: (route: Route) => void }) {
  const items: { label: string; value: Cents; tone: string; param: string }[] = [
    { label: 'Entradas', value: summary.income, tone: 'text-in', param: 'entradas' },
    { label: 'Saídas', value: summary.expense, tone: 'text-out', param: 'saidas' },
    { label: 'Investido', value: summary.invested, tone: 'text-inv', param: 'investimentos' },
  ];
  return (
    <Panel className="p-5">
      <SectionTitle action={<LinkButton onClick={() => onGo({ view: 'movimentos' })}>Movimentos</LinkButton>}>
        Como está seu mês
      </SectionTitle>
      <dl className="grid grid-cols-3 gap-2">
        {items.map((i) => (
          <button
            key={i.label}
            type="button"
            onClick={() => onGo({ view: 'movimentos', param: i.param })}
            className="rounded-field bg-surface-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
          >
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">{i.label}</dt>
            <dd className={cn('tnum mt-1 text-[13.5px] font-semibold leading-tight sm:text-[15px]', i.tone)}>
              {formatMoney(i.value, { hidden, compact: true })}
            </dd>
          </button>
        ))}
      </dl>
    </Panel>
  );
}

/* ------------------------------------------------------------ mês completo */

interface CoverageItem {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  action?: { label: string; run: () => void };
  secondary?: { label: string; run: () => void };
}

/**
 * O que falta para os números do mês serem de verdade.
 *
 * O saldo previsto é tão bom quanto o que entrou: sem o saldo de hoje ele
 * parte de zero; sem a fatura, as compras do cartão não existem; sem a renda,
 * não há "até o próximo recebimento". Cada item diz o que falta e leva direto
 * para onde se resolve. Some sozinho quando está tudo lá.
 */
function Coverage({ spaceId, base, cash, settings, onGo, onQuick }: InicioProps) {
  const [adjusting, setAdjusting] = React.useState(false);
  const today = cash.today;
  const since = (days: number) => addDaysIso(today, -days);
  const live = base.entries.filter((e) => !e.deletedAt && !e.tags.includes('saldo-anterior'));
  const cardsEnabled = settings?.cardsEnabled ?? true;
  const cards = base.cards.filter((c) => !c.archived && !c.deletedAt);

  const items: CoverageItem[] = [
    {
      id: 'saldo',
      title: 'Saldo de hoje',
      detail: cash.hasOpening ? 'Informado: o saldo parte do valor do banco.' : 'Sem ele, o saldo parte de zero e não bate com o banco.',
      done: cash.hasOpening,
      action: { label: 'Informar', run: () => setAdjusting(true) },
    },
    (() => {
      const recent = live.filter((e) => !e.cardId && e.repeat.kind === 'once' && e.date >= since(30) && e.date <= today);
      return {
        id: 'conta',
        title: 'Movimentos da conta',
        detail: recent.length
          ? `${recent.length} ${recent.length === 1 ? 'lançamento' : 'lançamentos'} nos últimos 30 dias.`
          : 'Nada nos últimos 30 dias. O extrato traz o mês de uma vez.',
        done: recent.length > 0,
        action: { label: 'Importar extrato', run: () => onGo({ view: 'importar' }) },
      };
    })(),
  ];

  if (cardsEnabled && !cards.length) {
    items.push({
      id: 'cartao',
      title: 'Cartão de crédito',
      detail: 'Se você usa, cadastre para as compras caírem na fatura certa e o limite aparecer.',
      done: false,
      action: { label: 'Cadastrar e importar', run: () => onGo({ view: 'importar', param: 'novo' }) },
      secondary: settings ? { label: 'Não uso', run: () => void putRecord('settings', { ...settings, cardsEnabled: false }) } : undefined,
    });
  }
  if (cardsEnabled) {
    for (const card of cards) {
      const purchases = live.filter((e) => e.cardId === card.id && e.date >= since(35) && e.date <= today);
      const last = purchases.reduce<string | null>((m, e) => (!m || e.date > m ? e.date : m), null);
      const name = card.name || card.institution || 'cartão';
      items.push({
        id: `fatura-${card.id}`,
        title: `Fatura do ${name}`,
        detail: last ? `Compras até ${formatDayShort(last)}.` : 'Nenhuma compra nos últimos 35 dias. Importe a fatura atual.',
        done: Boolean(last),
        action: { label: 'Importar fatura', run: () => onGo({ view: 'importar', param: card.id }) },
      });
      if (!card.limit) {
        items.push({
          id: `limite-${card.id}`,
          title: `Limite do ${name}`,
          detail: 'Sem ele, o app não mostra quanto do limite já está comprometido.',
          done: false,
          action: { label: 'Informar', run: () => onGo({ view: 'cartoes' }) },
        });
      }
    }
  }
  const income = live.some((e) => e.kind === 'in' && (e.repeat.kind !== 'once' || e.date >= since(35)));
  items.push({
    id: 'renda',
    title: 'Renda do mês',
    detail: income ? 'Registrada: o app sabe quando entra dinheiro.' : 'Sem ela, não há "até o próximo recebimento".',
    done: income,
    action: { label: 'Registrar', run: () => onQuick({ kind: 'in' }) },
  });

  const pending = items.filter((i) => !i.done);
  if (!pending.length) return null;
  const doneCount = items.length - pending.length;

  const hide = () => {
    if (!settings) return;
    const next = new Set(settings.hiddenBlocks ?? []);
    next.add('cobertura');
    void putRecord('settings', { ...settings, hiddenBlocks: [...next] });
    toast('Pronto. Dá para trazer de volta em Ajustes → O que aparece no Início.');
  };

  return (
    <Panel className="p-5">
      <SectionTitle
        action={
          <button type="button" onClick={hide} className="h-8 rounded-field px-1 text-[12.5px] font-medium text-ink-3 hover:text-ink">
            Esconder
          </button>
        }
      >
        Seu mês completo
      </SectionTitle>
      <p className="text-[13px] leading-relaxed text-ink-3">
        Os números só são tão bons quanto o que entrou. {doneCount} de {items.length} prontos.
      </p>
      <Meter value={doneCount / items.length} tone="in" label="Mês completo" valueText={`${doneCount} de ${items.length}`} className="mt-3" height={6} />
      <ul className="mt-3 divide-y divide-line">
        {[...pending, ...items.filter((i) => i.done)].map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full',
                item.done ? 'bg-in text-canvas' : 'border border-dashed border-line-strong',
              )}
              aria-hidden
            >
              {item.done ? <Check size={13} strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-[14px] font-medium', item.done ? 'text-ink-3' : 'text-ink')}>
                {item.title}
                <span className="sr-only">{item.done ? ' — pronto' : ' — falta'}</span>
              </span>
              <span className="block text-[12px] leading-relaxed text-ink-3">{item.detail}</span>
            </span>
            {!item.done ? (
              <span className="ml-9 flex gap-1.5 sm:ml-0">
                {item.secondary ? (
                  <Button size="sm" variant="quiet" onClick={item.secondary.run}>
                    {item.secondary.label}
                  </Button>
                ) : null}
                {item.action ? (
                  <Button size="sm" onClick={item.action.run}>
                    {item.action.label}
                  </Button>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <AdjustBalanceSheet open={adjusting} onClose={() => setAdjusting(false)} spaceId={spaceId} cash={cash} base={base} cardsEnabled={settings?.cardsEnabled ?? true} />
    </Panel>
  );
}

/* --------------------------------------------------------------- primeiros passos */

function FirstSteps({ onQuick, onGo }: { onQuick: (r: QuickAddRequest) => void; onGo: (route: Route) => void }) {
  return (
    <Panel className="p-2">
      <EmptyState
        icon={<CalendarDays size={22} />}
        title="Seu mês ainda está em branco"
        description="Traga o extrato do banco para o mês aparecer de uma vez, ou comece pelo salário e pelas contas fixas."
        action={
          <>
            <Button variant="primary" onClick={() => onGo({ view: 'importar' })}>
              <FileUp size={16} /> Importar extrato
            </Button>
            <Button onClick={() => onQuick({ kind: 'in' })}>
              <Plus size={16} /> Lançar o salário
            </Button>
          </>
        }
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ peças */

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1 rounded-field px-1 text-[12.5px] font-medium text-accent hover:underline">
      {children} <ArrowRight size={13} />
    </button>
  );
}

function InicioSkeleton() {
  return (
    <div role="status" aria-label="Carregando seu mês" className="grid gap-4 pt-4 lg:pt-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Skeleton className="h-[260px] rounded-panel" />
          <Skeleton className="h-[220px] rounded-panel" />
        </div>
        <div className="hidden gap-4 lg:grid">
          <Skeleton className="h-[200px] rounded-panel" />
          <Skeleton className="h-[160px] rounded-panel" />
        </div>
      </div>
    </div>
  );
}
