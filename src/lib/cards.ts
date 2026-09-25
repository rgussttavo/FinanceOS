import {
  addMonthsToKey,
  clampDayToMonth,
  dateInMonth,
  isoToParts,
  monthKeyOf,
  monthKeyParts,
  partsToIso,
} from './dates';
import { occurrencesOf, plannedAmount, type Occurrence } from './occurrences';
import type { Card, Cents, Entry, IsoDate, MonthKey, Subscription, Transfer } from './types';

/* ------------------------------------------------------------------ bancos */

export interface BankInfo {
  key: string;
  name: string;
  domain: string;
  /** cor da marca, usada quando o cartão não tem acabamento escolhido */
  brandColor?: string;
}

/**
 * Bancos e fintechs que aparecem na hora de cadastrar um cartão.
 * O domínio serve para buscar o logotipo; o resto é só rótulo.
 */
export const BANKS: BankInfo[] = [
  { key: 'nubank', name: 'Nubank', domain: 'nubank.com.br', brandColor: '#8a05be' },
  { key: 'inter', name: 'Inter', domain: 'inter.co', brandColor: '#ff7a00' },
  { key: 'itau', name: 'Itaú', domain: 'itau.com.br', brandColor: '#ec7000' },
  { key: 'bradesco', name: 'Bradesco', domain: 'bradesco.com.br', brandColor: '#cc092f' },
  { key: 'santander', name: 'Santander', domain: 'santander.com.br', brandColor: '#ec0000' },
  { key: 'caixa', name: 'Caixa', domain: 'caixa.gov.br', brandColor: '#0070af' },
  { key: 'bb', name: 'Banco do Brasil', domain: 'bb.com.br', brandColor: '#0037a1' },
  { key: 'c6', name: 'C6 Bank', domain: 'c6bank.com', brandColor: '#2b2b2b' },
  { key: 'original', name: 'Original', domain: 'original.com.br', brandColor: '#00a868' },
  { key: 'picpay', name: 'PicPay', domain: 'picpay.com', brandColor: '#21c25e' },
  { key: 'btg', name: 'BTG Pactual', domain: 'btgpactual.com', brandColor: '#0a3b6b' },
  { key: 'xp', name: 'XP', domain: 'xpi.com.br', brandColor: '#1c1c1c' },
  { key: 'neon', name: 'Neon', domain: 'neon.com.br', brandColor: '#00d4d4' },
  { key: 'will', name: 'Will Bank', domain: 'willbank.com.br', brandColor: '#f5c400' },
  { key: 'mercadopago', name: 'Mercado Pago', domain: 'mercadopago.com.br', brandColor: '#00a5e0' },
  { key: 'pan', name: 'Banco Pan', domain: 'bancopan.com.br' },
  { key: 'bmg', name: 'Banco BMG', domain: 'bancobmg.com.br' },
  { key: 'safra', name: 'Safra', domain: 'safra.com.br' },
  { key: 'sicoob', name: 'Sicoob', domain: 'sicoob.com.br' },
  { key: 'sicredi', name: 'Sicredi', domain: 'sicredi.com.br' },
  { key: 'banrisul', name: 'Banrisul', domain: 'banrisul.com.br' },
  { key: 'brb', name: 'BRB', domain: 'brb.com.br' },
  { key: 'bv', name: 'Banco BV', domain: 'bv.com.br' },
  { key: 'agibank', name: 'Agibank', domain: 'agibank.com.br' },
  { key: 'digio', name: 'digio', domain: 'digio.com.br' },
  { key: 'pagbank', name: 'PagBank', domain: 'pagbank.com.br' },
  { key: 'stone', name: 'Stone', domain: 'stone.com.br' },
  { key: 'cora', name: 'Cora', domain: 'cora.com.br' },
  { key: 'meliuz', name: 'Méliuz', domain: 'meliuz.com.br' },
  { key: 'sofisa', name: 'Sofisa', domain: 'sofisadireto.com.br' },
  { key: 'rico', name: 'Rico', domain: 'rico.com.br' },
  { key: 'clear', name: 'Clear', domain: 'clear.com.br' },
  { key: 'unicred', name: 'Unicred', domain: 'unicred.com.br' },
];

