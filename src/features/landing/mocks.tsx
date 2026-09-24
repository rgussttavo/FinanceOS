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

/* ------------------------------------------------------------- 01 · News */

export function MockNews() {
  const cotacoes = [
    ['Dólar', 'R$ 5,42', '+ 0,31%', 'in'],
    ['Euro', 'R$ 6,31', '− 0,12%', 'out'],
    ['Bitcoin', 'R$ 641.280', '+ 1,24%', 'in'],
    ['Ethereum', 'R$ 19.840', '+ 0,86%', 'in'],
    ['Selic', '15,00%', 'ao ano', ''],
    ['IPCA 12m', '4,58%', 'acumulado', ''],
  ] as const;

  return (
    <Quadro>
      <div className="grid grid-cols-3 gap-2">
        {cotacoes.map(([nome, valor, nota, cor]) => (
          <div key={nome} className="rounded-field bg-surface-2 px-2.5 py-2">
            <p className="truncate text-[11px] text-ink-3">{nome}</p>
            <p className="tnum mt-0.5 truncate text-[13px] font-medium text-ink">{valor}</p>
            <p
              className={cn(
                'tnum truncate text-[11px]',
                cor === 'in' && 'text-in',
                cor === 'out' && 'text-out',
                !cor && 'text-ink-3',
              )}
            >
              {nota}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Linha
          emoji="🗞️"
          titulo="Copom mantém a Selic em 15,00% ao ano"
          detalhe="manchetes de economia, de várias fontes"
          valor="há 2 h"
        />
        <Linha
          emoji="📅"
          titulo="Reunião do Copom"
          detalhe="em 5 dias · define a Selic"
          valor="28/09"
        />
        <Linha emoji="📊" titulo="IPCA de setembro" detalhe="IBGE · na primeira semana" valor="09/10" last />
      </div>
    </Quadro>
  );
}

/* -------------------------------------------------------- 02 · Calendário */

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

export function MockCalendario() {
  const marcas: Record<number, string> = {
    5: 'bg-out',
    8: 'bg-out',
    10: 'bg-inv',
    12: 'bg-out',
    15: 'bg-in',
    20: 'bg-event',
    28: 'bg-in',
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
              dentro && numero === 23 && 'bg-accent-soft text-ink ring-1 ring-inset ring-accent/40',
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

/* ---------------------------------------------------------- 03 · Cartões */

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

/* ------------------------------------------------------ 04 · Assinaturas */

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

/* ------------------------------------------------------------ 05 · Metas */

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

/* ---------------------------------------------------------- 06 · Dívidas */

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

/* ----------------------------------------------------------- 07 · Rateio */

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

/* -------------------------------------------------------- 08 · Orçamento */

export function MockOrcamento() {
  return (
    <Quadro>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[14px] font-medium text-ink">✈️ Viagem de fim de ano</p>
        <p className="text-[12px] text-ink-3">4 pessoas</p>
      </div>

      <Linha emoji="🎟️" titulo="Passagens" detalhe="4 × R$ 890" valor="R$ 3.560" />
      <Linha emoji="🏨" titulo="Hospedagem" detalhe="6 diárias × R$ 320" valor="R$ 1.920" />
      <Linha emoji="🍽️" titulo="Alimentação" detalhe="6 dias × R$ 180" valor="R$ 1.080" />
      <Linha emoji="🚕" titulo="Transporte local" detalhe="4 × R$ 120" valor="R$ 480" last />

      <div className="mt-4 space-y-2 rounded-field bg-surface-2 px-3 py-3">
        {[
          ['Folga de 10%', 'R$ 704', 'text-ink-2'],
          ['Total', 'R$ 7.744', 'text-ink'],
          ['Por pessoa', 'R$ 1.936', 'text-accent'],
        ].map(([rotulo, valor, cor]) => (
          <div key={rotulo} className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink-3">{rotulo}</span>
            <span className={cn('tnum font-medium', cor)}>{valor}</span>
          </div>
        ))}
      </div>
    </Quadro>
  );
}

/* ------------------------------------------------------- 09 · Patrimônio */

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

/* ----------------------------------------------------- 10 · Comprovantes */

export function MockComprovantes() {
  const pastas = [
    ['🏠', 'Casa', 14],
    ['🧾', 'Impostos', 9],
    ['🩺', 'Saúde', 6],
    ['🚗', 'Carro', 7],
    ['🎓', 'Escola', 4],
    ['📦', 'Outros', 2],
  ] as const;

  return (
    <Quadro>
      <p className="mb-3 text-[12px] text-ink-3">42 guardados · grade ou lista</p>

      <div className="grid grid-cols-3 gap-2">
        {pastas.map(([emoji, nome, n]) => (
          <div key={nome} className="rounded-field bg-surface-2 px-3 py-3 text-center">
            <p className="text-[20px]">{emoji}</p>
            <p className="mt-1 truncate text-[12px] text-ink">{nome}</p>
            <p className="tnum text-[11px] text-ink-3">{n} arquivos</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-field border border-line px-3 py-2.5">
        <span className="text-[15px]">🔎</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-ink">
            Busca: <span className="text-accent">&ldquo;ipva&rdquo;</span>
          </span>
          <span className="block truncate text-[12px] text-ink-3">
            IPVA 2026.pdf · achado na pasta Carro
          </span>
        </span>
      </div>
    </Quadro>
  );
}

/* ---------------------------------------------------------- hero: o app */

/**
 * O celular do topo.
 *
 * Mostra a tela de início de verdade — mesmos blocos, mesma ordem, mesma
 * hierarquia. Uma vitrine que promete uma tela e entrega outra queima a
 * confiança no primeiro clique.
 */
export function MockInicio() {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[38px] border border-line-strong bg-canvas p-2.5 shadow-e3">
      <div className="overflow-hidden rounded-[30px] border border-line bg-surface">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-[12px]">
              🙂
            </span>
            <span>
              <span className="block text-[11px] text-ink-3">Boa noite,</span>
              <span className="block text-[13px] text-ink">você</span>
            </span>
          </span>
          <span className="tnum text-[12px] text-ink-2">‹ Setembro 2026 ›</span>
        </div>

        <div className="px-4 pb-3">
          <p className="text-[11px] text-ink-3">Saldo do mês</p>
          <p className="amount mt-1 text-[36px] text-ink">R$ 4.812</p>

          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
            <span className="w-[62%] bg-in" />
            <span className="w-[27%] bg-out" />
            <span className="w-[11%] bg-inv" />
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
            {[
              ['Receitas', 'R$ 9.480', 'text-in'],
              ['Despesas', 'R$ 4.168', 'text-out'],
              ['Investido', 'R$ 500', 'text-inv'],
            ].map(([rotulo, valor, cor]) => (
              <span key={rotulo}>
                <span className="block text-ink-3">{rotulo}</span>
                <span className={cn('tnum block font-medium', cor)}>{valor}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-2 px-4 pb-4">
          <div className="flex items-center gap-2.5 rounded-field bg-surface-2 px-3 py-2.5">
            <Anel pct={38} className="size-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-ink">🎯 Reserva</span>
              <span className="tnum block truncate text-[11px] text-ink-3">
                R$ 11.400 de R$ 30.000
              </span>
            </span>
            <span className="text-ink-3">›</span>
          </div>

          <div className="flex items-center gap-2.5 rounded-field bg-warn-soft px-3 py-2.5">
            <span className="text-[15px]">⚠️</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-ink">2 contas atrasadas</span>
              <span className="tnum block truncate text-[11px] text-ink-3">somam R$ 1.043</span>
            </span>
            <span className="text-ink-3">›</span>
          </div>

          <div className="flex items-center gap-2.5 rounded-field bg-surface-2 px-3 py-2.5">
            <span className="grid size-9 place-items-center rounded-field bg-surface-3 text-[14px]">
              ⚡
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-ink">Conta de luz</span>
              <span className="block truncate text-[11px] text-ink-3">vence amanhã</span>
            </span>
            <span className="tnum text-[12px] text-out">R$ 214</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line px-6 py-3 text-[16px] text-ink-3">
          <span className="text-accent">⌂</span>
          <span>≡</span>
          <span>↑</span>
          <span>◫</span>
          <span className="grid size-8 place-items-center rounded-full bg-accent text-[18px] text-accent-ink">
            +
          </span>
        </div>
      </div>
    </div>
  );
}
