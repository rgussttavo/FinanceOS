'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { brl, movimentoReduzido, useAoAparecer, useContagem } from './anima';

/**
 * O Início do app, em miniatura e em movimento.
 *
 * A cena é a promessa da página acontecendo: o saldo de hoje parece folgado,
 * as contas dos próximos dias entram na linha do tempo uma a uma, e o número
 * que importa — quanto dá para gastar até o salário — vai sendo recalculado
 * até o valor real. No fim, o alerta que o app daria.
 *
 * Toca uma vez, quando aparece na tela. Os modos do cartão são clicáveis,
 * como no app. Com movimento reduzido, a cena já começa pronta.
 *
 * Os números são um exemplo e fecham entre si: 3.141,90 − 280 − 1.846 −
 * 21,90 − 119 = 875; mais o salário, 5.075 no fim do mês.
 */

const HOJE = 3_141_90;

const ITENS = [
  { dia: '25', rotulo: 'Mercado', icone: '🛒', valor: -280_00 },
  { dia: '26', rotulo: 'Fatura Nubank', icone: '💳', valor: -1_846_00 },
  { dia: '27', rotulo: 'Spotify', icone: '🎧', valor: -21_90 },
  { dia: '28', rotulo: 'Academia', icone: '🏋️', valor: -119_00 },
  { dia: '30', rotulo: 'Salário', icone: '💼', valor: 4_200_00 },
] as const;

/** saldo depois de cada item, na ordem */
const SALDOS = ITENS.reduce<number[]>((acc, item) => [...acc, (acc[acc.length - 1] ?? HOJE) + item.valor], []);
const ATE_O_SALARIO = Math.min(HOJE, ...SALDOS.slice(0, 4));
const FIM_DO_MES = SALDOS[SALDOS.length - 1];

type Modo = 'salario' | 'agora' | 'fim';

const MODOS: { id: Modo; rotulo: string }[] = [
  { id: 'salario', rotulo: 'Até o salário' },
  { id: 'agora', rotulo: 'Agora' },
  { id: 'fim', rotulo: 'Fim do mês' },
];

/** passo da cena: 0 = só o saldo de hoje; 1..5 = itens entrando; 6 = alerta */
const ULTIMO = ITENS.length + 1;

