import { describe, expect, it } from 'vitest';
import { account, card, debt, entry, paid, subscription, transfer } from '@/test/build';
import { buildInvoice, cardBalance, cardUsage } from './cards';
import { cashSnapshot, dayBalances, virtualOccurrences } from './cashflow';
import { auditAccount, balancesAt, cashNow, invoiceStatus, projectedBalance, type LedgerInput } from './ledger';
import { occurrencesInMonth, summarizeMonth } from './occurrences';
import type { Account, Card, Debt, Entry, Subscription, Transfer } from './types';

/**
 * O motor de saldo.
 *
 * Os dois primeiros casos são os cenários do documento de auditoria, com os
 * números que ele pede. Os seguintes são as regras que cada um deles depende
 * — cada uma escrita como a pessoa a diria em voz alta.
 */

function input(parts: Partial<LedgerInput> & { today: string }): LedgerInput {
  return {
    accounts: [],
    entries: [],
    transfers: [],
    cards: [],
    subscriptions: [],
    debts: [],
    cardsEnabled: true,
    ...parts,
  };
}

/** o resumo do mês do jeito que as telas de movimentos montam */
function monthSummary(i: LedgerInput, month: string) {
  const occ = [...occurrencesInMonth(i.entries, month, i.today), ...virtualOccurrences(i.subscriptions, i.debts, month, i.today, i.entries)];
  return summarizeMonth(occ, month, i.today);
}

describe('cenário 43: o extrato controlado', () => {
  // Saldo inicial 1.000; +3.000 salário; −500 aluguel; −200 mercado;
  // −100 transporte; +500 transferência recebida; −250 cartão.
  const corrente = account({ name: 'Corrente', primary: true, openingBalance: 100000, openingDate: '2026-09-01' });
  const poupanca = account({ name: 'Poupança', kind: 'savings', openingBalance: 200000, openingDate: '2026-09-01' });
  const nubank = card({ closingDay: 25, dueDay: 5 });
  const i = input({
    today: '2026-09-30',
    accounts: [corrente, poupanca],
    cards: [nubank],
    entries: [
      paid('in', 300000, '2026-09-02', { description: 'Salário', accountId: corrente.id }),
      paid('out', 50000, '2026-09-03', { description: 'Aluguel', accountId: corrente.id }),
      paid('out', 20000, '2026-09-05', { description: 'Mercado', accountId: corrente.id }),
      paid('out', 10000, '2026-09-05', { description: 'Transporte', accountId: corrente.id }),
      // a compra que gerou a fatura paga no dia 15
      entry('out', 25000, '2026-08-10', { description: 'Loja', cardId: nubank.id }),
    ],
    transfers: [
      transfer({ kind: 'account', amount: 50000, date: '2026-09-10', fromAccountId: poupanca.id, toAccountId: corrente.id }),
      transfer({ kind: 'card', amount: 25000, date: '2026-09-15', fromAccountId: corrente.id, toCardId: nubank.id, invoiceMonth: '2026-08' }),
    ],
  });

  it('o saldo final da corrente é 3.450', () => {
    const { accounts } = balancesAt(i, '2026-09-30');
    expect(accounts.find((a) => a.account.id === corrente.id)?.balance).toBe(345000);
  });

  it('a transferência sai da poupança e não muda o total', () => {
    const { accounts, total } = balancesAt(i, '2026-09-30');
    expect(accounts.find((a) => a.account.id === poupanca.id)?.balance).toBe(150000);
    // 1.000 + 2.000 de saldos iniciais + 3.000 − 800 − 250 da fatura
    expect(total).toBe(495000);
  });

  it('receita é o salário; transferência não infla nada', () => {
    const s = monthSummary(i, '2026-09');
    expect(s.income).toBe(300000);
    expect(s.expense).toBe(80000);
  });

  it('o pagamento da fatura não é uma segunda despesa: a compra conta no mês dela', () => {
    expect(monthSummary(i, '2026-08').expense).toBe(25000);
    expect(monthSummary(i, '2026-09').expense).toBe(80000);
  });

  it('o cartão fica sem dívida depois do pagamento', () => {
    expect(cardBalance(nubank, i.entries, [], i.transfers, '2026-09-30').debt).toBe(0);
  });

  it('o Início mostra o mesmo saldo das contas', () => {
    expect(cashSnapshot(i).balanceNow).toBe(balancesAt(i, '2026-09-30').total);
  });

  it('cada número da corrente pode ser refeito linha a linha', () => {
    const audit = auditAccount(i, corrente.id);
    expect(audit.opening).toBe(100000);
    expect(audit.lines.map((l) => l.amount)).toEqual([300000, -50000, -20000, -10000, 50000, -25000]);
    expect(audit.lines.at(-1)?.running).toBe(345000);
    expect(audit.balance).toBe(345000);
  });
});

