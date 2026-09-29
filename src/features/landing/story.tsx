'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Reveal, useScrollStep, useScrollVar, type ScrollMode } from '@/components/motion';
import { cn } from '@/lib/cn';
import { AppLink } from './chrome';

/**
 * As peças de montar a vitrine.
 *
 * Cada seção da história usa as mesmas: o título (StoryHeading), o palco que
 * segura a cena enquanto a rolagem conta a história (PinnedScene), o cartão
 * de interface (FinancialCard), o evento da linha do tempo, a leitura do app
 * (InsightCard), a linha que liga uma peça à outra (Connector) e o convite
 * (CtaGroup). Os movimentos vêm todos de components/motion.tsx e globals.css.
 */

/* ------------------------------------------------------------- botões */

export const buttonPrimary =
  'inline-flex h-12 items-center justify-center gap-2 rounded-field bg-accent px-7 text-[15px] font-medium text-accent-ink transition-[filter,transform] duration-[var(--t-fast)] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const buttonSecondary =
  'inline-flex h-12 items-center justify-center gap-2 rounded-field border border-line-strong px-7 text-[15px] text-ink transition-colors duration-[var(--t-fast)] hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** o convite: começar (a tela de entrada) e explorar (o exemplo, sem cadastro) */
export function CtaGroup({ secondary = 'Explorar o FinanceOS', className }: { secondary?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', className)}>
      <AppLink href="/entrar" className={cn(buttonPrimary, 'w-full sm:w-auto')}>
        Começar agora
      </AppLink>
      <AppLink href="/demo" className={cn(buttonSecondary, 'w-full sm:w-auto')}>
        {secondary}
      </AppLink>
    </div>
  );
}

/* ------------------------------------------------------------- títulos */

export function StoryHeading({
  id,
  eyebrow,
  children,
  lead,
  className,
  center,
}: {
  id: string;
  eyebrow?: string;
  children: React.ReactNode;
  lead?: React.ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <div className={cn(center && 'mx-auto text-center', className)}>
      {eyebrow ? (
        <Reveal as="p" variant="fade" className="text-[13px] font-medium text-accent">
          {eyebrow}
        </Reveal>
      ) : null}
      <Reveal as="h2" id={id} index={1} className={cn('mt-2 max-w-[20ch] text-balance font-display text-[34px] leading-[1.06] text-ink sm:text-[46px]', center && 'mx-auto')}>
        {children}
      </Reveal>
      {lead ? (
        <Reveal as="p" index={2} className={cn('mt-4 max-w-[46ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17px]', center && 'mx-auto')}>
          {lead}
        </Reveal>
      ) : null}
    </div>
  );
}

/** a seção da história: o mesmo respiro e a mesma largura em toda a página */
export function StorySection({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn('scroll-mt-20 px-5 py-20 sm:py-28', className)}>
      <div className="mx-auto max-w-[72rem]">{children}</div>
    </section>
  );
}

/* --------------------------------------------------------- a cena fixa */

/**
 * O palco que fica parado enquanto a rolagem avança a cena.
 *
 * A seção ganha altura extra (um trecho de rolagem por passo) e o palco gruda
 * no topo; o passo atual vai para `children`. Com movimento reduzido — ou
 * quando a cena não cabe inteira na altura da tela, como num celular pequeno
 * deitado —, a seção volta à altura normal e a cena aparece completa: nada da
 * história se perde, só o movimento.
 */
export function PinnedScene({
  id,
  labelledBy,
  steps,
  perStep = 24,
  mode = 'pin',
  className,
  children,
}: {
  id?: string;
  labelledBy: string;
  steps: number;
  /** quanto rolar por passo, em % da altura da tela */
  perStep?: number;
  mode?: ScrollMode;
  className?: string;
  children: (step: number) => React.ReactNode;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const inner = React.useRef<HTMLDivElement>(null);
  const [fits, setFits] = React.useState(true);
  const step = useScrollStep(ref, steps, mode);
  useScrollVar(ref, mode);

  React.useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // 112 px: o respiro do palco (80 em cima, por causa da barra fixa, e 32 embaixo)
    const check = () => setFits(el.offsetHeight + 112 <= window.innerHeight);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={labelledBy}
      data-pinned={fits ? '' : undefined}
      style={{ '--scene-h': `calc(100svh + ${steps * perStep}svh)` } as React.CSSProperties}
      className={cn('relative scroll-mt-16 motion-reduce:h-auto', fits && 'h-[var(--scene-h)]', className)}
    >
      <div
        className={cn(
          'flex items-center px-5',
          fits ? 'sticky top-0 min-h-svh pb-8 pt-20 motion-reduce:static motion-reduce:min-h-0 motion-reduce:py-20' : 'py-20 sm:py-28',
        )}
      >
        {/* sem palco fixo, a cena fica montada: o --p local vale 1 para as peças lá dentro */}
        <div ref={inner} className="mx-auto w-full max-w-[72rem]" style={fits ? undefined : ({ '--p': 1 } as React.CSSProperties)}>
          {children(fits ? step : steps)}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- cartões */

/** um pedaço da interface do app, com a mesma superfície dos painéis dele */
export function FinancialCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('overflow-hidden rounded-panel border border-line bg-surface shadow-e2', className)} {...rest}>
      {children}
    </div>
  );
}

