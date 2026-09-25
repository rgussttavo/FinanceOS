import { partsToIso } from './dates';
import type { Cents, IsoDate } from './types';

/**
 * Leitura de extrato bancário.
 *
 * Tudo aqui é puro e roda no aparelho: o arquivo nunca sai do navegador para
 * ser lido. Isso importa porque extrato é o documento mais íntimo que existe
 * numa vida financeira, e mandá-lo a um servidor só para achar três colunas
 * seria pedir uma confiança que o app não precisa pedir.
 *
 * O caminho é o mesmo para todo formato: o arquivo vira uma lista de linhas
 * com data, descrição e valor COM SINAL (negativo é dinheiro saindo). O que
 * fazer com cada linha — criar, dar baixa, pular — é decisão do importador.
 */

/* ------------------------------------------------------------------ tipos */

export type StatementFormat = 'ofx' | 'qif' | 'csv' | 'xlsx';

export interface StatementRow {
  date: IsoDate;
  description: string;
  /** centavos com sinal: negativo sai, positivo entra */
  amount: Cents;
  /** identificador do banco para a transação, quando o formato traz (OFX) */
  fitId: string | null;
  /** o saldo que o banco mostra depois desta linha, quando o arquivo tem a coluna */
  balanceAfter?: Cents;
}

/** um saldo que o próprio banco declarou no arquivo */
export interface DeclaredBalance {
  amount: Cents;
  date: IsoDate;
}

/**
 * Os saldos que o arquivo traz. São a régua da reconciliação: se o app chega
 * num número diferente do que o banco escreveu, alguma linha está faltando,
 * sobrando ou com valor trocado — e isso aparece, em vez de passar calado.
 */
export interface StatementBalance {
  /** antes da primeira transação ("SALDO ANTERIOR") */
  opening?: DeclaredBalance;
  /** depois da última ("SALDO DO DIA", LEDGERBAL do OFX) */
  closing?: DeclaredBalance;
}

/** uma célula de planilha já normalizada: data vira AAAA-MM-DD, número fica número */
export type Cell = string | number | null;

export interface ColumnMap {
  date: number;
  description: number;
  /** segunda coluna de texto ("Histórico" e "Descrição" juntos), -1 quando não há */
  memo: number;
  /** coluna única de valor com sinal; -1 quando o extrato separa crédito e débito */
  amount: number;
  credit: number;
  debit: number;
  /** coluna "D/C" ou "tipo", que diz o sinal quando o valor vem sempre positivo */
  direction: number;
  /** coluna de saldo corrido; nunca é valor de transação, mas confere cada linha */
  balance: number;
}

export interface TableSource {
  /** nome da aba, quando veio de planilha com várias */
  sheet: string | null;
  grid: Cell[][];
  /** linha do cabeçalho; -1 quando o arquivo não tem */
  headerRow: number;
  map: ColumnMap;
}

export interface ParsedStatement {
  format: StatementFormat;
  rows: StatementRow[];
  /** linhas que não viraram transação: saldo, cabeçalho repetido, total */
  ignored: number;
  /** linhas que pareciam transação mas não deu para ler data ou valor */
  unreadable: number;
  /** o arquivo é de cartão de crédito (OFX diz; nos outros, a pessoa escolhe) */
  creditCard: boolean;
  /** conta de origem, para o identificador do OFX não colidir entre contas */
  accountKey: string | null;
  /** presente nos formatos de tabela: permite remapear colunas na revisão */
  table: TableSource | null;
  /** saldos declarados pelo banco, quando o arquivo traz */
  balance?: StatementBalance;
}

export class StatementError extends Error {}

/* ---------------------------------------------------------------- entrada */

const SHEET_EXT = /\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i;

/**
 * Lê um arquivo de extrato em qualquer dos formatos aceitos.
 *
 * A extensão é só uma pista: muito banco brasileiro exporta um ".xls" que por
 * dentro é uma tabela HTML ou texto separado por tabulação. Por isso o que
 * decide é o conteúdo — os primeiros bytes dizem se é planilha de verdade.
 */