const norm = (s: string) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** acha o banco pelo que a pessoa digitou, aceitando começo de palavra */
export function matchBank(text: string): BankInfo | null {
  const n = norm(text);
  if (!n) return null;
  return (
    BANKS.find((b) => norm(b.name) === n || b.key === n) ??
    BANKS.find((b) => norm(b.name).startsWith(n) || n.startsWith(norm(b.name))) ??
    null
  );
}

export const bankByKey = (key: string): BankInfo | null =>
  BANKS.find((b) => b.key === key) ?? null;

/**
 * O banco citado numa descrição de extrato: "PAGAMENTO FATURA NUBANK" é o
 * Nubank. Procura palavra inteira, para "Inter" não casar com "internet".
 */
export function bankInText(text: string): BankInfo | null {
  const words = ` ${norm(text).replace(/[^a-z0-9]+/g, ' ')} `;
  return (
    BANKS.find((b) => {
      const name = norm(b.name).replace(/[^a-z0-9]+/g, ' ').trim();
      return words.includes(` ${name} `) || words.includes(` ${b.key} `);
    }) ?? null
  );
}

/** o cartão cadastrado que corresponde a um banco, pelo nome ou pela instituição */
export function cardOfBank<T extends Pick<Card, 'name' | 'institution'>>(cards: T[], bank: BankInfo | null): T | null {
  if (!bank) return null;
  return cards.find((c) => matchBank(c.institution)?.key === bank.key || matchBank(c.name)?.key === bank.key) ?? null;
}

/* ------------------------------------------------------------- acabamentos */

export interface Finish {
  key: string;
  label: string;
  /** o degradê do plástico */
  gradient: string;
  /** o texto sobre o cartão é claro ou escuro? */
  ink: 'light' | 'dark';
}

/**
 * Os acabamentos do plástico. São doze mais o automático, que deduz o visual
 * pelo banco e pela linha do cartão — quem cadastra um "Nubank Ultravioleta"
 * não deveria precisar escolher a cor à mão.
 */
export const FINISHES: Finish[] = [
  { key: 'grafite', label: 'Grafite', gradient: 'linear-gradient(140deg,#3a3b42,#16171b)', ink: 'light' },
  { key: 'preto', label: 'Black', gradient: 'linear-gradient(140deg,#2c2c31,#0a0a0c)', ink: 'light' },
  { key: 'prata', label: 'Prata', gradient: 'linear-gradient(140deg,#d3d7dd,#9aa0a8)', ink: 'dark' },
  { key: 'ouro', label: 'Ouro', gradient: 'linear-gradient(140deg,#e9cd82,#b8923f)', ink: 'dark' },
  { key: 'roxo', label: 'Roxo', gradient: 'linear-gradient(140deg,#8a15d6,#4a0a75)', ink: 'light' },
  { key: 'azul', label: 'Azul', gradient: 'linear-gradient(140deg,#2f63bd,#12315e)', ink: 'light' },
  { key: 'vermelho', label: 'Vermelho', gradient: 'linear-gradient(140deg,#d13a4a,#7a1526)', ink: 'light' },
  { key: 'amarelo', label: 'Amarelo', gradient: 'linear-gradient(140deg,#f5c400,#c07d00)', ink: 'dark' },
  { key: 'verde', label: 'Verde', gradient: 'linear-gradient(140deg,#12a45a,#0a5e34)', ink: 'light' },
  { key: 'rose', label: 'Rosé', gradient: 'linear-gradient(140deg,#e0578f,#a52d60)', ink: 'light' },
  { key: 'laranja', label: 'Laranja', gradient: 'linear-gradient(140deg,#ff7a1a,#c25000)', ink: 'light' },
  { key: 'ciano', label: 'Ciano', gradient: 'linear-gradient(140deg,#00c4c4,#00807f)', ink: 'dark' },
];

export const finishByKey = (key: string): Finish | null =>
  FINISHES.find((f) => f.key === key) ?? null;

