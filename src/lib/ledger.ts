import { cardBalance, dueDateOf, invoiceLinesByMonth, invoiceMonthOf, paymentInvoiceMonth, realizedCharges, realizedKey, subscriptionCharge } from './cards';
import { addDaysIso, addMonthsToKey, monthKeyOf } from './dates';
import { debtInstallmentIn } from './debts';
import { OPENING_TAG, occurrencesOf, type Occurrence } from './occurrences';
import type { Account, Card, Cents, Debt, Entry, FlowKind, IsoDate, MonthKey, Subscription, Transfer } from './types';

/**
 * O livro-caixa: de onde sai todo saldo do app.
 *
 * Início, Contas, Cartões, Patrimônio e o assistente perguntam aqui — e só
 * aqui. Não existe outra conta de "quanto eu tenho". Se duas telas mostram
 * números diferentes para a mesma pergunta, o defeito está neste arquivo, e
 * é aqui que se conserta.
 *
 * O modelo é o de um extrato:
 *
 *   saldo da conta num dia =
 *       saldo inicial (no começo de `openingDate`)
 *     + tudo que se REALIZOU na conta de `openingDate` até aquele dia
 *
 * "Realizou" quer dizer: lançamento baixado (pago/recebido), transferência,
 * ajuste de saldo, cobrança automática de assinatura e parcela de dívida que
 * já venceram, e fatura de cartão paga. O previsto não entra no saldo — entra
 * na projeção. Receita futura não é dinheiro de hoje, e conta vencida que
 * ninguém pagou continua na conta até ser paga.
 *
 * Tudo aqui é puro: recebe os registros e o dia de hoje, devolve números.
 */

/* ------------------------------------------------------------------ tipos */

export interface LedgerInput {
  accounts: Account[];
  entries: Entry[];
  transfers: Transfer[];
  cards: Card[];
  subscriptions: Subscription[];
  debts: Debt[];
  /** com cartões desligados, a compra no cartão volta a ser gasto da conta */
  cardsEnabled: boolean;
  today: IsoDate;
}

export type PostingSource = 'entry' | 'subscription' | 'debt' | 'invoice' | 'transfer' | 'card-payment' | 'adjustment';

/** um movimento que já aconteceu numa conta */
export interface Posting {
  /** estável entre cálculos */
  id: string;
  accountId: string;
  date: IsoDate;
  /** com sinal: positivo entra na conta, negativo sai */
  amount: Cents;
  source: PostingSource;
  label: string;
  /** o registro que gerou o movimento */
  refId: string;
  occurrenceKey?: string;
  /**
   * Muda o saldo mas não é receita nem despesa: transferência entre contas
   * suas e ajuste de saldo. Fica fora de toda soma de entradas e saídas.
   */
  internal: boolean;
  kind?: FlowKind;
  categoryId?: string | null;
  /** quando o movimento passou a existir no app: a baixa, ou a criação da transferência */
  recordedAt?: string;
}

/** a conta que existe quando a pessoa ainda não cadastrou nenhuma */
export const FALLBACK_ACCOUNT_ID = 'conta-principal';

/* ----------------------------------------------------------------- contas */

/** as contas que carregam dinheiro; sem nenhuma cadastrada, a principal implícita */
export function ledgerAccounts(accounts: Account[]): Account[] {
  const live = accounts.filter((a) => !a.deletedAt);
  if (live.length) return live;
  return [
    {
      id: FALLBACK_ACCOUNT_ID,
      spaceId: '',
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      name: 'Conta principal',
      kind: 'checking',
      institution: '',
      color: '',
      openingBalance: 0,
      openingDate: null,
      primary: true,
      archived: false,
    },
  ];
}

/** a conta principal: a marcada, senão a mais antiga */
export function primaryAccountId(accounts: Account[]): string {
  const live = ledgerAccounts(accounts);
  const marked = live.find((a) => a.primary && !a.archived) ?? live.find((a) => a.primary);
  if (marked) return marked.id;
  return live.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))[0].id;
}

/**
 * Para qual conta um movimento vai. Lançamento sem conta, ou com uma conta
 * que foi excluída, cai na principal — dinheiro não pode sumir porque a conta
 * dele sumiu. O diagnóstico aponta esses casos.
 */