export async function parseStatementFile(file: File, onRead?: (fraction: number) => void): Promise<ParsedStatement> {
  // sem filtro no seletor do iPhone, chega de tudo: foto e PDF merecem um aviso que diga o que fazer
  if (/^image\//.test(file.type) || /\.(jpe?g|png|heic|heif|gif|webp)$/i.test(file.name)) {
    throw new StatementError('Isso é uma imagem, não um extrato. No app do banco, exporte o extrato em OFX, CSV ou Excel.');
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    throw new StatementError('Extrato em PDF não dá para ler com segurança. No app do banco, procure exportar em OFX, CSV ou Excel.');
  }

  const buffer = await readBuffer(file, onRead);
  if (!buffer.length) throw new StatementError('O arquivo está vazio.');

  if (isZip(buffer) || isCompoundFile(buffer)) {
    return parseSpreadsheet(buffer);
  }

  const text = decodeText(buffer);
  const kind = sniffText(text);

  if (kind === 'ofx') return parseOfx(text);
  if (kind === 'qif') return parseQif(text);
  if (kind === 'html') return parseSpreadsheet(buffer, true);
  if (SHEET_EXT.test(file.name) && kind !== 'delimited') return parseSpreadsheet(buffer, true);
  return parseDelimited(text);
}

/** lê o arquivo avisando o quanto já leu; arquivo grande de banco passa de 10 MB */
function readBuffer(file: File, onRead?: (fraction: number) => void): Promise<Uint8Array> {
  if (typeof FileReader === 'undefined') return file.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) onRead?.(e.loaded / e.total);
    };
    reader.onload = () => {
      onRead?.(1);
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => reject(reader.error ?? new StatementError('Não consegui ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;
const isCompoundFile = (b: Uint8Array) =>
  b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/**
 * Texto em UTF-8 quando for UTF-8 válido, senão Windows-1252 — que é o que os
 * bancos daqui usam quando não usam UTF-8. Ler como UTF-8 um arquivo 1252
 * transforma "Descrição" em "Descri��o".
 */
export function decodeText(buffer: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  return text.replace(/^﻿/, '');
}

function sniffText(text: string): 'ofx' | 'qif' | 'html' | 'delimited' {
  const head = text.slice(0, 2000).trimStart();
  if (/OFXHEADER|<OFX>/i.test(head) || /<STMTTRN>/i.test(text.slice(0, 20000))) return 'ofx';
  if (/^!Type:/i.test(head) || /^!Account/i.test(head)) return 'qif';
  if (/^<(!doctype|html|table|\?xml)/i.test(head)) return 'html';
  return 'delimited';
}

/* -------------------------------------------------------------------- OFX */

/**
 * OFX, nas duas versões que existem por aí.
 *
 * A 1.x é SGML: as tags de valor não fecham (`<TRNAMT>-50.00` e acabou). A 2.x
 * é XML e fecha tudo. Ler cada campo "da tag até o próximo `<` ou quebra de
 * linha" serve para as duas sem precisar de dois leitores.
 */
export function parseOfx(text: string): ParsedStatement {
  const creditCard = /<CCSTMTRS>/i.test(text);
  const accountKey =
    [tag(text, 'BANKID'), tag(text, 'ACCTID')].filter(Boolean).join(':') || null;

  const rows: StatementRow[] = [];
  let unreadable = 0;

  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];

  /**
   * Pela norma do OFX, o decimal é sempre o ponto: "1.500" é um real e meio.
   * Há banco daqui que escreve "-50,00" mesmo assim; quando alguma linha do
   * arquivo usa vírgula, o arquivo inteiro é lido com vírgula. Adivinhar valor
   * a valor ("1.500" parece milhar) multiplicava tarifas por mil.
   */
  const amounts = blocks.map((b) => tag(b, 'TRNAMT') ?? '');
  const decimal: Decimal = amounts.some((a) => a.includes(',')) ? ',' : '.';

  for (const block of blocks) {
    const date = parseOfxDate(tag(block, 'DTPOSTED') ?? tag(block, 'DTUSER') ?? '');
    const amount = parseAmountText(tag(block, 'TRNAMT') ?? '', decimal);
    if (!date || amount === null) {
      unreadable += 1;
      continue;
    }
    const name = tag(block, 'NAME') ?? '';
    const memo = tag(block, 'MEMO') ?? '';
    rows.push({
      date,
      description: joinDescription(name, memo) || tag(block, 'TRNTYPE') || 'Sem descrição',
      amount,
      fitId: tag(block, 'FITID'),
    });
  }

  if (!rows.length && !unreadable) {
    throw new StatementError('O OFX não tem nenhuma transação no período exportado.');
  }

  // o saldo contábil que o banco fecha no arquivo; é ele que a reconciliação persegue
  const ledger = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i.exec(text)?.[1] ?? '';
  const ledgerAmount = parseAmountText(tag(ledger, 'BALAMT') ?? '', decimal);
  const ledgerDate = parseOfxDate(tag(ledger, 'DTASOF') ?? '');
  const balance: StatementBalance | undefined =
    ledgerAmount !== null && ledgerDate ? { closing: { amount: ledgerAmount, date: ledgerDate } } : undefined;

  return { format: 'ofx', rows, ignored: 0, unreadable, creditCard, accountKey, table: null, ...(balance ? { balance } : null) };
}

function tag(text: string, name: string): string | null {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(text);
  const value = match?.[1]?.trim();
  return value ? decodeEntities(value) : null;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** o fuso em que o dinheiro da pessoa vive; é nele que "dia 30" é dia 30 */
const HOME_OFFSET_HOURS = -3;

/**
 * 20260903, 20260903120000, 20260903120000[-3:BRT], 20261001020000[0:GMT].
 *
 * Sem fuso, vale a data escrita. Com fuso diferente do de Brasília, a hora é
 * convertida antes de tirar o dia: "01/10 às 02h em Greenwich" é 30/09 às 23h
 * aqui, e é em 30/09 que a compra aconteceu para quem a fez.
 */
function parseOfxDate(raw: string): IsoDate | null {
  const s = raw.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?(?:\.\d+)?)?\s*(?:\[([+-]?\d+(?:\.\d+)?)(?::[^\]]*)?\])?/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const plainDate = validDate(y, mo, d);
  if (!plainDate || m[4] === undefined || m[7] === undefined) return plainDate;

  const offset = Number(m[7]);
  if (!Number.isFinite(offset) || offset === HOME_OFFSET_HOURS) return plainDate;

  // hora escrita no fuso do arquivo → instante UTC → hora de Brasília
  const utcMs = Date.UTC(y, mo - 1, d, Number(m[4]), Number(m[5]), Number(m[6] ?? 0)) - offset * 3_600_000;
  const home = new Date(utcMs + HOME_OFFSET_HOURS * 3_600_000);
  return validDate(home.getUTCFullYear(), home.getUTCMonth() + 1, home.getUTCDate());
}

/** NAME e MEMO costumam repetir um ao outro; quando repetem, fica um só */
function joinDescription(a: string, b: string): string {
  const x = a.trim();
  const y = b.trim();
  if (!x) return y;
  if (!y) return x;
  const lx = x.toLowerCase();
  const ly = y.toLowerCase();
  if (lx.includes(ly)) return x;
  if (ly.includes(lx)) return y;
  return `${x} · ${y}`;
}

/* -------------------------------------------------------------------- QIF */

/**
 * QIF: um campo por linha, a letra na frente, e `^` fechando cada transação.
 * D é a data, T o valor, P quem recebeu, M o memorando.
 */
export function parseQif(text: string): ParsedStatement {
  const records: { d: string; t: string; p: string; m: string }[] = [];
  let current = { d: '', t: '', p: '', m: '' };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!')) continue;
    if (line === '^') {
      if (current.d || current.t) records.push(current);
      current = { d: '', t: '', p: '', m: '' };
      continue;
    }
    const code = line[0].toUpperCase();
    const value = line.slice(1).trim();
    if (code === 'D') current.d = value;
    else if (code === 'T' || code === 'U') current.t = current.t || value;
    else if (code === 'P') current.p = value;
    else if (code === 'M') current.m = value;
  }
  if (current.d || current.t) records.push(current);

  // QIF não diz se a data é dia/mês ou mês/dia; a ordem se decide pelo arquivo inteiro
  const order = detectDayOrder(records.map((r) => r.d.replace(/'/g, '/')));
  const decimal = detectDecimal(records.map((r) => r.t));

  const rows: StatementRow[] = [];
  let unreadable = 0;
  for (const r of records) {
    const date = parseDateText(r.d.replace(/'/g, '/'), order);
    const amount = parseAmountText(r.t, decimal);
    if (!date || amount === null) {
      unreadable += 1;
      continue;
    }
    rows.push({
      date,
      description: joinDescription(r.p, r.m) || 'Sem descrição',
      amount,
      fitId: null,
    });
  }

  if (!rows.length) throw new StatementError('Não achei transações neste QIF.');
  return { format: 'qif', rows, ignored: 0, unreadable, creditCard: false, accountKey: null, table: null };
}

/* ------------------------------------------------------------ CSV e texto */

/** CSV, TSV, TXT: o separador é descoberto, não presumido */
export function parseDelimited(text: string): ParsedStatement {
  const delimiter = detectDelimiter(text);
  const grid = splitDelimited(text, delimiter).map((row) => row.map(cleanCell));
  return fromGrid('csv', grid, null);
}

const DELIMITERS = [';', ',', '\t', '|'] as const;

/**
 * O separador certo é o que divide as linhas no mesmo número de colunas, e em
 * mais de uma. Vírgula perde para ponto e vírgula quando os dois aparecem —
 * em extrato brasileiro a vírgula quase sempre é o decimal.
 */
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40).join('\n');
  let best: string = ';';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const rows = splitDelimited(sample, d);
    const counts = rows.map((r) => r.length).filter((n) => n > 1);
    if (!counts.length) continue;
    const mode = mostCommon(counts);
    const consistent = counts.filter((n) => n === mode).length;
    const score = consistent * 10 + mode;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/** separa respeitando aspas: "Loja; filial" continua sendo uma célula */
function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function cleanCell(value: string): Cell {
  const v = value.replace(/\s+/g, ' ').trim();
  return v === '' ? null : v;
}

/* --------------------------------------------------------------- planilha */

/**
 * XLSX, XLS, ODS e o "xls" que é HTML por dentro.
 *
 * A biblioteca é pesada, então só desce quando alguém de fato escolhe uma
 * planilha. Com `raw` ligado ela não tenta adivinhar número em texto — quem
 * decide se "1.234" é mil e tanto ou um e pouco é o leitor daqui, que olha a
 * coluna inteira antes.
 */
async function parseSpreadsheet(buffer: Uint8Array, textual = false): Promise<ParsedStatement> {
  const XLSX = await import('@e965/xlsx');
  const cpexcel = await import('@e965/xlsx/dist/cpexcel.full.mjs');
  XLSX.set_cptable(cpexcel);

  let book: import('@e965/xlsx').WorkBook;
  try {
    book = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true, raw: textual, codepage: 1252 });
  } catch {
    throw new StatementError('Não consegui abrir esta planilha. Se ela tiver senha, tire a senha e tente de novo.');
  }

  // a aba certa é a que rende mais transações, não necessariamente a primeira
  let best: ParsedStatement | null = null;
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet?.['!ref']) continue;
    const grid = sheetToGrid(XLSX, sheet);
    if (!grid.length) continue;
    try {
      const parsed = fromGrid('xlsx', grid, book.SheetNames.length > 1 ? name : null);
      if (!best || parsed.rows.length > best.rows.length) best = parsed;
    } catch {
      // aba sem transação (capa, resumo): segue para a próxima
    }
  }

  if (!best) throw new StatementError('Não achei uma tabela de transações nesta planilha.');
  return best;
}

