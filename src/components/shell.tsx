'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Calculator,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Home,
  Landmark,
  LayoutGrid,
  Newspaper,
  Plus,
  Receipt,
  Repeat,
  Search,
  Settings,
  Sparkles,
  SunMoon,
  Tags,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import {
  ROOTS,
  VIEW_META,
  isRoot,
  parseHash,
  rootOf,
  routeHash,
  viewTitle,
  type RootId,
  type Route,
  type SubId,
  type ViewId,
} from '@/lib/nav';
import { IconButton } from './ui';

export { IconButton } from './ui';

export const VIEW_ICONS: Record<ViewId, LucideIcon> = {
  inicio: Home,
  movimentos: ArrowLeftRight,
  planejamento: CalendarRange,
  patrimonio: Landmark,
  mais: LayoutGrid,
  calendario: CalendarDays,
  orcamento: ClipboardList,
  metas: Target,
  assinaturas: Repeat,
  cartoes: CreditCard,
  dividas: Receipt,
  importar: FileUp,
  simuladores: Calculator,
  rateio: Users,
  comprovantes: FileText,
  news: Newspaper,
  busca: Search,
  ia: Sparkles,
  ajustes: Settings,
  categorias: Tags,
};

/* ------------------------------------------------------------------ saudação */

/** "Bom dia" até 12h, "Boa tarde" até 18h, "Boa noite" depois */
export function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-surface-3 font-semibold text-ink-2"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || '?'}
    </span>
  );
}

/* -------------------------------------------------------------------- rotas */

/**
 * A tela aberta mora na URL (`/app#/metas`).
 *
 * Antes ela vivia só na memória: o voltar do celular fechava o app, recarregar
 * jogava de volta no início e não dava para guardar o atalho de uma tela. O
 * hash resolve os três sem servidor nenhum — o app continua uma página só.
 */
const routeListeners = new Set<() => void>();

function subscribeRoute(fn: () => void) {
  routeListeners.add(fn);
  window.addEventListener('popstate', fn);
  window.addEventListener('hashchange', fn);
  return () => {
    routeListeners.delete(fn);
    window.removeEventListener('popstate', fn);
    window.removeEventListener('hashchange', fn);
  };
}

const readHash = () => window.location.hash;

export function navigate(route: Route, opts: { replace?: boolean } = {}) {
  const url = `${window.location.pathname}${window.location.search}${routeHash(route)}`;
  if (opts.replace) {
    window.history.replaceState(window.history.state, '', url);
  } else {
    const depth = (window.history.state?.appDepth ?? 0) + 1;
    window.history.pushState({ appDepth: depth }, '', url);
  }
  routeListeners.forEach((fn) => fn());
}

export function useRoute() {
  const hash = React.useSyncExternalStore(subscribeRoute, readHash, () => '');
  const route = React.useMemo<Route>(() => parseHash(hash) ?? { view: 'inicio' }, [hash]);

  const go = React.useCallback((next: Route | ViewId) => {
    const target = typeof next === 'string' ? { view: next } : next;
    navigate(target);
    window.scrollTo({ top: 0 });
  }, []);

  /** volta pelo histórico quando fomos nós que empilhamos; senão, sobe para o pai */
  const back = React.useCallback(() => {
    if ((window.history.state?.appDepth ?? 0) > 0) {
      window.history.back();
      return;
    }
    const parent = isRoot(route.view) ? 'inicio' : rootOf(route.view);
    navigate({ view: parent }, { replace: true });
  }, [route.view]);

  return { route, go, back };
}

/* --------------------------------------------------------------------- topo */

