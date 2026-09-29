'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';

/**
 * As partes da vitrine que precisam do navegador.
 *
 * Tudo o mais na landing é HTML estático — o conteúdo não muda, então não há
 * motivo para mandar JavaScript junto. Só a barra do topo e o trilho lateral
 * dependem de rolagem, e são eles que moram aqui.
 */

/* ------------------------------------------------------------ link do app */

/**
 * Link para o app que só baixa o app quando a pessoa mostra intenção.
 *
 * O padrão do Next é pré-carregar a rota assim que o link aparece na tela — e
 * a rota do app traz a base local e o cliente da nuvem, uns 350 KB. Numa
 * vitrine, isso sairia do plano de dados de quem só veio ler. Aqui a carga
 * começa no hover, no toque ou no foco: ainda antes do clique, só para quem
 * vai clicar.
 */
export function AppLink({ href, className, children }: { href: '/app' | '/demo' | '/entrar'; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const prefetched = React.useRef(false);
  const warm = () => {
    if (prefetched.current) return;
    prefetched.current = true;
    router.prefetch(href);
  };
  return (
    <Link href={href} prefetch={false} className={className} onMouseEnter={warm} onFocus={warm} onTouchStart={warm}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------- topo */

/** as seções da página, na mesma ordem (o trilho lateral) */
const SECOES = [
  ['problema', 'O problema'],
  ['mes', 'O mês'],
  ['como-funciona', 'Como funciona'],
  ['inteligencia', 'Inteligência'],
  ['planejamento', 'Planejamento'],
  ['comportamento', 'Comportamento'],
  ['tudo-junto', 'Tudo junto'],
  ['recursos', 'Recursos'],
  ['privacidade', 'Privacidade'],
  ['perguntas', 'Perguntas'],
] as const;

/** a barra do topo fica curta: quatro destinos e o convite */
const LINKS = [
  ['como-funciona', 'Como funciona'],
  ['recursos', 'Recursos'],
  ['inteligencia', 'Inteligência'],
  ['privacidade', 'Privacidade'],
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
  const [aberto, setAberto] = React.useState(false);

  // Esc fecha o menu do celular, e o foco volta para o botão
  const botao = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAberto(false);
      botao.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto]);

  return (
    <nav
      aria-label="Principal"
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-[var(--t-base)]',
        desceu || aberto ? 'border-b border-line bg-canvas/85 backdrop-blur-xl' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[72rem] items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name}, início da página`}>
          <Marca />
          <span className="text-[15px] font-semibold tracking-tight text-ink">{BRAND.name}</span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map(([id, nome]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex h-10 items-center rounded-field px-3.5 text-[14px] text-ink-2 transition-colors duration-[var(--t-fast)] hover:bg-surface-2 hover:text-ink"
              >
                {nome}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <AppLink
            href="/entrar"
            className="inline-flex h-10 items-center rounded-field bg-accent px-4 text-[14px] font-medium text-accent-ink transition-[filter,transform] duration-[var(--t-fast)] hover:brightness-110 active:scale-[0.98] sm:px-5"
          >
            Começar agora
          </AppLink>
          <button
            ref={botao}
            type="button"
            onClick={() => setAberto((a) => !a)}
            aria-expanded={aberto}
            aria-controls="menu-vitrine"
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            className="grid size-10 place-items-center rounded-field text-ink-2 hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            {aberto ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {aberto ? (
        <ul id="menu-vitrine" className="border-t border-line px-5 pb-4 pt-2 lg:hidden">
          {LINKS.map(([id, nome]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={() => setAberto(false)}
                className="flex h-12 items-center border-b border-line text-[15px] text-ink last:border-b-0"
              >
                {nome}
              </a>
            </li>
          ))}
          <li className="pt-3">
            <AppLink href="/demo" className="flex h-11 items-center text-[14px] font-medium text-accent">
              Explorar com dados de exemplo →
            </AppLink>
          </li>
        </ul>
      ) : null}

      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-accent transition-transform duration-[var(--t-fast)]"
        style={{ transform: `scaleX(${progresso})` }}
      />
    </nav>
  );
}

/** o losango de latão: o mesmo do app, para a vitrine e o produto serem um só */
export function Marca() {
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
