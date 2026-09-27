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
 * O quanto de uma seção já passou pela tela, de 0 a 1.
 *
 * É o que conduz a montagem do quebra-cabeça: 0 quando o topo da seção chega
 * ao pé da tela, 1 quando o fim dela chega ao topo. Funciona com roda, trackpad
 * e toque — lê a posição, não o evento de roda. Um quadro por vez
 * (requestAnimationFrame), e só enquanto a seção está perto da tela.
 */
export function useScrollProgress<T extends HTMLElement>(ref: React.RefObject<T | null>): number {
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    if (reducedMotion()) {
      // sem movimento, a história aparece montada
      frame = requestAnimationFrame(() => setProgress(1));
      return () => cancelAnimationFrame(frame);
    }
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = rect.height + vh;
      const done = vh - rect.top;
      setProgress(Math.min(1, Math.max(0, done / total)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref]);
  return progress;
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
