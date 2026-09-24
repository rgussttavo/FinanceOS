'use client';

import * as React from 'react';
import { Check, FileUp } from 'lucide-react';
import { Button, EmptyState, Field, Panel, SectionTitle, Segmented, Select } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDayShort, formatMonthLabel, monthKeyOf } from '@/lib/dates';
import { buildReview, commitReview, type ImportResult, type ImportTarget, type ReviewRow } from '@/lib/importer';
import { formatMoney } from '@/lib/money';
import {
  StatementError,
  parseStatementFile,
  remapTable,
  type ColumnMap,
  type ParsedStatement,
} from '@/lib/statement';
import { rememberCategory, useCards } from '@/lib/store';
import type { Category, Cents, EntrySource, MonthKey } from '@/lib/types';

/**
 * Importar extrato.
 *
 * Três passos e nenhum salto no escuro: escolher o arquivo, revisar linha a
 * linha o que vai entrar, gravar. Nada é gravado antes da revisão — um
 * extrato lido errado vira cem lançamentos errados, e desfazer cem é pior do
 * que conferir uma tela.
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
  | { step: 'reading'; name: string }
  | { step: 'review'; name: string }
  | { step: 'saving' }
  | { step: 'done'; result: ImportResult };

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
  const [phase, setPhase] = React.useState<Phase>({ step: 'pick', error: null });
  const [targetType, setTargetType] = React.useState<'account' | 'card'>('account');
  const [cardId, setCardId] = React.useState<string>('');
  const [parsed, setParsed] = React.useState<ParsedStatement | null>(null);
  const [invert, setInvert] = React.useState(false);
  const [rows, setRows] = React.useState<ReviewRow[]>([]);

  const chosenCard = cardId || cards[0]?.id || '';
  const target: ImportTarget = React.useMemo(
    () => (targetType === 'card' && chosenCard ? { type: 'card', cardId: chosenCard } : { type: 'account' }),
    [targetType, chosenCard],
  );

  // a revisão se refaz quando muda o destino, o sinal ou uma coluna
  React.useEffect(() => {
    if (!parsed) return;
    let alive = true;
    buildReview(parsed, { spaceId, target, invert, categories }).then((next) => {
      if (alive) setRows(next);
    });
    return () => {
      alive = false;
    };
  }, [parsed, spaceId, target, invert, categories]);

  async function onFile(file: File | null | undefined) {
    if (!file) return;
    setPhase({ step: 'reading', name: file.name });
    try {
      const result = await parseStatementFile(file);
      // fatura em CSV costuma trazer a compra como positivo: o contrário do extrato
      const positives = result.rows.filter((r) => r.amount > 0).length;
      const cardSheet = targetType === 'card' && result.format !== 'ofx' && positives > result.rows.length / 2;
      if (result.creditCard && cards.length) setTargetType('card');
      setInvert(cardSheet);
      setParsed(result);
      setPhase({ step: 'review', name: file.name });
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
  }

  function reset() {
    setParsed(null);
    setRows([]);
    setInvert(false);
    setPhase({ step: 'pick', error: null });
  }

  if (phase.step === 'done') {
    const { created, settled, lastMonth } = phase.result;
    return (
      <Panel className="mt-3 px-6 py-10 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-in-soft text-in">
          <Check size={22} strokeWidth={2.6} />
        </span>
        <p className="mt-4 font-display text-[24px] text-ink">Extrato no lugar</p>
        <p className="mx-auto mt-2 max-w-[34ch] text-[14px] leading-relaxed text-ink-3">
          {created ? `${created} ${created === 1 ? 'lançamento criado' : 'lançamentos criados'}` : 'Nenhum lançamento novo'}
          {settled ? ` e ${settled} ${settled === 1 ? 'conta prevista marcada' : 'contas previstas marcadas'} como paga.` : '.'}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          {lastMonth ? (
            <Button variant="primary" onClick={() => onOpenMonth(lastMonth)}>
              Ver {formatMonthLabel(lastMonth)}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={reset}>
            Importar outro arquivo
          </Button>
        </div>
      </Panel>
    );
  }

  if (phase.step === 'review' && parsed) {
    return (
      <Review
        name={phase.name}
        parsed={parsed}
        rows={rows}
        setRows={setRows}
        categories={categories}
        hidden={hidden}
        invert={invert}
        setInvert={setInvert}
        targetType={targetType}
        onRemap={(map) => setParsed(remapTable(parsed, map))}
        onCancel={reset}
        onCommit={onCommit}
      />
    );
  }

  const busy = phase.step === 'reading' || phase.step === 'saving';

  return (
    <div className="grid gap-4 pt-2">
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
                      {c.name}
                      {c.last4 ? ` · final ${c.last4}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink-3">
                Cadastre o cartão em Cartões antes: as compras da fatura precisam de um cartão para
                entrar no ciclo certo.
              </p>
            )}
          </div>
        )}
      </Panel>

      <DropZone disabled={busy || (targetType === 'card' && !cards.length)} onFile={onFile}>
        {phase.step === 'reading' ? (
          <p className="text-[14px] text-ink-2">Lendo {phase.name}…</p>
        ) : (
          <>
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
          </>
        )}
      </DropZone>

      {phase.step === 'pick' && phase.error ? (
        <p role="alert" className="rounded-card border border-out/30 bg-out-soft px-4 py-3 text-[13px] leading-relaxed text-ink">
          {phase.error}
        </p>
      ) : null}

      <Panel className="p-4">
        <SectionTitle>Antes de importar</SectionTitle>
        <ul className="grid gap-2.5 text-[13px] leading-relaxed text-ink-2">
          <li>
            <strong className="font-medium text-ink">O arquivo não sai do aparelho.</strong> A leitura
            acontece aqui no navegador; só os lançamentos que você confirmar entram na sua conta.
          </li>
          <li>
            <strong className="font-medium text-ink">Prefira OFX.</strong> É o formato que traz o
            identificador de cada transação, e reimportar o mesmo período não duplica nada. No app ou
            no site do banco, costuma estar em Extrato › Exportar ou Salvar como.
          </li>
          <li>
            <strong className="font-medium text-ink">Pode importar de novo.</strong> O que já entrou é
            reconhecido e pulado; conta que você já tinha lançada é marcada como paga, não duplicada.
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
        'transition-colors duration-[var(--t-fast)]',
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

/* ---------------------------------------------------------------- revisão */