describe('cenário 62: o teste final obrigatório', () => {
  // Saldo inicial 5.000; salário 4.000; aluguel 1.500; mercado 500;
  // transporte 300; compra no cartão 800; transferência de 500 para a
  // poupança; aporte de 300; parcela de 200; assinatura de 50.
  const principal = account({ name: 'Principal', primary: true, openingBalance: 500000, openingDate: '2026-09-01' });
  const poupanca = account({ name: 'Poupança', kind: 'savings', openingDate: '2026-09-01' });
  const cartao = card({ closingDay: 25, dueDay: 5, limit: 500000 });
  const emprestimo = debt({ installment: 20000, installments: 10, startMonth: '2026-06', dueDay: 15 });
  const streaming = subscription({ amount: 5000, billingDay: 10, startedAt: '2026-01-01' });

  const base = input({
    today: '2026-09-28',
    accounts: [principal, poupanca],
    cards: [cartao],
    debts: [emprestimo],
    subscriptions: [streaming],
    entries: [
      paid('in', 400000, '2026-09-05', { description: 'Salário' }),
      paid('out', 150000, '2026-09-06', { description: 'Aluguel' }),
      paid('out', 50000, '2026-09-08', { description: 'Mercado' }),
      paid('out', 30000, '2026-09-09', { description: 'Transporte' }),
      paid('invest', 30000, '2026-09-12', { description: 'Aporte na meta' }),
      entry('out', 80000, '2026-09-20', { description: 'Compra no cartão', cardId: cartao.id }),
    ],
    transfers: [transfer({ kind: 'account', amount: 50000, date: '2026-09-14', fromAccountId: principal.id, toAccountId: poupanca.id })],
  });

  it('conta principal: 5.000 + 4.000 − 1.500 − 500 − 300 − 300 − 500 − 50 − 200 = 5.650', () => {
    const acc = balancesAt(base, base.today).accounts.find((a) => a.account.id === principal.id);
    expect(acc?.balance).toBe(565000);
  });

  it('poupança recebe os 500 da transferência', () => {
    expect(balancesAt(base, base.today).accounts.find((a) => a.account.id === poupanca.id)?.balance).toBe(50000);
  });

  it('a compra no cartão ainda não saiu da conta: está na fatura de setembro', () => {
    const inv = buildInvoice(cartao, base.entries, [], '2026-09', base.today);
    expect(inv.total).toBe(80000);
    expect(inv.dueOn).toBe('2026-10-05');
    expect(cardUsage(cartao, base.entries, [], '2026-09', base.today).used).toBe(80000);
  });

  it('despesas do mês: 1.500 + 500 + 300 + 800 + 50 + 200 = 3.350; receita 4.000; investido 300', () => {
    const s = monthSummary(base, '2026-09');
    expect(s.income).toBe(400000);
    expect(s.expense).toBe(335000);
    expect(s.invested).toBe(30000);
  });

  it('saldo projetado para 05/10 já desconta a fatura de 800', () => {
    // parcela e assinatura de outubro caem depois do dia 5
    expect(projectedBalance(base, '2026-10-05')).toBe(565000 + 50000 - 80000);
  });

  it('pagar a fatura tira da conta e zera o cartão, sem nova despesa', () => {
    const pago = input({
      ...base,
      today: '2026-10-05',
      transfers: [
        ...base.transfers,
        transfer({ kind: 'card', amount: 80000, date: '2026-10-05', fromAccountId: principal.id, toCardId: cartao.id, invoiceMonth: '2026-09' }),
      ],
    });
    const acc = balancesAt(pago, '2026-10-05').accounts.find((a) => a.account.id === principal.id);
    expect(acc?.balance).toBe(565000 - 80000);
    expect(cardBalance(cartao, pago.entries, [], pago.transfers, '2026-10-05').debt).toBe(0);
    expect(monthSummary(pago, '2026-10').expense).toBe(20000 + 5000); // só parcela e assinatura de outubro
  });

  it('Início, Contas e curva do mês dão o mesmo número hoje', () => {
    const snap = cashSnapshot(base);
    const curve = dayBalances(base, '2026-09-01', '2026-09-30').days.find((d) => d.date === base.today);
    expect(snap.balanceNow).toBe(cashNow(base));
    expect(curve?.balance).toBe(cashNow(base));
  });
});

