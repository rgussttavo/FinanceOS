'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Os movimentos do FinanceOS, num lugar só.
 *
 * Cada componente pede um padrão (fade, up, scale, blur) em vez de inventar o
 * seu. Tudo anda por `transform` e `opacity` — o navegador compõe sem refazer
 * o layout, e o scroll continua liso no celular. Com movimento reduzido, o
 * conteúdo aparece pronto: a história continua inteira, só sem deslocamento.
 *
 * As regras visuais moram em `globals.css` (.reveal, .float, .assemble); aqui
 * ficam só os ganchos que decidem quando elas entram.
 */

export type RevealVariant = 'fade' | 'up' | 'scale' | 'blur';

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** true quando o elemento entra na tela (uma vez só, por padrão) */
export function useInView<T extends Element>(ref: React.RefObject<T | null>, { once = true, threshold = 0.2, margin = '0px 0px -8% 0px' } = {}): boolean {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // com movimento reduzido o CSS já mostra tudo pronto; sem observador, mostra no próximo quadro
    if (reducedMotion()) return;
    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin: margin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, once, threshold, margin]);
  return inView;
}

/**
 * Três réguas de rolagem, para três tipos de cena:
 *
 * - through: a seção atravessando a tela (0 quando o topo aparece embaixo,
 *   1 quando o fim some em cima);
 * - pin: a seção alta com um palco fixo (sticky) dentro — 0 quando o palco
 *   gruda no topo, 1 quando ele vai soltar;
 * - exit: a seção que já começa na tela, como o topo da página — 0 parada,
 *   1 quando 60% dela já subiu.
 */
export type ScrollMode = 'through' | 'pin' | 'exit';

function progressOf(el: HTMLElement, mode: ScrollMode): number {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  const raw =
    mode === 'pin'
      ? -rect.top / Math.max(1, rect.height - vh)
      : mode === 'exit'
        ? -rect.top / Math.max(1, rect.height * 0.6)
        : (vh - rect.top) / (rect.height + vh);
  return Math.min(1, Math.max(0, raw));
}

/** acompanha a rolagem só enquanto a seção está perto da tela, um quadro por vez */
function watchScroll(el: HTMLElement, mode: ScrollMode, onProgress: (p: number) => void): () => void {
  let frame = 0;
  let near = true;
  const measure = () => {
    frame = 0;
    if (near) onProgress(progressOf(el, mode));
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          near = entry.isIntersecting;
          // ao sair, fecha na ponta certa: uma rolagem rápida não deixa a cena pela metade
          onProgress(progressOf(el, mode));
        }, { rootMargin: '25% 0px 25% 0px' });
  io?.observe(el);
  frame = requestAnimationFrame(measure);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    io?.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}

/**
 * Escreve o progresso na variável CSS `--p` da seção, sem renderizar nada.
 *
 * É o que move as peças do quebra-cabeça: o CSS lê `--p` (e cada peça, a sua
 * janela dentro dele) e calcula o `transform`. Nenhum estado do React muda a
 * cada quadro. Com movimento reduzido, a cena fica montada (`--p: 1`).
 */
export function useScrollVar<T extends HTMLElement>(ref: React.RefObject<T | null>, mode: ScrollMode = 'through') {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (p: number) => el.style.setProperty('--p', p.toFixed(4));
    if (reducedMotion()) {
      write(1);
      return;
    }
    return watchScroll(el, mode, write);
  }, [ref, mode]);
}

/**
 * Em que passo da cena a rolagem está, de 0 a `steps`: para as cenas contadas
 * em etapas (as contas que entram, os eventos da linha do tempo). O estado só
 * muda quando o passo muda — não a cada quadro. Com movimento reduzido, a cena
 * aparece inteira.
 */
export function useScrollStep<T extends HTMLElement>(ref: React.RefObject<T | null>, steps: number, mode: ScrollMode = 'pin'): number {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      const id = requestAnimationFrame(() => setStep(steps));
      return () => cancelAnimationFrame(id);
    }
    // um pouco antes do fim já está tudo na tela: o último passo não exige rolar até a borda
    return watchScroll(el, mode, (p) => setStep(Math.min(steps, Math.floor(p * 1.12 * (steps + 1)))));
  }, [ref, steps, mode]);
  return step;
}

/** faz o conteúdo surgir quando entra na tela; `index` escalona irmãos (stagger) */
export function Reveal({
  as: Tag = 'div',
  variant = 'up',
  index = 0,
  className,
  children,
  ...rest
}: {
  as?: 'div' | 'li' | 'section' | 'p' | 'span' | 'h2' | 'h3';
  variant?: RevealVariant;
  index?: number;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  const ref = React.useRef<HTMLElement>(null);
  const shown = useInView(ref);
  const Comp = Tag as React.ElementType;
  return (
    <Comp
      ref={ref}
      data-reveal={variant}
      data-shown={shown ? '' : undefined}
      style={{ '--reveal-delay': `${Math.min(index, 8) * 70}ms` } as React.CSSProperties}
      className={cn('reveal', className)}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/** um número que conta até o valor novo, para a mudança ser vista e não só lida */
export function useCountTo(target: number, duration = 700): number {
  const [value, setValue] = React.useState(target);
  const current = React.useRef(target);
  React.useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const ms = reducedMotion() ? 0 : duration;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = ms ? Math.min(1, (now - start) / ms) : 1;
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      current.current = v;
      setValue(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
