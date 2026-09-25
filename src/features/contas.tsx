'use client';

import * as React from 'react';
import { ArrowLeftRight, Check, ChevronRight, CircleAlert, Landmark, Plus, Scale } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  SectionTitle,
  Select,
  Sheet,
  SignToggle,
  Skeleton,
  confirmAction,
  toast,
} from '@/components/ui';
import { navigate } from '@/components/shell';
import {
  createAccount,
  createTransfer,
  makePrimary,
  removeAccount,
  removeTransfer,
  setBalance,
  updateAccount,
  updateTransfer,
} from '@/lib/accounts';
import { cn } from '@/lib/cn';
import { formatDateFull, formatDayShort, todayIso } from '@/lib/dates';
import { auditAccount, balancesAt, type AccountAudit, type AccountBalance } from '@/lib/ledger';
import { formatMoney, parseMoney } from '@/lib/money';
import { ledgerInput, type FinanceBase } from '@/lib/picture';
import type { Account, AccountKind, Cents, Transfer } from '@/lib/types';

/**
 * As contas: quanto tem em cada uma, e de onde veio cada centavo.
 *
 * A lista mostra o saldo de cada conta e se ele confere com o que o banco
 * declarou. Aberta, a conta vira um extrato: saldo inicial, cada movimento com
 * o saldo depois dele, e os saldos do banco lado a lado com os do app. Nenhum
 * número daqui é calculado nesta tela — tudo vem do livro-caixa, o mesmo do
 * Início, do Patrimônio e do assistente.
 */

const KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro / carteira',
  broker: 'Corretora / investimentos',
  other: 'Outra',
};