describe('saldo inicial', () => {
  it('o que aconteceu antes da data do saldo inicial já está dentro dele', () => {
    const c = account({ primary: true, openingBalance: 100000, openingDate: '2026-09-01' });
    const i = input({
      today: '2026-09-30',
      accounts: [c],
      entries: [paid('out', 30000, '2026-08-28'), paid('out', 1000, '2026-09-02')],
    });
    expect(cashNow(i)).toBe(99000);
    expect(auditAccount(i, c.id).beforeOpening).toHaveLength(1);
  });

  it('sem conta cadastrada, existe a principal implícita', () => {
    const i = input({ today: '2026-09-30', entries: [paid('in', 500, '2026-09-02'), paid('out', 200, '2026-09-03')] });
    expect(cashNow(i)).toBe(300);
  });
});

describe('realizado e previsto', () => {
  const c = account({ primary: true, openingBalance: 100000, openingDate: '2026-09-01' });

  it('conta vencida e não paga não sai do saldo, mas pesa na projeção', () => {
    const i = input({ today: '2026-09-20', accounts: [c], entries: [entry('out', 30000, '2026-09-10', { description: 'Luz' })] });
    expect(cashNow(i)).toBe(100000);
    const snap = cashSnapshot(i);
    expect(snap.overdue).toBe(30000);
    expect(snap.endOfMonth).toBe(70000);
  });

  it('receita futura não é dinheiro de hoje', () => {
    const i = input({ today: '2026-09-20', accounts: [c], entries: [entry('in', 500000, '2026-09-25', { description: 'Salário' })] });
    expect(cashNow(i)).toBe(100000);
    expect(projectedBalance(i, '2026-09-30')).toBe(600000);
  });

  it('valor pago diferente do previsto: vale o pago', () => {
    const e = entry('out', 20000, '2026-09-10', { settled: { '2026-09': { at: 'x', amount: 21450 } } });
    const i = input({ today: '2026-09-20', accounts: [c], entries: [e] });
    expect(cashNow(i)).toBe(100000 - 21450);
  });
});

describe('transferência', () => {
  const a = account({ primary: true, openingBalance: 100000, openingDate: '2026-09-01' });
  const b = account({ openingBalance: 0, openingDate: '2026-09-01' });

  it('editar o valor muda os dois lados; excluir desfaz os dois', () => {
    const t = transfer({ kind: 'account', amount: 30000, date: '2026-09-05', fromAccountId: a.id, toAccountId: b.id });
    const at = (transfers: Transfer[]) => balancesAt(input({ today: '2026-09-30', accounts: [a, b], transfers }), '2026-09-30');
    expect(at([t]).accounts.map((x) => x.balance)).toEqual([70000, 30000]);
    expect(at([{ ...t, amount: 45000 }]).accounts.map((x) => x.balance)).toEqual([55000, 45000]);
    expect(at([{ ...t, deletedAt: '2026-09-06T00:00:00Z' }]).accounts.map((x) => x.balance)).toEqual([100000, 0]);
  });

  it('transferência nunca aparece como receita ou despesa', () => {
    const t = transfer({ kind: 'account', amount: 30000, date: '2026-09-05', fromAccountId: a.id, toAccountId: b.id });
    const i = input({ today: '2026-09-30', accounts: [a, b], transfers: [t] });
    const snap = cashSnapshot(i);
    expect(snap.monthIn).toBe(0);
    expect(snap.monthOut).toBe(0);
    expect(monthSummary(i, '2026-09').income).toBe(0);
  });

  it('ajuste de saldo muda o saldo e não é receita', () => {
    const adj = transfer({ kind: 'adjustment', amount: 12750, date: '2026-09-30', fromAccountId: a.id, direction: 'out' });
    const i = input({ today: '2026-09-30', accounts: [a], transfers: [adj] });
    expect(cashNow(i)).toBe(100000 - 12750);
    expect(cashSnapshot(i).monthOut).toBe(0);
  });
});

