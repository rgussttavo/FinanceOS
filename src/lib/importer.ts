import { categorize, cleanDescription, type LearnedRule } from './categories';
import { addMonthsToKey, clampDayToMonth, diffDays, monthKeyOf, monthKeyParts, nowInstant, partsToIso, todayIso } from './dates';
import { buildInvoice, invoiceMonthOf } from './cards';
import { db, entriesUpTo, putRecords } from './db';
import { occurrencesInMonth, type Occurrence } from './occurrences';
import { uid } from './provision';
import { detectInstallment, tidyDescription, type ParsedStatement, type StatementRow } from './statement';
import type { Category, Cents, Entry, EntrySource, FlowKind, IsoDate, Subscription } from './types';
import { normalize } from './categories';

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
  | 'transfer'
  /** cobrança de uma assinatura já cadastrada: ela já pesa no mês */
  | 'subscription'
  /** dinheiro entre contas suas ou resgate de aplicação: não é renda nem gasto */
  | 'internal';

export type Confidence = 'alta' | 'média' | 'baixa';

/** como a revisão agrupa as linhas para a pessoa */
export type ReviewGroup = 'review' | 'ready' | 'match' | 'duplicate' | 'card-payment' | 'internal';

export function groupOf(row: Pick<ReviewRow, 'status' | 'confidence' | 'categoryId'>): ReviewGroup {
  switch (row.status) {
    case 'imported':
      return 'duplicate';
    case 'transfer':
      return 'card-payment';
    case 'internal':
      return 'internal';
    case 'settle':
    case 'similar':
    case 'subscription':
      return 'match';
    default:
      return row.confidence === 'baixa' || !row.categoryId ? 'review' : 'ready';
  }
}

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
  /** o quanto a sugestão de categoria é confiável */
  confidence: Confidence;
  externalId: string;
  status: RowStatus;
  include: boolean;
  /** pagamento de fatura (na conta, o que paga; na fatura, o crédito da anterior) */
  billPayment?: boolean;
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
  /** assinaturas cadastradas: a cobrança delas no extrato não vira lançamento de novo */
  subscriptions?: Subscription[];
  /** progresso real da comparação, linha a linha */
  onProgress?: (done: number, total: number) => void;
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


/**
 * A conta de uma fatura importada: o que o arquivo cobra e o que vai entrar.
 *
 * É o que responde "a minha fatura é 829 e o app diz 594": compras que
 * bateram com algo já lançado ficam desmarcadas, estornos abatem no banco —
 * e cada diferença aparece com nome antes de importar.
 */
export function invoiceReconciliation(rows: ReviewRow[]) {
  const charges = rows.filter((r) => r.kind !== 'in' && r.status !== 'transfer');
  const credits = rows.filter((r) => r.kind === 'in' && !r.billPayment);
  const sum = (list: ReviewRow[]) => list.reduce((s, r) => s + r.amount, 0);
  const entering = charges.filter((r) => r.include);
  const left = charges.filter((r) => !r.include && r.status !== 'imported');
  const already = charges.filter((r) => r.status === 'imported');
  return {
    charges: sum(charges),
    credits: sum(credits),
    /** o total que o banco cobra: compras menos estornos */
    fileTotal: sum(charges) - sum(credits),
    entering: sum(entering),
    left,
    leftTotal: sum(left),
    alreadyTotal: sum(already),
  };
}
const INTERNAL = /transferencia entre contas|mesma titularidade|conta propria|entre suas contas|resgate|transf.*propria/;
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
  const subs = (opts.subscriptions ?? []).filter((s) => !s.deletedAt);

  const out: ReviewRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    // cede a vez ao navegador de tempos em tempos: a barra de progresso anda
    // e a tela não congela num extrato de um ano
    if (i % 40 === 0) {
      opts.onProgress?.(i, rows.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    out.push(reviewOne(rows[i], i));
  }
  opts.onProgress?.(rows.length, rows.length);
  return out;

  function reviewOne(row: StatementRow, i: number): ReviewRow {
    const externalId = idOf.get(row) ?? `row:${i}`;
    const signed = opts.invert ? -row.amount : row.amount;

    const outflow = signed < 0;
    const amount = Math.abs(signed);
    const description = tidyDescription(row.description);
    const plainDesc = cleanDescription(row.description);
    // a limpeza tira "pagamento": para reconhecer pagamento de fatura, vale o texto inteiro
    const fullDesc = normalize(row.description);

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

    const sub = outflow ? matchSubscription(subs, plainDesc, amount, row.date) : null;

    if (already.has(externalId)) {
      status = 'imported';
    } else if (sub) {
      status = 'subscription';
      match = { entryId: `sub:${sub.id}`, occurrenceKey: '', description: sub.name };
    } else if (INTERNAL.test(plainDesc)) {
      status = 'internal';
    } else if (target.type === 'card' && (!outflow || CARD_PAYMENT.test(fullDesc))) {
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
      confidence: guess.confidence >= 0.7 ? 'alta' : guess.confidence >= 0.45 ? 'média' : 'baixa',
      externalId,
      status,
      include: status === 'new' || status === 'settle',
      match,
      installment: installment ? { index: installment.index, total: installment.total } : null,
      billPayment: CARD_PAYMENT.test(fullDesc) || (target.type === 'account' && outflow && ACCOUNT_CARD_BILL.test(plainDesc)),
    };
  }
}

