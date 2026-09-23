'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------ botao */

type ButtonVariant = 'primary' | 'ghost' | 'quiet' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95',
  ghost: 'border border-line text-ink hover:bg-surface-2',
  quiet: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'text-out hover:bg-out-soft',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
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
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{children}</h2>
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
        <p className="text-[12px] text-out">{error}</p>
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
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-field bg-surface-2 p-1">
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
              'h-9 flex-1 rounded-[7px] text-[13px] font-medium',
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

/* ------------------------------------------------------------------ folha */

/**
 * Folha que sobe de baixo no celular e vira dialogo centrado no desktop.
 * Fecha no Esc e no clique fora, prende o foco e devolve o scroll ao sair.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(10,10,12,0.45)] backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-surface shadow-e3',
          'rounded-t-panel sm:max-w-[440px] sm:rounded-panel',
          'motion-safe:animate-[sheet-in_var(--t-slow)_var(--ease-out)]',
        )}
        style={{ paddingBottom: 'var(--sa-bottom)' }}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <Button variant="quiet" size="sm" onClick={onClose} aria-label="Fechar">
            Fechar
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
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
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-display text-[22px] text-ink">{title}</p>
      <p className="max-w-[34ch] text-[14px] leading-relaxed text-ink-3">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