function resolver(input: Pick<LedgerInput, 'accounts'>) {
  const live = new Set(ledgerAccounts(input.accounts).map((a) => a.id));
  const primary = primaryAccountId(input.accounts);
  return (id: string | null | undefined) => (id && live.has(id) ? id : primary);
}

/**
 * O lançamento passa pelo cartão? Com cartões ligados, toda compra com cartão
 * passa — inclusive a de um cartão excluído, que fica fora da conta (e o
 * diagnóstico aponta), em vez de virar uma "conta vencida" que ninguém deve.
 */
function cardRouter(input: Pick<LedgerInput, 'cardsEnabled'>) {
  return (e: Pick<Entry, 'cardId'>) => input.cardsEnabled && !!e.cardId;
}

/**
 * A ocorrência já aconteceu? Baixada, sim. Com cartões desligados, a compra
 * no cartão vira gasto da conta e acontece no dia da compra — ninguém dá
 * baixa em compra de cartão.
 */
function realizedOccurrence(input: Pick<LedgerInput, 'cardsEnabled' | 'today'>, entry: Entry, o: Occurrence): boolean {
  if (o.settlement) return true;
  return !input.cardsEnabled && !!entry.cardId && o.date <= input.today;
}

/* ------------------------------------------------------------ ocorrências */

/**
 * Todas as ocorrências de um lançamento até uma data.
 *
 * O avulso — que é quase tudo, e todo extrato importado — sai direto, sem
 * varrer meses: um ano de extrato são milhares de linhas avulsas.
 */
function occurrencesUntil(entry: Entry, until: IsoDate, today: IsoDate): Occurrence[] {
  if (entry.deletedAt || entry.date > until) return [];
  const start = monthKeyOf(entry.date);
  if (entry.repeat.kind === 'once') return occurrencesOf(entry, start, today);
  const out: Occurrence[] = [];
  const last = monthKeyOf(until);
  for (let m = start; m <= last; m = addMonthsToKey(m, 1)) {
    for (const o of occurrencesOf(entry, m, today)) if (o.date <= until) out.push(o);
    if (entry.repeat.kind === 'installments' && out.length >= (entry.repeat.count ?? 1)) break;
  }
  return out;
}

/** sinal de uma ocorrência na conta: entrada soma; saída e aporte tiram; resgate devolve */
export function signedOnAccount(o: Pick<Occurrence, 'kind' | 'amount' | 'withdrawal'>): Cents {
  if (o.kind === 'in') return o.amount;
  if (o.kind === 'invest' && o.withdrawal) return o.amount;
  return -o.amount;
}

/* --------------------------------------------------------------- postagens */

/**
 * Tudo o que já aconteceu nas contas até `until`, inclusive.
 *
 * Cada fonte entra uma vez só:
 *  - lançamento pela conta: quando baixado, no dia da ocorrência;
 *  - compra no cartão: NÃO entra aqui — entra a fatura, quando é paga;
 *  - assinatura e parcela de dívida pela conta: no dia da cobrança, a não ser
 *    que o extrato já tenha trazido a cobrança real daquele mês (aí entra só
 *    o lançamento real);
 *  - fatura: o pagamento registrado; sem registro, a fatura vencida é tida
 *    como paga inteira no vencimento;
 *  - transferência: sai de uma conta e entra na outra, no mesmo dia.
 */
export function realizedPostings(input: LedgerInput, until: IsoDate): Posting[] {
  /**
   * O mesmo retrato pede as mesmas postagens várias vezes (saldo de hoje,
   * saldo da véspera do mês, a lista do mês). Guardadas por entrada e data,
   * saem uma vez só. A entrada é tratada como imutável — toda mudança na base
   * produz uma entrada nova, e o cache dela vai embora junto.
   */
  let byDate = POSTINGS_CACHE.get(input);
  if (!byDate) {
    byDate = new Map();
    POSTINGS_CACHE.set(input, byDate);
  }
  const hit = byDate.get(until);
  if (hit) return hit;
  const computed = computeRealizedPostings(input, until);
  byDate.set(until, computed);
  return computed;
}

const POSTINGS_CACHE = new WeakMap<LedgerInput, Map<IsoDate, Posting[]>>();

