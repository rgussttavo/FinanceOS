'use client';

import * as React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';

/**
 * As partes da vitrine que precisam do navegador.
 *
 * Tudo o mais na landing é HTML estático — o conteúdo não muda, então não há
 * motivo para mandar JavaScript junto. Só três coisas dependem de rolagem ou
 * de toque, e são elas que moram aqui.
 */

/* ------------------------------------------------------------------- topo */

const SECOES = [
  ['news', 'News'],
  ['calendario', 'Calendário'],
  ['cartoes', 'Cartões'],
  ['assinaturas', 'Assinaturas'],
  ['metas', 'Metas'],
  ['dividas', 'Dívidas'],
  ['rateio', 'Rateio'],
  ['orcamento', 'Orçamento'],
  ['patrimonio', 'Patrimônio'],
  ['comprovantes', 'Comprovantes'],
] as const;

/** fora do componente: um array novo a cada render refaria o observador sempre */
const IDS = SECOES.map(([id]) => id);

/**
 * Barra fixa do topo.
 *
 * Ela nasce transparente sobre o hero e só ganha fundo depois que a página
 * desce — assim a primeira tela fica inteira para a promessa, e o botão não
 * some quando a pessoa já rolou e decidiu.
 */
export function TopBar() {
  const desceu = useRolou(24);
  const progresso = useProgresso();

  return (
    <nav
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-[var(--t-base)]',
        desceu
          ? 'border-b border-line bg-canvas/80 backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[72rem] items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Marca />
          <span className="text-[15px] font-semibold tracking-tight text-ink">{BRAND.name}</span>
        </Link>

        <Link
          href="/app"
          className="inline-flex h-10 items-center rounded-field bg-accent px-5 text-[14px] font-medium text-accent-ink transition-[filter,transform] duration-[var(--t-fast)] hover:brightness-110 active:scale-[0.98]"
        >
          Começar agora
        </Link>
      </div>

      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-accent transition-transform duration-[var(--t-fast)]"
        style={{ transform: `scaleX(${progresso})` }}
      />
    </nav>
  );
}

/** o losango de latão: o mesmo do app, para a vitrine e o produto serem um só */
function Marca() {
  return (
    <span className="grid size-8 place-items-center rounded-[10px] bg-accent-soft ring-1 ring-inset ring-accent/25">
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path
          d="M12 2.5 21.5 12 12 21.5 2.5 12Z"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" fill="var(--accent)" />
      </svg>
    </span>
  );
}

/* -------------------------------------------------------------- trilho lateral */

/**
 * O trilho de pontos, um por seção.
 *
 * Só aparece em tela larga e com apontador fino: num celular ele roubaria a
 * borda onde o polegar vive, e a rolagem já é a navegação natural ali.
 */
export function Trilho() {
  const ativa = useSecaoVisivel(IDS);

  return (
    <nav
      aria-label="Seções"
      className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 [@media(pointer:fine)]:xl:flex"
    >
      {SECOES.map(([id, nome]) => (
        <a key={id} href={`#${id}`} className="group flex items-center justify-end gap-2.5">
          <span className="pointer-events-none whitespace-nowrap text-[12px] text-ink-3 opacity-0 transition-opacity duration-[var(--t-fast)] group-hover:opacity-100">
            {nome}
          </span>
          <span
            className={cn(
              'size-1.5 rounded-full transition-[background-color,transform] duration-[var(--t-base)]',
              ativa === id ? 'scale-[1.6] bg-accent' : 'bg-line-strong group-hover:bg-ink-3',
            )}
          />
          <span className="sr-only">{nome}</span>
        </a>
      ))}
    </nav>
  );
}

/* ----------------------------------------------------------------- carrossel */

/**
 * A esteira de frases que anda sozinha.
 *
 * Movimento automático sem como parar é problema de acessibilidade de verdade:
 * quem lê devagar perde a frase no meio. Daí o botão de pausar, o respeito a
 * `prefers-reduced-motion` e a parada no hover.
 */
export function Esteira({ itens }: { itens: readonly { texto: string; fonte: string }[] }) {
  const [parado, setParado] = React.useState(false);

  return (
    <div className="relative">
      <div className="mb-5 flex justify-center">
        <button
          type="button"
          onClick={() => setParado((p) => !p)}
          className="rounded-field border border-line px-3 py-1.5 text-[12px] text-ink-2 transition-colors duration-[var(--t-fast)] hover:bg-surface-2"
        >
          {parado ? 'Continuar' : 'Pausar'}
        </button>
      </div>

      <div
        className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]"
        onMouseEnter={() => setParado(true)}
        onMouseLeave={() => setParado(false)}
      >
        <ul
          className="flex w-max gap-3 motion-reduce:animate-none"
          style={{
            animation: 'esteira 72s linear infinite',
            animationPlayState: parado ? 'paused' : 'running',
          }}
        >
          {[...itens, ...itens].map((item, i) => (
            <li
              key={i}
              aria-hidden={i >= itens.length}
              className="w-[19rem] shrink-0 rounded-card border border-line bg-surface p-4"
            >
              <p className="text-[14px] leading-relaxed text-ink">{item.texto}</p>
              <p className="mt-3 text-[12px] text-ink-3">{item.fonte}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ganchos */

/** quanto da página já passou, de 0 a 1 */
function useProgresso(): number {
  return React.useSyncExternalStore(assinaRolagem, lerProgresso, () => 0);
}

/** true depois de passar de `altura` pixels */
function useRolou(altura: number): boolean {
  const ler = React.useCallback(() => window.scrollY > altura, [altura]);
  return React.useSyncExternalStore(assinaRolagem, ler, () => false);
}

function assinaRolagem(aviso: () => void): () => void {
  window.addEventListener('scroll', aviso, { passive: true });
  window.addEventListener('resize', aviso, { passive: true });
  return () => {
    window.removeEventListener('scroll', aviso);
    window.removeEventListener('resize', aviso);
  };
}

function lerProgresso(): number {
  const total = document.documentElement.scrollHeight - window.innerHeight;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / total));
}

/**
 * Qual seção está na tela.
 *
 * Por observador e não por posição de rolagem: contar pixels erra assim que
 * uma seção muda de altura, e elas mudam em cada largura de tela.
 */
function useSecaoVisivel(ids: readonly string[]): string | null {
  const [ativa, setAtiva] = React.useState<string | null>(null);

  React.useEffect(() => {
    const alvos = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!alvos.length) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visivel) setAtiva(visivel.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] },
    );

    for (const alvo of alvos) observador.observe(alvo);
    return () => observador.disconnect();
  }, [ids]);

  return ativa;
}
