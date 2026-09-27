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

  if (lastComma >= 0 && lastDot >= 0) {
    // os dois aparecem: o último é o decimal, o outro é milhar
    normalized =
      lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastDot >= 0) {
    /**
     * Só ponto. Em português, "5.800" são cinco mil e oitocentos — o ponto é de
     * milhar quando se repete ou quando vem seguido de três dígitos. "12.50",
     * com um ou dois dígitos depois, é quem digitou o decimal com ponto.
     */
    const thousands = (cleaned.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(cleaned);
    normalized = thousands ? cleaned.replace(/\./g, '') : cleaned;
  } else if (lastComma >= 0) {
    // só vírgula: é o decimal, a não ser que se repita ("1,250,000")
    normalized = (cleaned.match(/,/g) ?? []).length > 1 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else {
    normalized = cleaned;
  }

  return decimalToCents(normalized);
}

/* ------------------------------------------------------- texto em centavos */

/**
 * Texto decimal para centavos, nos dígitos (FIN-010).
 *
 * Recebe o número já normalizado — ponto como decimal, sem separador de
 * milhar, sinal opcional na frente: "1234.567", "-2.675". A regra de
 * arredondamento é uma só no app inteiro: meio para cima, sobre o valor
 * absoluto (2,675 → 2,68; −1,005 → −1,01).
 *
 * A conta é feita nos dígitos, e não multiplicando ponto flutuante por 100:
 * 1.005 × 100 dá 100,4999…, e o arredondamento caía para 1,00 em uns valores e
 * subia em outros. Valor maior do que um número do JavaScript guarda sem
 * perder centavo (R$ 9,9 trilhões) é recusado em vez de gravado errado.
 */
export function decimalToCents(text: string): Cents | null {
  const m = /^\s*(-)?(\d*)(?:\.(\d*))?\s*$/.exec(text);
  if (!m) return null;
  const [, sign, intRaw, fracRaw = ''] = m;
  if (!intRaw && !fracRaw) return null;
  const int = intRaw.replace(/^0+(?=\d)/, '') || '0';
  if (int.length > 13) return null;
  const frac = fracRaw.padEnd(2, '0');
  let cents = Number(int) * 100 + Number(frac.slice(0, 2));
  if (frac.length > 2 && frac[2] >= '5') cents += 1;
  if (cents > Number.MAX_SAFE_INTEGER) return null;
  return sign && cents !== 0 ? -cents : cents;
}

/**
 * Número (de uma célula de planilha, de uma conta) para centavos, pela mesma
 * regra. Parte do menor texto que representa o número — 2.675, e não
 * 2.67499999… —, que é o valor que a pessoa escreveu na célula.
 */
export function numberToCents(n: number): Cents | null {
  if (!Number.isFinite(n)) return null;
  return decimalToCents(plainDecimal(n));
}

/** 1e-7 → "0.0000001", 1.5e+21 → "1500000000000000000000": sem notação científica */
function plainDecimal(n: number): string {
  const s = String(n);
  const m = /^(-)?(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(s);
  if (!m) return s;
  const [, sign = '', int, frac = '', exp] = m;
  const digits = int + frac;
  const point = int.length + Number(exp);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
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