/** um dia da linha do tempo: o que acontece e como fica o saldo depois */
export function TimelineEvent({
  date,
  weekday,
  label,
  icon,
  amount,
  balance,
  on,
  low,
  last,
}: {
  date: string;
  weekday: string;
  label: string;
  icon: string;
  amount: string;
  balance: string;
  on: boolean;
  /** o menor saldo antes do recebimento: é o dia que o app avisa antes */
  low?: boolean;
  last?: boolean;
}) {
  const income = amount.startsWith('+');
  return (
    <li data-on={on ? '' : undefined} className="step relative grid grid-cols-[3rem_1rem_minmax(0,1fr)] gap-x-2.5 sm:grid-cols-[3.25rem_1.25rem_minmax(0,1fr)] sm:gap-x-3">
      <span className="pt-1 text-right">
        <span className="block whitespace-nowrap text-[12px] font-semibold uppercase leading-none tracking-wide text-ink sm:text-[13px]">{date}</span>
        <span className="mt-1 block text-[11px] uppercase text-ink-3">{weekday}</span>
      </span>
      <span aria-hidden className="relative flex justify-center">
        <span
          className={cn(
            'relative z-10 mt-1.5 size-3 rounded-full border-2',
            low ? 'border-warn bg-warn' : income ? 'border-in bg-in' : 'border-line-strong bg-canvas',
          )}
        />
        {!last ? <span className="absolute bottom-[-8px] top-5 w-px bg-line-strong" /> : null}
      </span>
      <span className={cn('mb-3 flex min-w-0 items-center gap-3 rounded-card border px-3.5 py-3', low ? 'border-warn/40 bg-warn-soft' : 'border-line bg-surface')}>
        {/* o ícone é enfeite: no celular, o espaço fica para o saldo e o valor */}
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[16px] max-sm:hidden">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-ink">{label}</span>
          <span className={cn('tnum block whitespace-nowrap text-[12.5px]', low ? 'font-medium text-warn' : 'text-ink-3')}>saldo {balance}</span>
        </span>
        <span className={cn('tnum shrink-0 whitespace-nowrap text-[14px] font-semibold sm:text-[15px]', income ? 'text-in' : 'text-ink-2')}>{amount}</span>
      </span>
    </li>
  );
}

/** uma leitura do app: a frase que ele mostra, com o número que a sustenta */
export function InsightCard({
  icon: Icon,
  tone = 'accent',
  kicker,
  children,
  on,
}: {
  icon: LucideIcon;
  tone?: 'accent' | 'warn' | 'out' | 'in' | 'inv';
  kicker: string;
  children: React.ReactNode;
  on: boolean;
}) {
  const toneClass = { accent: 'bg-accent-soft text-accent', warn: 'bg-warn-soft text-warn', out: 'bg-out-soft text-out', in: 'bg-in-soft text-in', inv: 'bg-inv-soft text-inv' }[tone];
  return (
    <li data-on={on ? '' : undefined} className="step flex items-start gap-3.5 rounded-card border border-line bg-surface px-4 py-4 shadow-e1">
      <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-field', toneClass)}>
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{kicker}</span>
        <span className="mt-1 block text-[15.5px] leading-relaxed text-ink">{children}</span>
      </span>
    </li>
  );
}

/* ------------------------------------------------------------ ligações */

/** a linha que liga duas peças; horizontal no computador, vertical no celular quando \`responsive\` */
export function Connector({ index = 0, responsive, className }: { index?: number; responsive?: boolean; className?: string }) {
  const delay = { '--reveal-delay': `${index * 140}ms` } as React.CSSProperties;
  if (responsive) {
    return (
      <span aria-hidden className={cn('flex items-center justify-center', className)}>
        <span style={delay} className="link-y block h-6 w-px bg-accent/60 sm:hidden" />
        <span style={delay} className="link-x hidden h-px w-full bg-accent/60 sm:block" />
      </span>
    );
  }
  return <span aria-hidden style={delay} className={cn('link-y mx-auto block h-6 w-px bg-accent/60', className)} />;
}
