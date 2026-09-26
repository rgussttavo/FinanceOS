import { ensurePrimaryAccount, loadLedger, primaryIdFor } from './accounts';
import { bankInText, buildInvoice, cardOfBank, dueDateOf, invoiceMonthOf, realizedCharges, realizedKey } from './cards';
import { categorize, cleanDescription, normalize, type LearnedRule } from './categories';
import { addDaysIso, addMonthsToKey, clampDayToMonth, diffDays, monthKeyOf, monthKeyParts, nowInstant, partsToIso, todayIso } from './dates';
import { audit, db, entriesUpTo, liveRows, putRecord, putRecords } from './db';
import { FALLBACK_ACCOUNT_ID, auditAccount, primaryAccountId, type LedgerInput } from './ledger';
import { occurrencesInMonth, type Occurrence } from './occurrences';
import { uid } from './provision';
import { detectInstallment, tidyDescription, type ParsedStatement, type StatementBalance, type StatementRow } from './statement';
import type { Account, Card, Category, Cents, Debt, Entry, EntrySource, FlowKind, IsoDate, Settings, Subscription, Transfer } from './types';

/**
 * Do extrato lido ao lançamento gravado.
 *
 * O leitor diz o que o arquivo contém. Daqui sai o que fazer com cada linha,
 * com duas regras:
 *
 *   1. não duplicar nada que a pessoa já tem — linha importada antes é pulada;
 *      conta prevista e aberta vira baixa; transferência já registrada do
 *      outro lado é reconhecida;
 *   2. toda linha do extrato de uma conta tem efeito nela. Antes, pagamento de
 *      fatura, transferência entre contas, resgate e cobrança de assinatura
 *      ficavam de fora — e o saldo do app não tinha como bater com o do banco.
 *      Agora cada um vira o que é: pagamento, transferência, resgate, cobrança
 *      real. Nenhum deles vira receita ou despesa por engano.
 */

/**
 * Onde o extrato entra. Na conta, `accountId` é a conta cadastrada; ausente,
 * é a principal.
 */
export type ImportTarget = { type: 'account'; accountId?: string | null } | { type: 'card'; cardId: string };

export type RowStatus =
  /** novo, vira lançamento */
  | 'new'
  /** bate com uma ocorrência prevista e aberta: marca como paga */
  | 'settle'
  /** parecido com algo já lançado; desmarcado até a pessoa decidir */
  | 'similar'
  /** este mesmo identificador já foi importado */
  | 'imported'
  /** pagamento de fatura: vira pagamento (conta → cartão), nunca despesa */
  | 'transfer'
  /** cobrança de uma assinatura já cadastrada: vira a cobrança real daquele mês */
  | 'subscription'
  /** dinheiro entre contas suas, ou resgate de aplicação: não é renda nem gasto */
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
  /** o sentido na conta: a linha tirou dinheiro dela? */
  outflow: boolean;
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
  /**
   * Transferência entre contas suas: a outra conta. Com ela, a linha vira uma
   * transferência (um registro, os dois lados); sem ela, fica de fora e a
   * reconciliação mostra a diferença.
   */
  counterpartAccountId?: string | null;
  /** pagamento de fatura na conta: o cartão pago. A linha vira pagamento, não despesa */
  payCardId?: string | null;
  /** cobrança de uma assinatura cadastrada: a linha vira a cobrança real daquele mês */
  subscriptionId?: string | null;
  /** resgate de aplicação: volta para a conta, sai do investido, não é renda */
  withdrawal?: boolean;
  /** a transferência já registrada (do outro lado) que esta linha é */
  matchedTransferId?: string | null;
  /** explicação curta do que vai acontecer, quando não é óbvio */
  note?: string;
}

export interface ReviewOptions {
  spaceId: string;
  target: ImportTarget;
  /** inverte o sinal de tudo: fatura que traz compra como positivo */
  invert: boolean;
  categories: Category[];
  /** assinaturas cadastradas: a cobrança delas no extrato vira a cobrança real */
  subscriptions?: Subscription[];
  /** progresso real da comparação, linha a linha */
  onProgress?: (done: number, total: number) => void;
}

/* ------------------------------------------------------------ assinatura */

/**
 * O escopo do identificador. A conta principal usa o escopo antigo ("acct"),
 * o mesmo de todo extrato importado antes de existirem contas: reimportar
 * aquele arquivo continua reconhecendo cada linha. As outras contas têm o
 * próprio escopo, para duas contas com a mesma tarifa no mesmo dia não se
 * confundirem.
 */