type SheetLib = typeof import('@e965/xlsx');

function sheetToGrid(XLSX: SheetLib, sheet: import('@e965/xlsx').WorkSheet): Cell[][] {
  const range = XLSX.utils.decode_range(sheet['!ref'] as string);
  const grid: Cell[][] = [];
  // extrato de uma vida inteira não passa disso; planilha maior é outra coisa
  const lastRow = Math.min(range.e.r, range.s.r + 20000);

  for (let r = range.s.r; r <= lastRow; r++) {
    const row: Cell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as import('@e965/xlsx').CellObject | undefined;
      row.push(cell ? sheetCell(XLSX, cell) : null);
    }
    if (row.some((v) => v !== null)) grid.push(row);
  }
  return grid;
}

function sheetCell(XLSX: SheetLib, cell: import('@e965/xlsx').CellObject): Cell {
  if (cell.t === 'n' && typeof cell.v === 'number') {
    // data em planilha é um número com formato de data; o formato é que diz
    if (cell.z && XLSX.SSF.is_date(String(cell.z))) {
      const p = XLSX.SSF.parse_date_code(cell.v);
      return p ? validDate(p.y, p.m, p.d) : null;
    }
    return cell.v;
  }
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v;
    return validDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (cell.t === 'b' || cell.t === 'e' || cell.v == null) return null;
  return cleanCell(String(cell.w ?? cell.v));
}

