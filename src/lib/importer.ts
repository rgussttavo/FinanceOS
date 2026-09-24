import { categorize, cleanDescription, type LearnedRule } from './categories';
import { addMonthsToKey, clampDayToMonth, diffDays, monthKeyOf, monthKeyParts, nowInstant, partsToIso, todayIso } from './dates';
import { db, entriesUpTo, putRecords } from './db';
import { occurrencesInMonth, type Occurrence } from './occurrences';
import { uid } from './provision';
import { detectInstallment, tidyDescription, type ParsedStatement, type StatementRow } from './statement';
import type { Category, Cents, Entry, EntrySource, FlowKind, IsoDate } from './types';

/**
 * Do extrato lido ao lançamento gravado.
 *
 * O leitor diz o que o arquivo contém. Daqui sai o que fazer com cada linha, e
 * a regra é não duplicar nada que a pessoa já tem:
 *
 *   - linha que já veio num import anterior é pulada, sempre;
 *   - linha que bate com uma conta prevista e ainda aberta vira baixa nela,
 *     em vez de um segundo lançamento com o mesmo aluguel;
 *   - linha parecida com algo já lançado à mão fica desmarcada, para a pessoa
 *     decidir — o app não sabe se são dois cafés iguais ou o mesmo café.
 */

export type ImportTarget = { type: 'account' } | { type: 'card'; cardId: string };

export type RowStatus =
  /** novo, vira lançamento */
  | 'new'
  /** bate com uma ocorrência prevista e aberta: marca como paga */
  | 'settle'
  /** parecido com algo já lançado; desmarcado até a pessoa decidir */
  | 'similar'
  /** este mesmo identificador já foi importado */
  | 'imported'
  /** pagamento de fatura, estorno no cartão: contaria em dobro */
  | 'transfer';

export interface ReviewRow {
  /** posição no arquivo, estável entre re-leituras */
  key: string;
  date: IsoDate;
  description: string;
  kind: FlowKind;
  /** sempre positivo, como no resto do app */
  amount: Cents;
  categoryId: string | null;
  /** a categoria veio de palpite fraco; a UI chama atenção */
  unsure: boolean;
  externalId: string;
  status: RowStatus;
  include: boolean;
  /** a ocorrência com que a linha bateu, quando bateu */
  match: { entryId: string; occurrenceKey: string; description: string } | null;
  installment: { index: number; total: number } | null;
}

export interface ReviewOptions {
  spaceId: string;
  target: ImportTarget;
  /** inverte o sinal de tudo: fatura que traz compra como positivo */
  invert: boolean;
  categories: Category[];
}

/* ------------------------------------------------------------ assinatura */

/**
 * O identificador que torna o reimport inofensivo.
 *
 * No OFX o banco dá um (FITID). Nos outros formatos ele é derivado da data, do
 * valor e da descrição — e da ordem dentro do arquivo entre linhas idênticas,
 * porque dois cafés de R$ 6 no mesmo dia são dois cafés.
 */
function externalIdFor(
  row: StatementRow,
  parsed: ParsedStatement,
  target: ImportTarget,
  repeat: number,
): string {
  const scope = target.type === 'card' ? `card:${target.cardId}` : 'acct';
  if (row.fitId) return `ofx:${parsed.accountKey ?? scope}:${row.fitId}`;
  const base = `${row.date}|${row.amount}|${cleanDescription(row.description)}|${repeat}`;
  return `${parsed.format}:${scope}:${hash(base)}`;
}

/** cyrb53: curto, estável e sem depender de crypto assíncrono */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ------------------------------------------------------------- revisão */

const CARD_PAYMENT = /pagamento (de |da )?fatura|pgto fatura|pagamento recebido|pag fatura|pagto fatura/;
const ACCOUNT_CARD_BILL = /fatura|pagamento (de )?cartao|pgto cartao|pag cartao/;

/**
 * Monta a lista que a pessoa revisa antes de gravar.
 *
 * Lê o que já existe no espaço uma vez só: os identificadores importados antes
 * e as ocorrências dos meses que o extrato cobre.
 */