const STATUS_NOTE: Record<ReviewRow['status'], string> = {
  new: '',
  settle: 'já previsto',
  similar: 'parecido com um lançamento seu',
  imported: 'já importado',
  transfer: 'pagamento de fatura',
};

type Filter = 'all' | 'in' | 'skipped';

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
  onRemap: (map: ColumnMap) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const [filter, setFilter] = React.useState<Filter>('all');

  const chosen = rows.filter((r) => r.include);
  const totals = chosen.reduce(
    (acc, r) => {
      if (r.kind === 'in') acc.in += r.amount;
      else acc.out += r.amount;
      return acc;
    },
    { in: 0 as Cents, out: 0 as Cents },
  );
  const skipped = rows.length - chosen.length;
  const imported = rows.filter((r) => r.status === 'imported').length;
  const toSettle = chosen.filter((r) => r.status === 'settle').length;

  const first = rows[0]?.date;
  const last = rows[rows.length - 1]?.date;

  const visible = rows.filter((r) => (filter === 'in' ? r.include : filter === 'skipped' ? !r.include : true));

  const toggle = (key: string) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, include: !r.include } : r)));

  const setCategory = (row: ReviewRow, categoryId: string) => {
    setRows((list) => list.map((r) => (r.key === row.key ? { ...r, categoryId, unsure: false } : r)));
    // corrigir aqui ensina o app, igual a corrigir num lançamento
    void rememberCategory(row.description, categoryId);
  };

  const setAll = (include: boolean) =>
    setRows((list) => list.map((r) => (r.status === 'imported' ? r : { ...r, include })));

  return (
    <div className="grid gap-4 pt-2">
      <Panel className="p-4">
        <p className="truncate text-[12px] text-ink-3">{name}</p>
        <p className="mt-1 text-[15px] text-ink">
          {rows.length} {rows.length === 1 ? 'transação' : 'transações'}
          {first && last ? (
            <span className="text-ink-3">
              {' '}
              · {formatDayShort(first)}
              {monthKeyOf(first) !== monthKeyOf(last) || first !== last ? ` a ${formatDayShort(last)}` : ''}
            </span>
          ) : null}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-field bg-surface-2 px-3 py-2">
            <p className="text-[11px] text-ink-3">Entra</p>
            <p className="tnum text-[15px] font-medium text-in">{formatMoney(totals.in, { hidden })}</p>
          </div>
          <div className="rounded-field bg-surface-2 px-3 py-2">
            <p className="text-[11px] text-ink-3">Sai</p>
            <p className="tnum text-[15px] font-medium text-out">{formatMoney(totals.out, { hidden })}</p>
          </div>
        </div>

        <ul className="mt-3 grid gap-1 text-[12px] leading-relaxed text-ink-3">
          {imported ? (
            <li>
              {imported === 1
                ? '1 já tinha entrado num import anterior e fica de fora.'
                : `${imported} já tinham entrado num import anterior e ficam de fora.`}
            </li>
          ) : null}
          {toSettle ? (
            <li>
              {toSettle === 1
                ? '1 bate com uma conta que você já tinha prevista: vira baixa, não lançamento novo.'
                : `${toSettle} batem com contas que você já tinha previsto: viram baixa, não lançamento novo.`}
            </li>
          ) : null}
          {parsed.ignored ? (
            <li>
              {parsed.ignored === 1
                ? '1 linha de saldo, total ou cabeçalho foi ignorada.'
                : `${parsed.ignored} linhas de saldo, total ou cabeçalho foram ignoradas.`}
            </li>
          ) : null}
          {parsed.unreadable ? (
            <li>
              {parsed.unreadable === 1
                ? '1 linha não tinha data ou valor legível.'
                : `${parsed.unreadable} linhas não tinham data ou valor legível.`}
            </li>
          ) : null}
        </ul>

        <label className="mt-3 flex items-center gap-2.5 text-[13px] text-ink-2">
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
      </Panel>

      <div className="grid gap-2">
        <Segmented
          label="Mostrar"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Todas · ${rows.length}` },
            { value: 'in', label: `Entram · ${chosen.length}` },
            { value: 'skipped', label: `De fora · ${skipped}` },
          ]}
        />
        <span className="flex justify-end gap-1">
          <Button size="sm" variant="quiet" onClick={() => setAll(true)}>
            Marcar todas
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setAll(false)}>
            Nenhuma
          </Button>
        </span>
      </div>

      <Panel className="divide-y divide-line">
        {visible.length ? (
          visible.map((r) => (
            <ReviewLine
              key={r.key}
              row={r}
              categories={categories}
              hidden={hidden}
              targetType={targetType}
              onToggle={() => toggle(r.key)}
              onCategory={(id) => setCategory(r, id)}
            />
          ))
        ) : (
          <EmptyState title="Nada aqui" description="Nenhuma linha neste filtro." />
        )}
      </Panel>

      <div
        className="sticky z-10 flex gap-2 rounded-panel border border-line bg-surface/95 p-3 shadow-e2 backdrop-blur"
        style={{ bottom: 'calc(var(--tabbar-h) + var(--sa-bottom) + 12px)' }}
      >
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" disabled={!chosen.length} onClick={onCommit}>
          Importar {chosen.length} {chosen.length === 1 ? 'linha' : 'linhas'}
        </Button>
      </div>
    </div>
  );
}

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

  let note = STATUS_NOTE[row.status];
  if (row.status === 'settle' && row.match) note = `marca “${row.match.description}” como paga`;
  if (row.status === 'similar' && row.match) note = `parecido com “${row.match.description}”`;
  if (row.status === 'transfer') {
    note = targetType === 'card' ? 'pagamento ou estorno da fatura' : 'pagamento de fatura: as compras do cartão já contam';
  }
  if (row.installment && row.status === 'new') {
    note = `parcela ${row.installment.index} de ${row.installment.total} · lança a compra inteira`;
  }

  return (
    <div className={cn('flex gap-3 px-4 py-3', !row.include && 'opacity-60')}>
      <button
        type="button"
        role="checkbox"
        aria-checked={row.include}
        aria-label={row.include ? `Deixar de fora ${row.description}` : `Incluir ${row.description}`}
        disabled={locked}
        onClick={onToggle}
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-[7px] border transition-colors duration-[var(--t-fast)]',
          row.include ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface',
          locked && 'opacity-40',
        )}
      >
        {row.include ? <Check size={14} strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] text-ink">{row.description}</p>
          <p
            className={cn(
              'tnum shrink-0 text-[14px] font-medium',
              row.kind === 'in' ? 'text-in' : row.kind === 'invest' ? 'text-inv' : 'text-out',
            )}
          >
            {row.kind === 'in' ? '+' : '−'}
            {formatMoney(row.amount, { hidden })}
          </p>
        </div>

        <p className="mt-0.5 truncate text-[12px] text-ink-3">
          {formatDayShort(row.date)}
          {note ? <span className={cn(row.status === 'settle' && 'text-in')}> · {note}</span> : null}
        </p>

        {row.include && row.status !== 'settle' ? (
          <Select
            aria-label={`Categoria de ${row.description}`}
            value={row.categoryId ?? ''}
            onChange={(e) => onCategory(e.target.value)}
            className={cn('mt-2 h-8 text-[13px]', row.unsure && 'border-warn/60')}
          >
            {!row.categoryId ? <option value="">Sem categoria</option> : null}
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
    </div>
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