const NEUTRAL: Finish = {
  key: 'auto',
  label: 'Automático',
  gradient: 'linear-gradient(140deg,#34353b,#161719)',
  ink: 'light',
};

/**
 * Como o cartão se parece.
 *
 * Escolha explícita ganha de tudo. Sem escolha, a linha do cartão decide —
 * "Black" é preto, "Gold" é dourado, "Platinum" é prata —, e o banco entra
 * como último critério.
 */
export function cardLook(card: Pick<Card, 'color' | 'name' | 'institution'>): Finish {
  const explicit = finishByKey(card.color);
  if (explicit) return explicit;

  const tier = norm(card.name);
  if (/black|infinite|infinit|noir|nanquim/.test(tier)) return finishByKey('preto') ?? NEUTRAL;
  if (/gold|ouro/.test(tier)) return finishByKey('ouro') ?? NEUTRAL;
  if (/platin|signature|world/.test(tier)) return finishByKey('prata') ?? NEUTRAL;
  if (/ultravioleta|roxo|purple/.test(tier)) return finishByKey('roxo') ?? NEUTRAL;
  if (/blue|azul/.test(tier)) return finishByKey('azul') ?? NEUTRAL;

  const bank = matchBank(card.institution);
  if (bank?.key === 'nubank') return finishByKey('roxo') ?? NEUTRAL;
  if (bank?.key === 'inter') return finishByKey('laranja') ?? NEUTRAL;
  if (bank?.key === 'neon') return finishByKey('ciano') ?? NEUTRAL;

  return NEUTRAL;
}

/* --------------------------------------------------------------- bandeiras */

export const BRANDS: { key: Card['brand']; label: string }[] = [
  { key: 'visa', label: 'Visa' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'elo', label: 'Elo' },
  { key: 'amex', label: 'American Express' },
  { key: 'hipercard', label: 'Hipercard' },
  { key: 'other', label: 'Outra' },
];

/* ------------------------------------------------------------ ciclo da fatura */

/**
 * Em qual fatura cai uma compra.
 *
 * O cartão fecha no dia `closingDay`: o que é comprado até ele entra na fatura
 * do próprio mês; o que vem depois já é da seguinte. É a regra que faz o
 * "comprei dia 28, só pago no mês que vem" bater com o extrato do banco.
 *
 * O CentavOS guarda os dias de fechamento e vencimento no cadastro mas nunca
 * os usa — lá toda compra cai na fatura do mês em que foi feita. Aqui a conta
 * é a de verdade.
 */
/** a fatura da primeira parcela: a do arquivo importado, se houver; senão, a do ciclo */
export function firstInvoiceOf(card: Pick<Card, 'closingDay'>, entry: Pick<Entry, 'date' | 'invoiceMonth'>): MonthKey {
  return entry.invoiceMonth || invoiceMonthOf(card, entry.date);
}

export function invoiceMonthOf(card: Pick<Card, 'closingDay'>, purchase: IsoDate): MonthKey {
  const month = monthKeyOf(purchase);
  const closing = Math.trunc(card.closingDay) || 0;
  if (closing <= 0) return month;
  const { d } = isoToParts(purchase);
  return d > closing ? addMonthsToKey(month, 1) : month;
}

/** a data em que a fatura daquela competência fecha */
export function closingDateOf(card: Pick<Card, 'closingDay'>, invoiceMonth: MonthKey): IsoDate {
  return dateInMonth(invoiceMonth, card.closingDay || 1);
}

/**
 * A data de vencimento da fatura.
 *
 * Vencimento depois do fechamento cai no mesmo mês; antes, no mês seguinte —
 * fecha dia 28 e vence dia 5 quer dizer dia 5 do mês que vem.
 */
export function dueDateOf(card: Pick<Card, 'closingDay' | 'dueDay'>, invoiceMonth: MonthKey): IsoDate {
  const closing = Math.trunc(card.closingDay) || 0;
  const due = Math.trunc(card.dueDay) || 1;
  const month = due > closing ? invoiceMonth : addMonthsToKey(invoiceMonth, 1);
  const { y, m } = monthKeyParts(month);
  return partsToIso(y, m, clampDayToMonth(due, y, m));
}

