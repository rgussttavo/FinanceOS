import { cleanDescription } from './categories';
import { auditAccount, invoiceStatus, ledgerAccounts, type LedgerInput } from './ledger';
import { formatMoney } from './money';
import { OPENING_TAG } from './occurrences';
import type { Category, Entry } from './types';

/**
 * A conferência dos dados que já estão na base.
 *
 * O app não pode supor que o que foi gravado está certo: veio de versões
 * antigas, de dois aparelhos, de imports que o leitor antigo lia errado. Aqui
 * se procura o que não deveria existir — e só se aponta. Nada é apagado nem
 * corrigido sozinho: cada achado diz o que é e onde está, e a pessoa decide.
 */

export type Severity = 'erro' | 'aviso';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** os registros envolvidos, para a tela levar até eles */
  refs: { table: 'entries' | 'transfers' | 'accounts' | 'cards' | 'subscriptions'; id: string; label: string }[];
}

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function validDate(d: string | null | undefined): boolean {
  if (!d || !ISO.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const check = new Date(y, m - 1, day);
  return check.getFullYear() === y && check.getMonth() === m - 1 && check.getDate() === day;
}

const validCents = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v > 0;

export function diagnose(input: LedgerInput, categories: Category[]): Finding[] {
  const out: Finding[] = [];
  const entries = input.entries.filter((e) => !e.deletedAt);
  const transfers = input.transfers.filter((t) => !t.deletedAt);
  const liveAccounts = new Set(input.accounts.filter((a) => !a.deletedAt).map((a) => a.id));
  const liveCards = new Set(input.cards.filter((c) => !c.deletedAt).map((c) => c.id));
  const anyCard = new Set(input.cards.map((c) => c.id));
  const liveCategories = new Set(categories.filter((c) => !c.deletedAt).map((c) => c.id));
  const label = (e: Entry) => `${e.description} · ${e.date}`;

  // o mesmo identificador de extrato em dois lançamentos: importado duas vezes
  const byExternal = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!e.externalId) continue;
    byExternal.set(e.externalId, [...(byExternal.get(e.externalId) ?? []), e]);
  }
  for (const [ext, list] of byExternal) {
    if (list.length < 2) continue;
    out.push({
      id: `dup-ext:${ext}`,
      severity: 'erro',
      title: 'Linha de extrato importada mais de uma vez',
      detail: `${list.length} lançamentos vieram da mesma linha do extrato (${list[0].description}, ${formatMoney(list[0].amount)}). Só um deveria existir.`,
      refs: list.map((e) => ({ table: 'entries', id: e.id, label: label(e) })),
    });
  }

  // o mesmo gasto lançado à mão e importado: mesmo dia, valor, sentido e descrição
  const seen = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.repeat.kind !== 'once') continue;
    const k = `${e.date}|${e.amount}|${e.kind}|${e.cardId ?? e.accountId ?? ''}|${cleanDescription(e.description)}`;
    seen.set(k, [...(seen.get(k) ?? []), e]);
  }
  for (const [k, list] of seen) {
    // dois do mesmo arquivo são duas compras de verdade (dois cafés); o suspeito é origem diferente
    const sources = new Set(list.map((e) => e.externalId ?? 'manual'));
    if (list.length < 2 || sources.size < 2) continue;
    out.push({
      id: `dup-prob:${k}`,
      severity: 'aviso',
      title: 'Possível lançamento duplicado',
      detail: `${list[0].description}, ${formatMoney(list[0].amount)} em ${list[0].date}, aparece ${list.length} vezes vindo de lugares diferentes (lançado à mão e importado, ou de dois arquivos). Se for o mesmo, apague um.`,
      refs: list.map((e) => ({ table: 'entries', id: e.id, label: label(e) })),
    });
  }

  for (const e of entries) {
    if (!validCents(e.amount)) {
      out.push({
        id: `valor:${e.id}`,
        severity: 'erro',
        title: 'Valor inválido',
        detail: `"${e.description}" tem valor ${String(e.amount)}, que não é um valor em centavos maior que zero.`,
        refs: [{ table: 'entries', id: e.id, label: label(e) }],
      });
    }
    if (!validDate(e.date)) {
      out.push({
        id: `data:${e.id}`,
        severity: 'erro',
        title: 'Data inválida',
        detail: `"${e.description}" tem a data "${e.date}", que não é um dia do calendário.`,
        refs: [{ table: 'entries', id: e.id, label: e.description }],
      });
    }
    if (e.accountId && !liveAccounts.has(e.accountId)) {
      out.push({
        id: `conta:${e.id}`,
        severity: 'aviso',
        title: 'Lançamento de uma conta que não existe mais',
        detail: `"${e.description}" aponta para uma conta excluída. O saldo dele está sendo contado na conta principal.`,
        refs: [{ table: 'entries', id: e.id, label: label(e) }],
      });
    }
    if (e.cardId && !liveCards.has(e.cardId)) {
      out.push({
        id: `cartao:${e.id}`,
        severity: 'aviso',
        title: anyCard.has(e.cardId) ? 'Compra de um cartão excluído' : 'Compra de um cartão desconhecido',
        detail: `"${e.description}" (${formatMoney(e.amount)}) é de um cartão que não está mais no app, e não entra em fatura nem em saldo nenhum.`,
        refs: [{ table: 'entries', id: e.id, label: label(e) }],
      });
    }
    if (e.categoryId && !liveCategories.has(e.categoryId)) {
      out.push({
        id: `categoria:${e.id}`,
        severity: 'aviso',
        title: 'Categoria que não existe mais',
        detail: `"${e.description}" aponta para uma categoria excluída; nos relatórios ele aparece sem categoria.`,
        refs: [{ table: 'entries', id: e.id, label: label(e) }],
      });
    }
    if (e.repeat.kind === 'installments' && !(Number.isInteger(e.repeat.count) && (e.repeat.count ?? 0) >= 1)) {
      out.push({
        id: `parcela:${e.id}`,
        severity: 'erro',
        title: 'Parcelamento sem número de parcelas',
        detail: `"${e.description}" é parcelado, mas não diz em quantas vezes.`,
        refs: [{ table: 'entries', id: e.id, label: label(e) }],
      });
    }
    if (e.tags.includes(OPENING_TAG)) {
      out.push({
        id: `saldo-antigo:${e.id}`,
        severity: 'aviso',
        title: '"Saldo do mês anterior" ainda não convertido',
        detail: 'Um lançamento de saldo anterior da versão antiga ainda existe. Ele é convertido sozinho ao abrir o app; se continuar aqui, avise.',
        refs: [{ table: 'entries', id: e.id, label: label(e) }],
      });
    }
  }

  for (const t of transfers) {
    const refs: Finding['refs'] = [{ table: 'transfers', id: t.id, label: `${t.description} · ${t.date}` }];
    if (!validCents(t.amount) || !validDate(t.date)) {
      out.push({ id: `transf-valor:${t.id}`, severity: 'erro', title: 'Transferência com valor ou data inválidos', detail: `${t.description}: ${String(t.amount)} em "${t.date}".`, refs });
    }
    const missing =
      (t.fromAccountId && !liveAccounts.has(t.fromAccountId)) ||
      (t.kind === 'account' && (!t.toAccountId || !liveAccounts.has(t.toAccountId))) ||
      (t.kind === 'card' && (!t.toCardId || !liveCards.has(t.toCardId)));
    if (missing) {
      out.push({
        id: `transf-ref:${t.id}`,
        severity: 'erro',
        title: 'Transferência pela metade',
        detail: `${t.description} (${formatMoney(t.amount)}) aponta para uma conta ou cartão que não existe mais. Um dos lados está sendo contado na conta principal.`,
        refs,
      });
    }
    if (t.kind === 'account' && t.fromAccountId && t.fromAccountId === t.toAccountId) {
      out.push({ id: `transf-mesma:${t.id}`, severity: 'erro', title: 'Transferência para a própria conta', detail: `${t.description}: origem e destino são a mesma conta.`, refs });
    }
  }

  // uma e só uma conta principal
  const primaries = input.accounts.filter((a) => !a.deletedAt && a.primary);
  if (input.accounts.some((a) => !a.deletedAt) && primaries.length !== 1) {
    out.push({
      id: 'principal',
      severity: 'aviso',
      title: primaries.length ? 'Mais de uma conta principal' : 'Nenhuma conta principal',
      detail: 'Lançamento sem conta cai na principal. Escolha uma em Contas › Editar › Tornar principal.',
      refs: primaries.map((a) => ({ table: 'accounts', id: a.id, label: a.name })),
    });
  }

  // saldo conferido com o banco que deixou de bater
  for (const a of ledgerAccounts(input.accounts)) {
    if (a.deletedAt) continue;
    const audit = auditAccount(input, a.id);
    for (const c of audit.checkpoints) {
      if (c.diff === 0) continue;
      out.push({
        id: `conferido:${a.id}:${c.date}`,
        severity: 'erro',
        title: 'Saldo conferido que deixou de bater',
        detail: `${a.name}: o banco disse ${formatMoney(c.declared)} em ${c.date} (${c.source}), e o app calcula ${formatMoney(c.computed)} — diferença de ${formatMoney(c.diff, { signed: true })}. Algo nesse período foi apagado, alterado ou lançado depois da conferência.`,
        refs: [{ table: 'accounts', id: a.id, label: a.name }],
      });
    }
  }

  // fatura paga a mais que o total: pagamento duplicado ou na fatura errada
  const months = new Set(transfers.filter((t) => t.kind === 'card' && t.invoiceMonth).map((t) => `${t.toCardId}|${t.invoiceMonth}`));
  for (const key of months) {
    const [cardId, month] = key.split('|');
    const card = input.cards.find((c) => c.id === cardId && !c.deletedAt);
    if (!card) continue;
    const st = invoiceStatus(input, card, month);
    if (st.paid > st.total && st.total >= 0) {
      out.push({
        id: `fatura-a-mais:${key}`,
        severity: 'aviso',
        title: 'Fatura paga a mais',
        detail: `A fatura de ${month} de ${card.name || card.institution} soma ${formatMoney(st.total)}, mas tem ${formatMoney(st.paid)} em pagamentos. Pode ser pagamento duplicado ou registrado na fatura errada.`,
        refs: st.payments.map((t) => ({ table: 'transfers', id: t.id, label: `${t.description} · ${t.date}` })),
      });
    }
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'erro' ? -1 : 1));
}
