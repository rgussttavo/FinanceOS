'use client';

import * as React from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { currentMonthKey, formatMonthLabel } from '@/lib/dates';
import {
  DEBT_KINDS,
  debtProgress,
  simulateLoan,
  simulateOverdraft,
  simulatePayoff,
  type PayoffStrategy,
} from '@/lib/debts';
import { formatMoney, formatPercent, parseMoney } from '@/lib/money';
import { createDebt, removeDebt, updateDebt, useDebts } from '@/lib/store';
import type { Debt, MonthKey } from '@/lib/types';

/* ------------------------------------------------------------------- tela */

type Tool = null | 'loan' | 'overdraft' | 'payoff';

export function DividasView({
  spaceId,
  month,
  hidden,
  startNew = false,
}: {
  spaceId: string;
  month: MonthKey;
  hidden: boolean;
  startNew?: boolean;
}) {
  const debts = useDebts(spaceId);
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

  const rows = debts.map((debt) => ({ debt, progress: debtProgress(debt, month) }));
  const outstanding = rows.reduce((sum, r) => sum + r.progress.outstanding, 0);
  const monthly = rows.filter((r) => !r.progress.done).reduce((sum, r) => sum + r.debt.installment, 0);

  return (
    <div className="grid gap-4 pt-2">
      {rows.length > 0 && (
        <Panel className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            Ainda falta pagar
          </p>
          <p className="amount mt-1.5 text-[38px] text-ink">
            {hidden ? '••••' : formatMoney(outstanding)}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-ink-3">Por mês</dt>
              <dd className="tnum mt-1 text-[15px] font-semibold text-out">
                {formatMoney(monthly, { hidden, compact: true })}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-ink-3">Dívidas abertas</dt>
              <dd className="tnum mt-1 text-[15px] font-semibold text-ink">
                {rows.filter((r) => !r.progress.done).length}
              </dd>
            </div>
          </dl>
        </Panel>
      )}

      <Panel className="px-5 py-4">
        <SectionTitle
          action={
            <button
              type="button"
              aria-label="Cadastrar dívida"
              onClick={() => setSheet({ open: true, editing: null })}
              className="grid h-8 w-8 place-items-center rounded-full text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={17} />
            </button>
          }
        >
          Dívidas
        </SectionTitle>

        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map(({ debt, progress }) => (
              <li key={debt.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, editing: debt })}
                  className="flex w-full items-center gap-3 py-3.5 text-left"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[18px]">
                    {debt.icon}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] text-ink">{debt.name}</span>
                      <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                        {formatMoney(progress.outstanding, { hidden })}
                      </span>
                    </span>

                    <span className="mt-1 block text-[12px] text-ink-3">
                      {progress.paid} de {debt.installments} parcelas ·{' '}
                      {formatMoney(debt.installment, { hidden, compact: true })} por mês
                    </span>

                    {/* as parcelas acendem uma a uma: ver o carnê encher motiva
                        mais do que ver um número cair */}
                    <span className="mt-2 flex gap-[3px]" aria-hidden>
                      {Array.from({ length: Math.min(debt.installments, 24) }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-1.5 flex-1 rounded-full transition-colors',
                            i < progress.paid ? 'bg-in' : 'bg-surface-3',
                          )}
                        />
                      ))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nenhuma dívida cadastrada"
            description="Cadastre empréstimos, financiamentos, consignados e compras parceladas. O app acompanha as parcelas e o saldo devedor sozinho, mês a mês."
            action={
              <Button variant="primary" onClick={() => setSheet({ open: true, editing: null })}>
                <Plus size={16} />
                Cadastrar dívida
              </Button>
            }
          />
        )}
      </Panel>

      <Panel className="px-5 py-4">
        <SectionTitle>Simuladores</SectionTitle>
        <ul className="divide-y divide-line">
          <ToolRow
            title="Simulador de empréstimo"
            detail="Parcela e custo real de um financiamento"
            onClick={() => setTool('loan')}
          />
          <ToolRow
            title="Simulador do cheque especial"
            detail="O tamanho do estrago dos juros"
            onClick={() => setTool('overdraft')}
          />
          <ToolRow
            title="Simulador de quitação"
            detail="Avalanche, bola de neve e aporte extra"
            onClick={() => setTool('payoff')}
          />
        </ul>
      </Panel>

      <DebtSheet
        state={sheet}
        spaceId={spaceId}
        month={month}
        onClose={() => setSheet({ open: false, editing: null })}
      />
      <LoanSheet open={tool === 'loan'} onClose={() => setTool(null)} />
      <OverdraftSheet open={tool === 'overdraft'} onClose={() => setTool(null)} />
      <PayoffSheet
        open={tool === 'payoff'}
        onClose={() => setTool(null)}
        debts={debts}
        month={month}
      />
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
      inFlow: true,
    };
    if (editing) await updateDebt(editing, payload);
    else await createDebt(payload);
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
                if (!confirm(`Apagar ${editing.name}?`)) return;
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