/* ----------------------------------------------------- tabela para linhas */

const HEADER_WORDS: Record<Exclude<keyof ColumnMap, 'memo'>, RegExp> = {
  date: /^(data|dt|date|dia)\b|data (do )?(lancamento|movimento|transacao|compra|mov)/,
  description: /(descri|historico|lancamento|title|titulo|estabelecimento|memo|detalhe|favorecido|beneficiario|nome|transacao|movimentacao)/,
  amount: /^(valor|value|amount|quantia|montante|vlr)\b|valor \(?r\$|valor (em )?(r\$|reais|brl)/,
  credit: /^(credito|creditos|entrada|entradas|cred)\b/,
  debit: /^(debito|debitos|saida|saidas|deb)\b/,
  direction: /^(d\/c|c\/d|tipo|natureza|sinal)$/,
  balance: /^saldo\b/,
};

const plain = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Transforma uma grade de células em transações.
 *
 * Primeiro procura o cabeçalho pelos nomes que os bancos usam. Não achou, olha
 * o conteúdo: a coluna em que quase tudo é data é a data, a de números é o
 * valor, a de texto mais comprido é a descrição.
 */
export function fromGrid(format: StatementFormat, grid: Cell[][], sheet: string | null, forced?: ColumnMap): ParsedStatement {
  if (!grid.length) throw new StatementError('O arquivo não tem linhas.');

  const detected = forced ? { headerRow: findHeaderRow(grid)?.row ?? -1, map: forced } : detectColumns(grid);
  if (!detected) {
    throw new StatementError('Não reconheci as colunas de data e valor. Confira se é o extrato e não um resumo.');
  }

  const table: TableSource = { sheet, grid, headerRow: detected.headerRow, map: detected.map };
  const { rows, ignored, unreadable, balance } = rowsFromTable(table);
  if (!rows.length) {
    throw new StatementError('Achei a tabela, mas nenhuma linha com data e valor que eu consiga ler.');
  }
  return { format, rows, ignored, unreadable, creditCard: false, accountKey: null, table, ...(balance ? { balance } : null) };
}

/** relê a mesma grade com outro mapeamento, quando a pessoa corrige uma coluna */
export function remapTable(parsed: ParsedStatement, map: ColumnMap): ParsedStatement {
  if (!parsed.table) return parsed;
  const table = { ...parsed.table, map };
  const { rows, ignored, unreadable, balance } = rowsFromTable(table);
  return { ...parsed, rows, ignored, unreadable, table, balance };
}

function findHeaderRow(grid: Cell[][]): { row: number; map: Partial<ColumnMap> } | null {
  const limit = Math.min(grid.length, 40);
  for (let r = 0; r < limit; r++) {
    const map: Partial<ColumnMap> = {};
    grid[r].forEach((cell, c) => {
      if (typeof cell !== 'string' || cell.length > 40) return;
      const text = plain(cell);
      for (const key of Object.keys(HEADER_WORDS) as (keyof typeof HEADER_WORDS)[]) {
        if (!HEADER_WORDS[key].test(text)) continue;
        if (map[key] === undefined) map[key] = c;
        // o banco que separa "Histórico" de "Descrição" põe metade em cada
        else if (key === 'description' && map.memo === undefined) map.memo = c;
        else continue;
        break;
      }
    });
    const hasValue = map.amount !== undefined || (map.credit !== undefined && map.debit !== undefined) || map.credit !== undefined || map.debit !== undefined;
    if (map.date !== undefined && hasValue) return { row: r, map };
  }
  return null;
}

function detectColumns(grid: Cell[][]): { headerRow: number; map: ColumnMap } | null {
  const header = findHeaderRow(grid);
  const start = header ? header.row + 1 : 0;
  const body = grid.slice(start, start + 200);
  const width = Math.max(...grid.map((r) => r.length));

  const order = detectDayOrder(body.flatMap((r) => r.filter((c): c is string => typeof c === 'string')));
  const dateScore = columnScores(body, width, (c) => toDate(c, order) !== null);
  const numScore = columnScores(body, width, (c) => typeof c === 'number' || (typeof c === 'string' && isAmountLike(c)));
  const textLen = Array.from({ length: width }, (_, i) => {
    const texts = body.map((r) => r[i]).filter((c): c is string => typeof c === 'string' && !isAmountLike(c) && toDate(c, order) === null);
    return texts.length ? texts.reduce((a, t) => a + t.length, 0) / body.length : 0;
  });

  const map: ColumnMap = { date: -1, description: -1, memo: -1, amount: -1, credit: -1, debit: -1, direction: -1, balance: -1 };
  Object.assign(map, header?.map ?? {});

  if (map.date < 0) map.date = argmax(dateScore, 0.6);
  if (map.date < 0) return null;

  const hasSplit = map.credit >= 0 && map.debit >= 0;
  if (map.amount < 0 && !hasSplit) {
    if (map.credit >= 0 || map.debit >= 0) {
      // só uma das duas foi nomeada; a outra é a numérica vizinha
      const known = map.credit >= 0 ? map.credit : map.debit;
      const other = argmax(numScore.map((s, i) => (i === known || i === map.date ? 0 : s)), 0.05);
      if (other < 0) map.amount = known;
      else if (map.credit >= 0) map.debit = other;
      else map.credit = other;
    } else {
      // sem cabeçalho: a primeira coluna numérica depois da data; a última
      // costuma ser o saldo, que nunca é o valor da transação
      const candidates = numScore
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => s >= 0.6 && i !== map.date && i !== map.balance);
      if (!candidates.length) return null;
      map.amount = candidates[0].i;
    }
  }

  if (map.description < 0) {
    const used = new Set([map.date, map.amount, map.credit, map.debit, map.direction, map.memo, map.balance]);
    map.description = argmax(textLen.map((l, i) => (used.has(i) ? 0 : l)), 0.5);
  }

  return { headerRow: header?.row ?? -1, map };
}