export function HeroDemo() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [passo, setPasso] = React.useState(0);
  const [modo, setModo] = React.useState<Modo>('salario');
  const [rodada, setRodada] = React.useState(0);

  useAoAparecer(
    ref,
    () => {
      if (movimentoReduzido()) {
        const t = window.setTimeout(() => setPasso(ULTIMO), 0);
        return () => window.clearTimeout(t);
      }
      const timers = [window.setTimeout(() => setPasso(0), 0)];
      for (let i = 1; i <= ULTIMO; i++) timers.push(window.setTimeout(() => setPasso(i), 700 + i * 850));
      return () => timers.forEach((t) => window.clearTimeout(t));
    },
    rodada,
  );

  const entrou = Math.min(passo, ITENS.length);
  // enquanto as contas entram, o "até o salário" é o menor saldo visto até ali
  const disponivel = entrou === 0 ? HOJE : Math.min(HOJE, ...SALDOS.slice(0, Math.min(entrou, 4)));
  const alvo = modo === 'agora' ? HOJE : modo === 'fim' ? (entrou === ITENS.length ? FIM_DO_MES : SALDOS[entrou - 1] ?? HOJE) : disponivel;
  const mostrado = useContagem(alvo);
  const pronto = passo >= ULTIMO;

  const legenda =
    modo === 'agora'
      ? 'Saldo nas contas hoje'
      : modo === 'fim'
        ? 'Depois do salário e de tudo que ainda sai'
        : pronto || entrou >= 4
          ? 'Salário em 6 dias · 30 de set'
          : 'Recalculando com o que ainda vai sair…';

  return (
    <figure ref={ref} className="relative">
      <figcaption className="sr-only">
        Exemplo do Início do FinanceOS: saldo de hoje {brl(HOJE)}; depois do mercado, da fatura, do Spotify e da academia,
        sobram {brl(ATE_O_SALARIO)} até o salário do dia 30, e o mês termina com {brl(FIM_DO_MES)}.
      </figcaption>

      <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-e3">
        <div aria-hidden className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-[7px] bg-accent-soft ring-1 ring-inset ring-accent/25">
              <svg viewBox="0 0 24 24" className="size-3">
                <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
                <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" fill="var(--accent)" />
              </svg>
            </span>
            <span className="text-[13px] font-semibold text-ink">Início</span>
          </span>
          <span className="text-[12px] text-ink-3">24 de setembro</span>
        </div>

        <div className="px-5 pb-4 pt-4">
          <div role="radiogroup" aria-label="Ver o saldo do exemplo" className="grid grid-cols-3 gap-1 rounded-field bg-surface-2 p-1">
            {MODOS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={modo === m.id}
                onClick={() => setModo(m.id)}
                className={cn(
                  'h-8 rounded-[8px] text-center text-[12px] font-medium transition-colors duration-[var(--t-fast)]',
                  modo === m.id ? 'bg-ink text-canvas' : 'text-ink-3 hover:text-ink',
                )}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <div aria-hidden>
            <p className="mt-4 text-[12.5px] text-ink-3">
              {modo === 'salario' ? 'Disponível até o salário' : modo === 'agora' ? 'Saldo hoje' : 'Previsto para o fim do mês'}
            </p>
            <p className={cn('amount mt-1 text-[40px] leading-none sm:text-[46px]', mostrado < 0 ? 'text-out' : 'text-ink')}>
              {brl(mostrado)}
            </p>
            <p className="mt-2 min-h-[20px] text-[12.5px] text-ink-3">{legenda}</p>
          </div>
        </div>

        <ol aria-hidden className="border-t border-line px-5 py-2">
          {ITENS.map((item, i) => (
            <li
              key={item.rotulo}
              className={cn(
                'grid grid-cols-[2.6rem_1.75rem_minmax(0,1fr)_auto] items-center gap-2 py-2 transition-[opacity,transform] duration-[var(--t-slow)] ease-[var(--ease-out)]',
                i < entrou ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-[0.14]',
                i < ITENS.length - 1 && 'border-b border-line',
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{item.dia} set</span>
              <span className="grid size-7 place-items-center rounded-full bg-surface-2 text-[13px]">{item.icone}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] text-ink">{item.rotulo}</span>
                <span className="tnum block text-[11px] text-ink-3">saldo {brl(SALDOS[i])}</span>
              </span>
              <span className={cn('tnum text-[13.5px] font-semibold', item.valor > 0 ? 'text-in' : 'text-ink-2')}>
                {brl(item.valor, true)}
              </span>
            </li>
          ))}
        </ol>

        <div
          aria-hidden
          className={cn(
            'mx-4 mb-4 flex items-start gap-2.5 rounded-card border border-warn/30 bg-warn-soft px-3.5 py-3 transition-[opacity,transform] duration-[var(--t-slow)] ease-[var(--ease-out)]',
            pronto ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
          )}
        >
          <span className="mt-0.5 text-[14px]">⚠️</span>
          <p className="text-[12.5px] leading-snug text-ink">
            A fatura do dia 26 leva 59% do que você tem hoje. Até o salário, sobram{' '}
            <strong className="font-semibold">{brl(ATE_O_SALARIO)}</strong>.
          </p>
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setModo('salario');
            setRodada((r) => r + 1);
          }}
          className={cn(
            'h-9 rounded-full px-3 text-[12.5px] text-ink-3 transition-opacity duration-[var(--t-base)] hover:text-ink',
            pronto ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          tabIndex={pronto ? 0 : -1}
          aria-hidden={!pronto}
        >
          ↻ Ver de novo
        </button>
      </div>
    </figure>
  );
}