/* ------------------------------------------------------------------ fatura */

export interface InvoiceLine {
  id: string;
  description: string;
  amount: Cents;
  /** data da compra, não a do vencimento */
  date: IsoDate;
  categoryId: string | null;
  installment: { index: number; total: number } | null;
  /** a linha veio de uma assinatura, não de uma compra avulsa */
  subscription: boolean;
}

export interface Invoice {
  cardId: string;
  month: MonthKey;
  closesOn: IsoDate;
  dueOn: IsoDate;
  total: Cents;
  lines: InvoiceLine[];
  /** a fatura já fechou? */
  closed: boolean;
}

/**
 * A cobrança de uma assinatura num mês: o dia e o valor, ou nada.
 *
 * É a regra única — lista de despesas, fatura, caixa e patrimônio perguntam
 * aqui. Antes cada um tinha a sua: a fatura cobrava no mês do cancelamento
 * mesmo depois de cancelada e cobrava no mês de início mesmo antes do
 * primeiro dia, enquanto a lista de despesas não — e o cartão e as despesas
 * mostravam valores diferentes para o mesmo mês.
 *
 * O valor é o da época: com histórico de preço, o mês antigo sai pelo preço
 * antigo, e não pelo de hoje.
 */
export function subscriptionCharge(sub: Subscription, month: MonthKey): { date: IsoDate; amount: Cents } | null {
  if (sub.deletedAt) return null;
  // anual: cobra uma vez por ano, no mês em que começou
  if (sub.cycle === 'yearly' && monthKeyParts(sub.startedAt).m !== monthKeyParts(month).m) return null;
  const date = dateInMonth(month, sub.billingDay);
  if (date < sub.startedAt) return null;
  if (sub.canceledAt && date > sub.canceledAt) return null;
  const amount = priceOn(sub, date);
  return amount > 0 ? { date, amount } : null;
}

function priceOn(sub: Subscription, date: IsoDate): Cents {
  const history = (sub.priceHistory ?? []).slice().sort((a, b) => (a.until < b.until ? -1 : a.until > b.until ? 1 : 0));
  for (const h of history) if (date <= h.until) return h.amount;
  return sub.amount;
}

/** quanto uma assinatura cobra na competência (0 quando não cobra) */
export function subscriptionChargeIn(sub: Subscription, month: MonthKey): Cents {
  return subscriptionCharge(sub, month)?.amount ?? 0;
}

/**
 * Monta a fatura de um cartão numa competência.
 *
 * Entra tudo que o ciclo alcança: parcelas de compras feitas no cartão e as
 * assinaturas pagas por ele. Cada parcela aparece com "3 de 12" para a pessoa
 * saber quanto ainda falta daquela compra.
 */
export function buildInvoice(
  card: Card,
  entries: Entry[],
  subscriptions: Subscription[],
  month: MonthKey,
  today: IsoDate,
): Invoice {
  const lines = invoiceLinesByMonth(card, entries, subscriptions, month, month, today).get(month) ?? [];
  const closesOn = closingDateOf(card, month);
  return {
    cardId: card.id,
    month,
    closesOn,
    dueOn: dueDateOf(card, month),
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    lines,
    closed: today > closesOn,
  };
}

/** chave da cobrança de uma assinatura ou parcela de dívida que já veio do extrato */
export const realizedKey = (refId: string, month: MonthKey) => `${refId}:${month}`;

/** as cobranças previstas que já têm um lançamento real no lugar */
export function realizedCharges(entries: Entry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    if (e.subscriptionId) out.add(realizedKey(e.subscriptionId, monthKeyOf(e.date)));
    if (e.debtId) out.add(realizedKey(e.debtId, monthKeyOf(e.date)));
  }
  return out;
}

/**
 * As linhas de todas as faturas de um cartão entre dois meses, numa passada.
 *
 * É a única fonte de "o que tem na fatura": a tela do cartão, o caixa (que
 * paga a fatura no vencimento) e o motor de saldo leem daqui. A compra entra
 * na fatura do ciclo em que foi feita; a assinatura também — cobrada depois do
 * fechamento, vai para a fatura seguinte, como no banco.
 */
