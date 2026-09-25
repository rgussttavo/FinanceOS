import { ensurePrimaryAccount, loadLedger } from './accounts';
import { audit, db, deleteRecord, putRecord } from './db';
import { addDaysIso, nowInstant, todayIso } from './dates';
import { balancesAt } from './ledger';
import { OPENING_TAG } from './occurrences';
import type { Account, Entry, Transfer } from './types';

/**
 * Do "saldo do mês anterior" ao livro-caixa.
 *
 * Antes das contas, o saldo era refeito todo mês a partir de um lançamento
 * marcado "saldo-anterior" que a pessoa informava. O livro-caixa não precisa
 * dele: o saldo corre de um mês para o outro sozinho. Esta migração converte
 * o que existe SEM MUDAR nenhum número que a pessoa informou:
 *
 *   - o primeiro "saldo anterior" vira o saldo inicial da conta principal,
 *     na mesma data;
 *   - cada "saldo anterior" seguinte vira um ajuste de saldo pela diferença
 *     exata entre o que ela informou e o que o livro-caixa calcula para aquela
 *     data — então, naquele dia, o saldo continua sendo o informado;
 *   - os lançamentos "saldo anterior" são excluídos (exclusão reversível: ficam
 *     marcados, não somem da base), porque somariam em dobro com o novo saldo.
 *
 * Antes de mexer, uma cópia de tudo vai para a base local. Os ids são
 * derivados dos registros de origem: dois aparelhos que migrem o mesmo espaço
 * produzem os mesmos registros, e nada se duplica quando eles se encontram.
 */
export async function migrateLedger(spaceId: string): Promise<{ migrated: number; backupId: string | null }> {
  const d = db();
  const openings = (await d.entries.where('spaceId').equals(spaceId).toArray())
    .filter((e) => !e.deletedAt && e.tags.includes(OPENING_TAG))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const primary = await ensurePrimaryAccount(spaceId);
  if (!openings.length) return { migrated: 0, backupId: null };

  const backupId = await backup(spaceId);

  let account: Account = primary;
  const signedOf = (e: Entry) => (e.kind === 'in' ? e.amount : -e.amount);
  const noStart = !account.openingDate && account.openingBalance === 0 && !(account.checkpoints?.length ?? 0);

  let rest = openings;
  if (noStart) {
    const first = openings[0];
    account = await putRecord('accounts', { ...account, openingBalance: signedOf(first), openingDate: first.date });
    rest = openings.slice(1);
  }

  // os ajustes entram um a um, cada um sobre o saldo que os anteriores deixaram
  for (const e of rest) {
    const dayBefore = addDaysIso(e.date, -1);
    const ledger = await loadLedger(spaceId, todayIso());
    const computed = balancesAt(ledger, dayBefore).accounts.find((a) => a.account.id === account.id)?.balance ?? 0;
    const diff = signedOf(e) - computed;
    const at = nowInstant();
    if (diff !== 0) {
      const adj: Transfer = {
        id: `ajuste-${e.id}`,
        spaceId,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
        kind: 'adjustment',
        date: dayBefore,
        amount: Math.abs(diff),
        direction: diff > 0 ? 'in' : 'out',
        description: 'Saldo informado no começo do mês (ajuste)',
        fromAccountId: account.id,
        toAccountId: null,
        toCardId: null,
        invoiceMonth: null,
        notes: `Convertido do "saldo do mês anterior" de ${e.date.slice(0, 7)}.`,
        externalIds: [],
        source: 'manual',
      };
      await putRecord('transfers', adj);
    }
    account = await putRecord('accounts', {
      ...account,
      checkpoints: [...(account.checkpoints ?? []), { date: dayBefore, amount: signedOf(e), source: 'saldo informado no mês', at }],
    });
  }

  for (const e of openings) await deleteRecord('entries', e.id);

  await audit(spaceId, 'ledger.migrated', {
    openings: openings.map((e) => ({ id: e.id, date: e.date, amount: signedOf(e) })),
    account: account.id,
    backupId,
  });
  return { migrated: openings.length, backupId };
}

/** uma cópia de tudo o que o espaço tem, na base local, antes de qualquer conversão */
async function backup(spaceId: string): Promise<string> {
  const d = db();
  const tables = ['accounts', 'entries', 'transfers', 'cards', 'subscriptions', 'debts', 'goals', 'categories', 'settings'] as const;
  const dump: Record<string, unknown[]> = {};
  for (const t of tables) dump[t] = await d[t].where('spaceId').equals(spaceId).toArray();
  const id = `backup-${spaceId}-${Date.now()}`;
  const blob = new Blob([JSON.stringify({ spaceId, at: nowInstant(), reason: 'migração para o livro-caixa', dump })], {
    type: 'application/json',
  });
  await d.files.put({ id, blob, savedAt: nowInstant() });
  return id;
}
