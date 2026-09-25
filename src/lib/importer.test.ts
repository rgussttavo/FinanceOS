import { beforeEach, describe, expect, it } from 'vitest';
import { SPACE, card as makeCard, subscription as makeSub } from '@/test/build';
import { createAccount, ensurePrimaryAccount, loadLedger } from './accounts';
import { buildSeedCategories } from './categories';
import { virtualOccurrences } from './cashflow';
import { putRecord, selectDatabase } from './db';
import { buildReview, commitReview, type ImportTarget } from './importer';
import { balancesAt, cashNow } from './ledger';
import { occurrencesInMonth, summarizeMonth } from './occurrences';
import { parseDelimited, statementIntegrity, type ParsedStatement } from './statement';
import type { Account, Card, Subscription } from './types';
import { investedRealized } from './wealth';

/**
 * Do arquivo ao saldo, na base local de verdade.
 *
 * O que se prova aqui é a frase do documento de auditoria: se eu importar um
 * extrato bancário real, os números do app batem com o extrato.
 */

let n = 0;
// as categorias de todo espaço novo: é com elas que o app reconhece aporte, mercado, salário
const categories = buildSeedCategories(SPACE, (slug) => `cat-${slug}`);
let principal: Account;
let cartao: Card;

beforeEach(async () => {
  selectDatabase(`importador-${++n}`);
  principal = await ensurePrimaryAccount(SPACE);
  cartao = await putRecord('cards', makeCard({ name: 'Nubank', institution: 'Nubank' }));
});

const csv = (...lines: string[]) => ['Data;Histórico;Valor;Saldo', ...lines].join('\n');

const EXTRATO_43 = csv(
  '01/09/2026;SALDO ANTERIOR;;1.000,00',
  '02/09/2026;PIX RECEBIDO SALARIO;3.000,00;4.000,00',
  '03/09/2026;ALUGUEL;-500,00;3.500,00',
  '05/09/2026;MERCADO EXTRA;-200,00;3.300,00',
  '05/09/2026;UBER TRIP;-100,00;3.200,00',
  '10/09/2026;TED RECEBIDA JOAO;500,00;3.700,00',
  '15/09/2026;PAGAMENTO FATURA NUBANK;-250,00;3.450,00',
  '30/09/2026;SALDO DO DIA;;3.450,00',
);

async function importar(parsed: ParsedStatement, target: ImportTarget, subscriptions: Subscription[] = []) {
  const rows = await buildReview(parsed, { spaceId: SPACE, target, invert: false, categories, subscriptions });
  const result = await commitReview(rows, {
    spaceId: SPACE,
    target,
    source: 'csv',
    fileName: 'extrato.csv',
    balance: parsed.balance,
    useOpening: true,
  });
  return { rows, result };
}

async function resumo(month: string) {
  const l = await loadLedger(SPACE, '2026-09-30');
  const occ = [...occurrencesInMonth(l.entries, month, l.today), ...virtualOccurrences(l.subscriptions, l.debts, month, l.today, l.entries)];
  return summarizeMonth(occ, month, l.today);
}

