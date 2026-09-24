import * as React from 'react';
import { THEME_KEY } from './theme-boot';
import type { ThemeChoice } from './types';

/**
 * O tema de cada aparelho.
 *
 * Fica no armazenamento do navegador, não nas preferências sincronizadas: o
 * celular pode seguir o sistema enquanto o computador fica no escuro. Escuro é
 * o padrão da marca, então só "claro" e "automático" precisam ser gravados.
 *
 * O atributo no <html> é escrito antes do primeiro paint pelo script do
 * layout; aqui o React lê de lá em vez de guardar uma cópia.
 */

const CANVAS = { light: '#faf9f6', dark: '#0b0b0c' } as const;

const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'system' ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

const systemIsLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

function paint(choice: ThemeChoice) {
  const light = choice === 'light' || (choice === 'system' && systemIsLight());
  const root = document.documentElement;
  if (light) root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  // a barra do navegador e a do app instalado acompanham o fundo
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? CANVAS.light : CANVAS.dark);
}

export function applyTheme(choice: ThemeChoice) {
  paint(choice);
  try {
    if (choice === 'dark') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // armazenamento bloqueado: o tema vale só nesta sessão
  }
  notify();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const readIsLight = () => document.documentElement.getAttribute('data-theme') === 'light';

export function useIsLight(): boolean {
  return React.useSyncExternalStore(subscribe, readIsLight, () => false);
}

export function useThemeChoice(): ThemeChoice {
  return React.useSyncExternalStore(subscribe, readThemeChoice, () => 'dark' as const);
}

/**
 * No automático, o app muda junto com o sistema — sem precisar recarregar.
 * Também alinha a cor da barra ao tema que o script do layout já aplicou.
 */
export function useSystemTheme() {
  React.useEffect(() => {
    paint(readThemeChoice());
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (readThemeChoice() !== 'system') return;
      paint('system');
      notify();
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
}