/**
 * A assinatura que esta linha provavelmente é: nome parecido, valor perto (o
 * reajuste de preço acontece) e cobrança perto do dia cadastrado.
 */
function matchSubscription(subs: Subscription[], plainDesc: string, amount: Cents, date: IsoDate): Subscription | null {
  const day = Number(date.slice(8));
  for (const s of subs) {
    if (s.canceledAt && s.canceledAt < date) continue;
    const words = normalize(s.name).split(' ').filter((w) => w.length >= 3);
    if (!words.length || !words.some((w) => plainDesc.includes(w))) continue;
    if (Math.abs(amount - s.amount) > Math.max(300, s.amount * 0.15)) continue;
    const gap = Math.abs(day - s.billingDay);
    if (Math.min(gap, 31 - gap) > 4) continue;
    return s;
  }
  return null;
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
  /** na fatura de cartão: qual fatura o arquivo é */
  invoiceMonth?: string;
  /** a fatura anterior do mesmo cartão está vazia no app: as parcelas antigas faltam */
  previousInvoiceMissing?: boolean;
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

  /**
   * O arquivo de uma fatura É uma fatura. Todas as compras dele ficam presas a
   * ela, em vez de cada uma ser redistribuída pelo dia de fechamento
   * cadastrado — que, errado por dois dias, jogava compras para a fatura do
   * lado e fazia a fatura do app não bater com a do banco. Qual fatura é: a da
   * compra mais recente do arquivo.
   */
  const cardId = opts.target.type === 'card' ? opts.target.cardId : null;
  const card = cardId ? await db().cards.get(cardId) : null;
  const purchases = rows.filter((r) => r.kind !== 'in' && r.status !== 'transfer');
  const lastPurchase = purchases.reduce<string>((max, r) => (r.date > max ? r.date : max), '');
  const invoiceMonth = card && lastPurchase ? invoiceMonthOf(card, lastPurchase) : null;
  const pinFor = (r: ReviewRow) => (invoiceMonth ? addMonthsToKey(invoiceMonth, -((r.installment?.index ?? 1) - 1)) : null);

  for (const r of chosen) {
    if (r.status === 'settle' && r.match) {
      const list = settleBy.get(r.match.entryId) ?? [];
      list.push({ key: r.match.occurrenceKey, amount: r.amount });
      settleBy.set(r.match.entryId, list);
      continue;
    }

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
      ...(cardId && invoiceMonth ? { invoiceMonth: pinFor(r) } : null),
    });
  }

  // reimportar a mesma fatura conserta as compras que já tinham entrado no ciclo errado
  const repinned: Entry[] = [];
  if (cardId && invoiceMonth) {
    const ids = rows.filter((r) => r.status === 'imported' && r.kind !== 'in').map((r) => r.externalId);
    const want = new Map(rows.map((r) => [r.externalId, r]));
    if (ids.length) {
      const existing = await db().entries.where('externalId').anyOf(ids).toArray();
      for (const e of existing) {
        const r = want.get(e.externalId ?? '');
        if (!r || e.deletedAt || e.spaceId !== opts.spaceId || e.cardId !== cardId) continue;
        const pin = pinFor(r);
        if (pin && e.invoiceMonth !== pin) repinned.push({ ...e, invoiceMonth: pin });
      }
    }
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

  await putRecords('entries', [...created, ...toSettle, ...repinned]);

  const lastMonth = chosen.reduce((max, r) => (monthKeyOf(r.date) > max ? monthKeyOf(r.date) : max), '');

  /**
   * A fatura do banco traz as parcelas de compras antigas ("3/6"); o arquivo
   * da fatura atual, em geral, só o que foi comprado neste ciclo. A compra
   * parcelada entra no app inteira a partir da fatura em que aparece — então,
   * se a anterior está vazia aqui, faltam as parcelas que continuam nesta.
   */
  let previousInvoiceMissing = false;
  if (card && invoiceMonth) {
    const cardEntries = (await db().entries.where('cardId').equals(card.id).toArray()).filter((e) => !e.deletedAt);
    previousInvoiceMissing = buildInvoice(card, cardEntries, [], addMonthsToKey(invoiceMonth, -1), today).lines.length === 0;
  }
  return {
    created: created.length,
    settled: toSettle.reduce((n, e) => n + (settleBy.get(e.id)?.length ?? 0), 0),
    lastMonth,
    ...(invoiceMonth ? { invoiceMonth, previousInvoiceMissing } : null),
  };
}