export function invoiceLinesByMonth(
  card: Card,
  entries: Entry[],
  subscriptions: Subscription[],
  from: MonthKey,
  to: MonthKey,
  today: IsoDate,
): Map<MonthKey, InvoiceLine[]> {
  const out = new Map<MonthKey, InvoiceLine[]>();
  const push = (month: MonthKey, line: InvoiceLine) => {
    if (month < from || month > to) return;
    const list = out.get(month);
    if (list) list.push(line);
    else out.set(month, [line]);
  };

  for (const entry of entries) {
    if (entry.cardId !== card.id || entry.deletedAt) continue;

    // a compra parcelada rende uma ocorrência por mês; o ciclo decide em qual
    // fatura a primeira delas entra, e as seguintes andam junto
    const start = monthKeyOf(entry.date);
    const shift = monthsSince(start, firstInvoiceOf(card, entry));
    if (entry.repeat.kind === 'once') {
      for (const o of occurrencesOf(entry, start, today)) push(addMonthsToKey(start, shift), toLine(o, false));
      continue;
    }
    const firstCompetence = addMonthsToKey(from, -shift) > start ? addMonthsToKey(from, -shift) : start;
    const lastCompetence = addMonthsToKey(to, -shift);
    for (let c = firstCompetence; c <= lastCompetence; c = addMonthsToKey(c, 1)) {
      for (const o of occurrencesOf(entry, c, today)) push(addMonthsToKey(c, shift), toLine(o, false));
    }
  }

  const realized = realizedCharges(entries);
  for (const sub of subscriptions) {
    if (sub.cardId !== card.id || sub.deletedAt) continue;
    // a cobrança do fim de um mês pode cair na fatura do mês seguinte
    for (let m = addMonthsToKey(from, -1); m <= to; m = addMonthsToKey(m, 1)) {
      const charge = subscriptionCharge(sub, m);
      if (!charge || realized.has(realizedKey(sub.id, m))) continue;
      push(invoiceMonthOf(card, charge.date), {
        id: `sub:${sub.id}:${m}`,
        description: sub.name,
        amount: charge.amount,
        date: charge.date,
        categoryId: sub.categoryId,
        installment: null,
        subscription: true,
      });
    }
  }

  for (const list of out.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function toLine(o: Occurrence, subscription: boolean): InvoiceLine {
  return {
    id: `${o.entryId}:${o.key}`,
    description: o.description,
    // estorno no cartão abate a fatura, como no banco
    amount: o.kind === 'in' ? -o.amount : o.amount,
    date: o.date,
    categoryId: o.categoryId,
    installment: o.installment,
    subscription,
  };
}

/**
 * Lançamentos da fatura que parecem o mesmo gasto contado duas vezes.
 *
 * Acontece quando a parcela de uma compra antiga chega por dois arquivos com
 * texto ou centavos diferentes, ou quando uma assinatura cadastrada no cartão
 * também entra como compra. Mesma loja (uma palavra em comum) e o mesmo
 * valor — até dez por cento de diferença quando uma das duas é assinatura,
 * porque preço de assinatura muda. Uma lista para conferir, nunca para apagar
 * sozinha: duas pizzas do mesmo lugar no mesmo mês existem.
 */
export function suspectDuplicates(lines: InvoiceLine[]): [InvoiceLine, InvoiceLine][] {
  const words = (t: string) =>
    new Set(
      norm(t)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && w !== 'parcela'),
    );
  const out: [InvoiceLine, InvoiceLine][] = [];
  const used = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (used.has(a.id) || used.has(b.id) || a.amount <= 0 || b.amount <= 0) continue;
      if (a.id.split(':')[0] === b.id.split(':')[0]) continue;
      const diff = Math.abs(a.amount - b.amount);
      const close = a.subscription || b.subscription ? diff <= Math.max(a.amount, b.amount) * 0.1 : diff <= 3;
      if (!close) continue;
      // repetição de verdade envolve parcela ou assinatura; duas compras avulsas iguais são comuns
      if (!a.installment && !b.installment && !a.subscription && !b.subscription) continue;
      const wa = words(a.description);
      if (![...words(b.description)].some((w) => wa.has(w))) continue;
      out.push([a, b]);
      used.add(a.id);
      used.add(b.id);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ limite */

export interface CardUsage {
  used: Cents;
  available: Cents;
  /** 0 a 1; 1 quando o limite estourou */
  ratio: number;
}

/**
 * Quanto o cartão deve de verdade numa data.
 *
 * Tudo o que foi comprado — a compra parcelada pelo valor INTEIRO, porque a
 * parcela que ainda vai vencer já segura o limite —, menos o que foi pago.
 * Pago é o pagamento registrado (importado do extrato ou feito no app); a
 * fatura vencida sem pagamento registrado conta como paga inteira no
 * vencimento, que é o que acontece com quem tem débito automático e é o que
 * o app sempre supôs.
 *
 * Antes, "limite usado" olhava só as compras datadas no mês aberto: a compra
 * de 29 do mês passado, que está na fatura aberta, não segurava limite; e
 * nada devolvia o limite quando a fatura era paga.
 */
export interface CardBalance {
  /** compras e cobranças até a data, com a parcelada inteira */
  charges: Cents;
  /** pagamentos registrados mais as faturas vencidas tidas como pagas */
  payments: Cents;
  /** o que o cartão deve: compras menos pagamentos */
  debt: Cents;
  /** faturas vencidas sem pagamento registrado, tidas como pagas no vencimento */
  autoPaid: { month: MonthKey; dueOn: IsoDate; amount: Cents }[];
  /** pagamentos registrados, por fatura */
  paidByInvoice: Map<MonthKey, Cents>;
}

export function cardBalance(
  card: Card,
  entries: Entry[],
  subscriptions: Subscription[],
  transfers: Transfer[],
  asOf: IsoDate,
  today: IsoDate = asOf,
): CardBalance {
  let charges = 0;
  let firstMonth: MonthKey | null = null;
  const mine = entries.filter((e) => e.cardId === card.id && !e.deletedAt);

  for (const entry of mine) {
    const start = monthKeyOf(entry.date);
    if (!firstMonth || start < firstMonth) firstMonth = start;
    if (entry.repeat.kind === 'installments') {
      // a compra parcelada pesa inteira no dia da compra
      if (entry.date > asOf) continue;
      const count = Math.max(1, Math.trunc(entry.repeat.count ?? 1));
      for (let i = 0; i < count; i++) {
        for (const o of occurrencesOf(entry, addMonthsToKey(start, i), today)) charges += o.kind === 'in' ? -o.amount : o.amount;
      }
      continue;
    }
    // avulsa e recorrente: cada cobrança no dia dela
    for (let m = start; m <= monthKeyOf(asOf); m = addMonthsToKey(m, 1)) {
      for (const o of occurrencesOf(entry, m, today)) {
        if (o.date <= asOf) charges += o.kind === 'in' ? -o.amount : o.amount;
      }
      if (entry.repeat.kind === 'once') break;
    }
  }

  const realized = realizedCharges(entries);
  for (const sub of subscriptions) {
    if (sub.cardId !== card.id || sub.deletedAt) continue;
    const start = monthKeyOf(sub.startedAt);
    if (!firstMonth || start < firstMonth) firstMonth = start;
    for (let m = start; m <= monthKeyOf(asOf); m = addMonthsToKey(m, 1)) {
      const charge = subscriptionCharge(sub, m);
      if (charge && charge.date <= asOf && !realized.has(realizedKey(sub.id, m))) charges += charge.amount;
    }
  }

  const paidByInvoice = new Map<MonthKey, Cents>();
  let payments = 0;
  for (const t of transfers) {
    if (t.deletedAt || t.kind !== 'card' || t.toCardId !== card.id || t.date > asOf) continue;
    const month = t.invoiceMonth ?? paymentInvoiceMonth(card, t.date);
    paidByInvoice.set(month, (paidByInvoice.get(month) ?? 0) + t.amount);
    payments += t.amount;
  }

  const autoPaid: CardBalance['autoPaid'] = [];
  if (firstMonth) {
    const lastInvoice = invoiceMonthOf(card, asOf);
    const lines = invoiceLinesByMonth(card, entries, subscriptions, firstMonth, lastInvoice, today);
    for (const [month, list] of lines) {
      const dueOn = dueDateOf(card, month);
      if (dueOn > asOf || paidByInvoice.has(month)) continue;
      const total = list.reduce((s, l) => s + l.amount, 0);
      if (total <= 0) continue;
      autoPaid.push({ month, dueOn, amount: total });
      payments += total;
    }
    autoPaid.sort((a, b) => (a.month < b.month ? -1 : 1));
  }

  return { charges, payments, debt: charges - payments, autoPaid, paidByInvoice };
}

/**
 * A fatura que um pagamento sem fatura indicada quita: a última que já
 * fechou até o dia do pagamento.
 */
export function paymentInvoiceMonth(card: Pick<Card, 'closingDay'>, date: IsoDate): MonthKey {
  return addMonthsToKey(invoiceMonthOf(card, date), -1);
}

/** quanto do limite está comprometido, na mesma conta da dívida do cartão */
export function cardUsage(
  card: Card,
  entries: Entry[],
  subscriptions: Subscription[],
  month: MonthKey,
  today: IsoDate,
  transfers: Transfer[] = [],
): CardUsage {
  // mês passado: como estava no fim dele; mês corrente ou futuro: hoje
  const asOf = month < monthKeyOf(today) ? dateInMonth(month, 31) : today;
  const used = Math.max(0, cardBalance(card, entries, subscriptions, transfers, asOf, today).debt);
  const limit = Math.max(0, card.limit);
  return {
    used,
    available: Math.max(0, limit - used),
    ratio: limit > 0 ? Math.min(1, used / limit) : 0,
  };
}

function monthsSince(from: MonthKey, to: MonthKey): number {
  const a = monthKeyParts(from);
  const b = monthKeyParts(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/* ------------------------------------------------------------------- logo */

/**
 * Onde buscar o logotipo de um domínio.
 *
 * São três fontes em ordem: a primeira que responder fica. A cascata importa
 * porque nenhuma delas cobre todas as marcas brasileiras sozinha.
 */
export function logoCandidates(domain: string): string[] {
  if (!domain) return [];
  const d = encodeURIComponent(domain);
  return [
    `https://logo.clearbit.com/${d}?size=128`,
    `https://icons.duckduckgo.com/ip3/${d}.ico`,
    `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
  ];
}

/* ----------------------------------------------------------- parcelas futuras */

export interface FutureLine {
  id: string;
  description: string;
  perInstallment: Cents;
  /** parcelas que ainda não caíram em fatura nenhuma */
  left: number;
  /** a soma exata dessas parcelas, com os centavos de cada uma */
  leftTotal: Cents;
  total: number;
  /** a parcela que está na fatura aberta */
  current: number;
}

/**
 * As parcelas que ainda vão cair, depois da fatura aberta.
 *
 * É o número que a fatura esconde: a compra de dez vezes aparece só como
 * "R$ 420" hoje, mas ainda prende R$ 2.520 dos próximos meses.
 */
export function futureInstallments(card: Card, entries: Entry[], openMonth: MonthKey): FutureLine[] {
  const out: FutureLine[] = [];
  for (const e of entries) {
    if (e.cardId !== card.id || e.deletedAt || e.repeat.kind !== 'installments') continue;
    const total = Math.max(1, Math.trunc(e.repeat.count ?? 1));
    const first = firstInvoiceOf(card, e);
    const current = monthsSince(first, openMonth) + 1;
    const left = total - Math.max(0, current);
    if (left <= 0) continue;
    const from = Math.max(0, current) + 1;
    let leftTotal = 0;
    for (let i = from; i <= total; i++) leftTotal += plannedAmount(e, { index: i, total });
    out.push({
      id: e.id,
      description: e.description,
      perInstallment: plannedAmount(e, { index: from, total }),
      left,
      leftTotal,
      total,
      current: Math.max(0, current),
    });
  }
  return out.sort((a, b) => b.leftTotal - a.leftTotal);
}
