'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  CalendarClock,
  Check,
  CreditCard,
  Flag,
  Goal,
  House,
  Landmark,
  Layers,
  PiggyBank,
  Receipt,
  Repeat,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Reveal, useCountTo, useScrollVar } from '@/components/motion';
import { PuzzlePiece, type PieceTone } from '@/components/pieces';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { Marca } from './chrome';
import { Connector, CtaGroup, FinancialCard, InsightCard, PinnedScene, StoryHeading, TimelineEvent } from './story';

/**
 * A história da vitrine, em cenas.
 *
 * Caos, informação, organização, contexto, plano, controle: cada cena
 * responde uma pergunta (a regra do §46 do briefing) e mostra a interface de
 * verdade — os mesmos cartões, peças e frases que o app usa. Os números são
 * exemplos e fecham entre si, cena a cena:
 *
 * - o topo e o problema: 4.200 − 1.500 − 980 − 620 − 180 − 420 = 500;
 * - o mês: 649 − 240 = 409 − 29 = 380 (o menor ponto) + 4.200 = 4.580 − 1.240 = 3.340;
 * - a leitura: a fatura de 1.240 é 23% maior que a média de 1.008, e 620 dela
 *   (metade) são parcelas antigas — o que faz o app dizer que elas seguram a fatura;
 * - o plano: 4.200 − 3.700 = 500 = 300 para a reserva + 200 para a viagem de 2.400 (12 meses).
 *
 * As frases entre aspas são as que o app escreve nas mesmas situações.
 */

const brl = (cents: number, signed = false) => formatMoney(cents, { signed });

/* ================================================================ 1 · topo */

interface BoardPiece {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: PieceTone;
  /** o lugar espalhado: deslocamento e giro antes de encaixar — sempre para dentro do quadro, nunca para fora da tela */
  dx: number;
  dy: number;
  r: number;
}

/** saldo 4.200 − contas 1.920 − fatura 980 − assinaturas 180 − parcelas 620 = 500 disponíveis */
const BOARD: BoardPiece[] = [
  { icon: Wallet, label: 'Saldo', value: brl(4_200_00), detail: 'hoje, na conta', tone: 'neutral', dx: 22, dy: 16, r: -8 },
  { icon: TrendingUp, label: 'Receitas', value: brl(4_200_00, true), detail: 'salário, dia 5', tone: 'in', dx: -30, dy: 6, r: 7 },
  { icon: Receipt, label: 'Contas', value: brl(-1_920_00), detail: 'aluguel, luz, internet', tone: 'out', dx: 36, dy: -8, r: 5 },
  { icon: CreditCard, label: 'Cartões', value: brl(-980_00), detail: 'fatura, dia 12', tone: 'out', dx: -18, dy: 14, r: -6 },
  { icon: Repeat, label: 'Assinaturas', value: brl(-180_00), detail: '4 serviços', tone: 'warn', dx: 12, dy: 22, r: -5 },
  { icon: Layers, label: 'Dívidas', value: brl(-620_00), detail: 'parcelas do mês', tone: 'warn', dx: -40, dy: -6, r: 8 },
  { icon: Target, label: 'Metas', value: 'Viagem · 25%', detail: 'R$ 600 de R$ 2.400', tone: 'accent', dx: 30, dy: -14, r: 6 },
  { icon: Landmark, label: 'Patrimônio', value: brl(18_400_00), detail: 'o que tem menos o que deve', tone: 'inv', dx: -24, dy: 18, r: -7 },
];

