'use client';

import * as React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Button, Field, Input, Segmented, Select, Sheet } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatQuote, useMarket, type Quote } from '@/lib/market';
import { formatMoney, formatPercent, parseMoney } from '@/lib/money';
import { convertCurrency, simulateFire, simulateInvestment } from '@/lib/simulators';

/* --------------------------------------------------------------- câmbio */

export function CambioSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useMarket();
  const quotes: Quote[] = React.useMemo(
    () => [...(data?.currencies ?? []), ...(data?.crypto ?? [])].filter((q) => q.price != null),
    [data],
  );

  const [currencyId, setCurrencyId] = React.useState('USDBRL');
  const [amountText, setAmountText] = React.useState('100');
  const [direction, setDirection] = React.useState<'toForeign' | 'toBrl'>('toForeign');
  const [withTaxes, setWithTaxes] = React.useState(true);

  const quote = quotes.find((q) => q.id === currencyId) ?? quotes[0] ?? null;
  const amount = Number(String(amountText).replace(/\./g, '').replace(',', '.')) || 0;

  // IOF de 3,5% para cartão e espécie, mais um spread típico de casa de câmbio
  const result = convertCurrency(
    amount,
    quote?.price ?? 0,
    direction,
    withTaxes ? { iofPercent: 3.5, spreadPercent: 4 } : undefined,
  );

  const fromLabel = direction === 'toForeign' ? 'R$' : (quote?.symbol.split('/')[0] ?? '');
  const toLabel = direction === 'toForeign' ? (quote?.symbol.split('/')[0] ?? '') : 'R$';

  return (
    <Sheet open={open} onClose={onClose} title="Simulador de câmbio">
      <div className="grid gap-4">
        <Field label="Moeda" htmlFor="fx-currency">
          <Select id="fx-currency" value={currencyId} onChange={(e) => setCurrencyId(e.target.value)}>
            {quotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label} ({q.symbol})
              </option>
            ))}
          </Select>
        </Field>

        <Segmented
          label="Sentido da conversão"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'toForeign' as const, label: 'Real → moeda' },
            { value: 'toBrl' as const, label: 'Moeda → real' },
          ]}
        />

        <Field label={`Quanto em ${fromLabel}`} htmlFor="fx-amount">
          <Input
            id="fx-amount"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            className="tnum text-[17px] font-semibold"
          />
        </Field>

        {quote?.price ? (
          <div className="grid gap-3 rounded-card border border-line bg-surface-2 p-4">
            <div className="flex items-center gap-2 text-[12px] text-ink-3">
              <ArrowLeftRight size={13} />
              1 {quote.symbol.split('/')[0]} = {formatQuote(quote.price)}
            </div>

            <div>
              <p className="text-[12px] text-ink-3">Pela cotação comercial</p>
              <p className="amount mt-1 text-[30px] text-ink">
                {toLabel === 'R$'
                  ? formatMoney(Math.round(result.converted * 100))
                  : `${result.converted.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${toLabel}`}
              </p>
            </div>

            {withTaxes && result.withTaxes != null && (
              <div className="border-t border-line pt-3">
                <p className="text-[12px] text-ink-3">Com IOF de 3,5% e spread de 4%</p>
                <p className="tnum mt-1 text-[20px] font-semibold text-warn">
                  {toLabel === 'R$'
                    ? formatMoney(Math.round(result.withTaxes * 100))
                    : `${result.withTaxes.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${toLabel}`}
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={withTaxes}
                onChange={(e) => setWithTaxes(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Mostrar o que você paga de verdade
            </label>

            <p className="text-[12px] leading-relaxed text-ink-3">
              A cotação do noticiário é a comercial. Quem compra moeda paga IOF e o spread da casa
              — é por isso que o número da maquininha nunca bate com o da notícia.
            </p>
          </div>
        ) : (
          <p className="py-4 text-center text-[13px] text-ink-3">Carregando cotações…</p>
        )}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------- juros compostos */

export function InvestimentoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useMarket();
  const cdi = data?.indicators.find((i) => i.id === 'cdi')?.value ?? null;

  const [initialText, setInitialText] = React.useState('1000');
  const [monthlyText, setMonthlyText] = React.useState('500');
  const [yearlyRate, setYearlyRate] = React.useState('');
  const [months, setMonths] = React.useState('120');

  // sem taxa informada, usa o CDI do dia: é a referência que todo mundo conhece
  const effectiveYearly = Number(String(yearlyRate).replace(',', '.')) || cdi || 10;
  const monthlyRate = (Math.pow(1 + effectiveYearly / 100, 1 / 12) - 1) * 100;

  const result = simulateInvestment(
    parseMoney(initialText) ?? 0,
    parseMoney(monthlyText) ?? 0,
    monthlyRate,
    Number(months) || 1,
  );

  return (
    <Sheet open={open} onClose={onClose} title="Simulador de investimentos">
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor inicial" htmlFor="inv-initial">
            <Input
              id="inv-initial"
              value={initialText}
              onChange={(e) => setInitialText(e.target.value)}
              inputMode="decimal"
              className="tnum"
            />
          </Field>
          <Field label="Aporte mensal" htmlFor="inv-monthly">
            <Input
              id="inv-monthly"
              value={monthlyText}
              onChange={(e) => setMonthlyText(e.target.value)}
              inputMode="decimal"
              className="tnum"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Rendimento ao ano"
            htmlFor="inv-rate"
            hint={cdi != null && !yearlyRate ? `Usando o CDI de hoje: ${cdi.toFixed(2)}%` : 'Em %'}
          >
            <Input
              id="inv-rate"
              value={yearlyRate}
              onChange={(e) => setYearlyRate(e.target.value)}
              inputMode="decimal"
              className="tnum"
              placeholder={cdi != null ? cdi.toFixed(2) : '10'}
            />
          </Field>
          <Field label="Por quantos meses" htmlFor="inv-months">
            <Input
              id="inv-months"
              value={months}
              onChange={(e) => setMonths(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              className="tnum"
            />
          </Field>
        </div>

        <div className="rounded-card border border-line bg-surface-2 p-4">
          <p className="text-[12px] text-ink-3">Você teria</p>
          <p className="amount mt-1 text-[32px] text-ink">{formatMoney(result.total)}</p>

          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-3">
            <span
              className="h-full bg-ink-3"
              style={{ width: `${(result.contributed / Math.max(1, result.total)) * 100}%` }}
            />
            <span
              className="h-full bg-in"
              style={{ width: `${(result.earned / Math.max(1, result.total)) * 100}%` }}
            />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-ink-3">Você colocou</dt>
              <dd className="tnum mt-1 text-[14px] font-semibold text-ink-2">
                {formatMoney(result.contributed, { compact: true })}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-ink-3">Rendeu</dt>
              <dd className="tnum mt-1 text-[14px] font-semibold text-in">
                {formatMoney(result.earned, { compact: true })}
              </dd>
            </div>
          </dl>

          {result.crossoverMonth && (
            <p className="mt-3 border-t border-line pt-3 text-[13px] text-in">
              No mês <strong className="font-semibold">{result.crossoverMonth}</strong> o rendimento
              passa a ser maior que o seu aporte. É aí que o juro composto começa a trabalhar por você.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ FIRE */

export function FireSheet({
  open,
  onClose,
  currentWealth = 0,
}: {
  open: boolean;
  onClose: () => void;
  currentWealth?: number;
}) {
  const [expenseText, setExpenseText] = React.useState('5000');
  const [wealthText, setWealthText] = React.useState(
    currentWealth > 0 ? String(currentWealth / 100).replace('.', ',') : '0',
  );
  const [contributionText, setContributionText] = React.useState('2000');
  const [realRate, setRealRate] = React.useState('5');
  const [withdrawal, setWithdrawal] = React.useState('4');

  const result = simulateFire(
    parseMoney(expenseText) ?? 0,
    parseMoney(wealthText) ?? 0,
    parseMoney(contributionText) ?? 0,
    Number(String(realRate).replace(',', '.')) || 0,
    Number(String(withdrawal).replace(',', '.')) || 4,
  );

  return (
    <Sheet open={open} onClose={onClose} title="Viver de renda">
      <div className="grid gap-4">
        <Field label="Quanto você quer gastar por mês" htmlFor="fire-expense">
          <Input
            id="fire-expense"
            value={expenseText}
            onChange={(e) => setExpenseText(e.target.value)}
            inputMode="decimal"
            className="tnum text-[17px] font-semibold"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Você já tem" htmlFor="fire-wealth">
            <Input
              id="fire-wealth"
              value={wealthText}
              onChange={(e) => setWealthText(e.target.value)}
              inputMode="decimal"
              className="tnum"
            />
          </Field>
          <Field label="Aporte mensal" htmlFor="fire-contribution">
            <Input
              id="fire-contribution"
              value={contributionText}
              onChange={(e) => setContributionText(e.target.value)}
              inputMode="decimal"
              className="tnum"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Juro real ao ano" htmlFor="fire-rate" hint="Já descontada a inflação">
            <Input
              id="fire-rate"
              value={realRate}
              onChange={(e) => setRealRate(e.target.value)}
              inputMode="decimal"
              className="tnum"
            />
          </Field>
          <Field label="Retirada ao ano" htmlFor="fire-withdrawal" hint="A regra clássica é 4%">
            <Input
              id="fire-withdrawal"
              value={withdrawal}
              onChange={(e) => setWithdrawal(e.target.value)}
              inputMode="decimal"
              className="tnum"
            />
          </Field>
        </div>

        <div
          className={cn(
            'rounded-card border p-4',
            result.unreachable ? 'border-out/30 bg-out-soft' : 'border-line bg-surface-2',
          )}
        >
          <p className="text-[12px] text-ink-3">Você precisa juntar</p>
          <p className="amount mt-1 text-[32px] text-ink">{formatMoney(result.target)}</p>
          <p className="mt-1 text-[13px] text-ink-3">
            que sustentam {formatMoney(result.monthlyIncome)} por mês
          </p>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full bg-accent transition-[width] duration-[var(--t-slow)]"
              style={{ width: `${Math.max(1, result.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[12px] text-ink-3">{formatPercent(result.progress)} do caminho</p>

          <p className="mt-4 border-t border-line pt-3 text-[14px]">
            {result.unreachable ? (
              <span className="text-out">
                Com esse aporte e esse juro real, o alvo não é alcançado. Aumente o aporte ou reveja o
                gasto desejado.
              </span>
            ) : (
              <span className="text-ink">
                Mantendo o ritmo, você chega em{' '}
                <strong className="font-semibold">
                  {result.years} {result.years === 1 ? 'ano' : 'anos'}
                </strong>
                .
              </span>
            )}
          </p>

          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            A conta usa juro real, já sem a inflação. Projetar com juro nominal dá um número
            animador e falso — em trinta anos, a diferença é de anos de vida.
          </p>
        </div>
      </div>
    </Sheet>
  );
}

/** botão discreto que abre um simulador a partir de outra tela */
export function ToolButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" className="w-full" onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}