function computeRealizedPostings(input: LedgerInput, until: IsoDate): Posting[] {
  const out: Posting[] = [];
  const accountOf = resolver(input);
  const onCard = cardRouter(input);
  const realized = realizedCharges(input.entries);

  for (const entry of input.entries) {
    if (entry.deletedAt || onCard(entry) || entry.tags.includes(OPENING_TAG)) continue;
    for (const o of occurrencesUntil(entry, until, input.today)) {
      if (!realizedOccurrence(input, entry, o)) continue;
      out.push({
        id: `e:${entry.id}:${o.key}`,
        accountId: accountOf(entry.accountId),
        date: o.date,
        amount: signedOnAccount(o),
        source: 'entry',
        label: entry.description,
        refId: entry.id,
        occurrenceKey: o.key,
        internal: false,
        kind: entry.kind,
        categoryId: entry.categoryId,
        recordedAt: o.settlement?.at ?? entry.createdAt,
      });
    }
  }

  const lastMonth = monthKeyOf(until);

  for (const sub of input.subscriptions) {
    if (sub.deletedAt || (sub.cardId && onCard({ cardId: sub.cardId }))) continue;
    for (let m = monthKeyOf(sub.startedAt); m <= lastMonth; m = addMonthsToKey(m, 1)) {
      const charge = subscriptionCharge(sub, m);
      if (!charge || charge.date > until || realized.has(realizedKey(sub.id, m))) continue;
      out.push({
        id: `s:${sub.id}:${m}`,
        accountId: accountOf(sub.accountId),
        date: charge.date,
        amount: -charge.amount,
        source: 'subscription',
        label: sub.name,
        refId: sub.id,
        occurrenceKey: m,
        internal: false,
        kind: 'out',
        categoryId: sub.categoryId,
      });
    }
  }

  for (const debt of input.debts) {
    if (debt.deletedAt || !debt.inFlow) continue;
    for (let m = debt.startMonth; m <= lastMonth; m = addMonthsToKey(m, 1)) {
      const inst = debtInstallmentIn(debt, m);
      if (!inst || inst.date > until || realized.has(realizedKey(debt.id, m))) continue;
      out.push({
        id: `d:${debt.id}:${m}`,
        accountId: accountOf(null),
        date: inst.date,
        amount: -debt.installment,
        source: 'debt',
        label: debt.name,
        refId: debt.id,
        occurrenceKey: m,
        internal: false,
        kind: 'out',
        categoryId: null,
      });
    }
  }

  if (input.cardsEnabled) {
    for (const card of input.cards) {
      if (card.deletedAt) continue;
      const bal = cardBalance(card, input.entries, input.subscriptions, input.transfers, until, input.today);
      for (const auto of bal.autoPaid) {
        out.push({
          id: `f:${card.id}:${auto.month}`,
          accountId: accountOf(card.accountId),
          date: auto.dueOn,
          amount: -auto.amount,
          source: 'invoice',
          label: `Fatura ${card.name || card.institution}`,
          refId: card.id,
          occurrenceKey: auto.month,
          internal: false,
          kind: 'out',
        });
      }
    }
  }

  for (const t of input.transfers) {
    if (t.deletedAt || t.date > until) continue;
    out.push(...transferPostings(t, accountOf));
  }

  return out.sort(byDate);
}

/** os dois lados (ou o único lado) de uma transferência */
export function transferPostings(t: Transfer, accountOf: (id: string | null | undefined) => string): Posting[] {
  const base = { date: t.date, refId: t.id, label: t.description, recordedAt: t.createdAt };
  if (t.kind === 'adjustment') {
    return [
      {
        ...base,
        id: `t:${t.id}`,
        accountId: accountOf(t.fromAccountId),
        amount: t.direction === 'in' ? t.amount : -t.amount,
        source: 'adjustment',
        internal: true,
      },
    ];
  }
  if (t.kind === 'card') {
    return [
      {
        ...base,
        id: `t:${t.id}`,
        accountId: accountOf(t.fromAccountId),
        amount: -t.amount,
        source: 'card-payment',
        internal: false,
        kind: 'out',
      },
    ];
  }
  return [
    { ...base, id: `t:${t.id}:de`, accountId: accountOf(t.fromAccountId), amount: -t.amount, source: 'transfer', internal: true },
    { ...base, id: `t:${t.id}:para`, accountId: accountOf(t.toAccountId), amount: t.amount, source: 'transfer', internal: true },
  ];
}