function scopeFor(target: ImportTarget, spaceId: string): string {
  if (target.type === 'card') return `card:${target.cardId}`;
  const id = target.accountId;
  if (!id || id === primaryIdFor(spaceId) || id === FALLBACK_ACCOUNT_ID) return 'acct';
  return `acct:${id}`;
}

/**
 * O identificador que torna o reimport inofensivo.
 *
 * No OFX o banco dá um (FITID). Nos outros formatos ele é derivado da data, do
 * valor e da descrição — e da ordem dentro do arquivo entre linhas idênticas,
 * porque dois cafés de R$ 6 no mesmo dia são dois cafés.
 */
function externalIdFor(row: StatementRow, parsed: ParsedStatement, scope: string, repeat: number): string {
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
 * Crédito na fatura que é pagamento, com a palavra que o banco usar. Os
 * outros créditos (estorno, cancelamento, reembolso) entram e abatem a
 * fatura.
 */
const CARD_CREDIT_PAYMENT = /pagamento|pgto|pagto|pag fat|debito automatico/;

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
  const left = charges.filter((r) => !r.include && r.status !== 'imported');
  return {
    charges: sum(charges),
    credits: sum(credits),
    /** o total que o banco cobra: compras menos estornos */
    fileTotal: sum(charges) - sum(credits),
    entering: sum(charges.filter((r) => r.include)) - sum(credits.filter((r) => r.include)),
    left,
    leftTotal: sum(left),
    alreadyTotal: sum(charges.filter((r) => r.status === 'imported')) - sum(credits.filter((r) => r.status === 'imported')),
  };
}

const INTERNAL = /transferencia entre contas|mesma titularidade|conta propria|entre suas contas|transf.*propria|mesmo titular/;
const WITHDRAWAL = /\b(resgate|resg|resgatado|rendimento resgatado|resgate aplic\w*|resgate cdb|resgate lci|resgate lca|resgate tesouro|resgate poupanca)\b/;
/**
 * Uma linha de saída da conta é o pagamento da fatura de um cartão?
 *
 *   'card'   é: fala em cartão ("pagamento cartão", "cartão de crédito") ou
 *            em fatura de um banco pelo nome ("pagamento fatura Nubank")
 *   'maybe'  pode ser: "pagamento de fatura" sem dizer de quem
 *   null     não é
 *
 * Duas regras nasceram de extratos reais:
 *
 *  - "fatura" sozinha não basta. Conta de luz, telefone e internet também se
 *    chamam fatura ("FATURA CLARO", "DEB AUTOMATICO FATURA ENEL"); tratadas
 *    como pagamento de cartão, sumiam das despesas e davam crédito ao cartão.
 *    Concessionária e operadora no texto decidem: é conta de consumo.
 *  - O teste é feito sobre o texto inteiro. A limpeza de descrição apaga
 *    "pagamento cartão" por ser ruído para categorizar — e com isso
 *    "PAGAMENTO CARTAO NUBANK" deixava de ser reconhecido e virava despesa,
 *    contando em dobro com as compras do cartão.
 */
const UTILITY =
  /\b(enel|cemig|copel|cpfl|light|equatorial|neoenergia|coelba|celpe|cosern|energisa|elektro|sabesp|cedae|caesb|sanepar|embasa|copasa|compesa|casan|corsan|comgas|naturgy|ultragaz|claro|vivo|tim|oi|net|sky|algar|nextel|telefonica|energia|eletrica|agua|esgoto|saneamento|gas|internet|fibra|banda larga|telefone|celular|condominio|aluguel|escola|faculdade|mensalidade|unimed|amil|hapvida|seguro)\b/;
// "crédito" sozinho não: "pagamento crédito pessoal" é empréstimo, não cartão
const CARD_WORDS = /\b(cartao|cartoes|card|visa|mastercard|elo|amex|hipercard)\b/;
const BILL_PAYMENT = /\b(pagamento|pgto|pagto|pag|pg|deb|debito)\b.*\bfatura\b|\bfatura\b.*\b(pagamento|pgto|pagto|paga)\b/;