export function Hero() {
  const ref = React.useRef<HTMLElement>(null);
  useScrollVar(ref, 'exit');
  return (
    <header ref={ref} className="relative overflow-hidden px-5 pb-16 pt-28 sm:pb-24 sm:pt-32">
      <span
        aria-hidden
        className="pointer-events-none absolute right-[-12rem] top-0 -z-10 size-[42rem] rounded-full opacity-[0.13] blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 66%)' }}
      />
      <div className="mx-auto grid max-w-[72rem] items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
        <div>
          <Reveal as="p" variant="fade" className="text-[15px] text-ink-2">
            Você sabe quanto tem hoje. <span className="text-ink">Mas sabe quanto pode gastar até o fim do mês?</span>
          </Reveal>
          <h1 className="mt-4 font-display text-[44px] leading-[1.02] tracking-[-0.015em] text-ink motion-safe:animate-[rise-in_640ms_var(--ease-out)_both] sm:text-[64px]">
            Saiba quanto sobra <span className="text-accent">antes</span> do mês acabar.
          </h1>
          <Reveal as="p" index={2} className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-ink-2">
            Não basta saber quanto você tem hoje. O FinanceOS mostra o que já aconteceu, o que ainda vai acontecer e quanto
            realmente está disponível.
          </Reveal>
          <Reveal index={3}>
            <CtaGroup className="mt-8" />
          </Reveal>
          <Reveal as="p" index={4} className="mt-5 text-[13px] text-ink-3">
            Grátis · sem senha de banco · funciona sem internet. A conta é opcional.
          </Reveal>
        </div>

        <HeroBoard />
      </div>
    </header>
  );
}

/**
 * As peças do mês, espalhadas, que se organizam enquanto o topo sobe.
 *
 * O lugar final de cada peça é o do grid; o espalhado é só um transform lido
 * de --p (useScrollVar, modo exit). No meio, a pergunta vira a resposta.
 */
function HeroBoard() {
  return (
    <figure className="relative">
      <figcaption className="sr-only">
        Exemplo do FinanceOS: saldo de {brl(4_200_00)} hoje. Ainda saem {brl(1_920_00)} em contas, {brl(980_00)} de fatura,{' '}
        {brl(180_00)} de assinaturas e {brl(620_00)} de parcelas. Disponível de verdade até o próximo salário: {brl(500_00)}.
      </figcaption>
      <div aria-hidden className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {BOARD.slice(0, 2).map((p, i) => (
          <BoardCell key={p.label} piece={p} index={i} />
        ))}
        <div className="relative col-span-2 min-h-[118px] sm:min-h-[132px]">
          <div
            className="submerge absolute inset-0 grid place-items-center rounded-panel border border-dashed border-line-strong text-center"
            style={{ '--s': 0.2, '--l': 0.35 } as React.CSSProperties}
          >
            <p className="px-4 font-display text-[24px] leading-tight text-ink-2 sm:text-[28px]">Quanto sobra de verdade?</p>
          </div>
          <div
            className="emerge absolute inset-0 flex flex-col justify-center rounded-panel border border-accent/40 bg-surface px-5 shadow-e3"
            style={{ '--s': 0.35, '--l': 0.4 } as React.CSSProperties}
          >
            <p className="text-[13px] text-ink-3">Disponível até o salário</p>
            <p className="amount mt-1 text-[40px] leading-none text-ink sm:text-[46px]">{brl(500_00)}</p>
            <p className="mt-2 text-[12.5px] text-in">Nenhuma conta fica descoberta até o próximo recebimento.</p>
          </div>
        </div>
        {BOARD.slice(2).map((p, i) => (
          <BoardCell key={p.label} piece={p} index={i + 2} />
        ))}
      </div>
    </figure>
  );
}

function BoardCell({ piece, index }: { piece: BoardPiece; index: number }) {
  return (
    <div
      className="assemble"
      style={{ '--dx': `${piece.dx}px`, '--dy': `${piece.dy}px`, '--r': `${piece.r}deg`, '--s': index * 0.035, '--l': 0.55 } as React.CSSProperties}
    >
      <Reveal variant="scale" index={index}>
        <div className="float" style={{ animationDelay: `${-index * 0.7}s` }}>
          <PuzzlePiece icon={piece.icon} label={piece.label} value={piece.value} detail={piece.detail} tone={piece.tone} />
        </div>
      </Reveal>
    </div>
  );
}

/* ============================================================ 2 · o problema */

