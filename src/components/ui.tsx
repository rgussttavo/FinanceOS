'use client';

import * as React from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatMoney, type FormatOptions } from '@/lib/money';
import type { Cents } from '@/lib/types';

/**
 * As peças de interface do FinanceOS.
 *
 * Toda tela monta com o que está aqui. Um botão, um campo ou um aviso com cara
 * própria em cada canto é o que faz um produto parecer remendado — e o que
 * obriga a pessoa a reaprender a interface em cada tela.
 *
 * Escala de texto usada em todo o app:
 *   11px  rótulo em caixa alta (seções, legendas de número)
 *   12px  legenda, data, detalhe
 *   13px  texto secundário
 *   14–15 texto de leitura e itens de lista
 *   17px  título de folha e de card
 *   21–28 títulos em serifa
 *   32+   valores em destaque (sempre na serifa, com algarismos tabulares)
 */

/* ------------------------------------------------------------------ botao */

type ButtonVariant = 'primary' | 'ghost' | 'quiet' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95',
  ghost: 'border border-line text-ink hover:bg-surface-2',
  quiet: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'text-out hover:bg-out-soft',
  soft: 'bg-accent-soft text-accent hover:bg-accent/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-[15px] gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'ghost', size = 'md', className, type, ...props }: ButtonProps) {
  return (
    <button
      // sem type explícito o padrão do HTML é "submit"; dentro de um formulário
      // isso dispararia envio em vez de rodar o onClick
      type={type ?? 'button'}
      {...props}
      className={cn(
        'inline-flex items-center justify-center rounded-field font-medium',
        'transition-[background-color,color,filter,transform] duration-[var(--t-fast)] ease-[var(--ease)]',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  );
}

/**
 * Botão só de ícone. O rótulo é obrigatório: é o que o leitor de tela lê e o
 * que aparece ao parar o mouse em cima. A área de toque é de 40px mesmo quando
 * o desenho parece menor.
 */
export function IconButton({
  label,
  onClick,
  accent,
  active,
  children,
  className,
  size = 40,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full transition-colors duration-[var(--t-fast)]',
        active
          ? 'bg-accent-soft text-accent'
          : accent
            ? 'text-accent hover:bg-accent-soft'
            : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ cartao */

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('rounded-panel border border-line bg-surface shadow-e1', className)}
    />
  );
}

export function SectionTitle({
  children,
  action,
  as: Tag = 'h2',
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
      <Tag className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{children}</Tag>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- campos */

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, error, children, htmlFor }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-[12px] text-out">
          <AlertTriangle size={12} aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass = cn(
  'h-11 w-full rounded-field border border-line bg-surface-2 px-3 text-[15px] text-ink',
  'placeholder:text-ink-3 outline-none transition-colors duration-[var(--t-fast)]',
  'focus:border-accent focus:bg-surface',
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} {...props} className={cn(inputClass, className)} />;
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return <select ref={ref} {...props} className={cn(inputClass, 'pr-8', className)} />;
});

/**
 * Interruptor de liga/desliga. É um checkbox de verdade por baixo — teclado,
 * leitor de tela e formulário funcionam sem nenhuma adaptação.
 */
export function Switch({
  checked,
  onChange,
  label,
  detail,
  className,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  detail?: string;
  className?: string;
}) {
  const id = React.useId();
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-center justify-between gap-4 py-3.5', className)}>
      <span className="min-w-0">
        <span className="block text-[15px] text-ink">{label}</span>
        {detail ? <span className="block text-[12px] leading-relaxed text-ink-3">{detail}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            'h-7 w-12 rounded-full border transition-colors duration-[var(--t-base)]',
            checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-3',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute top-1 left-1 size-5 rounded-full shadow-e1 transition-transform duration-[var(--t-base)] ease-[var(--ease)]',
            checked ? 'translate-x-5 bg-accent-ink' : 'bg-ink-2',
          )}
        />
      </span>
    </label>
  );
}

/* ------------------------------------------------------- grupo de opcoes */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** cor semantica aplicada quando a opcao esta ativa */
  tone?: 'in' | 'out' | 'inv' | 'accent';
}

