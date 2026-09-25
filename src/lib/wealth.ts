import { addMonthsToKey, daysInMonth, monthKeyOf, monthKeyParts, partsToIso } from './dates';
import { debtProgress } from './debts';
import { balancesAt, cardDebts, type LedgerInput } from './ledger';
import { occurrencesOf } from './occurrences';
import type { Asset, Cents, Debt, Entry, IsoDate, MonthKey } from './types';

/**
 * O que você tem menos o que você deve.
 *
 * Ativos: o saldo de cada conta (quando positivo), o que foi investido e os
 * bens. Passivos: conta no negativo, o que falta pagar das dívidas e o que os
 * cartões devem — a compra parcelada inteira, menos o que já foi pago.
 *
 * Tudo sai do livro-caixa: o caixa daqui é o mesmo das Contas e do Início, e
 * a dívida do cartão é a mesma do limite usado. Dinheiro que vai da conta
 * para o investimento sai de um lado e entra no outro — nunca conta duas
 * vezes, nem some.
 *
 * O investido é a soma dos aportes feitos (menos os resgates), não o valor de
 * mercado: o app não conecta em corretora, e inventar rendimento seria pior
 * do que não mostrar.
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

/**
 * Aportes que aconteceram até `cutoff`, menos resgates.
 *
 * Só o realizado: o aporte programado para o dia 28 não está investido no
 * dia 20. Antes, todo aporte previsto do mês já contava como feito.
 */
export function investedRealized(entries: Entry[], cutoff: IsoDate, today: IsoDate, filter?: (e: Entry) => boolean): Cents {
  let total = 0;
  for (const e of entries) {
    if (e.kind !== 'invest' || e.deletedAt || e.date > cutoff) continue;
    if (filter && !filter(e)) continue;
    const start = monthKeyOf(e.date);
    for (let m = start; m <= monthKeyOf(cutoff); m = addMonthsToKey(m, 1)) {
      for (const o of occurrencesOf(e, m, today)) {
        if (!o.settlement || o.date > cutoff) continue;
        total += e.withdrawal ? -o.amount : o.amount;
      }
      if (e.repeat.kind === 'once') break;
    }
  }
  return total;
}

const monthEnd = (month: MonthKey): IsoDate => {
  const { y, m } = monthKeyParts(month);
  return partsToIso(y, m, daysInMonth(y, m));
};

/** o investido no fim de `month` (ou hoje, se o mês ainda não acabou) */
export function investedUntil(entries: Entry[], month: MonthKey, today: IsoDate): Cents {
  const end = monthEnd(month);
  return investedRealized(entries, end < today ? end : today, today);
}

export function wealthNow(ledger: LedgerInput, assets: Asset[]): WealthBreakdown {
  const { today } = ledger;
  const month = monthKeyOf(today);
  const live = assets.filter((a) => !a.deletedAt);

  let cash = 0;
  let overdraft = 0;
  for (const row of balancesAt(ledger, today).accounts) {
    if (row.balance >= 0) cash += row.balance;
    else overdraft += -row.balance;
  }

  const investments = investedRealized(ledger.entries, today, today);
  const property = live.filter((a) => a.kind === 'property').reduce((t, a) => t + a.value, 0);
  const vehicles = live.filter((a) => a.kind === 'vehicle').reduce((t, a) => t + a.value, 0);
  const otherAssets = live.filter((a) => a.kind === 'other').reduce((t, a) => t + a.value, 0);

  let financing = 0;
  let loans = 0;
  let cardsDebt = 0;
  let otherDebts = overdraft;
  for (const d of ledger.debts) {
    if (d.deletedAt || d.settledAt) continue;
    const left = debtProgress(d, month).outstanding;
    if (d.kind === 'financing') financing += left;
    else if (d.kind === 'loan' || d.kind === 'payroll') loans += left;
    else if (d.kind === 'card') cardsDebt += left;
    else otherDebts += left;
  }
  for (const c of cardDebts(ledger)) cardsDebt += Math.max(0, c.debt);

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
 * Fica de fora o saldo em conta e os cartões: o histórico olha só o que o
 * app conhece com segurança mês a mês. Bens entram a partir da data de
 * compra, pelo valor de hoje; a tela diz isso.
 */
export function wealthHistory(
  input: { assets: Asset[]; entries: Entry[]; debts: Debt[]; today: IsoDate },
  months: number,
): WealthPoint[] {
  const current = monthKeyOf(input.today);
  const out: WealthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonthsToKey(current, -i);
    const invested = investedUntil(input.entries, m, input.today);
    const end = monthEnd(m);
    const goods = input.assets
      .filter((a) => !a.deletedAt && (!a.purchasedAt || a.purchasedAt <= end))
      .reduce((t, a) => t + a.value, 0);
    const debts = input.debts
      .filter((d) => !d.deletedAt && !d.settledAt && d.startMonth <= m)
      .reduce((t, d) => t + debtProgress(d, m).outstanding, 0);
    out.push({ month: m, assets: invested + goods, debts, net: invested + goods - debts });
  }
  return out;
}