export function ContasView({
  spaceId,
  base,
  cardsEnabled,
  hidden,
  param,
}: {
  spaceId: string;
  base: FinanceBase;
  cardsEnabled: boolean;
  hidden: boolean;
  /** conta aberta, vinda da URL */
  param?: string;
}) {
  const today = todayIso();
  const input = React.useMemo(() => ledgerInput(base, cardsEnabled, today), [base, cardsEnabled, today]);
  const balances = React.useMemo(() => balancesAt(input, today), [input, today]);
  const [creating, setCreating] = React.useState(false);
  const [transferring, setTransferring] = React.useState<Transfer | 'new' | null>(null);

  if (!base.ready) {
    return (
      <div className="grid gap-3 pt-2">
        <Skeleton className="h-24 rounded-panel" />
        <Skeleton className="h-40 rounded-panel" />
      </div>
    );
  }

  const open = param ? balances.accounts.find((r) => r.account.id === param) : null;
  if (open) {
    return (
      <>
        <AccountDetail
          spaceId={spaceId}
          row={open}
          audit={auditAccount(input, open.account.id)}
          accounts={balances.accounts.map((r) => r.account)}
          transfers={base.transfers}
          hidden={hidden}
          onTransfer={(t) => setTransferring(t)}
        />
        <TransferSheet
          spaceId={spaceId}
          open={transferring !== null}
          editing={transferring === 'new' ? null : transferring}
          defaultFrom={open.account.id}
          accounts={balances.accounts.map((r) => r.account).filter((a) => !a.archived)}
          onClose={() => setTransferring(null)}
        />
      </>
    );
  }

  const visible = balances.accounts.filter((r) => !r.account.archived || r.balance !== 0);
  const registered = base.accounts.length > 0;

  return (
    <div className="grid gap-4 pt-1">
      <Panel className="p-5">
        <p className="text-[12px] text-ink-3">Em todas as contas, hoje</p>
        <p className={cn('amount mt-1 text-[34px]', balances.total < 0 ? 'text-out' : 'text-ink')}>
          {formatMoney(balances.total, { hidden, signed: balances.total < 0 })}
        </p>
        <p className="mt-2 text-[13px] text-ink-3">
          Só o que já aconteceu: conta vencida e não paga ainda está aqui dentro, e receita futura ainda não.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={15} className="mr-1.5" /> Nova conta
          </Button>
          <Button onClick={() => setTransferring('new')} disabled={balances.accounts.filter((r) => !r.account.archived).length < 2}>
            <ArrowLeftRight size={15} className="mr-1.5" /> Transferir
          </Button>
        </div>
      </Panel>

      <Panel className="px-2 py-2">
        {visible.map((r) => (
          <AccountRow key={r.account.id} row={r} audit={auditAccount(input, r.account.id)} hidden={hidden} />
        ))}
        {!registered ? (
          <p className="px-3 pb-3 pt-1 text-[12px] text-ink-3">
            Esta é a conta onde cai tudo que não diz de qual conta é. Dê um nome e informe o saldo de hoje para ela bater com o banco.
          </p>
        ) : null}
      </Panel>

      <CreateAccountSheet spaceId={spaceId} open={creating} onClose={() => setCreating(false)} />
      <TransferSheet
        spaceId={spaceId}
        open={transferring !== null}
        editing={transferring === 'new' ? null : transferring}
        accounts={balances.accounts.map((r) => r.account).filter((a) => !a.archived)}
        onClose={() => setTransferring(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- lista */

function CheckStatus({ audit, hidden }: { audit: AccountAudit; hidden: boolean }) {
  const last = audit.checkpoints[audit.checkpoints.length - 1];
  const wrong = audit.checkpoints.filter((c) => c.diff !== 0);
  if (wrong.length) {
    const first = wrong[0];
    return (
      <Badge tone="warn">
        <CircleAlert size={12} /> diferença de {formatMoney(Math.abs(first.diff), { hidden })} em {formatDayShort(first.date)}
      </Badge>
    );
  }
  if (last) {
    return (
      <Badge tone="in">
        <Check size={12} /> conferido em {formatDayShort(last.date)}
      </Badge>
    );
  }
  if (!audit.openingDate && audit.opening === 0) return <Badge>saldo não informado</Badge>;
  return null;
}

function AccountRow({ row, audit, hidden }: { row: AccountBalance; audit: AccountAudit; hidden: boolean }) {
  const a = row.account;
  return (
    <button
      type="button"
      onClick={() => navigate({ view: 'contas', param: a.id })}
      className="flex w-full items-center gap-3 rounded-field px-3 py-3 text-left transition-colors hover:bg-surface-2"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-field bg-surface-2 text-ink-3">
        <Landmark size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] text-ink">{a.name}</span>
          {a.primary ? <span className="text-[11px] text-ink-3">principal</span> : null}
          {a.archived ? <span className="text-[11px] text-ink-3">arquivada</span> : null}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-ink-3">{a.institution || KIND_LABEL[a.kind]}</span>
          <CheckStatus audit={audit} hidden={hidden} />
        </span>
      </span>
      <span className={cn('tnum shrink-0 text-[15px] font-semibold', row.balance < 0 ? 'text-out' : 'text-ink')}>
        {formatMoney(row.balance, { hidden, signed: row.balance < 0 })}
      </span>
      <ChevronRight size={16} className="shrink-0 text-ink-3" />
    </button>
  );
}

/* ----------------------------------------------------------------- detalhe */

function AccountDetail({
  spaceId,
  row,
  audit,
  accounts,
  transfers,
  hidden,
  onTransfer,
}: {
  spaceId: string;
  row: AccountBalance;
  audit: AccountAudit;
  accounts: Account[];
  transfers: Transfer[];
  hidden: boolean;
  onTransfer: (t: Transfer | 'new') => void;
}) {
  const a = row.account;
  const [checking, setChecking] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [limit, setLimit] = React.useState(60);
  const lines = audit.lines.slice().reverse();
  const m = (v: Cents, signed = false) => formatMoney(v, { hidden, signed });

  return (
    <div className="grid gap-4 pt-1">
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-ink-3">{a.institution || KIND_LABEL[a.kind]}</p>
            <p className="truncate font-display text-[24px] text-ink">{a.name}</p>
          </div>
          <CheckStatus audit={audit} hidden={hidden} />
        </div>
        <p className={cn('amount mt-3 text-[32px]', row.balance < 0 ? 'text-out' : 'text-ink')}>{m(row.balance, row.balance < 0)}</p>

        {/* a conta à mostra: o saldo é exatamente esta soma, e dá para refazer à mão */}
        <dl className="mt-4 grid gap-1.5 rounded-field bg-surface-2 px-3 py-3 text-[13px]">
          <Line label={audit.openingDate ? `Saldo inicial em ${formatDayShort(audit.openingDate)}` : 'Saldo inicial'} value={m(audit.opening, true)} />
          <Line label="Entradas" value={m(row.inflow)} tone="in" />
          <Line label="Saídas" value={m(-row.outflow, true)} tone="out" />
          <Line label="Transferências e ajustes" value={m(row.internal, true)} />
          <div className="my-1 border-t border-line" />
          <Line label="Saldo calculado" value={m(row.balance, row.balance < 0)} strong />
        </dl>
        {audit.beforeOpening.length ? (
          <p className="mt-2 text-[12px] text-ink-3">
            {audit.beforeOpening.length} {audit.beforeOpening.length === 1 ? 'movimento anterior' : 'movimentos anteriores'} ao saldo inicial já
            {audit.beforeOpening.length === 1 ? ' está' : ' estão'} dentro dele e não somam de novo.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setChecking(true)}>
            <Scale size={15} className="mr-1.5" /> Conferir com o banco
          </Button>
          <Button onClick={() => onTransfer('new')}>
            <ArrowLeftRight size={15} className="mr-1.5" /> Transferir
          </Button>
          <Button variant="quiet" onClick={() => setEditing(true)}>
            Editar
          </Button>
        </div>
      </Panel>

      {audit.checkpoints.length ? (
        <Panel className="p-5">
          <SectionTitle>Saldos do banco × saldos do app</SectionTitle>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-3">
                <th className="pb-2 font-medium">Dia</th>
                <th className="pb-2 text-right font-medium">Banco</th>
                <th className="pb-2 text-right font-medium">App</th>
                <th className="pb-2 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {audit.checkpoints.map((c) => (
                <tr key={`${c.date}:${c.source}`} className="border-t border-line">
                  <td className="py-2 text-ink-2">
                    {formatDayShort(c.date)}
                    <span className="block text-[11px] text-ink-3">{c.source}</span>
                  </td>
                  <td className="tnum py-2 text-right text-ink">{m(c.declared, c.declared < 0)}</td>
                  <td className="tnum py-2 text-right text-ink">{m(c.computed, c.computed < 0)}</td>
                  <td className={cn('tnum py-2 text-right font-semibold', c.diff === 0 ? 'text-in' : 'text-warn')}>
                    {c.diff === 0 ? '✓' : m(c.diff, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {audit.checkpoints.some((c) => c.diff !== 0) ? (
            <p className="mt-3 text-[12px] text-ink-3">
              A diferença apareceu entre o último saldo que bateu e o primeiro que não bate. Os movimentos desse intervalo estão logo abaixo —
              procure um que falta, sobra ou tem valor trocado. Se estiver tudo certo, “Conferir com o banco” registra um ajuste visível.
            </p>
          ) : null}
        </Panel>
      ) : null}

      <Panel className="px-5 py-4">
        <SectionTitle action={<span className="tnum text-[12px] text-ink-3">{lines.length}</span>}>Extrato da conta</SectionTitle>
        {lines.length ? (
          <ul className="grid">
            {lines.slice(0, limit).map((l) => {
              const transfer = l.source === 'transfer' || l.source === 'adjustment' || l.source === 'card-payment';
              return (
                <li key={l.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                  <span className="w-12 shrink-0 text-[12px] text-ink-3">{formatDayShort(l.date)}</span>
                  <button
                    type="button"
                    disabled={!transfer}
                    onClick={() => {
                      const t = transferOf(l.refId);
                      if (t) onTransfer(t);
                    }}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <span className="block truncate text-[14px] text-ink">{l.label}</span>
                    <span className="block text-[11px] text-ink-3">{SOURCE_LABEL[l.source]}</span>
                  </button>
                  <span className="shrink-0 text-right">
                    <span className={cn('tnum block text-[14px] font-medium', l.amount >= 0 ? 'text-in' : 'text-ink')}>{m(l.amount, true)}</span>
                    <span className="tnum block text-[11px] text-ink-3">{m(l.running, l.running < 0)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact title="Nenhum movimento" description="O que acontecer nesta conta aparece aqui, com o saldo depois de cada linha." />
        )}
        {lines.length > limit ? (
          <Button variant="quiet" className="mt-2 w-full" onClick={() => setLimit((n) => n + 120)}>
            Mostrar mais
          </Button>
        ) : null}
      </Panel>

      <CheckSheet spaceId={spaceId} account={a} computed={row.balance} open={checking} onClose={() => setChecking(false)} />
      <EditAccountSheet account={a} accounts={accounts} open={editing} onClose={() => setEditing(false)} />
    </div>
  );

  function transferOf(id: string): Transfer | null {
    return transfers.find((t) => t.id === id) ?? null;
  }
}

const SOURCE_LABEL: Record<string, string> = {
  entry: 'lançamento',
  subscription: 'assinatura · cobrança automática',
  debt: 'parcela de dívida',
  invoice: 'fatura do cartão · tida como paga no vencimento',
  'card-payment': 'pagamento de fatura',
  transfer: 'transferência entre contas',
  adjustment: 'ajuste de saldo · não é receita nem despesa',
};

function Line({ label, value, tone, strong }: { label: string; value: string; tone?: 'in' | 'out'; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-ink-3', strong && 'font-medium text-ink')}>{label}</dt>
      <dd className={cn('tnum', strong ? 'font-semibold text-ink' : tone === 'in' ? 'text-in' : tone === 'out' ? 'text-ink' : 'text-ink-2')}>{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ folhas */

function useMoneyField(initial = '') {
  const [text, setText] = React.useState(initial);
  const [negative, setNegative] = React.useState(false);
  const read = (): Cents | null => {
    const trimmed = text.trim();
    const neg = negative || /^[-−]/.test(trimmed);
    const parsed = parseMoney(trimmed.replace(/^[-−]/, ''));
    return parsed === null ? null : neg ? -parsed : parsed;
  };
  return { text, setText, negative, setNegative, read };
}

function CheckSheet({ spaceId, account, computed, open, onClose }: { spaceId: string; account: Account; computed: Cents; open: boolean; onClose: () => void }) {
  const money = useMoneyField();
  const [date, setDate] = React.useState(todayIso());
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    const value = money.read();
    if (value === null) return setError('Digite o saldo que o banco mostra, como 1.250,00.');
    const r = await setBalance({ spaceId, accountId: account.id, balance: value, date });
    toast(
      r.kind === 'opening'
        ? 'Saldo informado: a conta parte deste valor.'
        : r.kind === 'none'
          ? 'Conferido: o app e o banco dizem o mesmo.'
          : `O app tinha ${formatMoney(Math.abs(r.diff))} ${r.diff > 0 ? 'a menos' : 'a mais'}. Ficou registrado um ajuste visível.`,
    );
    money.setText('');
    setError(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Conferir com o banco"
      description={`O saldo que o banco mostra para ${account.name} no fim do dia escolhido. Se bater, fica marcado como conferido; se não bater, a diferença vira um ajuste com nome — nenhum lançamento é alterado.`}
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={() => void save()}>
          Conferir
        </Button>
      }
    >
      <div className="grid gap-3">
        <SignToggle negative={money.negative} onChange={money.setNegative} />
        <Field label="Saldo no banco" htmlFor="check-amount" error={error} hint={`O app calcula ${formatMoney(computed)} hoje.`}>
          <Input id="check-amount" value={money.text} onChange={(e) => money.setText(e.target.value)} inputMode="decimal" placeholder="0,00" className="tnum text-[20px] font-semibold" />
        </Field>
        <Field label="No fim do dia" htmlFor="check-date">
          <Input id="check-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

function CreateAccountSheet({ spaceId, open, onClose }: { spaceId: string; open: boolean; onClose: () => void }) {
  const [name, setName] = React.useState('');
  const [institution, setInstitution] = React.useState('');
  const [kind, setKind] = React.useState<AccountKind>('checking');
  const money = useMoneyField();
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError('Dê um nome para a conta.');
    const opening = money.text.trim() ? money.read() : 0;
    if (opening === null) return setError('Digite o saldo de hoje, como 1.250,00 — ou deixe em branco.');
    await createAccount({ spaceId, name, institution, kind, openingBalance: opening, openingDate: todayIso() });
    toast('Conta criada.');
    setName('');
    setInstitution('');
    money.setText('');
    setError(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nova conta"
      description="O saldo de hoje é o ponto de partida: o que aconteceu antes já está dentro dele."
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={() => void save()}>
          Criar conta
        </Button>
      }
    >
      <div className="grid gap-3">
        <Field label="Nome" htmlFor="acc-name" error={error}>
          <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nubank, Poupança Caixa, Carteira…" />
        </Field>
        <Field label="Banco" htmlFor="acc-inst">
          <Input id="acc-inst" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Opcional" />
        </Field>
        <Field label="Tipo" htmlFor="acc-kind">
          <Select id="acc-kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <SignToggle negative={money.negative} onChange={money.setNegative} />
        <Field label="Saldo hoje" htmlFor="acc-opening" hint="Em branco, a conta começa em zero.">
          <Input id="acc-opening" value={money.text} onChange={(e) => money.setText(e.target.value)} inputMode="decimal" placeholder="0,00" className="tnum" />
        </Field>
      </div>
    </Sheet>
  );
}

function EditAccountSheet({ account, accounts, open, onClose }: { account: Account; accounts: Account[]; open: boolean; onClose: () => void }) {
  const [name, setName] = React.useState(account.name);
  const [institution, setInstitution] = React.useState(account.institution);
  const [kind, setKind] = React.useState<AccountKind>(account.kind);
  const [loadedFor, setLoadedFor] = React.useState(account.id);
  if (loadedFor !== account.id) {
    setLoadedFor(account.id);
    setName(account.name);
    setInstitution(account.institution);
    setKind(account.kind);
  }

  async function save() {
    await updateAccount(account, { name: name.trim() || account.name, institution, kind });
    toast('Conta atualizada.');
    onClose();
  }

  async function remove() {
    const ok = await confirmAction({
      title: `Excluir ${account.name}?`,
      description: 'Conta com movimentos é arquivada em vez de excluída: o dinheiro que passou por ela continua explicado.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const r = await removeAccount(account);
    toast(r === 'archived' ? 'A conta tinha movimentos: foi arquivada.' : 'Conta excluída.');
    onClose();
    navigate({ view: 'contas' });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar conta"
      footer={
        <div className="grid gap-2">
          <Button variant="primary" size="lg" className="w-full" onClick={() => void save()}>
            Salvar
          </Button>
          {!account.primary && accounts.filter((a) => !a.archived).length > 1 ? (
            <Button className="w-full" onClick={() => void makePrimary(account).then(() => toast('Agora é a conta principal.'))}>
              Tornar principal
            </Button>
          ) : null}
          <Button variant="danger" className="w-full" onClick={() => void remove()}>
            Excluir conta
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <Field label="Nome" htmlFor="edit-acc-name">
          <Input id="edit-acc-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Banco" htmlFor="edit-acc-inst">
          <Input id="edit-acc-inst" value={institution} onChange={(e) => setInstitution(e.target.value)} />
        </Field>
        <Field label="Tipo" htmlFor="edit-acc-kind">
          <Select id="edit-acc-kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-[12px] text-ink-3">
          {account.openingDate
            ? `Saldo inicial de ${formatMoney(account.openingBalance)} em ${formatDateFull(account.openingDate)}. Para mudar o saldo, use “Conferir com o banco”: assim a diferença fica registrada.`
            : 'Sem saldo inicial: use “Conferir com o banco” para informar quanto a conta tem.'}
        </p>
      </div>
    </Sheet>
  );
}

/**
 * Transferência entre contas suas.
 *
 * Um formulário, um registro: não existe o lado de lá sem o lado de cá.
 */
export function TransferSheet({
  spaceId,
  open,
  editing,
  accounts,
  defaultFrom,
  onClose,
}: {
  spaceId: string;
  open: boolean;
  editing: Transfer | null;
  accounts: Account[];
  defaultFrom?: string;
  onClose: () => void;
}) {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [text, setText] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);

  const key = open ? (editing?.id ?? 'novo') : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (open) {
      const first = defaultFrom ?? accounts.find((a) => a.primary)?.id ?? accounts[0]?.id ?? '';
      setFrom(editing?.fromAccountId ?? first);
      setTo(editing?.toAccountId ?? accounts.find((a) => a.id !== first)?.id ?? '');
      setText(editing ? String(editing.amount / 100).replace('.', ',') : '');
      setDate(editing?.date ?? todayIso());
      setDescription(editing?.description ?? '');
      setError(null);
    }
  }

  const isAdjustment = editing?.kind === 'adjustment';
  const isPayment = editing?.kind === 'card';

  async function save() {
    const amount = parseMoney(text);
    if (amount === null || amount <= 0) return setError('Informe um valor maior que zero.');
    try {
      if (editing) {
        await updateTransfer(editing, {
          amount,
          date,
          description: description.trim() || editing.description,
          ...(editing.kind === 'account' ? { fromAccountId: from, toAccountId: to } : { fromAccountId: from }),
        });
        toast('Transferência atualizada nos dois lados.');
      } else {
        await createTransfer({ spaceId, kind: 'account', amount, date, fromAccountId: from, toAccountId: to, description });
        toast('Transferência registrada. Não entra como receita nem despesa.');
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui salvar.');
    }
  }

  async function remove() {
    if (!editing) return;
    const ok = await confirmAction({
      title: 'Excluir esta transferência?',
      description: 'Os dois lados saem juntos: o dinheiro volta para a conta de origem.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    await removeTransfer(editing);
    toast('Transferência excluída.');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isAdjustment ? 'Ajuste de saldo' : isPayment ? 'Pagamento de fatura' : editing ? 'Editar transferência' : 'Transferir entre contas'}
      description={
        isAdjustment
          ? 'Correção registrada para a conta bater com o banco. Não é receita nem despesa.'
          : 'Sai de uma conta e entra na outra. O total não muda, e nada disso aparece como receita ou despesa.'
      }
      footer={
        <div className="grid gap-2">
          <Button variant="primary" size="lg" className="w-full" onClick={() => void save()}>
            {editing ? 'Salvar' : 'Transferir'}
          </Button>
          {editing ? (
            <Button variant="danger" className="w-full" onClick={() => void remove()}>
              Excluir
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-3">
        {!isAdjustment ? (
          <Field label="De" htmlFor="tr-from">
            <Select id="tr-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {!isAdjustment && !isPayment ? (
          <Field label="Para" htmlFor="tr-to">
            <Select id="tr-to" value={to} onChange={(e) => setTo(e.target.value)}>
              {accounts
                .filter((a) => a.id !== from)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Valor" htmlFor="tr-amount" error={error}>
          <Input id="tr-amount" value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" placeholder="0,00" className="tnum text-[20px] font-semibold" />
        </Field>
        <Field label="Dia" htmlFor="tr-date">
          <Input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Descrição" htmlFor="tr-desc">
          <Input id="tr-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </Sheet>
  );
}
