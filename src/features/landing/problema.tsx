'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { brl, movimentoReduzido, useAoAparecer, useContagem } from './anima';

/**
 * A conta que o extrato do banco não faz.
 *
 * O saldo de hoje entra primeiro, inteiro. Depois cada conta que ainda vai
 * sair é descontada, uma a uma, e o número de baixo desce até o que de fato
 * está livre. 4.200 − 1.800 − 640 − 310 − 89,70 − 120,30 = 1.240.
 */

const HOJE = 4_200_00;

const CONTAS = [
  { icone: '🏠', nome: 'Aluguel', quando: 'dia 5', valor: -1_800_00 },
  { icone: '💳', nome: 'Fatura do cartão', quando: 'dia 8', valor: -640_00 },
  { icone: '🛒', nome: 'Mercado do mês', quando: 'até o dia 30', valor: -310_00 },
  { icone: '🎬', nome: 'Assinaturas', quando: '4 serviços', valor: -89_70 },
  { icone: '💻', nome: 'Parcelas', quando: 'notebook, 4 de 10', valor: -120_30 },
] as const;

const LIVRE = CONTAS.reduce((s, c) => s + c.valor, HOJE);

export function ProblemaDemo() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [n, setN] = React.useState(0);

  useAoAparecer(ref, () => {
    if (movimentoReduzido()) {
      const t = window.setTimeout(() => setN(CONTAS.length), 0);
      return () => window.clearTimeout(t);
    }
    const timers = CONTAS.map((_, i) => window.setTimeout(() => setN(i + 1), 500 + i * 520));
    return () => timers.forEach((t) => window.clearTimeout(t));
  });

  const livre = CONTAS.slice(0, n).reduce((s, c) => s + c.valor, HOJE);
  const mostrado = useContagem(livre, 420);
  const pronto = n === CONTAS.length;

  return (
    <div ref={ref} className="overflow-hidden rounded-panel border border-line bg-surface shadow-e2">
      <p className="sr-only">
        Exemplo: {brl(HOJE)} no banco hoje. Ainda vão sair aluguel, fatura, mercado, assinaturas e parcelas. Livre de
        verdade: {brl(LIVRE)}.
      </p>
      <div aria-hidden>
        <div className="flex items-baseline justify-between gap-3 px-5 pb-4 pt-5">
          <span className="text-[13px] text-ink-3">Hoje, no banco</span>
          <span className="amount text-[28px] text-ink">{brl(HOJE)}</span>
        </div>

        <div className="border-t border-line px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Mas ainda vão sair</p>
          <ul className="mt-1">
            {CONTAS.map((c, i) => (
              <li
                key={c.nome}
                className={cn(
                  'flex items-center gap-3 py-2 transition-[opacity,transform] duration-[var(--t-slow)] ease-[var(--ease-out)]',
                  i < n ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-25',
                  i < CONTAS.length - 1 && 'border-b border-line',
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px]">{c.icone}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">{c.nome}</span>
                  <span className="block text-[12px] text-ink-3">{c.quando}</span>
                </span>
                <span className="tnum shrink-0 text-[14px] font-medium text-out">{brl(c.valor)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className={cn(
            'flex items-baseline justify-between gap-3 border-t px-5 py-4 transition-colors duration-[var(--t-slow)]',
            pronto ? 'border-accent/40 bg-accent-soft' : 'border-line',
          )}
        >
          <span className="text-[14px] font-medium text-ink">Saldo real disponível</span>
          <span className={cn('amount text-[30px] transition-colors duration-[var(--t-slow)]', pronto ? 'text-accent' : 'text-ink-2')}>
            {brl(mostrado)}
          </span>
        </div>
      </div>
    </div>
  );
}