const COMMITMENTS = [
  { icon: '🏠', name: 'Aluguel', when: 'dia 10', value: -1_500_00 },
  { icon: '💳', name: 'Cartão', when: 'fatura do dia 12', value: -980_00 },
  { icon: '💻', name: 'Parcelas', when: 'notebook e celular', value: -620_00 },
  { icon: '🎬', name: 'Assinaturas', when: '4 serviços', value: -180_00 },
  { icon: '💡', name: 'Contas', when: 'luz, água, internet', value: -420_00 },
] as const;
const BALANCE = 4_200_00;
const FREE = COMMITMENTS.reduce((t, c) => t + c.value, BALANCE);

export function ProblemScene() {
  return (
    <PinnedScene id="problema" labelledBy="problema-titulo" steps={COMMITMENTS.length + 1}>
      {(step) => <ProblemStage step={step} />}
    </PinnedScene>
  );
}

function ProblemStage({ step }: { step: number }) {
  const entered = Math.min(step, COMMITMENTS.length);
  const done = step > COMMITMENTS.length;
  const shown = useCountTo(COMMITMENTS.slice(0, entered).reduce((t, c) => t + c.value, BALANCE), 480);
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16">
      <StoryHeading
        id="problema-titulo"
        eyebrow="O problema"
        lead={
          <>
            {brl(BALANCE)} na conta parece confortável. <span className="max-sm:hidden">Mas parte desse dinheiro já tem dono — e o banco não mostra quanto.</span>
          </>
        }
      >
        Seu saldo não conta a história inteira.
      </StoryHeading>

      <FinancialCard>
        <p className="sr-only">
          Exemplo: {brl(BALANCE)} no banco. Ainda vão sair aluguel, cartão, parcelas, assinaturas e contas. Disponível de verdade: {brl(FREE)}.
        </p>
        <div aria-hidden>
          <div className="flex items-baseline justify-between gap-3 px-5 pb-3.5 pt-4">
            <span className="text-[13px] text-ink-3">Hoje, no banco</span>
            <span className="amount text-[28px] text-ink">{brl(BALANCE)}</span>
          </div>
          <div className="border-t border-line px-5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Mas ainda vão sair</p>
            <ul className="mt-1">
              {COMMITMENTS.map((c, i) => (
                <li
                  key={c.name}
                  data-on={i < entered ? '' : undefined}
                  className={cn('step flex items-center gap-3 py-2', i < COMMITMENTS.length - 1 && 'border-b border-line')}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px]">{c.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">{c.name}</span>
                    <span className="block truncate text-[12px] text-ink-3">{c.when}</span>
                  </span>
                  <span className="tnum shrink-0 whitespace-nowrap text-[14px] font-medium text-out">{brl(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className={cn(
              'border-t px-5 py-4 transition-colors duration-[var(--t-slow)]',
              done ? 'border-accent/40 bg-accent-soft' : 'border-line',
            )}
          >
            <p className="text-[14px] font-medium text-ink">Quanto realmente está disponível?</p>
            <p className={cn('amount mt-1 text-[40px] leading-none transition-colors duration-[var(--t-slow)]', done ? 'text-accent' : 'text-ink-2')}>{brl(shown)}</p>
          </div>
        </div>
      </FinancialCard>
    </div>
  );
}

/* ================================================================ 3 · o mês */

const TODAY_BALANCE = 649_00;
const EVENTS = [
  { date: '25 set', weekday: 'sex', label: 'Mercado', icon: '🛒', value: -240_00 },
  { date: '27 set', weekday: 'dom', label: 'Assinatura', icon: '🎧', value: -29_00 },
  { date: '30 set', weekday: 'qua', label: 'Salário', icon: '💼', value: 4_200_00 },
  { date: '03 out', weekday: 'sáb', label: 'Fatura', icon: '💳', value: -1_240_00 },
] as const;
const RUNNING = EVENTS.reduce<number[]>((acc, e) => [...acc, (acc[acc.length - 1] ?? TODAY_BALANCE) + e.value], []);
/** o menor saldo antes do salário: o dia que o app avisa com antecedência */
const LOW_INDEX = RUNNING.slice(0, 2).indexOf(Math.min(...RUNNING.slice(0, 2)));

export function MonthScene() {
  return (
    <PinnedScene id="mes" labelledBy="mes-titulo" steps={EVENTS.length + 1}>
      {(step) => <MonthStage step={step} />}
    </PinnedScene>
  );
}

function MonthStage({ step }: { step: number }) {
  const entered = Math.min(step, EVENTS.length);
  const done = step > EVENTS.length;
  const shown = useCountTo(entered ? RUNNING[entered - 1] : TODAY_BALANCE, 420);
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16">
      <div>
        <StoryHeading
          id="mes-titulo"
          eyebrow="O mês"
          lead="Mercado, assinatura, salário, fatura: cada um cai num dia, e o saldo muda em cada um. O FinanceOS mostra esse caminho antes de você passar por ele."
        >
          Seu dinheiro não para no hoje.
        </StoryHeading>
        <p
          data-on={done ? '' : undefined}
          className="step mt-6 hidden max-w-[44ch] rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-[14.5px] leading-relaxed text-ink lg:block"
        >
          Dia 27 é o ponto mais baixo antes do salário: {brl(RUNNING[LOW_INDEX])}. Você fica sabendo hoje, dia 24 — três dias antes.
        </p>
      </div>

      <div>
        <div className="mb-4 flex items-baseline justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
          <span className="text-[13px] text-ink-3">{entered ? `Saldo previsto em ${EVENTS[entered - 1].date}` : 'Hoje, 24 set'}</span>
          <span className={cn('amount text-[26px]', entered - 1 === LOW_INDEX ? 'text-warn' : 'text-ink')}>{brl(shown)}</span>
        </div>
        <ol aria-label="Os próximos dias, com o saldo depois de cada um">
          {EVENTS.map((e, i) => (
            <TimelineEvent
              key={e.date}
              date={e.date}
              weekday={e.weekday}
              label={e.label}
              icon={e.icon}
              amount={brl(e.value, true)}
              balance={brl(RUNNING[i])}
              on={i < entered}
              low={i === LOW_INDEX && entered > i}
              last={i === EVENTS.length - 1}
            />
          ))}
        </ol>
        <p data-on={done ? '' : undefined} className="step mt-1 text-[13.5px] leading-relaxed text-warn lg:hidden">
          Dia 27 é o ponto mais baixo antes do salário: {brl(RUNNING[LOW_INDEX])}. Você fica sabendo três dias antes.
        </p>
      </div>
    </div>
  );
}

/* ======================================================= 4 · como funciona */

const CHAINS: { title: string; pieces: { icon: LucideIcon; label: string; value: string; tone: PieceTone }[] }[] = [
  {
    title: 'Uma compra parcelada',
    pieces: [
      { icon: CreditCard, label: 'Cartão', value: `${brl(360_00)} em 3x`, tone: 'out' },
      { icon: Receipt, label: 'Fatura', value: `${brl(120_00)} em cada uma`, tone: 'warn' },
      { icon: CalendarClock, label: 'Saldo futuro', value: 'cai em cada vencimento', tone: 'neutral' },
      { icon: Flag, label: 'Planejamento', value: 'o disponível já desconta', tone: 'accent' },
    ],
  },
  {
    title: 'Uma meta',
    pieces: [
      { icon: Goal, label: 'Meta', value: `Viagem · ${brl(2_400_00)}`, tone: 'accent' },
      { icon: PiggyBank, label: 'Aporte', value: `${brl(200_00)} por mês`, tone: 'in' },
      { icon: CalendarClock, label: 'Prazo', value: 'chega em 12 meses', tone: 'neutral' },
      { icon: Landmark, label: 'Patrimônio', value: 'cresce a cada aporte', tone: 'inv' },
    ],
  },
];

export function ConnectScene() {
  return (
    <section id="como-funciona" aria-labelledby="como-titulo" className="scroll-mt-20 px-5 py-20 sm:py-28">
      <div className="mx-auto max-w-[72rem]">
        <StoryHeading
          id="como-titulo"
          eyebrow="Como funciona"
          lead="Uma compra no cartão não é só uma compra: ela vira fatura, a fatura tira do saldo futuro, e o saldo futuro decide o que dá para planejar. O FinanceOS faz essas ligações sozinho."
        >
          Cada informação puxa a próxima.
        </StoryHeading>

        <div className="mt-12 grid gap-10">
          {CHAINS.map((chain) => (
            <Reveal key={chain.title} variant="fade">
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">{chain.title}</p>
              <div role="list" className="grid items-stretch sm:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem_minmax(0,1fr)]">
                {chain.pieces.map((p, i) => (
                  <React.Fragment key={p.label}>
                    {i > 0 ? <Connector responsive index={i} className="py-1 sm:py-0" /> : null}
                    <div role="listitem" className="reveal-child" style={{ '--reveal-delay': `${i * 140}ms` } as React.CSSProperties}>
                      <PuzzlePiece icon={p.icon} label={p.label} value={p.value} tone={p.tone} className="h-full" />
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal as="p" variant="fade" className="mt-10 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
          Tudo começa pelo extrato do banco — OFX, CSV, Excel ou QIF, lido no seu aparelho — ou por dois números digitados:
          quanto você tem hoje e quanto recebe.
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================ 5 · inteligência */

export function IntelligenceScene() {
  return (
    <PinnedScene id="inteligencia" labelledBy="inteligencia-titulo" steps={4}>
      {(step) => (
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)] lg:gap-16">
          <div>
            <StoryHeading
              id="inteligencia-titulo"
              eyebrow="Inteligência"
              lead="O FinanceOS lê os seus números e diz o que eles significam, com a conta à mostra. Tudo calculado no seu aparelho."
            >
              Não basta registrar.
            </StoryHeading>
            <p
              data-on={step >= 4 ? '' : undefined}
              className="step mt-6 hidden font-display text-[30px] leading-tight text-accent lg:block"
            >
              Agora você sabe o que está acontecendo.
            </p>
          </div>
          <div>
            <ul className="grid gap-3">
              <InsightCard icon={CreditCard} tone="warn" kicker="A fatura" on={step >= 1}>
                “A próxima fatura do Nubank, que vence 03 de out, está em {brl(1_240_00)}, 23% acima da média das anteriores ({brl(1_008_00)}).”
              </InsightCard>
              <InsightCard icon={Layers} tone="accent" kicker="O porquê" on={step >= 2}>
                “Dela, {brl(620_00)} são parcelas de compras antigas. As parcelas antigas são o que segura a fatura alta: mesmo sem compra nova, elas continuam vindo até acabar.”
              </InsightCard>
              <InsightCard icon={TrendingDown} tone="out" kicker="A previsão" on={step >= 3}>
                “Seu saldo previsto cai para {brl(380_00)} no dia 27.”
              </InsightCard>
            </ul>
            <p data-on={step >= 4 ? '' : undefined} className="step mt-5 font-display text-[26px] leading-tight text-accent lg:hidden">
              Agora você sabe o que está acontecendo.
            </p>
          </div>
        </div>
      )}
    </PinnedScene>
  );
}

const AREAS: { title: string; label: string; status: 'ok' | 'attention' }[] = [
  { title: 'Fluxo de caixa', label: 'sem conta descoberta', status: 'ok' },
  { title: 'Reserva', label: '0,8 mês', status: 'attention' },
  { title: 'Dívidas', label: '12% da renda', status: 'ok' },
  { title: 'Cartões', label: '62% do limite', status: 'attention' },
  { title: 'Metas', label: 'no ritmo', status: 'ok' },
];

/** o diagnóstico por área: o mesmo painel "Sua vida financeira" do Início */
export function DiagnosisBlock() {
  return (
    <section aria-labelledby="diagnostico-titulo" className="px-5 pb-20 sm:pb-28">
      <div className="mx-auto grid max-w-[72rem] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)] lg:gap-16">
        <div>
          <Reveal as="h3" id="diagnostico-titulo" className="max-w-[22ch] font-display text-[28px] leading-tight text-ink sm:text-[34px]">
            E o todo, área por área.
          </Reveal>
          <Reveal as="p" index={1} className="mt-3 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-2">
            Fluxo, reserva, dívidas, cartões, metas e patrimônio: cada área com o estado, o porquê em números e o próximo passo.
            Em vez de uma nota, a situação de cada área — com a confiança dos dados à vista.
          </Reveal>
        </div>
        <Reveal variant="scale">
          <FinancialCard className="p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-3">Sua vida financeira</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">Duas áreas pedem atenção: reserva e cartões.</p>
            <ul className="mt-3 grid gap-2">
              {AREAS.map((a) => (
                <li key={a.title} className="flex items-center justify-between gap-3 text-[14px]">
                  <span className="flex items-center gap-2 text-ink">
                    {a.status === 'ok' ? <Check size={15} className="text-in" aria-label="saudável" /> : <AlertTriangle size={15} className="text-warn" aria-label="pede atenção" />}
                    {a.title}
                  </span>
                  <span className={cn('text-[13px]', a.status === 'ok' ? 'text-ink-2' : 'text-warn')}>{a.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-2.5 text-[12px] text-ink-3">Dados com confiança alta · 92%</p>
          </FinancialCard>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================ 6 · planejamento */

const FLOW = [
  { label: 'Renda', value: brl(4_200_00), tone: 'text-in' },
  { label: 'Compromissos do mês', value: brl(-3_700_00), tone: 'text-out' },
  { label: 'Sobra', value: brl(500_00), tone: 'text-accent' },
] as const;

const GOALS = [
  { icon: '🎯', name: 'Reserva', detail: '6 meses de despesas', ratio: 0.2 },
  { icon: '✈️', name: 'Viagem', detail: `${brl(600_00)} de ${brl(2_400_00)}`, ratio: 0.25 },
  { icon: '🚗', name: 'Carro', detail: `${brl(2_400_00)} de ${brl(30_000_00)}`, ratio: 0.08 },
  { icon: '🏠', name: 'Casa', detail: `entrada: ${brl(3_000_00)} de ${brl(60_000_00)}`, ratio: 0.05 },
] as const;

export function PlanScene() {
  return (
    <section id="planejamento" aria-labelledby="plano-titulo" className="scroll-mt-20 border-t border-line bg-surface/40 px-5 py-20 sm:py-28">
      <div className="mx-auto max-w-[72rem]">
        <StoryHeading
          id="plano-titulo"
          eyebrow="Planejamento"
          lead="A sobra do mês vai para o que importa, na ordem de prioridade que você escolher. Quando duas metas não cabem juntas, o app mostra o conflito e três caminhos."
        >
          Dinheiro com destino chega mais longe.
        </StoryHeading>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
          {/* o caminho do dinheiro: renda → compromissos → sobra → reserva e meta → patrimônio */}
          <Reveal variant="fade">
            <ol aria-label="O caminho da renda até o patrimônio" className="grid">
              {FLOW.map((f, i) => (
                <li key={f.label}>
                  {i > 0 ? <Connector index={i} /> : null}
                  <div className="flex items-baseline justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
                    <span className="text-[14px] text-ink-2">{f.label}</span>
                    <span className={cn('tnum whitespace-nowrap text-[17px] font-semibold', f.tone)}>{f.value}</span>
                  </div>
                </li>
              ))}
              <li>
                <Connector index={3} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-card border border-line bg-surface px-3.5 py-3">
                    <p className="text-[12.5px] text-ink-3">🎯 Reserva</p>
                    <p className="tnum mt-0.5 whitespace-nowrap text-[15px] font-semibold text-ink">{brl(300_00)}/mês</p>
                  </div>
                  <div className="rounded-card border border-line bg-surface px-3.5 py-3">
                    <p className="text-[12.5px] text-ink-3">✈️ Viagem</p>
                    <p className="tnum mt-0.5 whitespace-nowrap text-[15px] font-semibold text-ink">{brl(200_00)}/mês</p>
                  </div>
                </div>
              </li>
              <li>
                <Connector index={4} />
                <div className="flex items-center justify-between gap-3 rounded-card border border-inv/40 bg-inv-soft px-4 py-3">
                  <span className="flex items-center gap-2 text-[14px] text-ink">
                    <span aria-hidden>📈</span> Patrimônio
                  </span>
                  <span className="text-[13px] text-inv">cresce a cada aporte</span>
                </div>
              </li>
            </ol>
          </Reveal>

          <div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {GOALS.map((g, i) => (
                <Reveal as="li" key={g.name} index={i} className="rounded-card border border-line bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="grid size-10 place-items-center rounded-field bg-surface-2 text-[18px]">
                      {g.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-ink">{g.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-3">{g.detail}</span>
                    </span>
                    <span className="tnum ml-auto text-[13px] font-medium text-ink-2">{Math.round(g.ratio * 100)}%</span>
                  </div>
                  <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${g.name}: ${Math.round(g.ratio * 100)}%`}>
                    <span className="meter-fill block h-full rounded-full bg-accent" style={{ '--w': g.ratio } as React.CSSProperties} />
                  </span>
                </Reveal>
              ))}
            </ul>
            <Reveal as="p" variant="fade" className="mt-5 max-w-[52ch] text-[14px] leading-relaxed text-ink-3">
              Cada meta sabe quanto falta, quanto guardar por mês até o prazo e, no ritmo de hoje, quando você chega lá. A ligada a um
              investimento sobe sozinha a cada aporte.
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================== 7 · comportamento */

const PHRASES = [
  'Seu futuro também participa do orçamento de hoje.',
  'Consistência costuma importar mais que intensidade.',
  'O melhor plano é aquele que você consegue sustentar.',
] as const;

export function BehaviorScene() {
  return (
    <section id="comportamento" aria-labelledby="comportamento-titulo" className="scroll-mt-20 px-5 py-24 sm:py-32">
      <div className="mx-auto max-w-[60rem] text-center">
        <Reveal as="p" variant="fade" className="text-[13px] font-medium text-accent">
          Comportamento
        </Reveal>
        <Reveal as="h2" id="comportamento-titulo" index={1} className="mt-2 text-[17px] text-ink-2">
          Porque dinheiro também é comportamento.
        </Reveal>
        <Reveal as="p" variant="blur" index={2} className="mx-auto mt-6 max-w-[18ch] text-balance font-display text-[40px] leading-[1.06] text-ink sm:text-[60px]">
          Nem todo desejo precisa virar compra.
        </Reveal>

        <Reveal variant="scale" index={3} className="mx-auto mt-10 max-w-[26rem] text-left">
          <FinancialCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5 text-[15px] text-ink">
                <span aria-hidden className="grid size-9 place-items-center rounded-full bg-surface-2 text-[16px]">
                  👟
                </span>
                Tênis
              </span>
              <span className="tnum whitespace-nowrap text-[16px] font-semibold text-ink">{brl(450_00)}</span>
            </div>
            <p className="mt-3 rounded-field bg-warn-soft px-3 py-2.5 text-[13.5px] leading-relaxed text-ink">
              Antes de comprar, olhe o impacto no restante do mês. Depois dele, sobram {brl(50_00)} para gastar até 05 de out.
            </p>
          </FinancialCard>
          <p className="mt-2 text-center text-[12px] text-ink-3">O que o app mostra antes de salvar uma compra grande.</p>
        </Reveal>

        <ul className="mt-12 grid gap-3">
          {PHRASES.map((p, i) => (
            <Reveal as="li" key={p} variant="blur" index={i} className="font-display text-[22px] leading-snug text-ink-2 sm:text-[26px]">
              {p}
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ====================================================== 8 · tudo se conecta */

/** a árvore do briefing: FinanceOS em cima, três colunas, patrimônio embaixo */
const COLUMNS: [{ icon: LucideIcon; label: string }, { icon: LucideIcon; label: string }][] = [
  [
    { icon: Wallet, label: 'Contas' },
    { icon: Receipt, label: 'Despesas' },
  ],
  [
    { icon: CreditCard, label: 'Cartões' },
    { icon: Layers, label: 'Faturas' },
  ],
  [
    { icon: Target, label: 'Metas' },
    { icon: House, label: 'Planos' },
  ],
];
/** de onde cada peça vem, espalhada: [dx, dy, giro] */
const SCATTER: [number, number, number][] = [
  [30, -70, -8],
  [20, 60, 6],
  [10, -100, 5],
  [-10, 90, -7],
  [-30, -70, 7],
  [-20, 70, -5],
];

export function PuzzleScene() {
  return (
    <PinnedScene id="tudo-junto" labelledBy="tudo-titulo" steps={4} perStep={22}>
      {() => (
        <div className="mx-auto max-w-[44rem] text-center">
          <div aria-hidden className="relative">
            {/* FinanceOS surge por último: é o que liga tudo */}
            <div className="emerge mx-auto flex w-fit items-center gap-2.5 rounded-card border border-accent/40 bg-surface px-4 py-2.5 shadow-e2" style={{ '--s': 0.55, '--l': 0.25 } as React.CSSProperties}>
              <Marca />
              <span className="text-[15px] font-semibold text-ink">FinanceOS</span>
            </div>
            <span className="link-y by-scroll mx-auto block h-6 w-px bg-accent/60" style={{ '--s': 0.6, '--l': 0.15 } as React.CSSProperties} />
            {/* a barra que distribui para as três colunas */}
            <span className="link-x by-scroll mx-auto block h-px w-2/3 bg-accent/60" style={{ '--s': 0.62, '--l': 0.15, transformOrigin: 'center' } as React.CSSProperties} />
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {COLUMNS.map((col, c) => (
                <div key={col[0].label} className="grid justify-items-center">
                  <span className="link-y by-scroll block h-5 w-px bg-accent/60" style={{ '--s': 0.66, '--l': 0.12 } as React.CSSProperties} />
                  {col.map((piece, r) => {
                    const [dx, dy, rot] = SCATTER[c * 2 + r];
                    return (
                      <React.Fragment key={piece.label}>
                        {r > 0 ? <span className="link-y by-scroll block h-4 w-px bg-accent/60" style={{ '--s': 0.5, '--l': 0.15 } as React.CSSProperties} /> : null}
                        <div className="assemble w-full" style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, '--r': `${rot}deg`, '--s': (c * 2 + r) * 0.04, '--l': 0.45 } as React.CSSProperties}>
                          <NodePiece icon={piece.icon} label={piece.label} />
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <span className="link-y by-scroll block h-5 w-px bg-accent/60" style={{ '--s': 0.7, '--l': 0.12 } as React.CSSProperties} />
                </div>
              ))}
            </div>
            <span className="link-x by-scroll mx-auto block h-px w-2/3 bg-accent/60" style={{ '--s': 0.74, '--l': 0.12, transformOrigin: 'center' } as React.CSSProperties} />
            <span className="link-y by-scroll mx-auto block h-6 w-px bg-accent/60" style={{ '--s': 0.78, '--l': 0.1 } as React.CSSProperties} />
            <div className="assemble mx-auto w-fit" style={{ '--dx': '0px', '--dy': '90px', '--r': '0deg', '--s': 0.3, '--l': 0.45 } as React.CSSProperties}>
              <NodePiece icon={Landmark} label="Patrimônio" wide />
            </div>
          </div>

          <h2 id="tudo-titulo" className="emerge mx-auto mt-10 max-w-[22ch] text-balance font-display text-[30px] leading-[1.1] text-ink sm:text-[40px]" style={{ '--s': 0.8, '--l': 0.15 } as React.CSSProperties}>
            Quando todas as peças se conectam, seu dinheiro começa a fazer sentido.
          </h2>
          <div className="emerge mt-6 flex justify-center" style={{ '--s': 0.85, '--l': 0.12 } as React.CSSProperties}>
            <ArrowDown size={18} className="text-ink-3" aria-hidden />
          </div>
        </div>
      )}
    </PinnedScene>
  );
}

function NodePiece({ icon: Icon, label, wide }: { icon: LucideIcon; label: string; wide?: boolean }) {
  return (
    <span className={cn('flex items-center justify-center gap-2 rounded-card border border-line bg-surface px-2.5 py-2.5 shadow-e1', wide ? 'px-5' : 'w-full')}>
      <Icon size={15} className="shrink-0 text-accent" />
      <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-ink sm:text-[12px]">{label}</span>
    </span>
  );
}