export function cardBillKind(description: string): 'card' | 'maybe' | null {
  const text = normalize(description);
  if (UTILITY.test(text)) return null;
  const paying = /\b(pagamento|pgto|pagto|pag|pg|debito automatico|deb aut)\b/.test(text);
  if (paying && CARD_WORDS.test(text)) return 'card';
  if (/\bfatura\b.*\b(cartao|credito)\b|\b(cartao|credito)\b.*\bfatura\b/.test(text)) return 'card';
  if (BILL_PAYMENT.test(text) || (paying && /\bfatura\b/.test(text))) return bankInText(description) ? 'card' : 'maybe';
  return null;
}

/**
 * Monta a lista que a pessoa revisa antes de gravar.
 *
 * Lê o que já existe no espaço uma vez só: identificadores importados antes,
 * transferências registradas e as ocorrências dos meses que o extrato cobre.
 */
export async function buildReview(parsed: ParsedStatement, opts: ReviewOptions): Promise<ReviewRow[]> {
  const { spaceId, target, categories } = opts;
  const learned = (await db().learned.toArray()) as LearnedRule[];

  const rows = parsed.rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!rows.length) return [];

  const [accounts, cards, transfers] = await Promise.all([
    liveRows<Account>('accounts', spaceId),
    liveRows<Card>('cards', spaceId),
    liveRows<Transfer>('transfers', spaceId),
  ]);
  const targetAccount = target.type === 'account' ? (target.accountId ?? primaryAccountId(accounts)) : null;
  const others = accounts.filter((a) => !a.archived && a.id !== targetAccount);
  const liveCards = cards.filter((c) => !c.archived);

  // linhas idênticas no mesmo arquivo recebem um contador, para não virarem uma só
  const scope = scopeFor(target, spaceId);
  const seen = new Map<string, number>();
  const ids = parsed.rows.map((row) => {
    const k = `${row.date}|${row.amount}|${cleanDescription(row.description)}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return externalIdFor(row, parsed, scope, n);
  });
  const idOf = new Map(parsed.rows.map((row, i) => [row, ids[i]]));

  const already = new Set<string>([
    ...(await db().entries.where('externalId').anyOf(ids).toArray())
      .filter((e) => e.spaceId === spaceId && !e.deletedAt)
      .map((e) => e.externalId as string),
    ...transfers.flatMap((t) => t.externalIds ?? []),
  ]);

  // na fatura, parcelas de compras antigas podem estar datadas bem longe do arquivo: a janela é mais larga
  const pad = target.type === 'card' ? 45 : 0;
  const occurrences = await occurrencesCovering(spaceId, addDaysIso(rows[0].date, -pad), addDaysIso(rows[rows.length - 1].date, pad));
  const taken = new Set<string>();
  const takenTransfers = new Set<string>();
  const subs = (opts.subscriptions ?? []).filter((s) => !s.deletedAt);

  /**
   * No máximo uma cobrança por assinatura por mês (FIN-009).
   *
   * Antes cada linha era comparada sozinha, e a compra de R$ 21,90 na Amazon
   * perto do dia do Prime virava "a cobrança do Prime" — junto com a cobrança
   * de verdade, se ela também estivesse no arquivo. Agora as candidatas de
   * cada assinatura, em cada mês, disputam uma vaga: ganha a de valor mais
   * perto do cadastrado (e, empatado, a de dia mais perto). A vaga de um mês
   * que já tem a cobrança real no app, vinda de outro arquivo, já está
   * ocupada.
   */
  const subOf = new Map<StatementRow, Subscription>();
  if (subs.length) {
    const held = realizedCharges(await entriesUpTo(spaceId, monthKeyOf(rows[rows.length - 1].date)));
    const best = new Map<string, { row: StatementRow; score: number; sub: Subscription }>();
    for (const row of rows) {
      const signedAmount = opts.invert ? -row.amount : row.amount;
      if (signedAmount >= 0) continue;
      const candidates = subscriptionCandidates(subs, cleanDescription(row.description), -signedAmount, row.date);
      const top = candidates[0];
      if (!top) continue;
      const slot = realizedKey(top.sub.id, monthKeyOf(row.date));
      // a cobrança deste mês que já veio de outro arquivo só é reconhecida por ser ela mesma
      if (held.has(slot) && !already.has(idOf.get(row) ?? '')) continue;
      const current = best.get(slot);
      if (!current || top.score < current.score) best.set(slot, { row, score: top.score, sub: top.sub });
    }
    for (const { row, sub } of best.values()) subOf.set(row, sub);
  }

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

  /** a transferência já registrada que esta linha é, vista do lado de cá */
  function matchTransfer(date: IsoDate, amount: Cents, outflow: boolean): Transfer | null {
    let best: Transfer | null = null;
    let bestGap = Infinity;
    for (const t of transfers) {
      if (takenTransfers.has(t.id) || t.amount !== amount) continue;
      const gap = Math.abs(diffDays(t.date, date));
      if (gap > (target.type === 'card' ? 7 : 3) || gap >= bestGap) continue;
      const fits =
        target.type === 'card'
          ? t.kind === 'card' && t.toCardId === target.cardId && !outflow
          : (t.kind === 'account' && ((outflow && t.fromAccountId === targetAccount) || (!outflow && t.toAccountId === targetAccount))) ||
            (t.kind === 'card' && outflow && t.fromAccountId === targetAccount);
      if (!fits) continue;
      best = t;
      bestGap = gap;
    }
    return best;
  }

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
    // na conta: esta saída é o pagamento de uma fatura de cartão?
    const bill = target.type === 'account' && outflow ? cardBillKind(row.description) : null;

    let status: RowStatus = 'new';
    let match: ReviewRow['match'] = null;
    let include: boolean | null = null;
    const extra: Partial<ReviewRow> = {};

    const sub = outflow ? (subOf.get(row) ?? null) : null;
    const isWithdrawal = target.type === 'account' && !outflow && WITHDRAWAL.test(fullDesc);
    const linked = !already.has(externalId) ? matchTransfer(row.date, amount, outflow) : null;

    if (already.has(externalId)) {
      status = 'imported';
    } else if (linked) {
      // o outro lado já registrou: esta linha só se junta a ela
      takenTransfers.add(linked.id);
      status = 'imported';
      extra.matchedTransferId = linked.id;
      extra.note = linked.kind === 'card' ? 'é o pagamento de fatura já registrado' : 'é a transferência já registrada';
    } else if (sub) {
      status = 'subscription';
      match = { entryId: `sub:${sub.id}`, occurrenceKey: '', description: sub.name };
      extra.subscriptionId = sub.id;
      if (sub.categoryId) guess = { ...guess, categoryId: sub.categoryId, confidence: 0.9 };
      include = true;
      extra.note = `cobrança real de ${sub.name}: toma o lugar da prevista`;
    } else if (isWithdrawal) {
      status = 'internal';
      kind = 'invest';
      guess = categorize({ description, kind: 'invest', categories, learned });
      extra.withdrawal = true;
      include = true;
      extra.note = 'resgate: volta para a conta e sai do investido, não é renda';
    } else if (target.type === 'account' && INTERNAL.test(plainDesc)) {
      status = 'internal';
      const counterpart = others.length === 1 ? others[0].id : null;
      extra.counterpartAccountId = counterpart;
      include = !!counterpart;
      extra.note = counterpart ? 'transferência entre suas contas' : 'transferência entre suas contas: escolha a outra conta';
    } else if (target.type === 'card' && (CARD_PAYMENT.test(fullDesc) || (!outflow && CARD_CREDIT_PAYMENT.test(fullDesc)))) {
      // o pagamento da fatura anterior, visto do cartão: vira o pagamento, que sai da conta
      status = 'transfer';
      include = true;
      extra.note = 'pagamento da fatura: sai da conta, não é compra nem estorno';
    } else {
      const hit = findMatch(occurrences, taken, row.date, amount, outflow, installment, target.type === 'card' ? plainDesc : null);
      if (hit) {
        taken.add(`${hit.entryId}:${hit.key}`);
        match = { entryId: hit.entryId, occurrenceKey: hit.key, description: hit.description };
        status = hit.settlement || hit.cardId || target.type === 'card' ? 'similar' : 'settle';
        // parcela de uma compra que já está no app (veio de outra fatura): não entra de novo
        if (hit.installment && (installment || target.type === 'card')) status = 'imported';
      } else if (target.type === 'account' && outflow && bill) {
        // a fatura paga pela conta: com o cartão dela no app, é pagamento e não despesa
        const bank = bankInText(row.description);
        const card = cardOfBank(liveCards, bank);
        if (card) {
          status = 'transfer';
          extra.payCardId = card.id;
          include = true;
          extra.note = `pagamento da fatura ${card.name || card.institution}: sai da conta, as compras já contam no cartão`;
        } else if (bank || !liveCards.length) {
          /**
           * O cartão pago não está no app — o banco citado não tem cartão
           * cadastrado, ou não há cartão nenhum. As compras dele também não
           * estão aqui, então o pagamento é o gasto. Antes, com um cartão só
           * cadastrado, a fatura do Itaú ia para o Nubank.
           */
          extra.note = `fatura de cartão${bank ? ` ${bank.name}` : ''} que não está no app: entra como gasto. Se importar a fatura depois, exclua esta linha.`;
        } else {
          // não diz de qual cartão: a pessoa escolhe; até lá, fica de fora
          status = 'transfer';
          extra.payCardId = null;
          include = false;
          extra.note =
            bill === 'maybe'
              ? 'pagamento de fatura sem dizer de quem: escolha o cartão — ou desmarque, se for conta de consumo'
              : 'pagamento de fatura de cartão: escolha qual';
        }
      }
    }

    return {
      key: `${i}:${externalId}`,
      date: row.date,
      description: installment ? installment.base : description,
      kind,
      amount,
      outflow,
      categoryId: guess.categoryId,
      unsure: guess.confidence < 0.35,
      confidence: guess.confidence >= 0.7 ? 'alta' : guess.confidence >= 0.45 ? 'média' : 'baixa',
      externalId,
      status,
      include: include ?? (status === 'new' || status === 'settle'),
      match,
      installment: installment ? { index: installment.index, total: installment.total } : null,
      billPayment:
        target.type === 'card' ? CARD_PAYMENT.test(fullDesc) || (!outflow && CARD_CREDIT_PAYMENT.test(fullDesc)) : bill !== null,
      ...extra,
    };
  }
}

/**
 * A assinatura que esta linha provavelmente é: nome parecido, valor perto (o
 * reajuste de preço acontece) e cobrança perto do dia cadastrado.
 */
function subscriptionCandidates(subs: Subscription[], plainDesc: string, amount: Cents, date: IsoDate): { sub: Subscription; score: number }[] {
  const day = Number(date.slice(8));
  const out: { sub: Subscription; score: number }[] = [];
  for (const s of subs) {
    if (s.canceledAt && s.canceledAt < date) continue;
    const words = normalize(s.name).split(' ').filter((w) => w.length >= 3);
    if (!words.length || !words.some((w) => plainDesc.includes(w))) continue;
    const diff = Math.abs(amount - s.amount);
    // a variação aceita é a de sempre: reajuste de preço acontece
    if (diff > Math.max(300, s.amount * 0.15)) continue;
    const gap = Math.abs(day - s.billingDay);
    const dayGap = Math.min(gap, 31 - gap);
    if (dayGap > 4) continue;
    // valor pesa mais que o dia: centavos de diferença vêm antes de um dia de diferença
    out.push({ sub: s, score: diff * 100 + dayGap });
  }
  return out.sort((a, b) => a.score - b.score);
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
  /** na fatura de cartão: a descrição limpa, para reconhecer parcela de compra antiga */
  cardDesc: string | null = null,
): Occurrence | null {
  let best: Occurrence | null = null;
  let bestGap = Infinity;
  let continuation: Occurrence | null = null;
  let continuationGap = Infinity;
  for (const o of occurrences) {
    if (taken.has(`${o.entryId}:${o.key}`)) continue;
    if ((o.kind === 'in') === outflow) continue;
    // parcelas podem diferir em centavos (a primeira leva o arredondamento)
    const diff = Math.abs(o.amount - amount);
    if (installment && o.installment && o.installment.total === installment.total && o.installment.index === installment.index && diff <= 3) {
      return o;
    }
    if (diff === 0) {
      const gap = Math.abs(diffDays(o.date, date));
      // na fatura, parcela conhecida fica com a regra de parcela, que olha a loja
      if (gap <= 3 && gap < bestGap && !(cardDesc && o.installment)) {
        best = o;
        bestGap = gap;
      }
    }
    // a parcela de uma compra antiga que o arquivo trouxe sem "2/6", ou com outra data
    // a parcela de data mais próxima: a de agosto e a de setembro da mesma compra têm o mesmo valor
    const gap = Math.abs(diffDays(o.date, date));
    if (cardDesc && o.cardId && o.installment && diff <= 3 && gap <= 45 && gap < continuationGap && sharesWord(cardDesc, o.description)) {
      continuation = o;
      continuationGap = gap;
    }
  }
  return best ?? continuation;
}

/** duas descrições falam da mesma loja: dividem uma palavra de verdade */
export function sharesWord(a: string, b: string): boolean {
  const words = (t: string) => new Set(normalize(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w)));
  const wa = words(a);
  for (const w of words(b)) if (wa.has(w)) return true;
  return false;
}

/* -------------------------------------------------------------- gravação */

export interface Reconciliation {
  accountId: string;
  /** o saldo que o banco escreveu no arquivo */
  declared: Cents;
  date: IsoDate;
  /** o saldo que o app calcula para a mesma conta, no mesmo dia */
  computed: Cents;
  /** declarado menos calculado: zero é conferido */
  diff: Cents;
  /** linhas do arquivo que ficaram de fora e mexeriam no saldo */
  left: { description: string; date: IsoDate; signed: Cents }[];
  /** movimentos da conta no período do arquivo que não vieram dele */
  extra: { description: string; date: IsoDate; signed: Cents }[];
}

export interface ImportResult {
  created: number;
  settled: number;
  /** transferências e pagamentos de fatura criados */
  transfers: number;
  /** linhas que se juntaram a uma transferência já registrada */
  linked: number;
  /** a competência mais recente do extrato, para a tela abrir nela */
  lastMonth: string;
  /** na fatura de cartão: qual fatura o arquivo é */
  invoiceMonth?: string;
  /** a fatura anterior do mesmo cartão está vazia no app: as parcelas antigas faltam */
  previousInvoiceMissing?: boolean;
  /** o saldo do banco contra o do app, quando o arquivo traz o saldo */
  reconciliation?: Reconciliation;
  /** o saldo anterior do arquivo virou o saldo inicial da conta */
  openingSet?: { amount: Cents; date: IsoDate };
}

/**
 * Grava a revisão.
 *
 * Um extrato de um ano são centenas de linhas; cada tabela vai numa
 * transação só, para a base nunca ficar com metade de um extrato.
 */
export async function commitReview(
  rows: ReviewRow[],
  opts: {
    spaceId: string;
    target: ImportTarget;
    source: EntrySource;
    invoiceMonth?: string | null;
    /** nome do arquivo, para o saldo conferido dizer de onde veio */
    fileName?: string;
    /** saldos declarados no arquivo */
    balance?: StatementBalance;
    /** usar o saldo anterior do arquivo como saldo inicial da conta (só se ela ainda não tem) */
    useOpening?: boolean;
  },
): Promise<ImportResult> {
  const chosen = rows.filter((r) => r.include);
  const today = todayIso();
  const at = nowInstant();

  const accounts = await liveRows<Account>('accounts', opts.spaceId);
  const targetAccount = opts.target.type === 'account' ? (opts.target.accountId ?? primaryAccountId(accounts)) : null;
  const accountField = targetAccount && targetAccount !== FALLBACK_ACCOUNT_ID ? targetAccount : null;

  const created: Entry[] = [];
  const newTransfers: Transfer[] = [];
  const linkedTransfers = new Map<string, string[]>();
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
  // quem sabe qual é a fatura é a pessoa (pelo vencimento); sem isso, o palpite pelo ciclo
  const invoiceMonth = card ? opts.invoiceMonth || (lastPurchase ? invoiceMonthOf(card, lastPurchase) : null) : null;
  const pinFor = (r: ReviewRow) => (invoiceMonth ? addMonthsToKey(invoiceMonth, -((r.installment?.index ?? 1) - 1)) : null);

  const cards = await liveRows<Card>('cards', opts.spaceId);
  const transferBase = (r: ReviewRow) => ({
    id: uid(),
    spaceId: opts.spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    date: r.date,
    amount: r.amount,
    description: r.description.slice(0, 120),
    notes: '',
    externalIds: [r.externalId],
    source: opts.source,
    toAccountId: null,
    toCardId: null,
    invoiceMonth: null,
  });

  for (const r of rows) {
    // a linha que se juntou a uma transferência já registrada guarda o próprio id nela
    if (r.status === 'imported' && r.matchedTransferId) {
      linkedTransfers.set(r.matchedTransferId, [...(linkedTransfers.get(r.matchedTransferId) ?? []), r.externalId]);
    }
  }

  for (const r of chosen) {
    if (r.status === 'settle' && r.match) {
      const list = settleBy.get(r.match.entryId) ?? [];
      list.push({ key: r.match.occurrenceKey, amount: r.amount });
      settleBy.set(r.match.entryId, list);
      continue;
    }

    // transferência entre suas contas: um registro, os dois lados
    if (r.status === 'internal' && !r.withdrawal) {
      if (!r.counterpartAccountId || !targetAccount) continue;
      newTransfers.push({
        ...transferBase(r),
        kind: 'account',
        fromAccountId: r.outflow ? accountField : r.counterpartAccountId,
        toAccountId: r.outflow ? r.counterpartAccountId : accountField,
      });
      continue;
    }

    // pagamento de fatura: sai da conta e quita o cartão
    if (r.status === 'transfer') {
      if (opts.target.type === 'account') {
        const paid = cards.find((c) => c.id === r.payCardId);
        if (!paid) continue;
        newTransfers.push({
          ...transferBase(r),
          kind: 'card',
          fromAccountId: accountField,
          toCardId: paid.id,
          invoiceMonth: invoicePaidBy(paid, r.date),
        });
      } else if (card && !r.outflow) {
        // visto da fatura: o crédito "pagamento recebido" saiu de alguma conta — a do cartão, ou a principal
        newTransfers.push({
          ...transferBase(r),
          kind: 'card',
          fromAccountId: card.accountId ?? null,
          toCardId: card.id,
          invoiceMonth: invoicePaidBy(card, r.date),
        });
      }
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
      accountId: cardId ? null : accountField,
      cardId,
      repeat,
      settled,
      notes: '',
      tags: [],
      source: opts.source,
      externalId: r.externalId,
      attachmentIds: [],
      ...(cardId && invoiceMonth ? { invoiceMonth: pinFor(r) } : null),
      ...(r.subscriptionId ? { subscriptionId: r.subscriptionId } : null),
      ...(r.withdrawal ? { withdrawal: true } : null),
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
    // a conta prevista sem conta definida foi paga por esta: é nela que o dinheiro saiu
    toSettle.push({ ...entry, settled, ...(entry.accountId || !accountField ? null : { accountId: accountField }) });
  }

  // parcela reconhecida com centavos de diferença: vale o valor do banco naquela parcela
  const adjusted: Entry[] = [];
  if (cardId) {
    const byEntry = new Map<string, { key: string; amount: Cents }[]>();
    for (const r of rows) {
      if (r.status !== 'imported' || !r.match || r.match.entryId.startsWith('sub:')) continue;
      byEntry.set(r.match.entryId, [...(byEntry.get(r.match.entryId) ?? []), { key: r.match.occurrenceKey, amount: r.amount }]);
    }
    for (const [entryId, marks] of byEntry) {
      const base = repinned.find((e) => e.id === entryId) ?? (await db().entries.get(entryId));
      if (!base || base.deletedAt) continue;
      const settled = { ...base.settled };
      let changed = false;
      for (const m of marks) {
        const current = settled[m.key]?.amount ?? base.amount;
        if (current !== m.amount) {
          settled[m.key] = { at, amount: m.amount };
          changed = true;
        }
      }
      if (changed) adjusted.push({ ...base, settled });
    }
  }
  const adjustedIds = new Set(adjusted.map((e) => e.id));

  const linked: Transfer[] = [];
  for (const [id, externalIds] of linkedTransfers) {
    const t = await db().transfers.get(id);
    if (!t || t.deletedAt) continue;
    const merged = [...new Set([...(t.externalIds ?? []), ...externalIds])];
    if (merged.length !== (t.externalIds ?? []).length) linked.push({ ...t, externalIds: merged });
  }

  await putRecords('entries', [...created, ...toSettle, ...repinned.filter((e) => !adjustedIds.has(e.id)), ...adjusted]);
  await putRecords('transfers', [...newTransfers, ...linked]);

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

  // o saldo do banco: vira saldo inicial (se pedido e se a conta não tem) e ponto de conferência
  let openingSet: ImportResult['openingSet'];
  let reconciliation: Reconciliation | undefined;
  if (opts.target.type === 'account' && targetAccount && opts.balance) {
    const account = await ensureTargetAccount(opts.spaceId, targetAccount);
    let current = account;
    const hasStart = !!current.openingDate || current.openingBalance !== 0 || (current.checkpoints?.length ?? 0) > 0;
    if (opts.useOpening && !hasStart && opts.balance.opening) {
      current = await putRecord('accounts', { ...current, openingBalance: opts.balance.opening.amount, openingDate: opts.balance.opening.date });
      openingSet = { amount: opts.balance.opening.amount, date: opts.balance.opening.date };
    }
    if (opts.balance.closing) {
      const closing = opts.balance.closing;
      const exists = (current.checkpoints ?? []).some((c) => c.date === closing.date && c.amount === closing.amount);
      if (!exists) {
        current = await putRecord('accounts', {
          ...current,
          checkpoints: [...(current.checkpoints ?? []), { date: closing.date, amount: closing.amount, source: opts.fileName || 'extrato importado', at }],
        });
      }
      reconciliation = await reconcile(opts.spaceId, current.id, closing.date, closing.amount, rows);
    }
  }

  await audit(opts.spaceId, 'statement.imported', {
    target: opts.target,
    file: opts.fileName ?? null,
    created: created.length,
    settled: toSettle.length,
    transfers: newTransfers.length,
    linked: linked.length,
    ...(reconciliation ? { declared: reconciliation.declared, computed: reconciliation.computed, diff: reconciliation.diff } : null),
  });
  if (reconciliation) {
    await audit(opts.spaceId, 'statement.reconciled', { account: reconciliation.accountId, date: reconciliation.date, diff: reconciliation.diff });
  }

  return {
    created: created.length,
    settled: toSettle.reduce((n, e) => n + (settleBy.get(e.id)?.length ?? 0), 0),
    transfers: newTransfers.length,
    linked: linked.length,
    lastMonth,
    ...(invoiceMonth ? { invoiceMonth, previousInvoiceMissing } : null),
    ...(reconciliation ? { reconciliation } : null),
    ...(openingSet ? { openingSet } : null),
  };
}

/**
 * A fatura que um pagamento quita: a de vencimento mais perto do dia do
 * pagamento, entre as que já fecharam.
 */
export function invoicePaidBy(card: Card, date: IsoDate): string {
  const open = invoiceMonthOf(card, date);
  let best = addMonthsToKey(open, -1);
  let bestGap = Infinity;
  for (const m of [addMonthsToKey(open, -2), addMonthsToKey(open, -1), open]) {
    const gap = Math.abs(diffDays(dueDateOf(card, m), date));
    if (gap < bestGap) {
      best = m;
      bestGap = gap;
    }
  }
  return best;
}

/** a conta de destino existe como registro (a principal implícita vira de verdade aqui) */
async function ensureTargetAccount(spaceId: string, accountId: string): Promise<Account> {
  const found = await db().accounts.get(accountId);
  if (found && !found.deletedAt) return found;
  return ensurePrimaryAccount(spaceId);
}

/**
 * O saldo do banco contra o do app, e o que explica a diferença.
 *
 * Quando não bate, a resposta vem com os suspeitos: linhas do arquivo que
 * ficaram de fora e movimentos da conta, no mesmo período, que não vieram do
 * arquivo (lançado à mão, importado de outro arquivo, cobrança automática que
 * o banco não fez). A diferença nunca é corrigida sozinha.
 */
export async function reconcile(spaceId: string, accountId: string, date: IsoDate, declared: Cents, rows: ReviewRow[]): Promise<Reconciliation> {
  const ledger: LedgerInput = await loadLedger(spaceId, todayIso() > date ? todayIso() : date);
  const audit = auditAccount(ledger, accountId, date);
  const computed = audit.balance;

  const first = rows[0]?.date ?? date;
  const fileIds = new Set(rows.map((r) => r.externalId));
  const entryIds = new Set(
    ledger.entries.filter((e) => e.externalId && fileIds.has(e.externalId)).map((e) => e.id),
  );
  const matchedEntries = new Set(rows.filter((r) => r.match).map((r) => r.match!.entryId));
  const transferIds = new Set(ledger.transfers.filter((t) => (t.externalIds ?? []).some((x) => fileIds.has(x))).map((t) => t.id));

  const extra = audit.lines
    .filter((l) => l.date >= first && l.date <= date)
    .filter((l) => !entryIds.has(l.refId) && !matchedEntries.has(l.refId) && !transferIds.has(l.refId))
    .map((l) => ({ description: l.label, date: l.date, signed: l.amount }));

  const left = rows
    .filter((r) => !r.include && r.status !== 'imported')
    .map((r) => ({ description: r.description, date: r.date, signed: r.outflow ? -r.amount : r.amount }));

  return { accountId, declared, date, computed, diff: declared - computed, left, extra };
}

export type { Debt, Settings };