describe('o extrato do cenário 43, do arquivo ao saldo', () => {
  it('o arquivo confere consigo mesmo antes de entrar', () => {
    const integ = statementIntegrity(parseDelimited(EXTRATO_43));
    expect(integ).toMatchObject({ checked: true, ok: true, sum: 245000, expectedClosing: 345000, diff: 0 });
    expect(integ.badDays).toEqual([]);
  });

  it('importado: o saldo do app é o do banco, e a reconciliação confere', async () => {
    const { result } = await importar(parseDelimited(EXTRATO_43), { type: 'account' });
    expect(result.openingSet).toEqual({ amount: 100000, date: '2026-09-01' });
    expect(result.reconciliation).toMatchObject({ declared: 345000, computed: 345000, diff: 0 });
    expect(cashNow(await loadLedger(SPACE, '2026-09-30'))).toBe(345000);
  });

  it('o pagamento da fatura sai da conta e não vira despesa', async () => {
    const { rows, result } = await importar(parseDelimited(EXTRATO_43), { type: 'account' });
    const pagamento = rows.find((r) => r.description.toLowerCase().includes('fatura'));
    expect(pagamento).toMatchObject({ status: 'transfer', payCardId: cartao.id, include: true });
    expect(result.transfers).toBe(1);
    const s = await resumo('2026-09');
    expect(s.expense).toBe(80000); // aluguel + mercado + uber
    expect(s.income).toBe(350000); // salário + TED de outra pessoa
  });

  it('importar o mesmo extrato de novo não duplica nada', async () => {
    await importar(parseDelimited(EXTRATO_43), { type: 'account' });
    const antes = cashNow(await loadLedger(SPACE, '2026-09-30'));
    const { rows, result } = await importar(parseDelimited(EXTRATO_43), { type: 'account' });
    expect(rows.every((r) => r.status === 'imported')).toBe(true);
    expect(result.created + result.transfers + result.settled).toBe(0);
    expect(cashNow(await loadLedger(SPACE, '2026-09-30'))).toBe(antes);
  });

  it('extrato em parte repetido: mantém o que existe e traz só o novo', async () => {
    await importar(parseDelimited(EXTRATO_43), { type: 'account' });
    const seguinte = parseDelimited(
      csv('10/09/2026;TED RECEBIDA JOAO;500,00;3.700,00', '15/09/2026;PAGAMENTO FATURA NUBANK;-250,00;3.450,00', '20/09/2026;FARMACIA;-45,90;3.404,10'),
    );
    const { rows, result } = await importar(seguinte, { type: 'account' });
    expect(rows.map((r) => r.status)).toEqual(['imported', 'imported', 'new']);
    expect(result.created).toBe(1);
    expect(cashNow(await loadLedger(SPACE, '2026-09-30'))).toBe(340410);
    expect(result.reconciliation?.diff).toBe(0);
  });

  it('linha deixada de fora aparece na reconciliação com o nome', async () => {
    const parsed = parseDelimited(EXTRATO_43);
    const rows = await buildReview(parsed, { spaceId: SPACE, target: { type: 'account' }, invert: false, categories });
    const semUber = rows.map((r) => (r.description.toLowerCase().includes('uber') ? { ...r, include: false } : r));
    const result = await commitReview(semUber, { spaceId: SPACE, target: { type: 'account' }, source: 'csv', balance: parsed.balance, useOpening: true });
    expect(result.reconciliation?.diff).toBe(-10000);
    expect(result.reconciliation?.left.map((l) => l.signed)).toEqual([-10000]);
  });
});

describe('o que não é receita nem despesa', () => {
  it('transferência entre suas contas: um registro, e o outro extrato se junta a ele', async () => {
    const poupanca = await createAccount({ spaceId: SPACE, name: 'Poupança', kind: 'savings', openingBalance: 0, openingDate: '2026-09-01' });
    await importar(
      parseDelimited(csv('01/09/2026;SALDO ANTERIOR;;1.000,00', '12/09/2026;TRANSFERENCIA ENTRE CONTAS MESMA TITULARIDADE;-300,00;700,00')),
      { type: 'account' },
    );
    const lado2 = await importar(parseDelimited(csv('12/09/2026;TRANSFERENCIA ENTRE CONTAS MESMA TITULARIDADE;300,00;300,00')), {
      type: 'account',
      accountId: poupanca.id,
    });
    expect(lado2.rows[0]).toMatchObject({ status: 'imported' });
    expect(lado2.result.linked).toBe(1);

    const l = await loadLedger(SPACE, '2026-09-30');
    expect(l.transfers).toHaveLength(1);
    const { accounts, total } = balancesAt(l, '2026-09-30');
    expect(accounts.find((a) => a.account.id === principal.id)?.balance).toBe(70000);
    expect(accounts.find((a) => a.account.id === poupanca.id)?.balance).toBe(30000);
    expect(total).toBe(100000);
    const s = await resumo('2026-09');
    expect(s.income).toBe(0);
    expect(s.expense).toBe(0);
  });

  it('resgate de aplicação volta para a conta, sai do investido e não é renda', async () => {
    await importar(parseDelimited(csv('01/09/2026;SALDO ANTERIOR;;0,00', '05/09/2026;APLICACAO CDB;-2.000,00;-2.000,00', '20/09/2026;RESGATE CDB;500,00;-1.500,00')), {
      type: 'account',
    });
    const l = await loadLedger(SPACE, '2026-09-30');
    expect(cashNow(l)).toBe(-150000);
    expect((await resumo('2026-09')).income).toBe(0);
    expect(investedRealized(l.entries, '2026-09-30', '2026-09-30')).toBe(150000);
  });

  it('cobrança de assinatura no extrato toma o lugar da prevista, com o valor do banco', async () => {
    const netflix = await putRecord('subscriptions', makeSub({ name: 'Netflix', amount: 4990, billingDay: 10, startedAt: '2026-01-01' }));
    const { rows } = await importar(parseDelimited(csv('01/09/2026;SALDO ANTERIOR;;1.000,00', '11/09/2026;NETFLIX.COM;-55,90;944,10')), { type: 'account' }, [netflix]);
    expect(rows[0]).toMatchObject({ status: 'subscription', subscriptionId: netflix.id, include: true });
    expect((await resumo('2026-09')).expense).toBe(5590);
    expect(cashNow(await loadLedger(SPACE, '2026-09-30'))).toBe(94410);
  });
});
