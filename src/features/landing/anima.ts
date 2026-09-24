'use client';

import * as React from 'react';

/**
 * Os dois movimentos da vitrine: começar quando a peça aparece, e contar até
 * um número novo em vez de trocá-lo de uma vez. Com movimento reduzido, a peça
 * aparece pronta e o número muda direto.
 */

export const movimentoReduzido = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** chama `aoAparecer` uma vez, quando o elemento entra na tela */
export function useAoAparecer(ref: React.RefObject<Element | null>, aoAparecer: () => (() => void) | void, chave: unknown = 0) {
  const cb = React.useRef(aoAparecer);
  React.useEffect(() => {
    cb.current = aoAparecer;
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let limpar: (() => void) | void;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        limpar = cb.current();
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (limpar) limpar();
    };
  }, [ref, chave]);
}

/** conta até o valor novo em ~0,5 s, para a mudança ser vista e não só lida */
export function useContagem(alvo: number, duracao = 520): number {
  const [valor, setValor] = React.useState(alvo);
  const atual = React.useRef(alvo);

  React.useEffect(() => {
    const de = atual.current;
    if (de === alvo) return;
    const ms = movimentoReduzido() ? 0 : duracao;
    let frame = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = ms ? Math.min(1, (agora - inicio) / ms) : 1;
      const v = Math.round(de + (alvo - de) * (1 - Math.pow(1 - t, 3)));
      atual.current = v;
      setValor(v);
      if (t < 1) frame = requestAnimationFrame(passo);
    };
    frame = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(frame);
  }, [alvo, duracao]);

  return valor;
}

export const brl = (cents: number, sinal = false) => {
  const abs = (Math.abs(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (cents < 0) return `−R$ ${abs}`;
  return `${sinal ? '+' : ''}R$ ${abs}`;
};
