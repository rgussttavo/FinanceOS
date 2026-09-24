'use client';

import * as React from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  FileText,
  FileUp,
  Home,
  Landmark,
  Menu as MenuIcon,
  Newspaper,
  Plus,
  Receipt,
  Repeat,
  Search,
  Settings,
  Sparkles,
  SunMoon,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { TABS, TOOLS, isTab, viewTitle, type TabId, type ToolId, type ViewId } from '@/lib/nav';

const TAB_ICONS: Record<TabId, LucideIcon> = {
  inicio: Home,
  receitas: ArrowDownToLine,
  despesas: ArrowUpFromLine,
  investimentos: TrendingUp,
};

const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  news: Newspaper,
  importar: FileUp,
  assinaturas: Repeat,
  cartoes: CreditCard,
  metas: Target,
  dividas: Receipt,
  rateio: Users,
  orcamento: ClipboardList,
  comprovantes: FileText,
  patrimonio: Landmark,
};

/* ------------------------------------------------------------------ saudação */

/** "Bom dia" até 12h, "Boa tarde" até 18h, "Boa noite" depois */
export function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ------------------------------------------------------------------- topo */

export interface TopBarProps {
  view: ViewId;
  name: string;
  onOpenMenu: () => void;
  onOpenProfile: () => void;
  onOpenIA: () => void;
  onOpenSearch: () => void;
  onBack: () => void;
}

export function TopBar({ view, name, onOpenMenu, onOpenProfile, onOpenIA, onOpenSearch, onBack }: TopBarProps) {
  const inner = isTab(view);

  return (
    <header
      className="sticky top-0 z-30 bg-canvas/80 backdrop-blur-xl"
      style={{ paddingTop: 'var(--sa-top)' }}
    >
      <div className="col flex h-14 items-center gap-2">
        <IconButton label="Menu" onClick={onOpenMenu}>
          <MenuIcon size={19} />
        </IconButton>

        {inner ? (
          <>
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-2.5 rounded-field px-1 py-1 text-left transition-colors hover:bg-surface-2"
            >
              <Avatar name={name} />
              <span className="leading-tight">
                <span className="block text-[11px] text-ink-3">{greetingFor()},</span>
                <span className="block text-[14px] font-semibold text-ink">{name}</span>
              </span>
            </button>

            <div className="flex-1" />

            <IconButton label="Perguntar sobre meu dinheiro" onClick={onOpenIA} accent>
              <Sparkles size={18} />
            </IconButton>
            <IconButton label="Buscar" onClick={onOpenSearch}>
              <Search size={18} />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton label="Voltar" onClick={onBack}>
              <ChevronLeft size={20} />
            </IconButton>
            <h1 className="flex-1 text-center font-display text-[21px] leading-none text-ink">
              {viewTitle(view)}
            </h1>
            <span className="w-9" aria-hidden />
          </>
        )}
      </div>
    </header>
  );
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

export function IconButton({
  label,
  onClick,
  accent,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors duration-[var(--t-fast)]',
        active
          ? 'bg-accent-soft text-accent'
          : accent
            ? 'text-accent hover:bg-accent-soft'
            : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ abas */

export function TabBar({
  view,
  onChange,
  onAdd,
}: {
  view: ViewId;
  onChange: (tab: TabId) => void;
  onAdd: () => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40"
      style={{ paddingBottom: 'calc(var(--sa-bottom) + 14px)' }}
      aria-label="Navegação principal"
    >
      {/* véu que apaga o conteúdo por baixo da barra sem cortar seco */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-canvas via-canvas/85 to-transparent"
      />
      <div className="col relative flex items-center gap-2.5">
        <div
          className={cn(
            'flex flex-1 items-center justify-around rounded-full border border-line bg-surface/85 px-1.5',
            'shadow-e2 backdrop-blur-xl',
          )}
          style={{ height: 'var(--tabbar-h)' }}
        >
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.id];
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                aria-label={tab.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'grid h-11 w-11 place-items-center rounded-full transition-all duration-[var(--t-base)] ease-[var(--ease)]',
                  active ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAdd}
          aria-label="Adicionar lançamento"
          className={cn(
            'grid shrink-0 place-items-center rounded-full bg-accent text-accent-ink shadow-e2',
            'transition-transform duration-[var(--t-fast)] ease-[var(--ease)] active:scale-95',
          )}
          style={{ width: 'var(--tabbar-h)', height: 'var(--tabbar-h)' }}
        >
          <Plus size={26} strokeWidth={2.3} />
        </button>
      </div>
    </nav>
  );
}

/* --------------------------------------------------------------- gaveta */

export function Drawer({
  open,
  view,
  name,
  hiddenTools = [],
  onClose,
  onGo,
  onOpenProfile,
  onToggleTheme,
  onOpenSettings,
}: {
  open: boolean;
  view: ViewId;
  name: string;
  /** ferramentas desligadas nas configurações; somem do menu inteiro */
  hiddenTools?: ToolId[];
  onClose: () => void;
  onGo: (view: ViewId) => void;
  onOpenProfile: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(0,0,0,0.55)] motion-safe:animate-[fade-in_var(--t-base)_ease-out]"
      />
      <div
        className={cn(
          'relative flex h-full w-[min(19rem,84vw)] flex-col border-r border-line bg-surface',
          'motion-safe:animate-[drawer-in_var(--t-slow)_var(--ease-out)]',
        )}
        style={{ paddingTop: 'var(--sa-top)' }}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <Avatar name={name} size={42} />
            <span className="min-w-0 leading-tight">
              <span className="block text-[12px] text-ink-3">{greetingFor()},</span>
              <span className="block truncate text-[16px] font-semibold text-ink">{name}</span>
            </span>
          </button>
          <IconButton label="Claro ou escuro" onClick={onToggleTheme}>
            <SunMoon size={18} />
          </IconButton>
          <IconButton label="Configurações" onClick={onOpenSettings}>
            <Settings size={18} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            Ferramentas
          </p>
          <ul className="grid gap-0.5">
            {TOOLS.filter((tool) => !hiddenTools.includes(tool.id)).map((tool) => {
              const Icon = TOOL_ICONS[tool.id];
              const active = view === tool.id;
              return (
                <li key={tool.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onGo(tool.id);
                      onClose();
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-field px-2.5 py-2.5 text-left transition-colors',
                      active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-9 w-9 place-items-center rounded-[10px]',
                        active ? 'bg-accent/15' : 'bg-surface-2',
                      )}
                    >
                      <Icon size={17} strokeWidth={1.9} />
                    </span>
                    <span className="text-[15px] font-medium">{tool.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="border-t border-line px-5 py-4 text-[12px] text-ink-3">
          {BRAND.name} · {BRAND.tagline}
        </p>
      </div>
    </div>
  );
}
