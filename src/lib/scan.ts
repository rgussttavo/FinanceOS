import { partsToIso } from './dates';
import type { Cents, IsoDate } from './types';

/**
 * Leitura de boleto e de Pix copia e cola.
 *
 * Os dois códigos já carregam valor e, no caso do boleto, vencimento. Ler isso
 * do código em vez de pedir para a pessoa digitar remove o passo mais chato do
 * app inteiro — e o mais sujeito a erro de digitação, porque é onde um dígito
 * trocado vira uma conta paga errada.
 *
 * Nada aqui vai para a rede: a leitura é local, e o código de um boleto é
 * informação bancária de quem está segurando o papel.
 */

export type ScanKind = 'boleto' | 'boleto-convenio' | 'pix';

export interface ScanResult {
  kind: ScanKind;
  /** valor lido, quando o código traz; null quando é em aberto */
  amount: Cents | null;
  dueDate: IsoDate | null;
  /** beneficiário, quando o código informa (Pix costuma trazer) */
  payee: string | null;
  /** texto para a descrição do lançamento */
  description: string;
}

const digitsOnly = (s: string) => String(s ?? '').replace(/\D/g, '');

/* ------------------------------------------------------------------ boleto */

/**
 * O fator de vencimento conta dias desde 07/10/1997 — a data base fixada pela
 * Febraban. Fator 0 significa boleto sem vencimento definido.
 */
const BOLETO_EPOCH = Date.UTC(1997, 9, 7);

function dueFromFactor(factor: number): IsoDate | null {
  if (!factor) return null;
  // a partir de 2025 o fator reiniciou em 1000 depois de passar de 9999
  const normalized = factor < 1000 ? factor + 9000 : factor;
  const d = new Date(BOLETO_EPOCH + normalized * 86_400_000);
  return partsToIso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Boleto bancário: 47 dígitos na linha digitável.
 *
 * Os últimos 14 dígitos são o campo livre com fator de vencimento (4) e valor
 * (10, em centavos) — é de lá que saem os dois dados que interessam.
 */
function parseBoleto(digits: string): ScanResult | null {
  if (digits.length !== 47) return null;

  const tail = digits.slice(33); // 14 dígitos
  const factor = Number(tail.slice(0, 4));
  const cents = Number(tail.slice(4));

  if (!Number.isFinite(cents)) return null;

  return {
    kind: 'boleto',
    amount: cents > 0 ? cents : null,
    dueDate: dueFromFactor(factor),
    payee: null,
    description: 'Boleto',
  };
}

/**
 * Boleto de concessionária e tributo: 48 dígitos, começa com 8.
 *
 * O terceiro dígito diz se o valor é efetivo (6 e 7) ou apenas referência
 * (8 e 9); quando é referência, o código não tem valor de verdade a informar.
 */
function parseConvenio(digits: string): ScanResult | null {
  if (digits.length !== 48 || digits[0] !== '8') return null;

  const valueIndicator = digits[2];
  const hasRealValue = valueIndicator === '6' || valueIndicator === '7';

  // tirando os dígitos verificadores de cada bloco de 12, sobra o código de 44
  const core = digits.slice(0, 11) + digits.slice(12, 23) + digits.slice(24, 35) + digits.slice(36, 47);
  const cents = Number(core.slice(4, 15));

  return {
    kind: 'boleto-convenio',
    amount: hasRealValue && Number.isFinite(cents) && cents > 0 ? cents : null,
    dueDate: null,
    payee: null,
    description: 'Conta de consumo',
  };
}

/* --------------------------------------------------------------------- pix */

interface Tlv {
  id: string;
  value: string;
}

/**
 * O BRCode do Pix é EMV: blocos de identificador (2), tamanho (2) e conteúdo.
 * Alguns blocos contêm outros dentro, então a leitura é recursiva por natureza.
 */
function parseTlv(payload: string): Tlv[] {
  const out: Tlv[] = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isFinite(len) || len < 0) break;
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length < len) break;
    out.push({ id, value });
    i += 4 + len;
  }
  return out;
}

const tlvValue = (blocks: Tlv[], id: string): string | null =>
  blocks.find((b) => b.id === id)?.value ?? null;

function parsePix(raw: string): ScanResult | null {
  const text = raw.trim();
  // todo BRCode começa com o bloco 00 de formato e termina com o CRC 6304
  if (!/^0002\d{2}/.test(text) || !/6304[0-9A-Fa-f]{4}$/.test(text)) return null;

  const blocks = parseTlv(text);
  if (!blocks.length) return null;

  const rawAmount = tlvValue(blocks, '54');
  const amount = rawAmount ? Math.round(Number(rawAmount) * 100) : null;
  const payee = tlvValue(blocks, '59');

  return {
    kind: 'pix',
    amount: amount && Number.isFinite(amount) && amount > 0 ? amount : null,
    dueDate: null,
    payee: payee ? payee.trim() : null,
    description: payee ? `Pix para ${payee.trim()}` : 'Pix',
  };
}

/* ------------------------------------------------------------------ leitura */

/**
 * Descobre sozinho o que foi colado.
 *
 * Pix vem com letras e estrutura própria; boleto é só dígito, e o tamanho
 * separa o bancário (47) do de concessionária (48). Não reconhecendo, devolve
 * null — e a tela pede para digitar, em vez de adivinhar valor errado.
 */
export function scanCode(input: string): ScanResult | null {
  const raw = String(input ?? '').trim();
  if (raw.length < 20) return null;

  const pix = parsePix(raw);
  if (pix) return pix;

  const digits = digitsOnly(raw);
  return parseConvenio(digits) ?? parseBoleto(digits);
}

export const SCAN_LABELS: Record<ScanKind, string> = {
  boleto: 'Boleto bancário',
  'boleto-convenio': 'Conta de consumo',
  pix: 'Pix copia e cola',
};