export async function buildReview(parsed: ParsedStatement, opts: ReviewOptions): Promise<ReviewRow[]> {
  const { spaceId, target, categories } = opts;
  const learned = (await db().learned.toArray()) as LearnedRule[];

  const rows = parsed.rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!rows.length) return [];

  // linhas idênticas no mesmo arquivo recebem um contador, para não virarem uma só
  const seen = new Map<string, number>();
  const ids = parsed.rows.map((row) => {
    const k = `${row.date}|${row.amount}|${cleanDescription(row.description)}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return externalIdFor(row, parsed, target, n);
  });
  const idOf = new Map(parsed.rows.map((row, i) => [row, ids[i]]));

  const already = new Set(
    (await db().entries.where('externalId').anyOf(ids).toArray())
      .filter((e) => e.spaceId === spaceId && !e.deletedAt)
      .map((e) => e.externalId),
  );

  const occurrences = await occurrencesCovering(spaceId, rows[0].date, rows[rows.length - 1].date);
  const taken = new Set<string>();

  return rows.map((row, i) => {
    const externalId = idOf.get(row) ?? `row:${i}`;
    const signed = opts.invert ? -row.amount : row.amount;

    const outflow = signed < 0;
    const amount = Math.abs(signed);
    const description = tidyDescription(row.description);
    const plainDesc = cleanDescription(row.description);

    // saída que é aplicação vira investimento, não despesa
    let kind: FlowKind = outflow ? 'out' : 'in';
    let guess = categorize({ description, kind, categories, learned });
    if (outflow) {
      const invest = categorize({ description, kind: 'invest', categories, learned });
      if ((invest.reason === 'keyword' || invest.reason === 'learned') && invest.confidence >= 0.55) {
        kind = 'invest';
        guess = invest;
      }
    }

    const installment = target.type === 'card' ? detectInstallment(description) : null;

    let status: RowStatus = 'new';
    let match: ReviewRow['match'] = null;

    if (already.has(externalId)) {
      status = 'imported';
    } else if (target.type === 'card' && (!outflow || CARD_PAYMENT.test(plainDesc))) {
      // crédito na fatura (pagamento, estorno) somaria na fatura em vez de abater
      status = 'transfer';
    } else {
      const hit = findMatch(occurrences, taken, row.date, amount, outflow, installment);
      if (hit) {
        taken.add(`${hit.entryId}:${hit.key}`);
        match = { entryId: hit.entryId, occurrenceKey: hit.key, description: hit.description };
        status = hit.settlement || hit.cardId || target.type === 'card' ? 'similar' : 'settle';
        if (installment && hit.installment) status = 'imported';
      } else if (target.type === 'account' && outflow && ACCOUNT_CARD_BILL.test(plainDesc)) {
        // a fatura paga pela conta: se as compras do cartão já estão no app, é dobro
        status = 'transfer';
      }
    }

    return {
      key: `${i}:${externalId}`,
      date: row.date,
      description: installment ? installment.base : description,
      kind,
      amount,
      categoryId: guess.categoryId,
      unsure: guess.confidence < 0.35,
      externalId,
      status,
      include: status === 'new' || status === 'settle',
      match,
      installment: installment ? { index: installment.index, total: installment.total } : null,
    };
  });
}

async function occurrencesCovering(spaceId: string, from: IsoDate, to: IsoDate): Promise<Occurrence[]> {
  const first = monthKeyOf(from);
  const last = monthKeyOf(to);
  const entries = await entriesUpTo(spaceId, last);
  const today = todayIso();
  const out: Occurrence[] = [];
  for (let m = first; m <= last; m = addMonthsToKey(m, 1)) {
    out.push(...occurrencesInMonth(entries, m, today));
  }
  return out;
}

/**
 * A ocorrência que esta linha provavelmente é.
 *
 * Mesmo valor, mesmo sentido e até três dias de distância — o boleto do dia 10
 * que caiu no dia 11 porque o 10 era domingo. Parcela bate por "3 de 10" com o
 * mesmo total, que é como a fatura seguinte vai trazer a mesma compra.
 */
function findMatch(
  occurrences: Occurrence[],
  taken: Set<string>,
  date: IsoDate,
  amount: Cents,
  outflow: boolean,
  installment: { index: number; total: number } | null,
): Occurrence | null {
  let best: Occurrence | null = null;
  let bestGap = Infinity;
  for (const o of occurrences) {
    if (taken.has(`${o.entryId}:${o.key}`)) continue;
    if (o.amount !== amount) continue;
    if ((o.kind === 'in') === outflow) continue;
    if (installment && o.installment && o.installment.total === installment.total && o.installment.index === installment.index) {
      return o;
    }
    const gap = Math.abs(diffDays(o.date, date));
    if (gap <= 3 && gap < bestGap) {
      best = o;
      bestGap = gap;
    }
  }
  return best;
}

/* -------------------------------------------------------------- gravação */

export interface ImportResult {
  created: number;
  settled: number;
  /** a competência mais recente do extrato, para a tela abrir nela */
  lastMonth: string;
}

/**
 * Grava a revisão numa transação só.
 *
 * Um extrato de um ano são centenas de linhas; gravar uma a uma deixaria a
 * base pela metade se a aba fechasse no meio, e a fila de sync com centenas de
 * transações pequenas em vez de uma.
 */
export async function commitReview(
  rows: ReviewRow[],
  opts: { spaceId: string; target: ImportTarget; source: EntrySource },
): Promise<ImportResult> {
  const chosen = rows.filter((r) => r.include);
  const today = todayIso();
  const at = nowInstant();

  const created: Entry[] = [];
  const settleBy = new Map<string, { key: string; amount: Cents }[]>();

  for (const r of chosen) {
    if (r.status === 'settle' && r.match) {
      const list = settleBy.get(r.match.entryId) ?? [];
      list.push({ key: r.match.occurrenceKey, amount: r.amount });
      settleBy.set(r.match.entryId, list);
      continue;
    }

    const cardId = opts.target.type === 'card' ? opts.target.cardId : null;
    let date = r.date;
    let repeat: Entry['repeat'] = { kind: 'once' };

    // parcela 3 de 10: a compra nasceu dois meses antes e segue até a décima
    if (r.installment && cardId) {
      const { y, m } = monthKeyParts(addMonthsToKey(monthKeyOf(r.date), -(r.installment.index - 1)));
      const day = Number(r.date.slice(8));
      date = partsToIso(y, m, clampDayToMonth(day, y, m));
      repeat = { kind: 'installments', count: r.installment.total };
    }

    // o que está no extrato já aconteceu; compra no cartão se paga pela fatura
    const settled: Entry['settled'] = {};
    if (!cardId && r.date <= today) settled[monthKeyOf(r.date)] = { at };

    created.push({
      id: uid(),
      spaceId: opts.spaceId,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      kind: r.kind,
      description: r.description.slice(0, 120),
      amount: r.amount,
      date,
      categoryId: r.categoryId,
      accountId: null,
      cardId,
      repeat,
      settled,
      notes: '',
      tags: [],
      source: opts.source,
      externalId: r.externalId,
      attachmentIds: [],
    });
  }

  const toSettle: Entry[] = [];
  for (const [entryId, marks] of settleBy) {
    const entry = await db().entries.get(entryId);
    if (!entry || entry.deletedAt) continue;
    const settled = { ...entry.settled };
    for (const mark of marks) {
      settled[mark.key] = mark.amount === entry.amount ? { at } : { at, amount: mark.amount };
    }
    toSettle.push({ ...entry, settled });
  }

  await putRecords('entries', [...created, ...toSettle]);

  const lastMonth = chosen.reduce((max, r) => (monthKeyOf(r.date) > max ? monthKeyOf(r.date) : max), '');
  return {
    created: created.length,
    settled: toSettle.reduce((n, e) => n + (settleBy.get(e.id)?.length ?? 0), 0),
    lastMonth,
  };
}
