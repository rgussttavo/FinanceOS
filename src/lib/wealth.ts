import { cardUsage } from './cards';
import { addMonthsToKey, daysInMonth, monthKeyOf, monthKeyParts, partsToIso } from './dates';
import { debtProgress } from './debts';
import { occurrencesInMonth } from './occurrences';
import type { Asset, Card, Cents, Debt, Entry, IsoDate, MonthKey, Subscription } from './types';

/**
 * O que você tem menos o que você deve.
 *
 * Ativos: o saldo em conta (quando positivo), o que foi investido e os bens.
 * Passivos: o que falta pagar das dívidas e o que está comprometido nos
 * cartões — fatura aberta mais as parcelas que ainda vêm.
 *
 * O investido é a soma dos aportes lançados, não o valor de mercado: o app não
 * conecta em corretora, e inventar rendimento seria pior do que não mostrar.
 */

export interface WealthBreakdown {
  cash: Cents;
  investments: Cents;
  property: Cents;
  vehicles: Cents;
  otherAssets: Cents;
  assetsTotal: Cents;
  financing: Cents;
  loans: Cents;
  cards: Cents;
  otherDebts: Cents;
  liabilitiesTotal: Cents;
  net: Cents;
}

/** soma dos aportes até o fim de `month` */
export function investedUntil(entries: Entry[], month: MonthKey, today: IsoDate): Cents {
  const invest = entries.filter((e) => e.kind === 'invest' && !e.deletedAt);
  if (!invest.length) return 0;
  const first = monthKeyOf(invest.reduce((min, e) => (e.date < min ? e.date : min), invest[0].date));
  let total = 0;
  for (let m = first; m <= month; m = addMonthsToKey(m, 1)) {
    for (const o of occurrencesInMonth(invest, m, today)) total += o.amount;
  }
  return total;
}

const monthEnd = (month: MonthKey): IsoDate => {
  const { y, m } = monthKeyParts(month);
  return partsToIso(y, m, daysInMonth(y, m));
};

export function wealthNow(input: {
  assets: Asset[];
  entries: Entry[];
  debts: Debt[];
  cards: Card[];
  subscriptions: Subscription[];
  cashNow: Cents;
  today: IsoDate;
  cardsEnabled: boolean;
}): WealthBreakdown {
  const { today } = input;
  const month = monthKeyOf(today);
  const live = input.assets.filter((a) => !a.deletedAt);

  const cash = Math.max(0, input.cashNow);
  const investments = investedUntil(input.entries, month, today);
  const property = live.filter((a) => a.kind === 'property').reduce((t, a) => t + a.value, 0);
  const vehicles = live.filter((a) => a.kind === 'vehicle').reduce((t, a) => t + a.value, 0);
  const otherAssets = live.filter((a) => a.kind === 'other').reduce((t, a) => t + a.value, 0);

  let financing = 0;
  let loans = 0;
  let cardsDebt = 0;
  let otherDebts = Math.max(0, -input.cashNow);
  for (const d of input.debts) {
    if (d.deletedAt || d.settledAt) continue;
    const left = debtProgress(d, month).outstanding;
    if (d.kind === 'financing') financing += left;
    else if (d.kind === 'loan' || d.kind === 'payroll') loans += left;
    else if (d.kind === 'card') cardsDebt += left;
    else otherDebts += left;
  }
  if (input.cardsEnabled) {
    for (const c of input.cards) {
      if (c.deletedAt || c.archived) continue;
      cardsDebt += cardUsage(c, input.entries, input.subscriptions, month, today).used;
    }
  }

  const assetsTotal = cash + investments + property + vehicles + otherAssets;
  const liabilitiesTotal = financing + loans + cardsDebt + otherDebts;
  return {
    cash,
    investments,
    property,
    vehicles,
    otherAssets,
    assetsTotal,
    financing,
    loans,
    cards: cardsDebt,
    otherDebts,
    liabilitiesTotal,
    net: assetsTotal - liabilitiesTotal,
  };
}

export interface WealthPoint {
  month: MonthKey;
  assets: Cents;
  debts: Cents;
  net: Cents;
}

/**
 * Evolução mês a mês de investimentos, bens e dívidas.
 *
 * Fica de fora o saldo em conta e os cartões, que o app só conhece do mês
 * corrente — incluí-los no passado seria chutar. Bens entram a partir da data
 * de compra, pelo valor de hoje; a tela diz isso.
 */
export function wealthHistory(
  input: { assets: Asset[]; entries: Entry[]; debts: Debt[]; today: IsoDate },
  months: number,
): WealthPoint[] {
  const current = monthKeyOf(input.today);
  const out: WealthPoint[] = [];
  const invest = input.entries.filter((e) => e.kind === 'invest' && !e.deletedAt);

  // acumulado corrido, para não refazer a soma do começo a cada mês
  const first = invest.length ? monthKeyOf(invest.reduce((min, e) => (e.date < min ? e.date : min), invest[0].date)) : current;
  const start = addMonthsToKey(current, -(months - 1));
  let running = 0;
  for (let m = first; m < start; m = addMonthsToKey(m, 1)) {
    for (const o of occurrencesInMonth(invest, m, input.today)) running += o.amount;
  }

  for (let i = months - 1; i >= 0; i--) {
    const m = addMonthsToKey(current, -i);
    for (const o of occurrencesInMonth(invest, m, input.today)) running += o.amount;
    const end = monthEnd(m);
    const goods = input.assets
      .filter((a) => !a.deletedAt && (!a.purchasedAt || a.purchasedAt <= end))
      .reduce((t, a) => t + a.value, 0);
    const debts = input.debts
      .filter((d) => !d.deletedAt && !d.settledAt && d.startMonth <= m)
      .reduce((t, d) => t + debtProgress(d, m).outstanding, 0);
    out.push({ month: m, assets: running + goods, debts, net: running + goods - debts });
  }
  return out;
}
