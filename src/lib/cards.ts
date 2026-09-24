import {
  addMonthsToKey,
  clampDayToMonth,
  dateInMonth,
  isoToParts,
  monthKeyOf,
  monthKeyParts,
  partsToIso,
} from './dates';
import { occurrencesOf, type Occurrence } from './occurrences';
import type { Card, Cents, Entry, IsoDate, MonthKey, Subscription } from './types';

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

/** quanto uma assinatura cobra na competência, considerando ciclo anual */
export function subscriptionChargeIn(sub: Subscription, month: MonthKey): Cents {
  if (sub.canceledAt && monthKeyOf(sub.canceledAt) < month) return 0;
  if (monthKeyOf(sub.startedAt) > month) return 0;
  if (sub.cycle === 'monthly') return sub.amount;
  // anual: cobra uma vez por ano, no mês em que começou
  return monthKeyParts(sub.startedAt).m === monthKeyParts(month).m ? sub.amount : 0;
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
  const lines: InvoiceLine[] = [];

  for (const entry of entries) {
    if (entry.cardId !== card.id || entry.deletedAt) continue;

    // a compra parcelada rende uma ocorrência por mês; o ciclo decide em qual
    // fatura a primeira delas entra, e as seguintes andam junto
    const shift = monthsSince(monthKeyOf(entry.date), firstInvoiceOf(card, entry));
    const competence = addMonthsToKey(month, -shift);

    for (const occurrence of occurrencesOf(entry, competence, today)) {
      lines.push(toLine(occurrence, false));
    }
  }

  for (const sub of subscriptions) {
    if (sub.cardId !== card.id || sub.deletedAt) continue;
    const amount = subscriptionChargeIn(sub, month);
    if (!amount) continue;
    lines.push({
      id: `sub:${sub.id}:${month}`,
      description: sub.name,
      amount,
      date: dateInMonth(month, sub.billingDay),
      categoryId: sub.categoryId,
      installment: null,
      subscription: true,
    });
  }

  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

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

/* ------------------------------------------------------------------ limite */

export interface CardUsage {
  used: Cents;
  available: Cents;
  /** 0 a 1; 1 quando o limite estourou */
  ratio: number;
}

/**
 * Quanto do limite está comprometido.
 *
 * Não é o valor da fatura do mês: parcela que ainda vai vencer continua
 * segurando limite. Então a conta soma todas as parcelas futuras de toda
 * compra em aberto, mais as assinaturas do cartão.
 */
export function cardUsage(
  card: Card,
  entries: Entry[],
  subscriptions: Subscription[],
  month: MonthKey,
  today: IsoDate,
): CardUsage {
  let used = 0;

  for (const entry of entries) {
    if (entry.cardId !== card.id || entry.deletedAt) continue;

    if (entry.repeat.kind === 'installments') {
      const total = Math.max(1, Math.trunc(entry.repeat.count ?? 1));
      const startInvoice = firstInvoiceOf(card, entry);
      const paid = Math.max(0, monthsSince(startInvoice, month));
      const remaining = Math.max(0, total - paid);
      used += remaining * entry.amount;
    } else {
      for (const o of occurrencesOf(entry, month, today)) used += o.kind === 'in' ? -o.amount : o.amount;
    }
  }

  for (const sub of subscriptions) {
    if (sub.cardId !== card.id || sub.deletedAt) continue;
    used += subscriptionChargeIn(sub, month);
  }

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
    out.push({ id: e.id, description: e.description, perInstallment: e.amount, left, total, current: Math.max(0, current) });
  }
  return out.sort((a, b) => b.perInstallment * b.left - a.perInstallment * a.left);
}