function columnScores(rows: Cell[][], width: number, test: (c: Cell) => boolean): number[] {
  return Array.from({ length: width }, (_, i) => {
    const filled = rows.map((r) => r[i]).filter((c) => c !== null && c !== undefined);
    if (!filled.length) return 0;
    return filled.filter(test).length / Math.max(filled.length, rows.length * 0.5);
  });
}

function argmax(values: number[], min: number): number {
  let best = -1;
  let bestValue = min;
  values.forEach((v, i) => {
    if (v > bestValue) {
      best = i;
      bestValue = v;
    }
  });
  return best;
}

/**
 * Linhas que aparecem em extrato mas não são transação. Importar "SALDO DO
 * DIA" como receita dobraria o dinheiro da pessoa na tela.
 *
 * A comparação é pela frase inteira, com datas e números tirados. Antes bastava
 * a descrição COMEÇAR com "total" ou "saldo" — e "TOTAL ACADEMIA" ou "Saldo
 * devedor cheque especial juros", que são cobranças de verdade, sumiam do
 * extrato sem aviso.
 */
const OPENING_ROW = /^(saldo anterior|saldo inicial|saldo inicial do periodo|saldo anterior do periodo)$/;
const CLOSING_ROW = /^(saldo|s a l d o|saldo do dia|saldo final|saldo atual|saldo disponivel|saldo em conta|saldo total|saldo final do periodo|saldo contabil)$/;
const SUMMARY_ROW = /^(total|subtotal|total geral|total do dia|total do periodo|total de (creditos|debitos|entradas|saidas)|limite|limite disponivel|limite da conta|saldo bloqueado)$/;

