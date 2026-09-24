'use client';

import * as React from 'react';
import { Check, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Meter,
  Panel,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Switch,
  confirmAction,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { addMonthsToKey, currentMonthKey, formatMonthLabel } from '@/lib/dates';
import {
  DEBT_KINDS,
  debtDetails,
  debtProgress,
  simulateExtra,
  simulateLoan,
  simulateOverdraft,
  simulatePayoff,
  type DebtDetails,
  type PayoffStrategy,
} from '@/lib/debts';
import { formatMoney, formatPercent, parseMoney } from '@/lib/money';
import type { FinanceBase } from '@/lib/picture';
import { createDebt, removeDebt, updateDebt } from '@/lib/store';
import type { Debt, MonthKey } from '@/lib/types';

/* ------------------------------------------------------------------- tela */

type Tool = null | 'loan' | 'overdraft' | 'payoff';

/**
 * Dívidas que encolhem à vista.
 *
 * Cada uma mostra o que foi contratado, o que ainda falta, os juros que ainda
 * vêm e quando acaba. E responde a pergunta que muda comportamento: "se eu
 * pagar um pouco a mais por mês, quanto tempo e quanto dinheiro eu ganho?".
 */
export function DividasView({
  spaceId,
  base,
  hidden,
  startNew = false,
}: {
  spaceId: string;
  base: FinanceBase;
  hidden: boolean;
  startNew?: boolean;
}) {
  const month = currentMonthKey();
  const [sheet, setSheet] = React.useState<{ open: boolean; editing: Debt | null }>({
    open: false,
    editing: null,
  });
  const [autoOpened, setAutoOpened] = React.useState(false);
  if (startNew && !autoOpened) {
    setAutoOpened(true);
    setSheet({ open: true, editing: null });
  }
  const [tool, setTool] = React.useState<Tool>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const open = base.debts.filter((d) => !d.settledAt);
  const rows = open
    .map((debt) => ({ debt, d: debtDetails(debt, month) }))
    .filter((r) => r.d.remaining > 0)
    .sort((a, b) => b.debt.monthlyRate - a.debt.monthlyRate || b.d.remainingNominal - a.d.remainingNominal);
  const finished = base.debts.filter((d) => d.settledAt || debtDetails(d, month).remaining === 0);

  const left = rows.reduce((t, r) => t + r.d.remainingNominal, 0);
  const monthly = rows.reduce((t, r) => t + r.debt.installment, 0);
  const interestAhead = rows.reduce((t, r) => t + r.d.interestAhead, 0);
  const last = rows.reduce<string | null>((max, r) => (!max || r.d.lastMonth > max ? r.d.lastMonth : max), null);

  // estou reduzindo o passivo? o mesmo cálculo de seis meses atrás
  const sixAgo = addMonthsToKey(month, -6);
  const before = open
    .filter((debt) => debt.startMonth <= sixAgo)
    .reduce((t, debt) => t + debtDetails(debt, sixAgo).remainingNominal, 0);
  const newSince = open.filter((debt) => debt.startMonth > sixAgo).reduce((t, debt) => t + debtDetails(debt, month).remainingNominal, 0);

  const sheets = (
    <>
      <DebtSheet state={sheet} spaceId={spaceId} month={month} onClose={() => setSheet({ open: false, editing: null })} />
      <LoanSheet open={tool === 'loan'} onClose={() => setTool(null)} />
      <OverdraftSheet open={tool === 'overdraft'} onClose={() => setTool(null)} />
      <PayoffSheet open={tool === 'payoff'} onClose={() => setTool(null)} debts={open} month={month} />
    </>
  );

  if (!base.ready) {
    return (
      <div className="grid gap-4 pt-2">
        <Skeleton className="h-[180px] rounded-panel" />
        <Skeleton className="h-[260px] rounded-panel" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-6">
      <div className="grid gap-4">
        {rows.length > 0 ? (
          <Panel className="p-5">
            <p className="text-[13px] text-ink-3">Ainda falta pagar</p>
            <p className="amount mt-1.5 text-[40px] text-ink">{formatMoney(left, { hidden })}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded-field bg-surface-2 px-3 py-2">
                <dt className="text-ink-3">Por mês</dt>
                <dd className="tnum font-semibold text-out">{formatMoney(monthly, { hidden })}</dd>
              </div>
              <div className="rounded-field bg-surface-2 px-3 py-2">
                <dt className="text-ink-3">Última parcela</dt>
                <dd className="font-semibold text-ink">{last ? formatMonthLabel(last) : '—'}</dd>
              </div>
              {interestAhead > 0 ? (
                <div className="col-span-2 rounded-field bg-surface-2 px-3 py-2">
                  <dt className="text-ink-3">Juros que ainda estão embutidos</dt>
                  <dd className="tnum font-semibold text-ink">{formatMoney(interestAhead, { hidden })}</dd>
                </div>
              ) : null}
            </dl>
            {before > 0 ? (
              <p className="mt-3 text-[13px] leading-snug text-ink-2">
                {left - newSince < before ? (
                  <>
                    Há seis meses faltavam {formatMoney(before, { hidden })} das dívidas de então. Você reduziu{' '}
                    <strong className="font-semibold text-in">{formatMoney(before - (left - newSince), { hidden })}</strong>.
                  </>
                ) : (
                  <>O saldo das dívidas antigas não diminuiu nos últimos seis meses.</>
                )}
                {newSince > 0 ? ` Nesse tempo entraram ${formatMoney(newSince, { hidden })} em dívidas novas.` : ''}
              </p>
            ) : null}
          </Panel>
        ) : null}

        <Panel className="px-5 py-4">
          <SectionTitle>Simuladores</SectionTitle>
          <ul className="divide-y divide-line">
            <ToolRow title="Quitar dívidas" detail="Avalanche ou bola de neve, com aporte extra" onClick={() => setTool('payoff')} />
            <ToolRow title="Empréstimo" detail="Parcela e custo real antes de assinar" onClick={() => setTool('loan')} />
            <ToolRow title="Cheque especial" detail="O tamanho do estrago dos juros" onClick={() => setTool('overdraft')} />
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4">
        <Panel className="px-5 py-4">
          <SectionTitle
            action={
              <Button size="sm" variant="soft" onClick={() => setSheet({ open: true, editing: null })}>
                <Plus size={15} /> Registrar
              </Button>
            }
          >
            {rows.length ? `${rows.length} ${rows.length === 1 ? 'dívida aberta' : 'dívidas abertas'}` : 'Dívidas'}
          </SectionTitle>

          {rows.length ? (
            <ul className="grid gap-3">
              {rows.map(({ debt, d }) => (
                <DebtCard
                  key={debt.id}
                  debt={debt}
                  d={d}
                  month={month}
                  hidden={hidden}
                  expanded={openId === debt.id}
                  onToggle={() => setOpenId((id) => (id === debt.id ? null : debt.id))}
                  onEdit={() => setSheet({ open: true, editing: debt })}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              title="Nenhuma dívida aberta"
              description="Registre empréstimos, financiamentos e consignados. O app acompanha parcela por parcela e mostra quanto você economiza pagando um pouco a mais."
              action={
                <Button variant="primary" onClick={() => setSheet({ open: true, editing: null })}>
                  <Plus size={16} />
                  Registrar dívida
                </Button>
              }
            />
          )}
        </Panel>

        {finished.length ? (
          <Panel className="px-5 py-4">
            <SectionTitle>Quitadas</SectionTitle>
            <ul className="divide-y divide-line">
              {finished.map((debt) => (
                <li key={debt.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-8 place-items-center rounded-full bg-in-soft text-in" aria-hidden>
                    <Check size={15} />
                  </span>
                  <span className="flex-1 text-[14px] text-ink-2">{debt.name}</span>
                  <button type="button" onClick={() => setSheet({ open: true, editing: debt })} className="h-8 text-[12px] text-ink-3 hover:text-ink">
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>

      {sheets}
    </div>
  );
}

const EXTRAS = [10000, 30000, 50000];

function DebtCard({
  debt,
  d,
  month,
  hidden,
  expanded,
  onToggle,
  onEdit,
}: {
  debt: Debt;
  d: DebtDetails;
  month: MonthKey;
  hidden: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const [customText, setCustomText] = React.useState('');
  const custom = parseMoney(customText) ?? 0;
  const scenarios = [...EXTRAS, ...(custom > 0 && !EXTRAS.includes(custom) ? [custom] : [])].map((extra) => simulateExtra(debt, month, extra));
  const count = Math.max(1, Math.trunc(debt.installments));
  const hasRate = debt.monthlyRate > 0;

  return (
    <li className="rounded-card border border-line">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="w-full p-4 text-left">
        <span className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[18px]" aria-hidden>
            {debt.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">{debt.name}</span>
              <span className="tnum shrink-0 text-[15px] font-semibold text-ink">{formatMoney(d.remainingNominal, { hidden })}</span>
            </span>
            <span className="mt-0.5 block text-[12px] text-ink-3">
              {d.paid} de {count} parcelas · {formatMoney(debt.installment, { hidden })}/mês · termina {formatMonthLabel(d.lastMonth)}
            </span>
          </span>
        </span>
        <Meter value={d.paid / count} tone="in" label={`${debt.name}: parcelas pagas`} valueText={`${d.paid} de ${count} parcelas`} className="mt-3" height={6} />
      </button>

      {expanded ? (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <dl className="grid grid-cols-2 gap-2 text-[13px]">
            <Fact label="Contrato" value={formatMoney(d.contractTotal, { hidden })} />
            <Fact label="Juros" value={hasRate ? `${debt.monthlyRate.toLocaleString('pt-BR')}% ao mês` : 'não informado'} />
            <Fact label="Para quitar hoje" value={formatMoney(d.balance, { hidden })} hint={hasRate ? 'saldo devedor pela taxa' : 'sem desconto de juros'} />
            <Fact label="Juros que ainda vêm" value={hasRate ? formatMoney(d.interestAhead, { hidden }) : '—'} />
          </dl>

          <p className="mt-4 text-[13px] font-medium text-ink">Se você pagar a mais por mês…</p>
          <div className="mt-2 overflow-hidden rounded-field border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-medium">A mais</th>
                  <th className="px-3 py-2 font-medium">Termina</th>
                  <th className="px-3 py-2 text-right font-medium">Economia</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((sc) => (
                  <tr key={sc.extra} className="border-t border-line">
                    <td className="tnum px-3 py-2 text-ink">+{formatMoney(sc.extra, { hidden, compact: true })}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {formatMonthLabel(sc.payoffMonth)}
                      {sc.monthsSaved > 0 ? <span className="text-in"> · −{sc.monthsSaved} {sc.monthsSaved === 1 ? 'mês' : 'meses'}</span> : null}
                    </td>
                    <td className={cn('tnum px-3 py-2 text-right font-semibold', sc.interestSaved > 0 ? 'text-in' : 'text-ink-3')}>
                      {hasRate ? formatMoney(sc.interestSaved, { hidden }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              inputMode="decimal"
              placeholder="Outro valor, ex.: 250"
              aria-label="Outro valor a mais por mês"
              className="h-10 text-[14px]"
            />
          </div>
          {!hasRate ? (
            <p className="mt-2 text-[12px] leading-snug text-ink-3">
              Sem a taxa de juros, pagar a mais só adianta o fim. Informe a taxa no cadastro para ver a economia.
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={onEdit}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="soft"
              onClick={async () => {
                await updateDebt(debt, { settledAt: new Date().toISOString() });
                toast(`${debt.name} quitada. Uma a menos.`, {
                  action: { label: 'Desfazer', onClick: () => void updateDebt(debt, { settledAt: null }) },
                });
              }}
            >
              <Check size={15} /> Quitei
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-field bg-surface-2 px-3 py-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className="tnum font-semibold text-ink">{value}</dd>
      {hint ? <dd className="text-[11px] text-ink-3">{hint}</dd> : null}
    </div>
  );
}

function ToolRow({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:text-ink"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-ink">{title}</span>
          <span className="block text-[12px] text-ink-3">{detail}</span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-ink-3" />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------ folha dívida */

function DebtSheet({
  state,
  spaceId,
  month,
  onClose,
}: {
  state: { open: boolean; editing: Debt | null };
  spaceId: string;
  month: MonthKey;
  onClose: () => void;
}) {
  const editing = state.editing;
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<Debt['kind']>('financing');
  const [installmentText, setInstallmentText] = React.useState('');
  const [count, setCount] = React.useState('12');
  const [startMonth, setStartMonth] = React.useState(month);
  const [rate, setRate] = React.useState('');
  const [dueDay, setDueDay] = React.useState('10');
  const [inFlow, setInFlow] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [loadedFor, setLoadedFor] = React.useState('');
  const signature = `${state.open}:${editing?.id ?? 'novo'}`;
  if (state.open && loadedFor !== signature) {
    setLoadedFor(signature);
    setName(editing?.name ?? '');
    setKind(editing?.kind ?? 'financing');
    setInstallmentText(editing ? String(editing.installment / 100).replace('.', ',') : '');
    setCount(editing ? String(editing.installments) : '12');
    setStartMonth(editing?.startMonth ?? month);
    setRate(editing ? String(editing.monthlyRate).replace('.', ',') : '');
    setDueDay(String(editing?.dueDay ?? 10));
    setInFlow(editing?.inFlow ?? true);
    setError(null);
  }

  const kindMeta = DEBT_KINDS.find((k) => k.key === kind);

  async function submit() {
    const installment = parseMoney(installmentText);
    if (!name.trim()) return setError('Dê um nome à dívida.');
    if (installment === null || installment <= 0) return setError('Informe o valor da parcela.');

    const payload = {
      spaceId,
      name,
      kind,
      icon: kindMeta?.icon ?? '\u{1F4E6}',
      installment,
      installments: Math.max(1, Number(count) || 1),
      startMonth,
      monthlyRate: Number(String(rate).replace(',', '.')) || 0,
      inFlow,
    };
    const day = Math.min(31, Math.max(1, Number(dueDay) || 10));
    if (editing) await updateDebt(editing, { ...payload, dueDay: day });
    else {
      const created = await createDebt(payload);
      await updateDebt(created, { dueDay: day });
    }
    toast(editing ? 'Dívida atualizada.' : 'Dívida registrada. As parcelas já entram no mês.');
    onClose();
  }

  return (
    <Sheet
      open={state.open}
      onClose={onClose}
      title={editing ? 'Editar dívida' : 'Nova dívida'}
      footer={
        <div className="grid gap-2">
          <Button variant="primary" size="lg" className="w-full" onClick={submit}>
            Salvar
          </Button>
          {editing && (
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                if (!(await confirmAction({ title: `Apagar ${editing.name}?`, description: 'Se ela foi quitada, prefira marcar como quitada: o histórico fica.', confirmLabel: 'Apagar', danger: true }))) return;
                await removeDebt(editing.id);
                onClose();
              }}
            >
              <Trash2 size={15} />
              Apagar dívida
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome" htmlFor="debt-name" hint="Ex.: Financiamento do carro, iPhone">
          <Input id="debt-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>

        <Field label="Tipo" htmlFor="debt-kind">
          <Select id="debt-kind" value={kind} onChange={(e) => setKind(e.target.value as Debt['kind'])}>
            {DEBT_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.icon} {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor da parcela" htmlFor="debt-inst">
            <Input
              id="debt-inst"
              value={installmentText}
              onChange={(e) => setInstallmentText(e.target.value)}
              inputMode="decimal"
              className="tnum"
              placeholder="0,00"
            />
          </Field>
          <Field label="Total de parcelas" htmlFor="debt-count">
            <Input
              id="debt-count"
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              className="tnum"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Primeira parcela" htmlFor="debt-start">
            <Input
              id="debt-start"
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value || currentMonthKey())}
            />
          </Field>
          <Field label="Juros ao mês" htmlFor="debt-rate" hint="Opcional, em %">
            <Input
              id="debt-rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              className="tnum"
              placeholder="0,00"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vence todo dia" htmlFor="debt-due">
            <Input
              id="debt-due"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              className="tnum"
            />
          </Field>
        </div>

        <Switch
          checked={inFlow}
          onChange={setInFlow}
          label="Contar a parcela nas despesas"
          detail="Ela entra no mês, no dia do vencimento, e pesa no saldo previsto."
          className="border-y border-line"
        />

        {installmentText && count && (
          <p className="rounded-field bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
            Total de {formatMoney((parseMoney(installmentText) ?? 0) * (Number(count) || 1))} · última em{' '}
            {formatMonthLabel(startMonth)}
          </p>
        )}

        {error && <p className="text-[13px] text-out">{error}</p>}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------- simulador empréstimo */

export function LoanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [principalText, setPrincipalText] = React.useState('');
  const [rate, setRate] = React.useState('2,5');
  const [months, setMonths] = React.useState('24');

  const principal = parseMoney(principalText) ?? 0;
  const result = React.useMemo(
    () => simulateLoan(principal, Number(String(rate).replace(',', '.')) || 0, Number(months) || 1),
    [principal, rate, months],
  );

  return (
    <Sheet open={open} onClose={onClose} title="Simulador de empréstimo">
      <div className="grid gap-4">
        <Field label="Quanto você vai pegar" htmlFor="loan-principal">
          <Input
            id="loan-principal"
            value={principalText}
            onChange={(e) => setPrincipalText(e.target.value)}
            inputMode="decimal"
            className="tnum text-[17px] font-semibold"
            placeholder="0,00"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Juros ao mês" htmlFor="loan-rate" hint="Em %">
            <Input
              id="loan-rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              className="tnum"
            />
          </Field>
          <Field label="Parcelas" htmlFor="loan-months">
            <Input
              id="loan-months"
              value={months}
              onChange={(e) => setMonths(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              className="tnum"
            />
          </Field>
        </div>

        {principal > 0 && (
          <div className="rounded-card border border-line bg-surface-2 p-4">
            <p className="text-[12px] text-ink-3">Parcela</p>
            <p className="amount mt-1 text-[32px] text-ink">{formatMoney(result.installment)}</p>

            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-ink-3">Total</dt>
                <dd className="tnum mt-1 text-[14px] font-semibold text-ink">
                  {formatMoney(result.total, { compact: true })}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-ink-3">Juros</dt>
                <dd className="tnum mt-1 text-[14px] font-semibold text-out">
                  {formatMoney(result.interest, { compact: true })}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-ink-3">Custo</dt>
                <dd className="tnum mt-1 text-[14px] font-semibold text-out">
                  {formatPercent(result.costPercent / 100)}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
              Cálculo pela Tabela Price, como bancos e financeiras fazem: parcelas iguais, juros
              sobre o saldo devedor.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------- simulador cheque especial */

export function OverdraftSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [usedText, setUsedText] = React.useState('');
  const [rate, setRate] = React.useState('8');
  const [days, setDays] = React.useState('30');

  const used = parseMoney(usedText) ?? 0;
  const result = React.useMemo(
    () => simulateOverdraft(used, Number(String(rate).replace(',', '.')) || 0, Number(days) || 0),
    [used, rate, days],
  );

  return (
    <Sheet open={open} onClose={onClose} title="Simulador do cheque especial">
      <div className="grid gap-4">
        <Field label="Valor usado" htmlFor="od-used">
          <Input
            id="od-used"
            value={usedText}
            onChange={(e) => setUsedText(e.target.value)}
            inputMode="decimal"
            className="tnum text-[17px] font-semibold"
            placeholder="0,00"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Juros ao mês" htmlFor="od-rate" hint="Em %">
            <Input id="od-rate" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="tnum" />
          </Field>
          <Field label="Por quantos dias" htmlFor="od-days">
            <Input
              id="od-days"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              className="tnum"
            />
          </Field>
        </div>

        {used > 0 && (
          <div className="rounded-card border border-out/30 bg-out-soft p-4">
            <p className="text-[12px] text-ink-3">Você vai dever</p>
            <p className="amount mt-1 text-[32px] text-out">{formatMoney(result.owed)}</p>
            <p className="mt-2 text-[13px] text-ink-2">
              {formatMoney(result.interest)} só de juros em {result.days} dias.
            </p>
            <p className="mt-3 border-t border-out/20 pt-3 text-[13px] text-ink-2">
              Essa taxa equivale a{' '}
              <strong className="font-semibold text-out">{formatPercent(result.yearlyPercent / 100)}</strong> ao ano.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------- simulador quitação */

export function PayoffSheet({
  open,
  onClose,
  debts,
  month,
}: {
  open: boolean;
  onClose: () => void;
  debts: Debt[];
  month: MonthKey;
}) {
  const [extraText, setExtraText] = React.useState('');
  const [strategy, setStrategy] = React.useState<PayoffStrategy>('avalanche');

  const inputs = React.useMemo(
    () =>
      debts
        .map((debt) => {
          const p = debtProgress(debt, month);
          return {
            id: debt.id,
            name: debt.name,
            balance: p.outstanding,
            monthlyRatePercent: debt.monthlyRate,
            minimum: debt.installment,
          };
        })
        .filter((d) => d.balance > 0),
    [debts, month],
  );

  const extra = parseMoney(extraText) ?? 0;
  const result = React.useMemo(() => simulatePayoff(inputs, extra, strategy), [inputs, extra, strategy]);
  const baseline = React.useMemo(() => simulatePayoff(inputs, 0, strategy), [inputs, strategy]);

  return (
    <Sheet open={open} onClose={onClose} title="Simulador de quitação">
      <div className="grid gap-4">
        {!inputs.length ? (
          <p className="py-6 text-center text-[14px] text-ink-3">
            Cadastre suas dívidas para simular a quitação.
          </p>
        ) : (
          <>
            <Segmented
              label="Estratégia"
              value={strategy}
              onChange={setStrategy}
              options={[
                { value: 'avalanche', label: 'Avalanche' },
                { value: 'snowball', label: 'Bola de neve' },
              ]}
            />

            <p className="text-[13px] leading-relaxed text-ink-3">
              {strategy === 'avalanche'
                ? 'Ataca primeiro a de juro mais alto. É a que custa menos dinheiro no fim.'
                : 'Ataca primeiro a menor. A primeira vitória vem mais rápido, e é a que mais gente consegue seguir até o fim.'}
            </p>

            <Field label="Quanto a mais por mês" htmlFor="payoff-extra" hint="Além das parcelas que você já paga.">
              <Input
                id="payoff-extra"
                value={extraText}
                onChange={(e) => setExtraText(e.target.value)}
                inputMode="decimal"
                className="tnum"
                placeholder="0,00"
              />
            </Field>

            <div className="rounded-card border border-line bg-surface-2 p-4">
              {result.impossible ? (
                <p className="text-[14px] text-out">
                  Com esses valores a dívida não se paga: os juros crescem mais rápido do que o
                  pagamento. Aumente o aporte extra.
                </p>
              ) : (
                <>
                  <p className="text-[12px] text-ink-3">Livre em</p>
                  <p className="amount mt-1 text-[32px] text-ink">
                    {result.months} {result.months === 1 ? 'mês' : 'meses'}
                  </p>

                  {extra > 0 && baseline.months > result.months && (
                    <p className="mt-2 text-[13px] text-in">
                      {baseline.months - result.months} {baseline.months - result.months === 1 ? 'mês' : 'meses'} a
                      menos, e {formatMoney(baseline.interestPaid - result.interestPaid)} de juros
                      economizados.
                    </p>
                  )}

                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-ink-3">Juros pagos</dt>
                      <dd className="tnum mt-1 text-[14px] font-semibold text-out">
                        {formatMoney(result.interestPaid, { compact: true })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-ink-3">Total pago</dt>
                      <dd className="tnum mt-1 text-[14px] font-semibold text-ink">
                        {formatMoney(result.totalPaid, { compact: true })}
                      </dd>
                    </div>
                  </dl>

                  {result.order.length > 0 && (
                    <ol className="mt-4 grid gap-2 border-t border-line pt-3">
                      {result.order.map((step, i) => (
                        <li key={step.id} className="flex items-center gap-2.5 text-[13px]">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2">
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-ink">{step.name}</span>
                          <span className="tnum shrink-0 text-ink-3">mês {step.month}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
