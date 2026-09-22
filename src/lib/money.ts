import { BRAND } from './brand';
import type { Cents } from './types';

const nf = new Intl.NumberFormat(BRAND.locale, {
  style: 'currency',
  currency: BRAND.currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nfPlain = new Intl.NumberFormat(BRAND.locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nfCompact = new Intl.NumberFormat(BRAND.locale, {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

export interface FormatOptions {
  /** some com o valor e mostra tarja: o modo "estou no onibus" */
  hidden?: boolean;
  /** R$ 12,3 mil em vez de R$ 12.345,00 */
  compact?: boolean;
  /** sem o "R$" */
  bare?: boolean;
  /** forca o sinal, util em variacoes */
  signed?: boolean;
}

const MINUS = '−'; // sinal de menos tipografico, nao o hifen

/** centavos para texto em portugues. E a unica funcao que formata dinheiro. */
export function formatMoney(cents: Cents, opts: FormatOptions = {}): string {
  if (opts.hidden) return '••••';
  const value = cents / 100;
  const abs = Math.abs(value);

  let body: string;
  if (opts.compact && abs >= 10_000) {
    body = opts.bare ? nfCompact.format(abs) : `R$ ${nfCompact.format(abs)}`;
  } else {
    body = opts.bare ? nfPlain.format(abs) : nf.format(abs);
  }

  if (value < 0) return `${MINUS}${body}`;
  if (opts.signed && value > 0) return `+${body}`;
  return body;
}

/**
 * Texto digitado para centavos. Aceita o que a pessoa realmente escreve:
 * "1.234,56", "1234,5", "1234.56", "R$ 90", "90".
 * Retorna null quando nao da para ler um numero.
 */
export function parseMoney(input: string): Cents | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d,.-]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma > lastDot) {
    // virgula e o decimal: tira os pontos de milhar
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // ponto e o decimal: tira as virgulas de milhar
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * Divide um valor entre n partes sem perder centavo. As primeiras partes ficam
 * um centavo maiores quando a divisao nao e exata: e assim que o rateio fecha.
 */
export function splitCents(total: Cents, parts: number): Cents[] {
  if (parts <= 0) return [];
  const base = Math.trunc(total / parts);
  const rest = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

export const sumCents = (values: Cents[]): Cents => values.reduce((a, b) => a + b, 0);

/** 0 quando o denominador e zero, em vez de NaN ou Infinity na tela */
export function ratio(part: Cents, whole: Cents): number {
  if (!whole) return 0;
  return part / whole;
}

export const formatPercent = (value: number, digits = 0): string =>
  new Intl.NumberFormat(BRAND.locale, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
