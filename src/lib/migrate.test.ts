import { beforeEach, describe, expect, it } from 'vitest';
import { SPACE, entry, paid } from '@/test/build';
import { loadLedger, primaryIdFor, setBalance } from './accounts';
import { db, putRecord, selectDatabase } from './db';
import { auditAccount, balancesAt, cashNow } from './ledger';
import { migrateLedger } from './migrate';
import { OPENING_TAG } from './occurrences';
import type { Entry } from './types';

/**
 * A migração do "saldo do mês anterior" para o livro-caixa, na base local de
 * verdade. A regra que ela não pode quebrar: todo saldo que a pessoa informou
 * continua valendo na data em que ela informou.
 */

let dbCount = 0;
beforeEach(async () => {
  selectDatabase(`migracao-${++dbCount}`);
});

const opening = (amount: number, date: string): Entry =>
  paid(amount >= 0 ? 'in' : 'out', Math.abs(amount), date, { tags: [OPENING_TAG], description: 'Saldo do mês anterior' });

describe('migração do saldo anterior', () => {
  it('o primeiro vira saldo inicial; os seguintes, ajustes que mantêm o número informado', async () => {
    const rows = [
      opening(100000, '2026-08-01'),
      paid('in', 300000, '2026-08-05'),
      paid('out', 120000, '2026-08-10'),
      // no fim de agosto o app calcularia 2.800; a pessoa informou 2.500 em setembro
      opening(250000, '2026-09-01'),
      paid('out', 40000, '2026-09-03'),
    ];
    for (const r of rows) await putRecord('entries', r);

    const result = await migrateLedger(SPACE);
    expect(result.migrated).toBe(2);
    expect(result.backupId).toBeTruthy();

    const ledger = await loadLedger(SPACE, '2026-09-10');
    const principal = ledger.accounts.find((a) => a.id === primaryIdFor(SPACE));
    expect(principal).toMatchObject({ openingBalance: 100000, openingDate: '2026-08-01', primary: true });

    // o que a pessoa informou continua valendo exatamente onde ela informou
    expect(balancesAt(ledger, '2026-07-31').total).toBe(100000);
    expect(balancesAt(ledger, '2026-08-31').total).toBe(250000);
    expect(cashNow(ledger)).toBe(210000);

    // o ajuste é visível e não é receita nem despesa
    const adj = ledger.transfers.filter((t) => t.kind === 'adjustment');
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ amount: 30000, direction: 'out', date: '2026-08-31' });

    // os lançamentos antigos saíram (excluídos, não apagados), e a cópia existe
    expect(ledger.entries.some((e) => e.tags.includes(OPENING_TAG))).toBe(false);
    expect((await db().entries.toArray()).filter((e) => e.tags.includes(OPENING_TAG)).every((e) => e.deletedAt)).toBe(true);
    expect(await db().files.get(result.backupId as string)).toBeTruthy();

    // e a conta inteira confere com os saldos informados
    expect(auditAccount(ledger, primaryIdFor(SPACE)).ok).toBe(true);
  });

  it('rodar duas vezes não muda nada nem duplica', async () => {
    for (const r of [opening(100000, '2026-08-01'), paid('in', 5000, '2026-08-05'), opening(90000, '2026-09-01')]) {
      await putRecord('entries', r);
    }
    await migrateLedger(SPACE);
    const before = cashNow(await loadLedger(SPACE, '2026-09-10'));
    const again = await migrateLedger(SPACE);
    expect(again.migrated).toBe(0);
    const ledger = await loadLedger(SPACE, '2026-09-10');
    expect(cashNow(ledger)).toBe(before);
    expect(ledger.accounts).toHaveLength(1);
    expect(ledger.transfers).toHaveLength(1);
  });

  it('espaço sem saldo anterior ganha só a conta principal', async () => {
    await putRecord('entries', paid('out', 1000, '2026-09-03'));
    const result = await migrateLedger(SPACE);
    expect(result).toEqual({ migrated: 0, backupId: null });
    const ledger = await loadLedger(SPACE, '2026-09-10');
    expect(ledger.accounts.map((a) => a.id)).toEqual([primaryIdFor(SPACE)]);
    expect(cashNow(ledger)).toBe(-1000);
  });
});

describe('"hoje eu tenho X"', () => {
  it('conta sem ponto de partida: vira o saldo inicial de hoje, contando o que já aconteceu hoje', async () => {
    await putRecord('entries', paid('out', 30000, '2026-09-01'));
    await putRecord('entries', paid('out', 1500, '2026-09-10'));
    const r = await setBalance({ spaceId: SPACE, balance: 500000, date: '2026-09-10' });
    expect(r.kind).toBe('opening');
    const ledger = await loadLedger(SPACE, '2026-09-10');
    expect(cashNow(ledger)).toBe(500000);
    // o gasto de 01/09 já está dentro dos 5.000: não sai de novo
    expect(balancesAt(ledger, '2026-09-10').total).toBe(500000);
  });

  it('conta com histórico: vira um ajuste pela diferença exata, e só isso', async () => {
    await setBalance({ spaceId: SPACE, balance: 100000, date: '2026-09-01' });
    await putRecord('entries', paid('out', 20000, '2026-09-05'));
    // o app diz 800; o banco diz 672,50
    const r = await setBalance({ spaceId: SPACE, balance: 67250, date: '2026-09-10' });
    expect(r).toMatchObject({ kind: 'adjustment', diff: -12750 });
    const ledger = await loadLedger(SPACE, '2026-09-10');
    expect(cashNow(ledger)).toBe(67250);
    // nenhum lançamento foi alterado para o número bater
    expect(ledger.entries.map((e) => e.amount)).toEqual([20000]);
  });

  it('se já bate, não cria ajuste', async () => {
    await setBalance({ spaceId: SPACE, balance: 100000, date: '2026-09-01' });
    await putRecord('entries', entry('out', 20000, '2026-09-05', { settled: { '2026-09': { at: 'x' } } }));
    const r = await setBalance({ spaceId: SPACE, balance: 80000, date: '2026-09-10' });
    expect(r.kind).toBe('none');
    expect((await loadLedger(SPACE)).transfers).toHaveLength(0);
  });
});

describe('saldo informado é o de um instante', () => {
  it('a transferência feita depois, no mesmo dia, não quebra a conferência', async () => {
    const { createAccount, createTransfer } = await import('./accounts');
    const { todayIso } = await import('./dates');
    const { vi } = await import('vitest');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T09:00:00'));
    const hoje = todayIso();
    await setBalance({ spaceId: SPACE, balance: 500000, date: hoje });
    // a transferência vem à tarde
    vi.setSystemTime(new Date('2026-09-24T15:00:00'));
    const principal = (await loadLedger(SPACE, hoje)).accounts[0];
    const poupanca = await createAccount({ spaceId: SPACE, name: 'Poupança', openingBalance: 100000, openingDate: hoje });
    await createTransfer({ spaceId: SPACE, kind: 'account', amount: 30000, date: hoje, fromAccountId: principal.id, toAccountId: poupanca.id });
    const ledger = await loadLedger(SPACE, hoje);
    expect(balancesAt(ledger, hoje).total).toBe(600000);
    expect(auditAccount(ledger, principal.id).ok).toBe(true);
    vi.useRealTimers();
  });
});
