import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * A peça do quebra-cabeça financeiro: um fragmento real da interface — um
 * ícone, o nome da parte e um número — e não um desenho.
 *
 * É a mesma peça na landing, na entrada e no onboarding: é assim que a pessoa
 * sente que tudo é o mesmo produto. O tom segue as cores do sistema (entrada,
 * saída, investimento, atenção, destaque).
 */

export type PieceTone = 'in' | 'out' | 'inv' | 'warn' | 'accent' | 'neutral';

const TONE: Record<PieceTone, string> = {
  in: 'text-in bg-in-soft',
  out: 'text-out bg-out-soft',
  inv: 'text-inv bg-inv-soft',
  warn: 'text-warn bg-warn-soft',
  accent: 'text-accent bg-accent-soft',
  neutral: 'text-ink-2 bg-surface-2',
};

export function PuzzlePiece({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral',
  className,
  style,
}: {
  icon: LucideIcon;
  label: string;
  value?: React.ReactNode;
  detail?: React.ReactNode;
  tone?: PieceTone;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2.5 shadow-e1',
        className,
      )}
    >
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-[10px]', TONE[tone])} aria-hidden>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">{label}</span>
        {value !== undefined ? <span className="tnum block truncate text-[15px] font-semibold text-ink">{value}</span> : null}
        {detail ? <span className="block truncate text-[12px] text-ink-3">{detail}</span> : null}
      </span>
    </div>
  );
}
