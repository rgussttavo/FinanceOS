'use client';

import * as React from 'react';
import { CloudOff, Eye, EyeOff, Moon, RefreshCw, Sun } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'norte-theme';

/**
 * O tema vive no atributo `data-theme` do <html>, escrito antes do primeiro
 * paint pelo script do layout. O React lê de lá em vez de guardar uma cópia:
 * uma fonte da verdade só, sem piscar na hidratação.
 */
const themeListeners = new Set<() => void>();

function readTheme(): Theme {
  const value = document.documentElement.getAttribute('data-theme');
  return value === 'light' || value === 'dark' ? value : 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  try {
    if (theme === 'system') {
      root.removeAttribute('data-theme');
      localStorage.removeItem(STORAGE_KEY);
    } else {
      root.setAttribute('data-theme', theme);
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // navegador com armazenamento bloqueado: o tema vale só nesta sessão
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }
  for (const notify of themeListeners) notify();
}

function subscribeTheme(onChange: () => void): () => void {
  themeListeners.add(onChange);
  return () => {
    themeListeners.delete(onChange);
  };
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = React.useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as Theme);
  return [theme, applyTheme];
}

export interface AppHeaderProps {
  privateMode: boolean;
  onTogglePrivate: () => void;
  pendingSync: number;
  online: boolean;
}

export function AppHeader({ privateMode, onTogglePrivate, pendingSync, online }: AppHeaderProps) {
  const [theme, setTheme] = useTheme();

  const cycleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');

  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-xl"
      style={{ paddingTop: 'var(--sa-top)' }}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[21px] leading-none text-ink">{BRAND.name}</span>
          <span className="hidden text-[12px] text-ink-3 sm:inline">{BRAND.tagline}</span>
        </div>

        <div className="flex items-center gap-0.5">
          <SyncBadge pending={pendingSync} online={online} />

          <IconButton
            label={privateMode ? 'Mostrar valores' : 'Esconder valores'}
            onClick={onTogglePrivate}
            active={privateMode}
          >
            {privateMode ? <EyeOff size={18} /> : <Eye size={18} />}
          </IconButton>

          <IconButton
            label={
              theme === 'light' ? 'Tema claro' : theme === 'dark' ? 'Tema escuro' : 'Tema do aparelho'
            }
            onClick={cycleTheme}
          >
            {theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Sun size={18} className="opacity-60" />}
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
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
        'grid h-9 w-9 place-items-center rounded-field transition-colors duration-[var(--t-fast)]',
        active ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Estado do sync, dito em português. "3 por sincronizar" informa; um ícone
 * cinza que ninguém entende, não.
 */
function SyncBadge({ pending, online }: { pending: number; online: boolean }) {
  if (!online) {
    return (
      <span className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-ink-3">
        <CloudOff size={13} />
        offline
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] text-accent">
        <RefreshCw size={13} />
        {pending} por sincronizar
      </span>
    );
  }
  return null;
}