export function TopBar({
  view,
  hidden,
  onToggleHidden,
  onBack,
  onGo,
  greeting,
}: {
  view: ViewId;
  hidden: boolean;
  onToggleHidden: () => void;
  onBack: () => void;
  onGo: (view: ViewId) => void;
  greeting: string;
}) {
  const root = isRoot(view);

  return (
    <header
      className="sticky top-0 z-30 border-b border-transparent bg-canvas/85 backdrop-blur-xl lg:hidden"
      style={{ paddingTop: 'var(--sa-top)' }}
    >
      <div className="mx-auto flex h-14 max-w-[720px] items-center gap-1 px-2">
        {root ? (
          view === 'inicio' ? (
            <button
              type="button"
              onClick={() => onGo('ajustes')}
              className="flex min-h-11 items-center gap-2.5 rounded-field px-2 text-left"
              aria-label="Abrir ajustes e perfil"
            >
              <BrandMark />
              <span className="text-[15px] font-semibold tracking-tight text-ink">{BRAND.name}</span>
            </button>
          ) : (
            <h1 className="px-3 font-display text-[24px] leading-none text-ink">{viewTitle(view)}</h1>
          )
        ) : (
          <>
            <IconButton label="Voltar" onClick={onBack}>
              <ChevronLeft size={21} />
            </IconButton>
            <h1 className="min-w-0 truncate font-display text-[21px] leading-none text-ink">{viewTitle(view)}</h1>
          </>
        )}

        <span className="flex-1" />
        <span className="sr-only">{greeting}</span>

        <IconButton label={hidden ? 'Mostrar valores' : 'Esconder valores'} onClick={onToggleHidden} active={hidden}>
          {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </IconButton>
        {view !== 'busca' && (
          <IconButton label="Buscar no FinanceOS" onClick={() => onGo('busca')}>
            <Search size={18} />
          </IconButton>
        )}
        {view !== 'ia' && (
          <IconButton label="Perguntar ao assistente" onClick={() => onGo('ia')} accent>
            <Sparkles size={18} />
          </IconButton>
        )}
      </div>
    </header>
  );
}

/** o losango de latão: o mesmo da vitrine */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[10px] bg-accent-soft ring-1 ring-inset ring-accent/25"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.52, height: size * 0.52 }}>
        <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" fill="var(--accent)" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------ barra de baixo */

export function BottomNav({ view, onGo }: { view: ViewId; onGo: (view: RootId) => void }) {
  const active = rootOf(view);

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'var(--sa-bottom)' }}
    >
      <ul className="mx-auto grid max-w-[720px] grid-cols-5" style={{ height: 'var(--nav-h)' }}>
        {ROOTS.map((r) => {
          const Icon = VIEW_ICONS[r.id];
          const on = active === r.id;
          return (
            <li key={r.id} className="flex">
              <button
                type="button"
                onClick={() => onGo(r.id)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-tight',
                  'transition-colors duration-[var(--t-fast)]',
                  on ? 'text-accent' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-0 h-0.5 w-8 rounded-full bg-accent transition-opacity duration-[var(--t-base)]',
                    on ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon size={21} strokeWidth={on ? 2.2 : 1.8} aria-hidden />
                {r.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** o botão de registrar, flutuando acima da barra no celular */
export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Registrar gasto, receita ou investimento"
      className={cn(
        'fixed right-4 z-40 grid size-14 place-items-center rounded-full bg-accent text-accent-ink shadow-e3 lg:hidden',
        'transition-transform duration-[var(--t-fast)] ease-[var(--ease)] active:scale-95',
      )}
      style={{ bottom: 'calc(var(--nav-h) + var(--sa-bottom) + 14px)' }}
    >
      <Plus size={26} strokeWidth={2.3} />
    </button>
  );
}

/* ------------------------------------------------------------------- lateral */

const SIDEBAR_GROUPS: { label: string | null; items: ViewId[] }[] = [
  { label: null, items: ['inicio', 'movimentos'] },
  { label: 'Planejamento', items: ['calendario', 'metas', 'assinaturas', 'orcamento'] },
  { label: 'Compromissos', items: ['cartoes', 'dividas'] },
  { label: 'Seu patrimônio', items: ['patrimonio'] },
  { label: 'Ferramentas', items: ['importar', 'simuladores', 'rateio', 'comprovantes', 'news'] },
];

export function Sidebar({
  view,
  hiddenViews,
  onGo,
  onAdd,
  onToggleTheme,
  footer,
}: {
  view: ViewId;
  hiddenViews: SubId[];
  onGo: (view: ViewId) => void;
  onAdd: () => void;
  onToggleTheme: () => void;
  /** estado da sincronização ou aviso do modo demonstração */
  footer?: React.ReactNode;
}) {
  return (
    <aside
      aria-label="Menu"
      className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-surface/60 lg:flex"
    >
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name}, página inicial`}>
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-ink">{BRAND.name}</span>
        </Link>
      </div>

      <div className="grid gap-2 px-3">
        <button
          type="button"
          onClick={onAdd}
          className="flex h-11 items-center justify-center gap-2 rounded-field bg-accent text-[14px] font-semibold text-accent-ink shadow-e1 transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={18} strokeWidth={2.4} />
          Registrar
        </button>
        <button
          type="button"
          onClick={() => onGo('busca')}
          className="flex h-10 items-center gap-2 rounded-field border border-line bg-surface-2 px-3 text-left text-[13px] text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2"
        >
          <Search size={15} />
          <span className="flex-1">Buscar no {BRAND.name}…</span>
          <kbd className="rounded-[5px] border border-line px-1.5 text-[11px] text-ink-3">/</kbd>
        </button>
      </div>

      <nav className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {SIDEBAR_GROUPS.map((group) => {
          const items = group.items.filter((id) => !hiddenViews.includes(id as SubId));
          if (!items.length) return null;
          return (
            <div key={group.label ?? 'topo'} className="mb-1.5">
              {group.label ? (
                <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                  {group.label}
                </p>
              ) : null}
              <ul className="grid gap-0.5">
                {items.map((id) => (
                  <SidebarItem key={id} id={id} active={view === id} onGo={onGo} />
                ))}
              </ul>
            </div>
          );
        })}

        <ul className="mt-1 grid gap-0.5 border-t border-line pt-3">
          <SidebarItem id="ia" active={view === 'ia'} onGo={onGo} />
          <SidebarItem id="ajustes" active={view === 'ajustes' || view === 'categorias'} onGo={onGo} />
        </ul>
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <div className="min-w-0 flex-1 text-[12px] leading-snug text-ink-3">{footer}</div>
        <IconButton label="Tema claro ou escuro" onClick={onToggleTheme}>
          <SunMoon size={17} />
        </IconButton>
      </div>
    </aside>
  );
}

function SidebarItem({ id, active, onGo }: { id: ViewId; active: boolean; onGo: (view: ViewId) => void }) {
  const Icon = VIEW_ICONS[id];
  return (
    <li>
      <button
        type="button"
        onClick={() => onGo(id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-9 w-full items-center gap-3 rounded-field px-2.5 text-left text-[14px] transition-colors',
          active ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )}
      >
        <Icon size={17} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
        {id === 'patrimonio' ? 'Patrimônio' : VIEW_META[id].title.replace(`${BRAND.name} `, '')}
      </button>
    </li>
  );
}

/** cabeçalho de página no desktop: título, para que serve e ações */
export function PageHeader({
  view,
  onBack,
  actions,
}: {
  view: ViewId;
  onBack: () => void;
  actions?: React.ReactNode;
}) {
  const nested = !isRoot(view);
  return (
    <div className="mb-6 hidden items-end gap-4 pt-8 lg:flex">
      {nested ? (
        <IconButton label="Voltar" onClick={onBack} className="-ml-2 mb-0.5">
          <ChevronLeft size={21} />
        </IconButton>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[34px] leading-none text-ink">{viewTitle(view)}</h1>
        <p className="mt-2 text-[14px] text-ink-3">{VIEW_META[view].description}</p>
      </div>
      {actions}
    </div>
  );
}
