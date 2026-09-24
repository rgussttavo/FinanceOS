'use client';

import * as React from 'react';
import { ArrowRight, Check, ChevronDown, FileUp, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Field, Meter, Panel, SectionTitle, Segmented, Select, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDayShort, formatMonthLabel } from '@/lib/dates';
import {
  buildReview,
  commitReview,
  groupOf,
  type ImportResult,
  type ImportTarget,
  type ReviewGroup,
  type ReviewRow,
} from '@/lib/importer';
import { formatMoney } from '@/lib/money';
import {
  StatementError,
  parseStatementFile,
  remapTable,
  type ColumnMap,
  type ParsedStatement,
} from '@/lib/statement';
import { rememberCategory, useAllSubscriptions, useCards } from '@/lib/store';
import type { Category, Cents, EntrySource, MonthKey } from '@/lib/types';

/**
 * Importar extrato.
 *
 * Cinco etapas e nenhum salto no escuro: escolher o arquivo, ler (com a barra
 * andando de verdade), ver o resumo do que foi encontrado, revisar só o que o
 * app não tem certeza e importar. Nada é gravado antes da última etapa — um
 * extrato lido errado vira cem lançamentos errados.
 *
 * O que o app tem certeza não pede revisão linha a linha: fica num grupo
 * fechado, que a pessoa abre se quiser conferir.
 */

const ACCEPT = '.ofx,.qfx,.csv,.tsv,.txt,.qif,.xls,.xlsx,.xlsm,.ods';

const FORMATS = ['OFX', 'CSV', 'XLSX', 'XLS', 'QIF', 'ODS', 'TXT'] as const;

const SOURCE_BY_FORMAT: Record<ParsedStatement['format'], EntrySource> = {
  ofx: 'ofx',
  qif: 'qif',
  csv: 'csv',
  xlsx: 'xlsx',
};

type Phase =
  | { step: 'pick'; error: string | null }
  | { step: 'reading'; name: string; stage: string; progress: number | null }
  | { step: 'review'; name: string }
  | { step: 'saving' }
  | { step: 'done'; result: ImportResult };

const GROUPS: { id: ReviewGroup; title: string; hint: string; open: boolean }[] = [
  { id: 'review', title: 'Precisam da sua olhada', hint: 'A categoria não é certa. Confirme ou troque.', open: true },
  { id: 'match', title: 'Batem com o que você já tem', hint: 'Contas previstas viram baixa; o resto fica de fora até você decidir.', open: true },
  { id: 'ready', title: 'Novos, prontos para entrar', hint: 'Categoria sugerida com boa confiança.', open: false },
  { id: 'card-payment', title: 'Pagamentos de cartão', hint: 'Ficam de fora: as compras do cartão já contam.', open: false },
  { id: 'internal', title: 'Transferências e resgates', hint: 'Dinheiro entre contas suas não é renda nem gasto.', open: false },
  { id: 'duplicate', title: 'Já importados antes', hint: 'Reconhecidos pelo identificador; não entram de novo.', open: false },
];