const balanceKey = (desc: string) =>
  plain(desc)
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(em|de|r)\b\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function rowsFromTable(table: TableSource): {
  rows: StatementRow[];
  ignored: number;
  unreadable: number;
  balance?: StatementBalance;
} {
  const { grid, headerRow, map } = table;
  const body = grid.slice(headerRow + 1);
  const balanceCol = map.balance ?? -1;

  const dayOrder = detectDayOrder(body.map((r) => r[map.date]).filter((c): c is string => typeof c === 'string'));
  const valueCols = [map.amount, map.credit, map.debit, balanceCol].filter((i) => i >= 0);
  const decimal = detectDecimal(body.flatMap((r) => valueCols.map((i) => r[i])));

  const rows: StatementRow[] = [];
  const openings: DeclaredBalance[] = [];
  const closings: DeclaredBalance[] = [];
  let ignored = 0;
  let unreadable = 0;

  for (const r of body) {
    const description = joinDescription(cellText(r[map.description]), map.memo >= 0 ? cellText(r[map.memo]) : '');
    const key = balanceKey(description);

    // cabeçalho repetido no meio do arquivo (quebra de página do banco)
    if (typeof r[map.date] === 'string' && HEADER_WORDS.date.test(plain(r[map.date] as string))) {
      ignored += 1;
      continue;
    }

    const date = toDate(r[map.date] ?? null, dayOrder);
    const balanceHere = balanceCol >= 0 ? toAmount(r[balanceCol] ?? null, decimal) : null;

    if (key && (OPENING_ROW.test(key) || CLOSING_ROW.test(key) || SUMMARY_ROW.test(key))) {
      ignored += 1;
      // o saldo da linha vem da coluna de saldo; sem ela, da de valor
      const declared = balanceHere ?? (map.amount >= 0 ? toAmount(r[map.amount] ?? null, decimal) : null);
      if (date && declared !== null) {
        if (OPENING_ROW.test(key)) openings.push({ amount: declared, date });
        else if (CLOSING_ROW.test(key)) closings.push({ amount: declared, date });
      }
      continue;
    }

    let amount: Cents | null = null;

    if (map.amount >= 0) {
      amount = toAmount(r[map.amount] ?? null, decimal);
    } else {
      const credit = map.credit >= 0 ? toAmount(r[map.credit] ?? null, decimal) : null;
      const debit = map.debit >= 0 ? toAmount(r[map.debit] ?? null, decimal) : null;
      if (credit) amount = Math.abs(credit);
      else if (debit) amount = -Math.abs(debit);
    }

    if (amount !== null && map.direction >= 0) {
      const dir = plain(cellText(r[map.direction]));
      if (/^(d|deb|debito|saida|s|-)$/.test(dir)) amount = -Math.abs(amount);
      else if (/^(c|cred|credito|entrada|e|\+)$/.test(dir)) amount = Math.abs(amount);
    }

    if (!date && amount === null) {
      // linha solta de texto: título, rodapé, observação do banco
      ignored += 1;
      continue;
    }
    if (!date || amount === null || amount === 0) {
      if (amount === 0) ignored += 1;
      else unreadable += 1;
      continue;
    }

    rows.push({
      date,
      description: description || 'Sem descrição',
      amount,
      fitId: null,
      ...(balanceHere !== null ? { balanceAfter: balanceHere } : null),
    });
  }

  /**
   * Muito banco lista do mais novo para o mais antigo. A ordem do arquivo é a
   * do saldo corrido; virar as linhas mantém saldo e transação juntos e deixa
   * "primeira" e "última" querendo dizer o que dizem.
   */
  const descending = rows.length > 1 && rows[0].date > rows[rows.length - 1].date;
  if (descending) rows.reverse();

  const byDate = (a: DeclaredBalance, b: DeclaredBalance) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const opening = openings.sort(byDate)[0];
  const closing = closings.sort(byDate)[closings.length - 1];

  const balance: StatementBalance = {};
  if (opening) balance.opening = opening;
  else if (rows[0]?.balanceAfter !== undefined) {
    // sem a linha "saldo anterior", ele é o saldo da primeira linha antes dela
    balance.opening = { amount: rows[0].balanceAfter - rows[0].amount, date: rows[0].date };
  }
  if (closing && (!rows.length || closing.date >= rows[rows.length - 1].date)) balance.closing = closing;
  else if (rows.length && rows[rows.length - 1].balanceAfter !== undefined) {
    const last = rows[rows.length - 1];
    balance.closing = { amount: last.balanceAfter as Cents, date: last.date };
  }

  return { rows, ignored, unreadable, ...(balance.opening || balance.closing ? { balance } : null) };
}