const byDate = (a: Posting, b: Posting) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);

/* ------------------------------------------------------------------ saldos */

export interface AccountBalance {
  account: Account;
  /** o saldo inicial e a data a que ele se refere */
  opening: Cents;
  openingDate: IsoDate | null;
  inflow: Cents;
  outflow: Cents;
  /** transferências e ajustes, com sinal */
  internal: Cents;
  balance: Cents;
}

/** a regra do saldo inicial: o que veio antes dele já está dentro dele */
const countsFor = (account: Account) => (p: Posting) => !account.openingDate || p.date >= account.openingDate;

/** o saldo de cada conta no FIM de `date`, e o total */
export function balancesAt(input: LedgerInput, date: IsoDate, postings = realizedPostings(input, date)) {
  const accounts = ledgerAccounts(input.accounts);
  const rows: AccountBalance[] = accounts.map((account) => ({
    account,
    // o saldo inicial é o do COMEÇO de openingDate, que é o do fim da véspera:
    // perguntar "quanto havia no fim de 31/08" tem que responder o saldo de 01/09
    opening: account.openingDate && addDaysIso(account.openingDate, -1) > date ? 0 : account.openingBalance,
    openingDate: account.openingDate ?? null,
    inflow: 0,
    outflow: 0,
    internal: 0,
    balance: 0,
  }));
  const byId = new Map(rows.map((r) => [r.account.id, r]));

  for (const p of postings) {
    if (p.date > date) continue;
    const row = byId.get(p.accountId);
    if (!row || !countsFor(row.account)(p)) continue;
    if (p.internal) row.internal += p.amount;
    else if (p.amount >= 0) row.inflow += p.amount;
    else row.outflow += -p.amount;
  }
  for (const r of rows) r.balance = r.opening + r.inflow - r.outflow + r.internal;

  return { accounts: rows, total: rows.reduce((s, r) => s + r.balance, 0) };
}

/** o dinheiro em conta hoje, somando todas */
export function cashNow(input: LedgerInput): Cents {
  return balancesAt(input, input.today).total;
}

/* ----------------------------------------------------------------- cartões */

/** o que cada cartão deve hoje, pela mesma régua do limite */
export function cardDebts(input: LedgerInput, date: IsoDate = input.today) {
  if (!input.cardsEnabled) return [];
  return input.cards
    .filter((c) => !c.deletedAt)
    .map((card) => ({ card, ...cardBalance(card, input.entries, input.subscriptions, input.transfers, date, input.today) }));
}

/** situação de uma fatura: total, pago, o que falta, e se foi tida como paga no vencimento */
export function invoiceStatus(input: LedgerInput, card: Card, month: MonthKey) {
  const lines = invoiceLinesByMonth(card, input.entries, input.subscriptions, month, month, input.today).get(month) ?? [];
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const dueOn = dueDateOf(card, month);
  const explicit = input.transfers.filter(
    (t) => !t.deletedAt && t.kind === 'card' && t.toCardId === card.id && (t.invoiceMonth ?? paymentInvoiceMonth(card, t.date)) === month,
  );
  const paidExplicit = explicit.reduce((s, t) => s + t.amount, 0);
  const autoPaid = !explicit.length && dueOn <= input.today && total > 0;
  const paid = autoPaid ? total : paidExplicit;
  return { month, dueOn, total, paid, remaining: Math.max(0, total - paid), autoPaid, payments: explicit };
}

/* -------------------------------------------------------------- conferência */

export interface CheckpointResult {
  date: IsoDate;
  declared: Cents;
  computed: Cents;
  /** declarado menos calculado: positivo = o banco tem mais que o app */
  diff: Cents;
  source: string;
}

export interface AccountAudit {
  account: Account;
  opening: Cents;
  openingDate: IsoDate | null;
  /** cada movimento, com o saldo depois dele */
  lines: (Posting & { running: Cents })[];
  /** movimentos anteriores ao saldo inicial: já estão dentro dele, não somam */
  beforeOpening: Posting[];
  balance: Cents;
  checkpoints: CheckpointResult[];
  ok: boolean;
}