export function ImportarView({
  spaceId,
  categories,
  hidden,
  onOpenMonth,
}: {
  spaceId: string;
  categories: Category[];
  hidden: boolean;
  onOpenMonth: (month: MonthKey) => void;
}) {
  const cards = useCards(spaceId);
  const subscriptions = useAllSubscriptions(spaceId);
  const [phase, setPhase] = React.useState<Phase>({ step: 'pick', error: null });
  const [targetType, setTargetType] = React.useState<'account' | 'card'>('account');
  const [cardId, setCardId] = React.useState<string>('');
  const [parsed, setParsed] = React.useState<ParsedStatement | null>(null);
  const [invert, setInvert] = React.useState(false);
  const [rows, setRows] = React.useState<ReviewRow[]>([]);
  const [fileName, setFileName] = React.useState('');

  const chosenCard = cardId || cards[0]?.id || '';
  const target: ImportTarget = React.useMemo(
    () => (targetType === 'card' && chosenCard ? { type: 'card', cardId: chosenCard } : { type: 'account' }),
    [targetType, chosenCard],
  );

  async function review(next: ParsedStatement, nextInvert: boolean, name: string) {
    setPhase({ step: 'reading', name, stage: 'Comparando com o que você já tem', progress: 0 });
    const built = await buildReview(next, {
      spaceId,
      target,
      invert: nextInvert,
      categories,
      subscriptions,
      onProgress: (done, total) =>
        setPhase({ step: 'reading', name, stage: `Comparando com o que você já tem · ${done} de ${total}`, progress: total ? done / total : 1 }),
    });
    setRows(built);
    setPhase({ step: 'review', name });
  }

  async function onFile(file: File | null | undefined) {
    if (!file) return;
    setFileName(file.name);
    setPhase({ step: 'reading', name: file.name, stage: 'Lendo o arquivo', progress: 0 });
    try {
      const result = await parseStatementFile(file, (f) =>
        setPhase({ step: 'reading', name: file.name, stage: f < 1 ? 'Lendo o arquivo' : 'Reconhecendo colunas e datas', progress: f < 1 ? f : null }),
      );
      // fatura em CSV costuma trazer a compra como positivo: o contrário do extrato
      const positives = result.rows.filter((r) => r.amount > 0).length;
      const cardSheet = targetType === 'card' && result.format !== 'ofx' && positives > result.rows.length / 2;
      if (result.creditCard && cards.length) setTargetType('card');
      setInvert(cardSheet);
      setParsed(result);
      await review(result, cardSheet, file.name);
    } catch (err) {
      const message =
        err instanceof StatementError
          ? err.message
          : 'Não consegui ler este arquivo. Confira se é o extrato exportado pelo banco.';
      setPhase({ step: 'pick', error: message });
    }
  }

  async function onCommit() {
    if (!parsed) return;
    setPhase({ step: 'saving' });
    const result = await commitReview(rows, {
      spaceId,
      target,
      source: SOURCE_BY_FORMAT[parsed.format],
    });
    setParsed(null);
    setRows([]);
    setPhase({ step: 'done', result });
    toast('Extrato importado.');
  }

  function reset() {
    setParsed(null);
    setRows([]);
    setInvert(false);
    setPhase({ step: 'pick', error: null });
  }

  const steps = ['Arquivo', 'Leitura', 'Revisão', 'Pronto'];
  const stepIndex = phase.step === 'pick' ? 0 : phase.step === 'reading' ? 1 : phase.step === 'review' || phase.step === 'saving' ? 2 : 3;

  return (
    <div className="grid gap-4 pt-2 lg:max-w-[880px]">
      <ol className="flex items-center gap-2 text-[12px]" aria-label="Etapas da importação">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === stepIndex ? 'step' : undefined}>
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full text-[11px] font-semibold',
                i < stepIndex ? 'bg-in text-canvas' : i === stepIndex ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-3',
              )}
            >
              {i < stepIndex ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className={cn(i === stepIndex ? 'font-medium text-ink' : 'text-ink-3', 'hidden sm:inline')}>{s}</span>
            {i < steps.length - 1 ? <span className="h-px w-4 bg-line-strong sm:w-8" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      {phase.step === 'done' ? (
        <Done result={phase.result} onOpenMonth={onOpenMonth} onAgain={reset} />
      ) : phase.step === 'reading' ? (
        <Panel className="px-6 py-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
            <RefreshCw size={20} className="motion-safe:animate-spin" style={{ animationDuration: '1.6s' }} />
          </span>
          <p className="mt-4 truncate text-[15px] font-medium text-ink">{phase.name}</p>
          <p className="mt-1 text-[13px] text-ink-3" aria-live="polite">
            {phase.stage}
          </p>
          <div className="mx-auto mt-4 max-w-[320px]">
            {phase.progress === null ? (
              <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Lendo o extrato">
                <span className="block h-full w-1/3 animate-pulse rounded-full bg-accent" />
              </div>
            ) : (
              <Meter value={phase.progress} label="Lendo o extrato" />
            )}
          </div>
        </Panel>
      ) : (phase.step === 'review' || phase.step === 'saving') && parsed ? (
        <Review
          name={fileName}
          parsed={parsed}
          rows={rows}
          setRows={setRows}
          categories={categories}
          hidden={hidden}
          invert={invert}
          setInvert={(v) => {
            setInvert(v);
            void review(parsed, v, fileName);
          }}
          targetType={targetType}
          saving={phase.step === 'saving'}
          onRemap={(map) => {
            const next = remapTable(parsed, map);
            setParsed(next);
            void review(next, invert, fileName);
          }}
          onCancel={reset}
          onCommit={onCommit}
        />
      ) : (
        <PickStep
          phase={phase}
          targetType={targetType}
          setTargetType={setTargetType}
          cards={cards}
          chosenCard={chosenCard}
          setCardId={setCardId}
          onFile={onFile}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ 1 · arquivo */

function PickStep({
  phase,
  targetType,
  setTargetType,
  cards,
  chosenCard,
  setCardId,
  onFile,
}: {
  phase: Phase;
  targetType: 'account' | 'card';
  setTargetType: (t: 'account' | 'card') => void;
  cards: { id: string; name: string; last4: string; institution: string }[];
  chosenCard: string;
  setCardId: (id: string) => void;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
      <div className="grid gap-4">
        <div>
          <h2 className="font-display text-[26px] leading-tight text-ink">Importe seu extrato</h2>
          <p className="mt-1 text-[14px] text-ink-2">O mês inteiro entra de uma vez, e nada é gravado antes de você conferir.</p>
        </div>

        <Panel className="p-4">
          <SectionTitle>De onde é o arquivo</SectionTitle>
          <Segmented
            label="Tipo de extrato"
            value={targetType}
            onChange={setTargetType}
            options={[
              { value: 'account', label: 'Conta' },
              { value: 'card', label: 'Fatura do cartão' },
            ]}
          />
          {targetType === 'card' && (
            <div className="mt-3">
              {cards.length ? (
                <Field label="Cartão" htmlFor="import-card">
                  <Select id="import-card" value={chosenCard} onChange={(e) => setCardId(e.target.value)}>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.institution}
                        {c.last4 ? ` · final ${c.last4}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="text-[13px] leading-relaxed text-ink-3">
                  Cadastre o cartão em Cartões antes: as compras da fatura precisam de um cartão para entrar no ciclo certo.
                </p>
              )}
            </div>
          )}
        </Panel>

        <DropZone disabled={targetType === 'card' && !cards.length} onFile={onFile}>
          <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
            <FileUp size={22} />
          </span>
          <p className="mt-3 text-[15px] font-medium text-ink">Escolha o arquivo do extrato</p>
          <p className="mt-1 text-[13px] text-ink-3">ou arraste para cá</p>
          <p className="mt-4 flex flex-wrap justify-center gap-1.5">
            {FORMATS.map((f) => (
              <span key={f} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-3">
                {f}
              </span>
            ))}
          </p>
        </DropZone>

        {phase.step === 'pick' && phase.error ? (
          <p role="alert" className="rounded-card border border-out/30 bg-out-soft px-4 py-3 text-[13px] leading-relaxed text-ink">
            {phase.error}
          </p>
        ) : null}
      </div>

      <Panel className="p-5">
        <SectionTitle>Antes de importar</SectionTitle>
        <ul className="grid gap-3.5 text-[13px] leading-relaxed text-ink-2">
          <li className="flex gap-3">
            <Lock size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span>
              <strong className="font-medium text-ink">O arquivo não sai do aparelho.</strong> A leitura acontece aqui no navegador; só os
              lançamentos que você confirmar entram na sua conta.
            </span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span>
              <strong className="font-medium text-ink">Prefira OFX.</strong> É o formato que traz o identificador de cada transação. No app
              ou no site do banco, costuma estar em Extrato › Exportar ou Salvar como.
            </span>
          </li>
          <li className="flex gap-3">
            <RefreshCw size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span>
              <strong className="font-medium text-ink">Pode importar de novo.</strong> O que já entrou é reconhecido e pulado; conta que você
              já tinha lançada vira baixa, e assinatura cadastrada não entra duas vezes.
            </span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}

/* --------------------------------------------------------------- arquivo */

function DropZone({
  disabled,
  onFile,
  children,
}: {
  disabled: boolean;
  onFile: (file: File | undefined) => void;
  children: React.ReactNode;
}) {
  const [over, setOver] = React.useState(false);

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center rounded-panel border border-dashed px-6 py-10 text-center',
        'transition-colors duration-[var(--t-fast)] focus-within:border-accent',
        over ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-surface-2',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <input
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {children}
    </label>
  );
}

/* ------------------------------------------------------------- 3 · revisão */

function Review({
  name,
  parsed,
  rows,
  setRows,
  categories,
  hidden,
  invert,
  setInvert,
  targetType,
  saving,
  onRemap,
  onCancel,
  onCommit,
}: {
  name: string;
  parsed: ParsedStatement;
  rows: ReviewRow[];
  setRows: React.Dispatch<React.SetStateAction<ReviewRow[]>>;
  categories: Category[];
  hidden: boolean;
  invert: boolean;
  setInvert: (v: boolean) => void;
  targetType: 'account' | 'card';
  saving: boolean;
  onRemap: (map: ColumnMap) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const grouped = React.useMemo(() => {
    const map = new Map<ReviewGroup, ReviewRow[]>();
    for (const r of rows) {
      const g = groupOf(r);
      map.set(g, [...(map.get(g) ?? []), r]);
    }
    return map;
  }, [rows]);

  const chosen = rows.filter((r) => r.include);
  const creating = chosen.filter((r) => r.status !== 'settle');
  const settling = chosen.filter((r) => r.status === 'settle');
  const totals = creating.reduce(
    (acc, r) => {
      if (r.kind === 'in') acc.in += r.amount;
      else acc.out += r.amount;
      return acc;
    },
    { in: 0 as Cents, out: 0 as Cents },
  );
  const first = rows[0]?.date;
  const last = rows[rows.length - 1]?.date;

  const toggle = (key: string) => setRows((list) => list.map((r) => (r.key === key ? { ...r, include: !r.include } : r)));

  const setCategory = (row: ReviewRow, categoryId: string) => {
    setRows((list) => list.map((r) => (r.key === row.key ? { ...r, categoryId, unsure: false, confidence: 'alta' } : r)));
    // corrigir aqui ensina o app, igual a corrigir num lançamento
    void rememberCategory(row.description, categoryId);
  };

  const confirmAll = (group: ReviewGroup) =>
    setRows((list) => list.map((r) => (groupOf(r) === group && r.categoryId ? { ...r, confidence: 'alta', unsure: false, include: true } : r)));

  return (
    <div className="grid gap-4">
      <Panel className="p-5">
        <p className="truncate text-[12px] text-ink-3">{name}</p>
        <p className="mt-1 font-display text-[26px] leading-tight text-ink">
          Encontramos {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}.
        </p>
        {first && last ? (
          <p className="text-[13px] text-ink-3">
            De {formatDayShort(first)} a {formatDayShort(last)}
            {parsed.ignored ? ` · ${parsed.ignored} ${parsed.ignored === 1 ? 'linha de saldo ou total ignorada' : 'linhas de saldo ou total ignoradas'}` : ''}
            {parsed.unreadable ? ` · ${parsed.unreadable} sem data ou valor legível` : ''}
          </p>
        ) : null}

        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GROUPS.map((g) => {
            const n = grouped.get(g.id)?.length ?? 0;
            if (!n) return null;
            return (
              <li key={g.id} className="rounded-field bg-surface-2 px-3 py-2">
                <p className="tnum text-[18px] font-semibold text-ink">{n}</p>
                <p className="text-[12px] leading-snug text-ink-3">{g.title.toLowerCase()}</p>
              </li>
            );
          })}
        </ul>

        <details className="mt-4 rounded-field border border-line">
          <summary className="cursor-pointer px-3 py-2 text-[13px] text-ink-2">Algo errado na leitura?</summary>
          <div className="px-3 pb-3">
            <label className="mt-1 flex items-center gap-2.5 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={invert}
                onChange={(e) => setInvert(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              {targetType === 'card'
                ? 'Compras vêm positivas no arquivo (inverter sinais)'
                : 'Entradas e saídas estão trocadas (inverter sinais)'}
            </label>
            {parsed.table ? <Columns parsed={parsed} onRemap={onRemap} /> : null}
          </div>
        </details>
      </Panel>

      {GROUPS.map((g) => {
        const list = grouped.get(g.id) ?? [];
        if (!list.length) return null;
        return (
          <GroupPanel key={g.id} group={g} count={list.length} included={list.filter((r) => r.include).length} onConfirmAll={g.id === 'review' ? () => confirmAll('review') : undefined}>
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <ReviewLine
                  key={r.key}
                  row={r}
                  categories={categories}
                  hidden={hidden}
                  targetType={targetType}
                  onToggle={() => toggle(r.key)}
                  onCategory={(id) => setCategory(r, id)}
                />
              ))}
            </ul>
          </GroupPanel>
        );
      })}

      <div
        className="sticky z-20 grid gap-3 rounded-panel border border-line-strong bg-surface/95 p-4 shadow-e3 backdrop-blur lg:bottom-6"
        style={{ bottom: 'calc(var(--nav-h) + var(--sa-bottom) + 12px)' }}
      >
        <p className="text-[14px] leading-snug text-ink">
          <strong className="font-semibold">
            {creating.length} {creating.length === 1 ? 'lançamento será adicionado' : 'lançamentos serão adicionados'}
          </strong>
          {settling.length ? ` e ${settling.length} ${settling.length === 1 ? 'conta prevista marcada' : 'contas previstas marcadas'} como paga` : ''}.
          <span className="block text-[12px] text-ink-3">
            Entra {formatMoney(totals.in, { hidden })} · sai {formatMoney(totals.out, { hidden })}
          </span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" disabled={!chosen.length || saving} onClick={onCommit}>
            {saving ? 'Importando…' : 'Importar lançamentos'}
            {!saving ? <ArrowRight size={16} /> : null}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GroupPanel({
  group,
  count,
  included,
  onConfirmAll,
  children,
}: {
  group: (typeof GROUPS)[number];
  count: number;
  included: number;
  onConfirmAll?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(group.open);
  return (
    <Panel className="overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
            {group.title}
            <Badge tone={group.id === 'review' ? 'warn' : group.id === 'ready' ? 'in' : 'neutral'}>{count}</Badge>
          </span>
          <span className="block text-[12.5px] text-ink-3">
            {group.hint} {included ? `${included} ${included === 1 ? 'entra' : 'entram'}.` : 'Nenhuma entra.'}
          </span>
        </span>
        <ChevronDown size={18} className={cn('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-line px-5 pb-3">
          {onConfirmAll ? (
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="soft" onClick={onConfirmAll}>
                <Check size={14} /> Confirmar as sugestões
              </Button>
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
    </Panel>
  );
}

const CONFIDENCE_TONE = { alta: 'in', média: 'accent', baixa: 'warn' } as const;

function ReviewLine({
  row,
  categories,
  hidden,
  targetType,
  onToggle,
  onCategory,
}: {
  row: ReviewRow;
  categories: Category[];
  hidden: boolean;
  targetType: 'account' | 'card';
  onToggle: () => void;
  onCategory: (id: string) => void;
}) {
  const options = categories.filter((c) => c.kind === row.kind);
  const locked = row.status === 'imported';

  let note = '';
  if (row.status === 'settle' && row.match) note = `marca “${row.match.description}” como paga`;
  if (row.status === 'similar' && row.match) note = `parecido com “${row.match.description}”, que já está lançado`;
  if (row.status === 'subscription' && row.match) note = `é a assinatura ${row.match.description}, que já conta no mês`;
  if (row.status === 'imported') note = 'já importado';
  if (row.status === 'internal') note = 'transferência ou resgate: não é renda nem gasto';
  if (row.status === 'transfer') note = targetType === 'card' ? 'pagamento ou estorno da fatura' : 'pagamento de fatura: as compras do cartão já contam';
  if (row.installment && row.status === 'new') note = `parcela ${row.installment.index} de ${row.installment.total} · lança a compra inteira`;

  return (
    <li className={cn('flex gap-3 py-3', !row.include && 'opacity-60')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={row.include}
        aria-label={row.include ? `Deixar de fora ${row.description}` : `Incluir ${row.description}`}
        disabled={locked}
        onClick={onToggle}
        className={cn(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] border transition-colors duration-[var(--t-fast)]',
          row.include ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface',
          locked && 'opacity-40',
        )}
      >
        {row.include ? <Check size={15} strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] text-ink">{row.description}</p>
          <p className={cn('tnum shrink-0 text-[14px] font-semibold', row.kind === 'in' ? 'text-in' : row.kind === 'invest' ? 'text-inv' : 'text-out')}>
            {row.kind === 'in' ? '+' : '−'}
            {formatMoney(row.amount, { hidden })}
          </p>
        </div>

        <p className="mt-0.5 text-[12px] text-ink-3">
          {formatDayShort(row.date)}
          {note ? <span className={cn(row.status === 'settle' && 'text-in')}> · {note}</span> : null}
        </p>

        {row.include && row.status !== 'settle' ? (
          <div className="mt-2 flex items-center gap-2">
            <Select
              aria-label={`Categoria de ${row.description}`}
              value={row.categoryId ?? ''}
              onChange={(e) => onCategory(e.target.value)}
              className={cn('h-9 flex-1 text-[13px]', row.confidence === 'baixa' && 'border-warn/60')}
            >
              {!row.categoryId ? <option value="">Escolha a categoria</option> : null}
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
            {row.categoryId ? <Badge tone={CONFIDENCE_TONE[row.confidence]}>confiança {row.confidence}</Badge> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------- 4 · pronto */

function Done({ result, onOpenMonth, onAgain }: { result: ImportResult; onOpenMonth: (m: MonthKey) => void; onAgain: () => void }) {
  const { created, settled, lastMonth } = result;
  return (
    <Panel className="px-6 py-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-in-soft text-in motion-safe:animate-[pop-in_var(--t-slow)_var(--ease-out)]">
        <Check size={26} strokeWidth={2.6} />
      </span>
      <p className="mt-4 font-display text-[26px] text-ink">Extrato no lugar</p>
      <p className="mx-auto mt-2 max-w-[36ch] text-[14px] leading-relaxed text-ink-3">
        {created ? `${created} ${created === 1 ? 'lançamento criado' : 'lançamentos criados'}` : 'Nenhum lançamento novo'}
        {settled ? ` e ${settled} ${settled === 1 ? 'conta prevista marcada' : 'contas previstas marcadas'} como paga.` : '.'}
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        {lastMonth ? (
          <Button variant="primary" onClick={() => onOpenMonth(lastMonth)}>
            Ver {formatMonthLabel(lastMonth)}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onAgain}>
          Importar outro arquivo
        </Button>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- colunas */

const COLUMN_FIELDS: { key: keyof ColumnMap; label: string; optional: boolean }[] = [
  { key: 'date', label: 'Data', optional: false },
  { key: 'description', label: 'Descrição', optional: false },
  { key: 'memo', label: 'Complemento', optional: true },
  { key: 'amount', label: 'Valor', optional: true },
  { key: 'credit', label: 'Crédito', optional: true },
  { key: 'debit', label: 'Débito', optional: true },
];

/**
 * O mapeamento de colunas, aberto só quando a pessoa quer conferir.
 *
 * O palpite acerta os extratos comuns; para o banco que inventa um layout, é
 * aqui que se diz "a data é a segunda coluna" sem precisar editar o arquivo.
 */
function Columns({ parsed, onRemap }: { parsed: ParsedStatement; onRemap: (map: ColumnMap) => void }) {
  const table = parsed.table;
  if (!table) return null;

  const width = Math.max(...table.grid.slice(0, 60).map((r) => r.length));
  const header = table.headerRow >= 0 ? table.grid[table.headerRow] : null;
  const sample = table.grid[table.headerRow + 1] ?? [];
  const label = (i: number) => {
    const head = header?.[i];
    const example = sample[i];
    const name = head ? String(head) : `Coluna ${i + 1}`;
    return example !== null && example !== undefined ? `${name} — ${String(example).slice(0, 24)}` : name;
  };

  return (
    <details className="mt-3 rounded-field border border-line">
      <summary className="cursor-pointer px-3 py-2 text-[13px] text-ink-2">
        Conferir colunas{table.sheet ? ` · aba “${table.sheet}”` : ''}
      </summary>
      <div className="grid gap-3 px-3 pb-3 pt-1 sm:grid-cols-2">
        {COLUMN_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`col-${f.key}`}>
            <Select
              id={`col-${f.key}`}
              value={table.map[f.key]}
              onChange={(e) => {
                const next = { ...table.map, [f.key]: Number(e.target.value) };
                // valor único e crédito/débito separados não convivem
                if (f.key === 'amount' && next.amount >= 0) {
                  next.credit = -1;
                  next.debit = -1;
                }
                if ((f.key === 'credit' || f.key === 'debit') && Number(e.target.value) >= 0) next.amount = -1;
                onRemap(next);
              }}
              className="h-9 text-[13px]"
            >
              {f.optional ? <option value={-1}>—</option> : null}
              {Array.from({ length: width }, (_, i) => (
                <option key={i} value={i}>
                  {label(i)}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
    </details>
  );
}