const cellText = (c: Cell | undefined): string =>
  c === null || c === undefined ? '' : typeof c === 'number' ? String(c) : c;

/* ------------------------------------------------------------------ datas */

type DayOrder = 'dmy' | 'mdy';

/**
 * Dia antes do mês é o padrão daqui. Só vira mês/dia quando o próprio arquivo
 * prova: algum "primeiro número" passa de 12 no segundo campo e nunca no
 * primeiro.
 */
function detectDayOrder(values: string[]): DayOrder {
  let firstOver12 = 0;
  let secondOver12 = 0;
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 += 1;
    if (Number(m[2]) > 12) secondOver12 += 1;
  }
  return secondOver12 > 0 && firstOver12 === 0 ? 'mdy' : 'dmy';
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

function toDate(cell: Cell, order: DayOrder): IsoDate | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return null;
  return parseDateText(cell, order);
}

/** aceita 03/09/2026, 3/9/26, 2026-09-03, 03.09.2026, 03 SET 2026 e com hora junto */
export function parseDateText(raw: string, order: DayOrder = 'dmy'): IsoDate | null {
  const s = raw.trim();
  if (!s) return null;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:$|[T\s,])/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(Number(m[3]));
    return order === 'mdy' ? validDate(y, a, b) : validDate(y, b, a);
  }

  m = /^(\d{1,2})[\s/-]+([a-zç]{3})[a-zç]*\.?[\s/-]+(\d{2}|\d{4})\b/i.exec(s);
  if (m) {
    const month = MONTH_NAMES[plain(m[2]).slice(0, 3)];
    if (month) return validDate(fullYear(Number(m[3])), month, Number(m[1]));
  }

  return null;
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

function validDate(y: number, m: number, d: number): IsoDate | null {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 1990 || y > 2100) return null;
  const check = new Date(y, m - 1, d);
  if (check.getMonth() !== m - 1) return null;
  return partsToIso(y, m - 1, d);
}

/* ---------------------------------------------------------------- valores */

type Decimal = ',' | '.' | 'auto';

/**
 * Qual é o separador decimal do arquivo inteiro.
 *
 * "1.234" sozinho é ambíguo: mil duzentos e trinta e quatro reais no Brasil,
 * um real e pouco nos Estados Unidos. Olhando a coluna toda, quase sempre há
 * valores que desempatam, como "12,50" ou "1.234,56".
 */
