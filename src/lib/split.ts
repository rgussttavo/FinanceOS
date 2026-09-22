import { splitCents } from './money';
import type { Cents, Participant, Split, SplitItem } from './types';

export interface Balance {
  participantId: string;
  name: string;
  me: boolean;
  /** quanto essa pessoa desembolsou */
  paid: Cents;
  /** quanto do consumo cabe a ela */
  owed: Cents;
  /** positivo: tem a receber. negativo: deve. */
  balance: Cents;
}

export interface Transfer {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: Cents;
}

/**
 * Quem pagou o quê e quanto cabe a cada um.
 *
 * Cada item é dividido só entre quem participou dele — a carne divide entre
 * quatro, a bebida só entre quem bebeu. E a divisão usa centavos inteiros, com
 * a sobra distribuída um a um: três pessoas dividindo R$ 10,00 pagam 3,34 /
 * 3,33 / 3,33, e não três vezes 3,33 com um centavo sumindo.
 */
export function computeBalances(split: Split): Balance[] {
  const byId = new Map(split.participants.map((p) => [p.id, p]));
  const paid = new Map<string, Cents>();
  const owed = new Map<string, Cents>();

  for (const item of split.items) {
    if (item.amount <= 0) continue;

    paid.set(item.paidBy, (paid.get(item.paidBy) ?? 0) + item.amount);

    const sharers = item.sharedWith.length
      ? item.sharedWith.filter((id) => byId.has(id))
      : split.participants.map((p) => p.id);
    if (!sharers.length) continue;

    const shares = splitCents(item.amount, sharers.length);
    sharers.forEach((id, i) => owed.set(id, (owed.get(id) ?? 0) + shares[i]));
  }

  return split.participants.map((p) => {
    const paidTotal = paid.get(p.id) ?? 0;
    const owedTotal = owed.get(p.id) ?? 0;
    return {
      participantId: p.id,
      name: p.name,
      me: p.me,
      paid: paidTotal,
      owed: owedTotal,
      balance: paidTotal - owedTotal,
    };
  });
}

/**
 * Fecha a conta no menor número de pagamentos.
 *
 * Em vez de todo mundo pagar todo mundo, junta-se quem deve com quem tem a
 * receber, sempre casando o maior credor com o maior devedor. Quatro pessoas
 * costumam fechar em dois ou três Pix em vez de seis — e é essa redução que
 * faz a conta do churrasco realmente acontecer.
 */
export function minimalTransfers(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ ...b, left: b.balance }))
    .sort((a, b) => b.left - a.left);

  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ ...b, left: -b.balance }))
    .sort((a, b) => b.left - a.left);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.left, debtor.left);

    if (amount > 0) {
      transfers.push({
        from: debtor.participantId,
        fromName: debtor.name,
        to: creditor.participantId,
        toName: creditor.name,
        amount,
      });
      creditor.left -= amount;
      debtor.left -= amount;
    }

    // o centavo residual não vira um Pix de R$ 0,01
    if (creditor.left <= 0) ci += 1;
    if (debtor.left <= 0) di += 1;
  }

  return transfers;
}

export interface SplitSummary {
  total: Cents;
  /** média por pessoa, quando todos participam de tudo */
  perPerson: Cents;
  balances: Balance[];
  transfers: Transfer[];
  settled: boolean;
}

export function summarizeSplit(split: Split): SplitSummary {
  const total = split.items.reduce((sum, i) => sum + Math.max(0, i.amount), 0);
  const balances = computeBalances(split);
  const transfers = minimalTransfers(balances);
  const people = Math.max(1, split.participants.length);

  return {
    total,
    perPerson: Math.round(total / people),
    balances,
    transfers,
    settled: transfers.length === 0 && total > 0,
  };
}

/** texto pronto para colar no grupo: quem paga quanto para quem */
export function splitAsText(split: Split, summary: SplitSummary): string {
  const money = (c: Cents) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100);

  const lines: string[] = [`${split.icon} ${split.name}`, `Total: ${money(summary.total)}`, ''];

  for (const b of summary.balances) {
    const state =
      b.balance > 0 ? `recebe ${money(b.balance)}` : b.balance < 0 ? `deve ${money(-b.balance)}` : 'em dia';
    lines.push(`${b.name}: pagou ${money(b.paid)} · ${state}`);
  }

  if (summary.transfers.length) {
    lines.push('', 'Acertos:');
    for (const t of summary.transfers) {
      lines.push(`${t.fromName} → ${t.toName}: ${money(t.amount)}`);
    }
  }

  return lines.join('\n');
}

/** participantes iniciais de um rateio novo: só você */
export function seedParticipants(makeId: () => string): Participant[] {
  return [{ id: makeId(), name: 'Você', me: true }];
}

export const emptyItem = (makeId: () => string, paidBy: string): SplitItem => ({
  id: makeId(),
  description: '',
  amount: 0,
  paidBy,
  sharedWith: [],
});