/**
 * A conta, linha por linha: saldo inicial, cada movimento com o saldo depois
 * dele, e cada saldo que o banco declarou comparado com o calculado.
 *
 * É o "de onde veio este número": qualquer saldo do app pode ser refeito à mão
 * a partir desta lista, e a primeira data em que o banco e o app discordam
 * diz onde procurar.
 */
export function auditAccount(input: LedgerInput, accountId: string, until: IsoDate = input.today): AccountAudit {
  const account = ledgerAccounts(input.accounts).find((a) => a.id === accountId);
  if (!account) throw new Error(`Conta ${accountId} não existe.`);

  const all = realizedPostings(input, until).filter((p) => p.accountId === accountId);
  const counts = countsFor(account);
  const beforeOpening = all.filter((p) => !counts(p));
  const lines: AccountAudit['lines'] = [];
  let running = account.openingBalance;
  for (const p of all) {
    if (!counts(p)) continue;
    running += p.amount;
    lines.push({ ...p, running });
  }

  /**
   * O saldo no fim de um dia — ou, com `cut`, no instante em que foi informado:
   * do mesmo dia, só entra o que já existia no app naquela hora.
   */
  const balanceOn = (date: IsoDate, cut?: string) => {
    if (account.openingDate && date < account.openingDate) return null;
    let b = account.openingBalance;
    for (const l of lines) {
      if (l.date > date) continue;
      if (cut && l.date === date && l.recordedAt && l.recordedAt > cut) continue;
      b += l.amount;
    }
    return b;
  };

  const checkpoints: CheckpointResult[] = (account.checkpoints ?? [])
    .filter((c) => c.date <= until)
    .map((c) => {
      const computed = balanceOn(c.date, c.moment ? c.at : undefined) ?? c.amount;
      return { date: c.date, declared: c.amount, computed, diff: c.amount - computed, source: c.source };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    account,
    opening: account.openingBalance,
    openingDate: account.openingDate ?? null,
    lines,
    beforeOpening,
    balance: running,
    checkpoints,
    ok: checkpoints.every((c) => c.diff === 0),
  };
}

/* --------------------------------------------------------------- previsto */

export type PlannedSource = 'entry' | 'subscription' | 'debt' | 'invoice' | 'transfer';

/** o que ainda vai acontecer (ou devia ter acontecido e não aconteceu) */
export interface PlannedItem {
  id: string;
  accountId: string;
  /** a data prevista; nos vencidos, a data original */
  date: IsoDate;
  amount: Cents;
  source: PlannedSource;
  label: string;
  refId: string;
  occurrenceKey?: string;
  kind: FlowKind;
  categoryId: string | null;
  /** passou da data e não foi baixado */
  overdue: boolean;
  internal: boolean;
  cardId?: string;
  installment?: { index: number; total: number } | null;
}

/**
 * O que está previsto até `to` e ainda não se realizou.
 *
 * Lançamento vencido e não baixado aparece aqui marcado como vencido: não saiu
 * da conta (senão estaria baixado), mas ainda vai sair.
 */
export function plannedItems(input: LedgerInput, to: IsoDate, from: IsoDate = monthStartOf(input.today)): PlannedItem[] {
  const { today } = input;
  const out: PlannedItem[] = [];
  const accountOf = resolver(input);
  const onCard = cardRouter(input);
  const realized = realizedCharges(input.entries);
  const lastMonth = monthKeyOf(to);
  // assinatura e dívida só têm previsto do dia de hoje em diante
  const firstMonth = from > today ? monthKeyOf(from) : monthKeyOf(today);

  for (const entry of input.entries) {
    if (entry.deletedAt || onCard(entry) || entry.tags.includes(OPENING_TAG)) continue;
    for (const o of occurrencesUntil(entry, to, today)) {
      if (realizedOccurrence(input, entry, o) || o.date < from) continue;
      out.push({
        id: `e:${entry.id}:${o.key}`,
        accountId: accountOf(entry.accountId),
        date: o.date,
        amount: Math.abs(signedOnAccount(o)),
        source: 'entry',
        label: entry.description,
        refId: entry.id,
        occurrenceKey: o.key,
        kind: signedOnAccount(o) >= 0 ? 'in' : entry.kind === 'invest' ? 'invest' : 'out',
        categoryId: entry.categoryId,
        overdue: o.date <= today,
        internal: false,
        installment: o.installment,
      });
    }
  }

  for (const sub of input.subscriptions) {
    if (sub.deletedAt || (sub.cardId && onCard({ cardId: sub.cardId }))) continue;
    for (let m = firstMonth; m <= lastMonth; m = addMonthsToKey(m, 1)) {
      const charge = subscriptionCharge(sub, m);
      if (!charge || charge.date <= today || charge.date > to || realized.has(realizedKey(sub.id, m))) continue;
      out.push({
        id: `s:${sub.id}:${m}`,
        accountId: accountOf(sub.accountId),
        date: charge.date,
        amount: charge.amount,
        source: 'subscription',
        label: sub.name,
        refId: sub.id,
        occurrenceKey: m,
        kind: 'out',
        categoryId: sub.categoryId,
        overdue: false,
        internal: false,
      });
    }
  }

  for (const debt of input.debts) {
    if (debt.deletedAt || !debt.inFlow) continue;
    for (let m = firstMonth; m <= lastMonth; m = addMonthsToKey(m, 1)) {
      const inst = debtInstallmentIn(debt, m);
      if (!inst || inst.date <= today || inst.date > to || realized.has(realizedKey(debt.id, m))) continue;
      out.push({
        id: `d:${debt.id}:${m}`,
        accountId: accountOf(null),
        date: inst.date,
        amount: debt.installment,
        source: 'debt',
        label: debt.name,
        refId: debt.id,
        occurrenceKey: m,
        kind: 'out',
        categoryId: null,
        overdue: false,
        internal: false,
        installment: { index: inst.index, total: inst.total },
      });
    }
  }

  if (input.cardsEnabled) {
    for (const card of input.cards) {
      if (card.deletedAt) continue;
      // a fatura que vence no intervalo pode ser do mês anterior; as dois
      // meses para trás pegam a vencida que foi paga só em parte
      for (let m = addMonthsToKey(firstMonth, -2); m <= lastMonth; m = addMonthsToKey(m, 1)) {
        const st = invoiceStatus(input, card, m);
        // vencida sem pagamento registrado é tida como paga (remaining = 0);
        // com pagamento parcial registrado, o resto continua devido
        if (st.remaining <= 0 || st.dueOn > to) continue;
        if (st.dueOn > today && st.dueOn < from) continue;
        out.push({
          id: `f:${card.id}:${m}`,
          accountId: accountOf(card.accountId),
          date: st.dueOn,
          amount: st.remaining,
          source: 'invoice',
          label: `Fatura ${card.name || card.institution}`,
          refId: card.id,
          occurrenceKey: m,
          kind: 'out',
          categoryId: null,
          overdue: st.dueOn <= today,
          internal: false,
          cardId: card.id,
        });
      }
    }
  }

  // transferência agendada: muda a conta, não o total
  for (const t of input.transfers) {
    if (t.deletedAt || t.date <= today || t.date > to || t.date < from) continue;
    for (const p of transferPostings(t, accountOf)) {
      out.push({
        id: `${p.id}:prev`,
        accountId: p.accountId,
        date: p.date,
        amount: Math.abs(p.amount),
        source: 'transfer',
        label: p.label,
        refId: t.id,
        kind: p.amount >= 0 ? 'in' : 'out',
        categoryId: null,
        overdue: false,
        internal: p.internal,
      });
    }
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

export function monthStartOf(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

/** o saldo que se espera ter no fim de `date`: o de hoje mais o previsto até lá */
export function projectedBalance(input: LedgerInput, date: IsoDate): Cents {
  const now = cashNow(input);
  if (date <= input.today) return balancesAt(input, date).total;
  const planned = plannedItems(input, date, '0000-01-01');
  return planned.reduce((s, p) => s + (p.kind === 'in' ? p.amount : -p.amount), now);
}

/** amanhã: onde o vencido e não pago pesa na curva do saldo */
export const pendingDay = (today: IsoDate) => addDaysIso(today, 1);

export { invoiceMonthOf };