function detectDecimal(values: (Cell | undefined)[]): Decimal {
  let comma = 0;
  let dot = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[^\d.,]/g, '');
    if (/,\d{1,2}$/.test(s) || /\.\d{3},/.test(s)) comma += 1;
    else if (/\.\d{1,2}$/.test(s) || /,\d{3}\./.test(s)) dot += 1;
  }
  if (comma === 0 && dot === 0) return 'auto';
  return comma >= dot ? ',' : '.';
}

function toAmount(cell: Cell | undefined, decimal: Decimal): Cents | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? Math.round(cell * 100) : null;
  return parseAmountText(cell, decimal);
}

function isAmountLike(raw: string): boolean {
  const s = raw.replace(/[−‒–—﹣－]/g, '-');
  return /^[-+(]?\s*(r\$)?\s*[-+]?\s*\d[\d.,\s]*\)?\s*[-+]?\s*[dc]?$/i.test(s.trim()) && /[.,]\d{2}\b|^\s*[-+]?\d+\s*$/.test(s);
}

/**
 * Texto de valor para centavos com sinal. Cobre o que os bancos inventam:
 * "-1.234,56", "1.234,56-", "(1.234,56)", "R$ -12,00", "- R$ 12,00",
 * "1,234.56", "50,00 D" e "50,00 C".
 */
export function parseAmountText(raw: string, decimal: Decimal = 'auto'): Cents | null {
  // menos tipográfico (−) e traços (– —) dizem o mesmo que o hífen; lidos
  // como texto, sumiam, e a despesa entrava como receita
  let s = raw.replace(/[−‒–—﹣－]/g, '-').trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  const suffix = /\s*([dc])$/i.exec(s);
  if (suffix) {
    if (suffix[1].toLowerCase() === 'd') negative = true;
    s = s.slice(0, suffix.index);
  }
  if (/-\s*$/.test(s) || /^\s*-/.test(s) || /^\s*r\$\s*-/i.test(s)) negative = true;

  const digits = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return null;

  const sep = decimal === 'auto' ? guessDecimal(digits) : decimal;
  const normalized =
    sep === ','
      ? digits.replace(/\./g, '').replace(',', '.')
      : digits.replace(/,/g, '');

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** sem o arquivo para desempatar: o último separador seguido de 1–2 dígitos é o decimal */
function guessDecimal(digits: string): ',' | '.' {
  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  if (lastComma > lastDot) return ',';
  if (lastDot > lastComma) {
    const tail = digits.length - lastDot - 1;
    // "1.234" sem vírgula: no Brasil é milhar
    if (tail === 3 && lastComma < 0) return ',';
    return '.';
  }
  return ',';
}

/* ------------------------------------------------------------- utilidades */

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount || (n === bestCount && v > best)) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

/**
 * "PIX ENVIADO PADARIA DO ZE" vira "Pix enviado padaria do ze"? Não: vira
 * "Pix Enviado Padaria do Ze". Texto todo em maiúscula é grito; siglas curtas
 * conhecidas continuam em maiúscula porque é assim que se leem.
 */
const KEEP_UPPER = new Set(['PIX', 'TED', 'DOC', 'CDB', 'LCI', 'LCA', 'IOF', 'IPVA', 'IPTU', 'INSS', 'FGTS', 'DARF', 'CPF', 'CNPJ', 'BB', 'CEF', 'XP', 'BTG', 'C6', 'NU', 'ATM', 'TAG', 'SA']);
const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'para', 'por', 'com']);

export function tidyDescription(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return s;
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s
    .split(' ')
    .map((word, i) => {
      if (KEEP_UPPER.has(word.replace(/[^A-Z0-9]/g, ''))) return word;
      const lower = word.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** "parcela 3/10", "03/10", "PARC 3 DE 10": a compra é parcelada e esta é a 3ª */
export function detectInstallment(description: string): { index: number; total: number; base: string } | null {
  const rx = /\s*[-–·]?\s*(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i;
  const m = rx.exec(description);
  if (!m) return null;
  const index = Number(m[1]);
  const total = Number(m[2]);
  // "12/09" no fim de uma descrição costuma ser data, não parcela
  const explicit = /parc/i.test(m[0]);
  if (index < 1 || total < 2 || total > 48 || index > total) return null;
  if (!explicit && total > 24) return null;
  const base = description.slice(0, m.index).trim();
  if (!base) return null;
  return { index, total, base };
}
