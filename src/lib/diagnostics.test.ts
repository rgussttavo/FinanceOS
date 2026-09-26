import { describe, expect, it } from 'vitest';
import { account, card, entry, paid, transfer } from '@/test/build';
import { diagnose } from './diagnostics';
import type { LedgerInput } from './ledger';

const base = (parts: Partial<LedgerInput>): LedgerInput => ({
  accounts: [],
  entries: [],
  transfers: [],
  cards: [],
  subscriptions: [],
  debts: [],
  cardsEnabled: true,
  today: '2026-09-30',
  ...parts,
});

const titles = (i: LedgerInput) => diagnose(i, []).map((f) => f.title);

describe('conferência dos dados', () => {
  it('base limpa não acusa nada', () => {
    const c = account({ primary: true });
    expect(diagnose(base({ accounts: [c], entries: [paid('out', 1000, '2026-09-10')] }), [])).toEqual([]);
  });

  it('linha de extrato importada duas vezes', () => {
    const a = paid('out', 1000, '2026-09-10', { externalId: 'csv:acct:x' });
    const b = paid('out', 1000, '2026-09-10', { externalId: 'csv:acct:x' });
    expect(titles(base({ entries: [a, b] }))).toContain('Linha de extrato importada mais de uma vez');
  });

  it('o mesmo gasto lançado à mão e importado', () => {
    const manual = paid('out', 4590, '2026-09-10', { description: 'Farmácia' });
    const importado = paid('out', 4590, '2026-09-10', { description: 'FARMACIA', externalId: 'csv:acct:y' });
    expect(titles(base({ entries: [manual, importado] }))).toContain('Possível lançamento duplicado');
  });

  it('dois cafés iguais do mesmo arquivo não são duplicata', () => {
    const a = paid('out', 600, '2026-09-10', { description: 'Café', externalId: 'csv:acct:1' });
    const b = paid('out', 600, '2026-09-10', { description: 'Café', externalId: 'csv:acct:2' });
    // origens diferentes em identificador, mas as duas vieram do extrato: dois cafés
    const r = diagnose(base({ entries: [a, b] }), []);
    expect(r.filter((f) => f.title === 'Linha de extrato importada mais de uma vez')).toEqual([]);
  });

  it('valor e data inválidos, parcela sem número', () => {
    const t = titles(
      base({
        entries: [
          entry('out', 10.5, '2026-09-10'),
          entry('out', 1000, '2026-02-30'),
          entry('out', 1000, '2026-09-10', { repeat: { kind: 'installments' } }),
        ],
      }),
    );
    expect(t).toEqual(expect.arrayContaining(['Valor inválido', 'Data inválida', 'Parcelamento sem número de parcelas']));
  });

  it('transferência pela metade e compra de cartão excluído', () => {
    const c = account({ primary: true });
    const excluido = card({ deletedAt: '2026-09-01T00:00:00Z' });
    const t = titles(
      base({
        accounts: [c],
        cards: [excluido],
        entries: [entry('out', 5000, '2026-09-10', { cardId: excluido.id })],
        transfers: [transfer({ kind: 'account', amount: 1000, date: '2026-09-10', fromAccountId: c.id, toAccountId: 'sumiu' })],
      }),
    );
    expect(t).toEqual(expect.arrayContaining(['Transferência pela metade', 'Compra de um cartão excluído']));
  });

  it('saldo conferido que deixou de bater', () => {
    const c = account({ primary: true, openingBalance: 100000, openingDate: '2026-09-01', checkpoints: [{ date: '2026-09-20', amount: 90000, source: 'extrato.ofx', at: 'x' }] });
    const f = diagnose(base({ accounts: [c], entries: [] }), []);
    expect(f[0]).toMatchObject({ title: 'Saldo conferido que deixou de bater', severity: 'erro' });
    expect(f[0].detail).toContain('diferença de');
  });
});

describe('FIN-008', () => {
  it('gasto lançado à mão sem conta (versão antiga) e o mesmo gasto importado na principal', () => {
    const p = account({ id: 'principal-x', primary: true });
    const manual = paid('out', 4590, '2026-09-10', { description: 'Farmácia', accountId: null });
    const importado = paid('out', 4590, '2026-09-10', { description: 'FARMACIA', accountId: 'principal-x', externalId: 'csv:acct:1' });
    expect(titles(base({ accounts: [p], entries: [manual, importado] }))).toContain('Possível lançamento duplicado');
  });

  it('o mesmo gasto em contas diferentes não é duplicata', () => {
    const p = account({ id: 'principal-x', primary: true });
    const outra = account({ id: 'poupanca' });
    const a = paid('out', 4590, '2026-09-10', { description: 'Farmácia', accountId: null });
    const b = paid('out', 4590, '2026-09-10', { description: 'FARMACIA', accountId: 'poupanca', externalId: 'csv:acct:poupanca:1' });
    expect(titles(base({ accounts: [p, outra], entries: [a, b] }))).not.toContain('Possível lançamento duplicado');
  });
});