describe('cartão', () => {
  const c = account({ primary: true, openingBalance: 500000, openingDate: '2026-01-01' });

  it('compra depois do fechamento vai para a fatura seguinte', () => {
    const k = card({ closingDay: 25, dueDay: 5 });
    const antes = entry('out', 1000, '2026-09-25', { cardId: k.id });
    const depois = entry('out', 2000, '2026-09-26', { cardId: k.id });
    expect(buildInvoice(k, [antes, depois], [], '2026-09', '2026-09-30').total).toBe(1000);
    expect(buildInvoice(k, [antes, depois], [], '2026-10', '2026-09-30').total).toBe(2000);
  });

  it('limite comprometido conta a compra parcelada inteira; cada fatura paga devolve a parcela', () => {
    const k = card({ closingDay: 25, dueDay: 5, limit: 1000000 });
    const tv = entry('out', 89970 / 3, '2026-09-10', { cardId: k.id, repeat: { kind: 'installments', count: 3, total: 89970 } });
    expect(cardUsage(k, [tv], [], '2026-09', '2026-09-20').used).toBe(89970);
    // a primeira parcela venceu em 05/10 sem pagamento registrado: tida como paga
    expect(cardUsage(k, [tv], [], '2026-10', '2026-10-06').used).toBe(89970 - 29990);
  });

  it('fatura vencida sem pagamento registrado sai da conta no vencimento, uma vez', () => {
    const k = card({ closingDay: 25, dueDay: 5 });
    const compra = entry('out', 40000, '2026-09-10', { cardId: k.id });
    const i = input({ today: '2026-10-10', accounts: [c], cards: [k], entries: [compra] });
    expect(cashNow(i)).toBe(500000 - 40000);
    expect(invoiceStatus(i, k, '2026-09')).toMatchObject({ total: 40000, paid: 40000, remaining: 0, autoPaid: true });
  });

  it('pagamento parcial registrado: o resto continua devido e aparece como vencido', () => {
    const k = card({ closingDay: 25, dueDay: 5 });
    const compra = entry('out', 40000, '2026-09-10', { cardId: k.id });
    const parcial = transfer({ kind: 'card', amount: 15000, date: '2026-10-05', fromAccountId: c.id, toCardId: k.id, invoiceMonth: '2026-09' });
    const i = input({ today: '2026-10-10', accounts: [c], cards: [k], entries: [compra], transfers: [parcial] });
    expect(cashNow(i)).toBe(500000 - 15000);
    expect(cardBalance(k, i.entries, [], i.transfers, i.today).debt).toBe(25000);
    expect(invoiceStatus(i, k, '2026-09').remaining).toBe(25000);
    expect(cashSnapshot(i).overdue).toBe(25000);
  });

  it('estorno abate a fatura', () => {
    const k = card({ closingDay: 25, dueDay: 5 });
    const compra = entry('out', 30000, '2026-09-10', { cardId: k.id });
    const estorno = entry('in', 30000, '2026-09-12', { cardId: k.id });
    expect(buildInvoice(k, [compra, estorno], [], '2026-09', '2026-09-20').total).toBe(0);
  });

  it('assinatura no cartão cobrada depois do fechamento entra na fatura seguinte', () => {
    const k = card({ closingDay: 25, dueDay: 5 });
    const s = subscription({ cardId: k.id, billingDay: 28, amount: 5590, startedAt: '2026-01-01' });
    expect(buildInvoice(k, [], [s], '2026-09', '2026-09-20').lines.map((l) => l.date)).toEqual(['2026-08-28']);
  });
});

