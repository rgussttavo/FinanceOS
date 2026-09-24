import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * As maquetes da vitrine.
 *
 * São ilustrações do produto, não capturas: uma captura de tela envelhece a
 * cada ajuste de layout e fica borrada em tela retina. Desenhadas com os mesmos
 * tokens do app, elas acompanham o tema claro/escuro sozinhas e continuam
 * nítidas em qualquer densidade.
 *
 * Os números aqui são exemplos. Nenhum deles é métrica nossa nem de ninguém.
 */

/* ------------------------------------------------------------ primitivas */

export function Quadro({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-panel border border-line bg-surface p-4 shadow-e2 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Linha({
  emoji,
  titulo,
  detalhe,
  valor,
  cor,
  last,
}: {
  emoji: string;
  titulo: string;
  detalhe: string;
  valor: string;
  cor?: 'in' | 'out' | 'inv';
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2.5',
        !last && 'border-b border-line',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-field bg-surface-2 text-[16px]">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-ink">{titulo}</span>
        <span className="block truncate text-[12px] text-ink-3">{detalhe}</span>
      </span>
      <span
        className={cn(
          'tnum shrink-0 text-[14px] font-medium',
          cor === 'in' && 'text-in',
          cor === 'out' && 'text-out',
          cor === 'inv' && 'text-inv',
          !cor && 'text-ink',
        )}
      >
        {valor}
      </span>
    </div>
  );
}

function Anel({ pct, className }: { pct: number; className?: string }) {
  const r = 15;
  const volta = 2 * Math.PI * r;
  return (
    <span className={cn('relative grid size-11 shrink-0 place-items-center', className)}>
      <svg viewBox="0 0 36 36" className="absolute size-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(volta * pct) / 100} ${volta}`}
        />
      </svg>
      <span className="tnum relative text-[11px] font-medium text-ink">{pct}%</span>
    </span>
  );
}

/* -------------------------------------------------------- Calendário */

/**
 * Setembro de 2026 — mês fixo, mas alinhado de verdade.
 *
 * O dia 1 caiu numa terça, então a grade começa com dois dias de agosto. Errar
 * isso é o tipo de detalhe que ninguém sabe explicar e todo mundo estranha.
 */
const MES = { dias: 30, comecaEm: 2, mesAnterior: 31 };

const GRADE = (() => {
  const total = Math.ceil((MES.comecaEm + MES.dias) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const dia = i - MES.comecaEm + 1;
    if (dia < 1) return { numero: MES.mesAnterior + dia, dentro: false };
    if (dia > MES.dias) return { numero: dia - MES.dias, dentro: false };
    return { numero: dia, dentro: true };
  });
})();

/** as marcas seguem o mesmo mês da trajetória do topo: salário no 5, adiantamento no 20 */
export function MockCalendario({ hoje = 5 }: { hoje?: number }) {
  const marcas: Record<number, string> = {
    3: 'bg-out',
    5: 'bg-in',
    6: 'bg-out',
    8: 'bg-out',
    10: 'bg-out',
    12: 'bg-inv',
    15: 'bg-out',
    20: 'bg-in',
    24: 'bg-out',
    28: 'bg-event',
  };

  return (
    <Quadro>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[14px] font-medium text-ink">Setembro 2026</p>
        <span className="rounded-field bg-surface-2 px-2.5 py-1 text-[12px] text-ink-2">
          + Evento
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <span key={i} className="pb-1 text-[11px] text-ink-3">
            {d}
          </span>
        ))}
        {GRADE.map(({ numero, dentro }, i) => (
          <span
            key={i}
            className={cn(
              'tnum relative grid aspect-square place-items-center rounded-[9px] text-[12px]',
              dentro ? 'bg-surface-2 text-ink-2' : 'text-ink-3/40',
              dentro && numero === hoje && 'bg-accent-soft text-ink ring-1 ring-inset ring-accent/40',
            )}
          >
            {numero}
            {dentro && marcas[numero] && (
              <span className={cn('absolute bottom-1 size-1 rounded-full', marcas[numero])} />
            )}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {[
          ['bg-in', 'Receita'],
          ['bg-out', 'Despesa'],
          ['bg-inv', 'Investimento'],
          ['bg-event', 'Evento'],
        ].map(([cor, nome]) => (
          <span key={nome} className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span className={cn('size-1.5 rounded-full', cor)} />
            {nome}
          </span>
        ))}
      </div>
    </Quadro>
  );
}

/* ---------------------------------------------------------- Cartões */

export function MockCartoes() {
  return (
    <Quadro>
      {/*
        A pilha: os de trás aparecem pela borda de cima e recuados nas laterais.
        Sem o recuo lateral eles somem atrás do da frente e a pilha vira um
        cartão só — que é justamente o que a tela quer mostrar que não é.
      */}
      <div className="relative h-[152px]">
        {[
          ['Inter', 'Gold', '1152', 'from-[#f07a26]/60 to-[#f07a26]/20', 0, 0.5, 18],
          ['Itaú', 'Black', '8807', 'from-[#1b1b1e] to-[#3a3a42]', 22, 0.8, 9],
          // o da frente é opaco de propósito: translúcido, o número do cartão
          // de trás aparece por dentro dele e a pilha fica suja
          ['Nubank', 'Ultravioleta', '4291', 'from-[#7b3fe4] to-[#4b1f9e]', 44, 1, 0],
        ].map(([banco, tipo, fim, grad, topo, opacidade, recuo], i) => (
          <div
            key={banco as string}
            style={{
              top: topo as number,
              opacity: opacidade as number,
              zIndex: i,
              left: recuo as number,
              right: recuo as number,
            }}
            className={cn(
              'absolute flex h-[108px] flex-col justify-between rounded-card bg-gradient-to-br p-3.5 shadow-e2',
              grad as string,
            )}
          >
            <div className="flex items-start justify-between">
              <span className="text-[13px] font-medium text-white">{banco as string}</span>
              <span className="text-[11px] text-white/70">{tipo as string}</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="tnum text-[12px] text-white/80">•••• {fim as string}</span>
              {i === 2 && (
                <span className="tnum text-[12px] text-white">R$ 4.960,00 livres</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[11px] text-ink-3">
        Toque na pilha para trocar o cartão da frente
      </p>

      <div className="mt-2">
        <Linha
          emoji="🎧"
          titulo="Fone bluetooth"
          detalhe="Nubank · 3× de R$ 89,97"
          valor="R$ 269,90"
          cor="out"
        />
        <Linha
          emoji="📺"
          titulo="Assinaturas na fatura"
          detalhe="4 no cartão · entram sozinhas"
          valor="R$ 104,60"
          cor="out"
        />
        <Linha
          emoji="🧾"
          titulo="Fatura de outubro"
          detalhe="fecha dia 28 · vence dia 5"
          valor="R$ 1.284,35"
          last
        />
      </div>
    </Quadro>
  );
}

/* ------------------------------------------------------ Assinaturas */

export function MockAssinaturas() {
  const servicos = [
    ['Netflix', 'dia 12 · no cartão', 'R$ 44,90', '#e50914', 'N'],
    ['Spotify', 'dia 05 · no cartão', 'R$ 21,90', '#1db954', 'S'],
    ['YouTube Premium', 'dia 08 · no cartão', 'R$ 24,90', '#ff0000', 'Y'],
    ['Prime Video', 'dia 15 · débito', 'R$ 19,90', '#00a8e1', 'P'],
    ['iCloud+', 'dia 02 · no cartão', 'R$ 12,90', '#6e6e73', 'i'],
    ['Globoplay', 'dia 20 · débito', 'R$ 22,90', '#f70', 'G'],
  ] as const;

  return (
    <Quadro>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[14px] font-medium text-ink">Assinaturas</p>
        <p className="tnum text-[14px] font-medium text-out">R$ 147,40 / mês</p>
      </div>

      {servicos.map(([nome, quando, valor, cor, inicial], i) => (
        <div
          key={nome}
          className={cn('flex items-center gap-3 py-2.5', i < servicos.length - 1 && 'border-b border-line')}
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-field text-[13px] font-semibold text-white"
            style={{ background: cor }}
          >
            {inicial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] text-ink">{nome}</span>
            <span className="block truncate text-[12px] text-ink-3">{quando}</span>
          </span>
          <span className="tnum shrink-0 text-[14px] text-ink">{valor}</span>
        </div>
      ))}
    </Quadro>
  );
}

/* ------------------------------------------------------------ Metas */

export function MockMetas() {
  const metas = [
    [38, '🎯', 'Reserva de emergência', 'R$ 11.400 de R$ 30.000 · R$ 1.550 por mês'],
    [70, '✈️', 'Viagem', 'R$ 7.000 de R$ 10.000 · faltam 3 meses'],
    [38, '🏆', 'Patrimônio de 100 mil', 'ligada ao investido: sobe sozinha a cada aporte'],
    [30, '🚗', 'Trocar de carro', 'R$ 18.000 de R$ 60.000 · R$ 1.200 por mês'],
  ] as const;

  return (
    <Quadro>
      {metas.map(([pct, emoji, nome, detalhe], i) => (
        <div
          key={nome}
          className={cn('flex items-center gap-3 py-3', i < metas.length - 1 && 'border-b border-line')}
        >
          <Anel pct={pct} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] text-ink">
              {emoji} {nome}
            </span>
            <span className="block truncate text-[12px] text-ink-3">{detalhe}</span>
          </span>
        </div>
      ))}
    </Quadro>
  );
}

/* ---------------------------------------------------------- Dívidas */

export function MockDividas() {
  const dividas = [
    ['🚗', 'Financiamento do carro', 18, 48, 'R$ 22.400'],
    ['💳', 'Parcelamento', 7, 10, 'R$ 1.290'],
    ['📱', 'iPhone 16', 7, 12, 'R$ 1.950'],
  ] as const;

  return (
    <Quadro>
      {dividas.map(([emoji, nome, pagas, total, resta], i) => (
        <div key={nome} className={cn('py-3', i < dividas.length - 1 && 'border-b border-line')}>
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-field bg-surface-2 text-[16px]">
              {emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-ink">{nome}</span>
              <span className="tnum block text-[12px] text-ink-3">
                {pagas} de {total} parcelas
              </span>
            </span>
            <span className="tnum shrink-0 text-[14px] font-medium text-ink">{resta}</span>
          </div>

          <div className="mt-2.5 flex gap-[3px]">
            {Array.from({ length: total }, (_, p) => (
              <span
                key={p}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  p < pagas ? 'bg-in' : 'bg-surface-3',
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </Quadro>
  );
}

/* ----------------------------------------------------------- Rateio */

export function MockRateio() {
  return (
    <Quadro>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[14px] font-medium text-ink">🔥 Churrasco de sábado</p>
        <p className="text-[12px] text-ink-3">4 pessoas · R$ 153 cada</p>
      </div>

      <Linha emoji="🥩" titulo="Carne" detalhe="pago por você" valor="R$ 320" />
      <Linha emoji="🍺" titulo="Bebidas" detalhe="pago pela Ana" valor="R$ 153" />
      <Linha emoji="🥗" titulo="Acompanhamentos" detalhe="pago pelo Bruno" valor="R$ 139" last />

      <p className="mt-4 text-[12px] text-ink-3">Como ficou cada um</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[
          ['você', 'recebe R$ 167', 'text-in'],
          ['Ana', 'em dia', 'text-ink-3'],
          ['Bruno', 'deve R$ 14', 'text-out'],
          ['Duda', 'deve R$ 153', 'text-out'],
        ].map(([quem, quanto, cor]) => (
          <div key={quem} className="rounded-field bg-surface-2 px-2 py-2 text-center">
            <p className="truncate text-[12px] text-ink">{quem}</p>
            <p className={cn('tnum truncate text-[11px]', cor)}>{quanto}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[12px] text-ink-3">Acertos no menor caminho</p>
      <div className="mt-2 space-y-1.5">
        {[
          ['Duda', 'você', 'R$ 153', false],
          ['Bruno', 'você', 'R$ 14', true],
        ].map(([de, para, valor, pago]) => (
          <div
            key={de as string}
            className="flex items-center gap-2 rounded-field bg-surface-2 px-3 py-2 text-[13px]"
          >
            <span className="text-ink">{de as string}</span>
            <span className="text-ink-3">→</span>
            <span className="flex-1 text-ink">{para as string}</span>
            <span className={cn('tnum', pago ? 'text-ink-3 line-through' : 'text-in')}>
              {valor as string}
            </span>
            {(pago as boolean) && <span className="text-[11px] text-in">pago ✓</span>}
          </div>
        ))}
      </div>
    </Quadro>
  );
}

/* ------------------------------------------------------- Patrimônio */

export function MockPatrimonio() {
  return (
    <Quadro>
      <div className="rounded-field bg-surface-2 px-3 py-3">
        <p className="text-[12px] text-ink-3">Patrimônio total</p>
        <p className="amount mt-1 text-[30px] text-ink">R$ 368.200</p>
        <div className="mt-3 flex gap-4 text-[12px]">
          <span className="text-ink-3">
            Em bens <span className="tnum text-ink">R$ 329.800</span>
          </span>
          <span className="text-ink-3">
            Investido <span className="tnum text-inv">R$ 38.400</span>
          </span>
        </div>
      </div>

      <div className="mt-3">
        <Linha
          emoji="🏠"
          titulo="Apartamento"
          detalhe="imóvel · corrigido pelo IPCA"
          valor="R$ 250.000"
        />
        <Linha
          emoji="🚗"
          titulo="Onix 1.0 Turbo"
          detalhe="carro · valor da FIPE, sozinho"
          valor="R$ 58.400"
        />
        <Linha emoji="💻" titulo="iMac" detalhe="outro bem · valor que você define" valor="R$ 12.500" />
        <Linha
          emoji="📈"
          titulo="Investido"
          detalhe="soma dos seus aportes, mês a mês"
          valor="R$ 38.400"
          cor="inv"
          last
        />
      </div>
    </Quadro>
  );
}

/* ------------------------------------------------------ Trajetória (topo) */

/**
 * O mês do topo da página, dia a dia.
 *
 * Os números não são desenhados à mão: saem de uma lista de lançamentos, como
 * no app. Assim a curva, o dia em que cruza o zero e o saldo do fim concordam
 * entre si — e com o calendário mais abaixo, que mostra o mesmo mês.
 */
const MOVIMENTOS: readonly (readonly [number, number, string])[] = [
  [3, -310, 'Mercado'],
  [5, 4200, 'Salário'],
  [6, -1650, 'Aluguel'],
  [8, -1480, 'Fatura do cartão'],
  [10, -365, 'Luz, água e internet'],
  [10, -290, 'Mercado'],
  [12, -300, 'Aporte na reserva'],
  [15, -890, 'Escola'],
  [17, -280, 'Mercado'],
  [20, 1800, 'Adiantamento'],
  [24, -300, 'Mercado'],
  [27, -120, 'Farmácia'],
];

const SALDO_INICIAL = 580;
const HOJE = 14;

const TRAJETORIA = (() => {
  const pontos: number[] = [];
  let saldo = SALDO_INICIAL;
  for (let dia = 1; dia <= MES.dias; dia++) {
    for (const [d, valor] of MOVIMENTOS) if (d === dia) saldo += valor;
    pontos.push(saldo);
  }
  const zero = pontos.findIndex((v) => v < 0);
  return { pontos, fim: pontos[pontos.length - 1], diaNoVermelho: zero >= 0 ? zero + 1 : null };
})();

const reais = (v: number) =>
  `${v < 0 ? '−' : ''}R$ ${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

export function MockTrajetoria() {
  const W = 620;
  const H = 170;
  const PAD = 12;
  const { pontos, fim, diaNoVermelho } = TRAJETORIA;
  const max = Math.max(...pontos, 0);
  const min = Math.min(...pontos, 0);
  const x = (i: number) => PAD + (i / (pontos.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);

  // degraus: o saldo muda no dia do lançamento, não aos poucos entre um e outro
  const caminho = (ate: number) =>
    pontos
      .slice(0, ate)
      .map((v, i) => (i ? `H${x(i).toFixed(1)} V${y(v).toFixed(1)}` : `M${x(0).toFixed(1)},${y(v).toFixed(1)}`))
      .join(' ');
  const inteiro = caminho(pontos.length);
  const real = caminho(HOJE);
  const area = `${inteiro} V${y(min).toFixed(1)} H${x(0).toFixed(1)} Z`;
  const vermelho = diaNoVermelho ? diaNoVermelho - 1 : -1;

  const proximos = MOVIMENTOS.filter(([d]) => d > HOJE).slice(0, 3);

  return (
    <Quadro className="p-0 sm:p-0">
      <div className="flex items-baseline justify-between px-4 pt-4 sm:px-5 sm:pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Trajetória de setembro
        </p>
        <p className="tnum text-[13px] font-semibold text-ink-2">{reais(fim)} no fim</p>
      </div>

      <div className="px-2 pt-2 sm:px-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Saldo de setembro dia a dia">
          <defs>
            <linearGradient id="vitrine-traj" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#vitrine-traj)" />
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeDasharray="3 4" />
          <path d={inteiro} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeDasharray="4 4" opacity="0.6" />
          <path d={real} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinejoin="round" />
          <line x1={x(HOJE - 1)} x2={x(HOJE - 1)} y1={PAD} y2={H - PAD} stroke="var(--ink-3)" strokeOpacity="0.35" />
          <text x={x(HOJE - 1) + 6} y={PAD + 10} fontSize="13" fill="var(--ink-3)">
            hoje
          </text>
          {vermelho >= 0 && (
            <>
              <circle cx={x(vermelho)} cy={y(pontos[vermelho])} r="10" fill="var(--out)" opacity="0.18" />
              <circle cx={x(vermelho)} cy={y(pontos[vermelho])} r="4.5" fill="var(--out)" />
            </>
          )}
        </svg>
      </div>

      {diaNoVermelho ? (
        <p className="px-4 text-[13px] text-out sm:px-5">
          O saldo cruza o zero no dia <strong className="font-semibold">{diaNoVermelho}</strong>.
        </p>
      ) : null}

      <div className="mt-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11px] text-ink-3">Ainda cai este mês</p>
        {proximos.map(([dia, valor, nome], i) => (
          <div
            key={`${dia}-${nome}`}
            className={cn('flex items-center gap-3 py-2', i < proximos.length - 1 && 'border-b border-line')}
          >
            <span className="tnum w-12 shrink-0 text-[12px] text-ink-3">dia {dia}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{nome}</span>
            <span className={cn('tnum shrink-0 text-[13px] font-medium', valor > 0 ? 'text-in' : 'text-out')}>
              {valor > 0 ? '+' : ''}
              {reais(valor)}
            </span>
          </div>
        ))}
      </div>
    </Quadro>
  );
}

/* ---------------------------------------------------------- Importar */

/**
 * A revisão do import, com os três destinos que uma linha pode ter.
 *
 * É a parte que ninguém vê num "importe seu extrato" e a que mais importa: o
 * que acontece com o aluguel que já estava lançado e com a fatura paga.
 */
export function MockImportar() {
  const linhas = [
    ['Salário', '05 set', '+R$ 4.200,00', 'in', true, ''],
    ['Pix enviado · Imobiliária Sol', '06 set', '−R$ 1.650,00', 'out', true, 'marca “Aluguel” como pago'],
    ['Pagamento de fatura', '08 set', '−R$ 1.480,00', 'out', false, 'fica de fora: as compras já contam'],
    ['Supermercado Dia', '10 set', '−R$ 290,00', 'out', true, '🛒 Mercado'],
    ['Aplicação RDB', '12 set', '−R$ 300,00', 'inv', true, '🛟 Reserva de emergência'],
  ] as const;

  return (
    <Quadro>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-field bg-accent-soft text-[11px] font-semibold text-accent">
          OFX
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-ink">extrato-setembro.ofx</span>
          <span className="block truncate text-[12px] text-ink-3">
            38 linhas · 12 já importadas antes
          </span>
        </span>
      </div>

      <div className="mt-3">
        {linhas.map(([nome, data, valor, cor, marcada, nota], i) => (
          <div
            key={nome}
            className={cn(
              'flex items-start gap-3 py-2.5',
              i < linhas.length - 1 && 'border-b border-line',
              !marcada && 'opacity-60',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border text-[11px]',
                marcada ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong',
              )}
              aria-hidden
            >
              {marcada ? '✓' : ''}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{nome}</span>
                <span
                  className={cn(
                    'tnum shrink-0 text-[13px] font-medium',
                    cor === 'in' && 'text-in',
                    cor === 'out' && 'text-out',
                    cor === 'inv' && 'text-inv',
                  )}
                >
                  {valor}
                </span>
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {data}
                {nota ? (
                  <span className={cn(nota.startsWith('marca') && 'text-in')}> · {nota}</span>
                ) : null}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-field bg-accent py-2.5 text-center text-[13px] font-medium text-accent-ink">
        Importar 25 linhas
      </div>
    </Quadro>
  );
}

/* ---------------------------------------------------------- Celular */

/**
 * O app no bolso: o Início com a barra de baixo, e o registro rápido — quanto,
 * onde, e a categoria que o app já sugere. São as duas telas que mais se abrem
 * no celular.
 */
function Aparelho({ children, rotulo }: { children: React.ReactNode; rotulo: string }) {
  return (
    <div className="mx-auto w-[248px] shrink-0 rounded-[38px] border border-line-strong bg-surface-2 p-[7px] shadow-e3 sm:w-[260px]">
      <div
        role="img"
        aria-label={rotulo}
        className="relative h-[520px] overflow-hidden rounded-[31px] bg-canvas sm:h-[540px]"
      >
        <div aria-hidden className="flex h-7 items-center justify-between px-6 pt-1 text-[10px] font-semibold text-ink-2">
          <span>9:41</span>
          <span className="h-[18px] w-[76px] rounded-full bg-surface-2" />
          <span>100%</span>
        </div>
        <div aria-hidden>{children}</div>
      </div>
    </div>
  );
}

const NAV = ['Início', 'Movimentos', 'Planejamento', 'Patrimônio', 'Mais'] as const;

export function MockCelularInicio() {
  return (
    <Aparelho rotulo="O Início do FinanceOS no celular: disponível até o salário, as próximas contas e a barra de navegação.">
      <div className="px-4 pt-2">
        <p className="text-[10px] text-ink-3">24 de setembro</p>
        <p className="font-display text-[22px] leading-tight text-ink">Bom dia, Ana.</p>

        <div className="mt-3 rounded-[16px] border border-line bg-surface p-3">
          <div className="grid grid-cols-3 gap-0.5 rounded-[9px] bg-surface-2 p-0.5 text-center text-[9px] font-medium">
            <span className="rounded-[7px] bg-ink py-1 text-canvas">Até o salário</span>
            <span className="py-1 text-ink-3">Agora</span>
            <span className="py-1 text-ink-3">Fim do mês</span>
          </div>
          <p className="mt-2.5 text-[10px] text-ink-3">Disponível até o salário</p>
          <p className="amount text-[28px] leading-none text-ink">R$ 875,00</p>
          <p className="mt-1.5 text-[10px] text-ink-3">Salário em 6 dias · 30 de set</p>
        </div>

        <div className="mt-3 rounded-[16px] border border-line bg-surface px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-3">O que vem por aí</p>
          {[
            ['26 set', 'Fatura Nubank', '−R$ 1.846,00'],
            ['27 set', 'Spotify', '−R$ 21,90'],
            ['30 set', 'Salário', '+R$ 4.200,00'],
          ].map(([dia, nome, valor], i) => (
            <div key={nome} className={cn('flex items-center gap-2 py-1.5', i < 2 && 'border-b border-line')}>
              <span className="w-9 text-[9px] font-semibold uppercase text-ink-3">{dia}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{nome}</span>
              <span className={cn('tnum text-[11px] font-semibold', valor.startsWith('+') ? 'text-in' : 'text-ink-2')}>{valor}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-warn/30 bg-warn-soft px-2.5 py-2">
          <span className="text-[11px]">⚠️</span>
          <p className="text-[10px] leading-snug text-ink">A fatura do dia 26 leva 59% do que você tem hoje.</p>
        </div>
      </div>

      <span className="absolute bottom-[62px] right-4 grid size-11 place-items-center rounded-full bg-accent text-[22px] leading-none text-accent-ink shadow-e2">
        +
      </span>
      <div className="absolute inset-x-0 bottom-0 grid grid-cols-5 border-t border-line bg-canvas/95 px-1 pb-3 pt-1.5">
        {NAV.map((item, i) => (
          <span key={item} className="flex flex-col items-center gap-1">
            <span className={cn('h-[3px] w-6 rounded-full', i === 0 ? 'bg-accent' : 'bg-transparent')} />
            <span className={cn('size-[15px] rounded-[5px] border-[1.5px]', i === 0 ? 'border-accent' : 'border-ink-3')} />
            <span className={cn('whitespace-nowrap text-[7px] tracking-tight', i === 0 ? 'text-accent' : 'text-ink-3')}>{item}</span>
          </span>
        ))}
      </div>
    </Aparelho>
  );
}

export function MockCelularRegistro() {
  return (
    <Aparelho rotulo="O registro rápido no celular: valor, onde foi e a categoria sugerida pelo app.">
      <div className="px-4 pt-2 opacity-40">
        <p className="text-[10px] text-ink-3">24 de setembro</p>
        <p className="font-display text-[22px] leading-tight text-ink">Bom dia, Ana.</p>
        <div className="mt-3 h-[120px] rounded-[16px] border border-line bg-surface" />
      </div>
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[22px] border-t border-line-strong bg-surface px-4 pb-5 pt-2">
        <span className="mx-auto block h-1 w-9 rounded-full bg-line-strong" />
        <p className="mt-3 text-[13px] font-semibold text-ink">Registrar gasto</p>

        <p className="mt-3 text-[10px] text-ink-3">Quanto?</p>
        <p className="amount text-[34px] leading-tight text-ink">R$ 89,90</p>

        <p className="mt-2 text-[10px] text-ink-3">Onde? O que foi?</p>
        <p className="mt-1 rounded-[10px] border border-accent/60 bg-surface-2 px-3 py-2 text-[12px] text-ink">Uber</p>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-ink">🚗 Transporte</span>
          <span className="text-[9px] text-ink-3">sugerida · confiança alta</span>
        </div>

        <p className="mt-3 text-[10px] text-ink-3">Quando?</p>
        <div className="mt-1 flex gap-1.5 text-[10px]">
          <span className="rounded-full border border-accent/60 bg-accent-soft px-2.5 py-1 text-ink">Hoje</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-3">Ontem</span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-3">📅 outra data</span>
        </div>

        <p className="mt-4 rounded-[12px] bg-accent py-2.5 text-center text-[12px] font-semibold text-accent-ink">Registrar</p>
      </div>
    </Aparelho>
  );
}