const TONE_ACTIVE: Record<string, string> = {
  in: 'bg-in-soft text-in',
  out: 'bg-out-soft text-out',
  inv: 'bg-inv-soft text-inv',
  accent: 'bg-accent-soft text-accent',
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex gap-1 rounded-field bg-surface-2 p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-9 flex-1 whitespace-nowrap rounded-[8px] px-2 text-[13px] font-medium',
              'transition-colors duration-[var(--t-fast)] ease-[var(--ease)]',
              active
                ? cn('shadow-e1', TONE_ACTIVE[opt.tone ?? 'accent'])
                : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** chip de filtro ou de escolha rápida; aria-pressed diz se está ligado */
export function Chip({
  active,
  onClick,
  children,
  className,
  ...rest
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      {...rest}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium',
        'transition-colors duration-[var(--t-fast)]',
        active
          ? 'border-accent/50 bg-accent-soft text-accent'
          : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ marcas */

export type Tone = 'neutral' | 'in' | 'out' | 'inv' | 'warn' | 'accent' | 'event';

const BADGE_TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  in: 'bg-in-soft text-in',
  out: 'bg-out-soft text-out',
  inv: 'bg-inv-soft text-inv',
  warn: 'bg-warn-soft text-warn',
  accent: 'bg-accent-soft text-accent',
  event: 'bg-event-soft text-event',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium',
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const METER_FILL: Record<Tone, string> = {
  neutral: 'bg-ink-3',
  in: 'bg-in',
  out: 'bg-out',
  inv: 'bg-inv',
  warn: 'bg-warn',
  accent: 'bg-accent',
  event: 'bg-event',
};

/**
 * Barra de progresso. `value` vai de 0 a 1 e é cortado nas pontas; o rótulo
 * é obrigatório porque uma barra sozinha não diz do que é.
 */
export function Meter({
  value,
  label,
  tone = 'accent',
  className,
  height = 8,
  valueText,
}: {
  value: number;
  label: string;
  tone?: Tone;
  className?: string;
  height?: number;
  /** o que o leitor de tela diz no lugar da porcentagem crua */
  valueText?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={valueText}
      className={cn('overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
    >
      <span
        className={cn('block h-full rounded-full transition-[width] duration-[var(--t-slow)] ease-[var(--ease-out)]', METER_FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- esqueleto */

/**
 * Esqueleto de carregamento. Tem o tamanho do que vai chegar, para a tela não
 * pular quando os dados aparecem — e some sozinho em vez de girar.
 */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={cn('block animate-pulse rounded-field bg-surface-2', className)} style={style} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="grid gap-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <span className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </span>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ dinheiro */

/** anda do valor anterior ao novo em ~420ms; sem movimento para quem pediu menos movimento */
export function useAnimatedNumber(target: number, duration = 420): number {
  const [shown, setShown] = React.useState(target);
  const from = React.useRef(target);

  React.useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const reduce =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      from.current = target;
      const id = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration]);

  return shown;
}

/**
 * Um valor em dinheiro. Toda tela mostra dinheiro por aqui ou por
 * `formatMoney` — nunca montando "R$" à mão.
 */
export function Money({
  value,
  hidden,
  animate,
  className,
  ...opts
}: {
  value: Cents;
  hidden?: boolean;
  animate?: boolean;
  className?: string;
} & Omit<FormatOptions, 'hidden'>) {
  const animated = useAnimatedNumber(value);
  const shown = animate ? animated : value;
  return (
    <span className={cn('tnum', className)} aria-label={hidden ? 'valor oculto' : undefined}>
      {formatMoney(shown, { ...opts, hidden })}
    </span>
  );
}

/* ------------------------------------------------------------------ camadas */

/**
 * A pilha de camadas abertas (folhas, diálogos, menu).
 *
 * Com uma folha aberta e um diálogo de confirmação por cima, o Esc e o Tab
 * têm que valer só para a de cima. Cada camada se registra aqui ao abrir.
 */
const layers: number[] = [];
let layerSeq = 0;
let scrollLocks = 0;
let savedOverflow = '';

function lockScroll() {
  if (scrollLocks === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Prende o foco dentro da camada, fecha no Esc, trava a rolagem do fundo e,
 * ao fechar, devolve o foco a quem abriu. Sem isso, quem navega por teclado
 * "cai" atrás da folha e perde o lugar em que estava.
 */
export function useLayer(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>, autoFocus = true) {
  const closeRef = React.useRef(onClose);
  React.useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const id = ++layerSeq;
    layers.push(id);
    const previous = document.activeElement as HTMLElement | null;
    lockScroll();

    if (autoFocus) {
      // o primeiro campo ganha o foco; sem campo, o painel inteiro
      const first =
        ref.current?.querySelector<HTMLElement>('[data-autofocus]') ??
        ref.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea') ??
        ref.current;
      first?.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (layers[layers.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const at = layers.indexOf(id);
      if (at >= 0) layers.splice(at, 1);
      unlockScroll();
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open, ref, autoFocus]);
}

/* ------------------------------------------------------------------ folha */

/**
 * Folha que sobe de baixo no celular e vira diálogo centrado no desktop.
 * Fecha no Esc e no clique fora, prende o foco e devolve o scroll ao sair.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();
  useLayer(open, onClose, panelRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(10,10,12,0.5)] backdrop-blur-[2px] motion-safe:animate-[fade-in_var(--t-base)_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-e3 outline-none',
          'rounded-t-panel sm:rounded-panel',
          size === 'lg' ? 'sm:max-w-[560px]' : 'sm:max-w-[460px]',
          'motion-safe:animate-[sheet-in_var(--t-slow)_var(--ease-out)]',
        )}
        style={{ paddingBottom: 'var(--sa-bottom)' }}
      >
        <span aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong sm:hidden" />
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3.5 pt-3 sm:pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-[13px] leading-snug text-ink-3">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Fechar" onClick={onClose} className="-mr-2 -mt-1">
            <X size={18} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
        {footer ? <footer className="border-t border-line px-5 py-4">{footer}</footer> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ vazio */

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 text-center', compact ? 'py-8' : 'py-12')}>
      {icon ? (
        <span className="mb-1 grid size-12 place-items-center rounded-full bg-accent-soft text-accent">{icon}</span>
      ) : null}
      <p className="font-display text-[22px] leading-tight text-ink">{title}</p>
      <p className="max-w-[36ch] text-[14px] leading-relaxed text-ink-3">{description}</p>
      {action ? <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- aviso */

export type ToastTone = 'ok' | 'info' | 'warn' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  duration: number;
}

let toastSeq = 0;
let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((fn) => fn());

/**
 * Um aviso discreto no pé da tela: "Gasto registrado.", "Meta atualizada.".
 *
 * Fica quatro segundos, ou mais quando traz uma ação — tempo de alguém ler e
 * tocar em "Desfazer". Vive fora do React para qualquer função poder avisar,
 * inclusive as que não são componentes.
 */
export function toast(
  message: string,
  opts: {
    tone?: ToastTone;
    action?: { label: string; onClick: () => void };
    secondary?: { label: string; onClick: () => void };
    duration?: number;
  } = {},
): number {
  const id = ++toastSeq;
  const item: ToastItem = {
    id,
    message,
    tone: opts.tone ?? 'ok',
    action: opts.action,
    secondary: opts.secondary,
    duration: opts.duration ?? (opts.action ? 6500 : 4000),
  };
  // no máximo três na tela; o mais antigo sai
  toasts = [...toasts, item].slice(-3);
  emitToasts();
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

const subscribeToasts = (fn: () => void) => {
  toastListeners.add(fn);
  return () => {
    toastListeners.delete(fn);
  };
};

const TOAST_ICON: Record<ToastTone, React.ReactNode> = {
  ok: <Check size={15} strokeWidth={2.6} />,
  info: <Info size={15} />,
  warn: <AlertTriangle size={15} />,
  error: <AlertTriangle size={15} />,
};

const TOAST_ICON_TONE: Record<ToastTone, string> = {
  ok: 'bg-in-soft text-in',
  info: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  error: 'bg-out-soft text-out',
};

export function Toaster() {
  const items = React.useSyncExternalStore(subscribeToasts, () => toasts, () => toasts);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:right-6 lg:items-end"
      style={{ bottom: 'var(--toast-bottom)' }}
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  React.useEffect(() => {
    const id = setTimeout(() => dismissToast(item.id), item.duration);
    return () => clearTimeout(id);
  }, [item.id, item.duration]);

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-card border border-line-strong bg-surface-hi px-3 py-2.5 shadow-e3 motion-safe:animate-[rise-in_var(--t-base)_var(--ease-out)]"
    >
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', TOAST_ICON_TONE[item.tone])}>
        {TOAST_ICON[item.tone]}
      </span>
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink">{item.message}</p>
      {item.secondary ? (
        <button
          type="button"
          onClick={() => {
            item.secondary?.onClick();
            dismissToast(item.id);
          }}
          className="h-9 shrink-0 rounded-field px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-3"
        >
          {item.secondary.label}
        </button>
      ) : null}
      {item.action ? (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismissToast(item.id);
          }}
          className="h-9 shrink-0 rounded-field px-2.5 text-[13px] font-semibold text-accent hover:bg-accent-soft"
        >
          {item.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => dismissToast(item.id)}
        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- confirmação */

interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let pendingConfirm: ConfirmRequest | null = null;
const confirmListeners = new Set<() => void>();

/**
 * Pergunta antes de algo sem volta, com a cara do app — o `confirm()` do
 * navegador interrompe tudo com uma caixa cinza que parece erro.
 */
export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    pendingConfirm?.resolve(false);
    pendingConfirm = { ...opts, resolve };
    confirmListeners.forEach((fn) => fn());
  });
}

const subscribeConfirm = (fn: () => void) => {
  confirmListeners.add(fn);
  return () => {
    confirmListeners.delete(fn);
  };
};

export function ConfirmHost() {
  const request = React.useSyncExternalStore(subscribeConfirm, () => pendingConfirm, () => null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  const settle = React.useCallback((ok: boolean) => {
    if (!pendingConfirm) return;
    const current = pendingConfirm;
    pendingConfirm = null;
    confirmListeners.forEach((fn) => fn());
    current.resolve(ok);
  }, []);

  const close = React.useCallback(() => settle(false), [settle]);
  useLayer(Boolean(request), close, panelRef, false);

  React.useEffect(() => {
    if (request) panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [request]);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cancelar"
        onClick={close}
        className="absolute inset-0 bg-[rgba(10,10,12,0.55)] motion-safe:animate-[fade-in_var(--t-base)_ease-out]"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[380px] rounded-panel border border-line bg-surface p-5 shadow-e3 motion-safe:animate-[sheet-in_var(--t-base)_var(--ease-out)]"
      >
        <h2 id={titleId} className="text-[17px] font-semibold text-ink">
          {request.title}
        </h2>
        {request.description ? (
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{request.description}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="quiet" onClick={close} data-autofocus>
            {request.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            variant={request.danger ? 'ghost' : 'primary'}
            className={cn(request.danger && 'border-out/40 text-out hover:bg-out-soft')}
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