describe('parcelas', () => {
  const k: Card = card();
  const parcelas = (total: number, count: number) => {
    const e: Entry = entry('out', Math.round(total / count), '2026-01-10', { cardId: k.id, repeat: { kind: 'installments', count, total } });
    const out: number[] = [];
    for (let m = 1; m <= count; m++) {
      const month = `2026-${String(m).padStart(2, '0')}`;
      for (const o of occurrencesInMonth([e], month, '2026-01-10')) out.push(o.amount);
    }
    return out;
  };

  it('R$ 1.200 em 12x são 12 × R$ 100', () => {
    expect(parcelas(120000, 12)).toEqual(Array(12).fill(10000));
  });

  it('R$ 100 em 3x fecha em R$ 100,00: 33,34 + 33,33 + 33,33', () => {
    const p = parcelas(10000, 3);
    expect(p).toEqual([3334, 3333, 3333]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('R$ 100 em 6x fecha em R$ 100,00', () => {
    expect(parcelas(10000, 6).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('R$ 0,01 em 1x e R$ 999.999,99 em 10x fecham', () => {
    expect(parcelas(1, 1)).toEqual([1]);
    expect(parcelas(99999999, 10).reduce((a, b) => a + b, 0)).toBe(99999999);
  });
});

describe('assinatura e dívida', () => {
  const c: Account = account({ primary: true, openingBalance: 100000, openingDate: '2026-01-01' });

  it('a cobrança real do extrato toma o lugar da prevista, com o valor do banco', () => {
    const s: Subscription = subscription({ amount: 4990, billingDay: 10 });
    const real = paid('out', 5590, '2026-09-11', { subscriptionId: s.id, description: 'NETFLIX.COM' });
    const i = input({ today: '2026-09-30', accounts: [c], subscriptions: [s], entries: [real] });
    const sep = monthSummary(i, '2026-09');
    expect(sep.expense).toBe(5590);
    // os meses sem cobrança real continuam com a prevista
    expect(monthSummary(i, '2026-08').expense).toBe(4990);
  });

  it('quitar a dívida não apaga do passado as parcelas pagas', () => {
    const d: Debt = debt({ installment: 20000, installments: 10, startMonth: '2026-06', dueDay: 15, settledAt: '2026-08-20T10:00:00Z' });
    const i = input({ today: '2026-09-30', accounts: [c], debts: [d] });
    expect(monthSummary(i, '2026-07').expense).toBe(20000);
    expect(monthSummary(i, '2026-08').expense).toBe(20000);
    expect(monthSummary(i, '2026-09').expense).toBe(0);
  });

  it('assinatura cancelada não cobra depois do cancelamento, em lugar nenhum', () => {
    const k = card({ closingDay: 25, dueDay: 5 });
    const s = subscription({ cardId: k.id, billingDay: 20, amount: 3000, canceledAt: '2026-09-15' });
    expect(buildInvoice(k, [], [s], '2026-09', '2026-09-30').total).toBe(0);
    expect(monthSummary(input({ today: '2026-09-30', subscriptions: [s], cards: [k] }), '2026-09').expense).toBe(0);
  });
});

describe('conferência com o banco', () => {
  it('saldo conferido que deixa de bater aparece com a diferença', () => {
    const c = account({
      primary: true,
      openingBalance: 100000,
      openingDate: '2026-09-01',
      checkpoints: [{ date: '2026-09-30', amount: 70000, source: 'extrato.ofx', at: 'x' }],
    });
    const certo = input({ today: '2026-09-30', accounts: [c], entries: [paid('out', 30000, '2026-09-10')] });
    expect(auditAccount(certo, c.id).checkpoints[0].diff).toBe(0);
    expect(auditAccount(certo, c.id).ok).toBe(true);

    // alguém apaga o lançamento depois de conferido
    const errado = input({ ...certo, entries: [] });
    const audit = auditAccount(errado, c.id);
    expect(audit.ok).toBe(false);
    expect(audit.checkpoints[0].diff).toBe(-30000);
  });
});
