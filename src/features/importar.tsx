'use client';

import * as React from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronDown, CreditCard, FileUp, Lock, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { navigate } from '@/components/shell';
import { setBalance } from '@/lib/accounts';
import { Badge, Button, Chip, Field, Input, Meter, Panel, SectionTitle, Segmented, Select, toast } from '@/components/ui';
import { BANKS, bankInText, cardOfBank, dueDateOf, invoiceMonthOf, matchBank, type BankInfo } from '@/lib/cards';
import { cn } from '@/lib/cn';
import { addMonthsToKey, formatDayShort, formatMonthLabel } from '@/lib/dates';
import {
  buildReview,
  commitReview,
  groupOf,
  invoiceReconciliation,
  type ImportResult,
  type ImportTarget,
  type ReviewGroup,
  type ReviewRow,
} from '@/lib/importer';
import { formatMoney, parseMoney } from '@/lib/money';
import {
  StatementError,
  parseStatementFile,
  remapTable,
  statementIntegrity,
  type ColumnMap,
  type ParsedStatement,
} from '@/lib/statement';
import { createCard, rememberCategory, useAccounts, useAllSubscriptions, useCards } from '@/lib/store';
import type { Card, Category, Cents, EntrySource, IsoDate, MonthKey } from '@/lib/types';

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

/**
 * No iPhone e no iPad o filtro vira armadilha: o Safari traduz cada extensão
 * para um tipo do sistema, e OFX, QFX e QIF não têm um — o arquivo aparece
 * apagado no seletor e não dá para escolher. Lá o seletor abre sem filtro e o
 * formato é conferido depois de escolhido, como em qualquer outro lugar.
 */
const isAppleMobile = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

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
  { id: 'card-payment', title: 'Pagamentos de cartão', hint: 'Viram pagamento da fatura: saem da conta, e as compras continuam contando só no cartão.', open: true },
  { id: 'internal', title: 'Transferências e resgates', hint: 'Transferência vira transferência, com os dois lados; resgate volta para a conta. Nada disso é renda nem gasto.', open: true },
  { id: 'duplicate', title: 'Já importados antes', hint: 'Reconhecidos pelo identificador; não entram de novo.', open: false },
];

export function ImportarView({
  spaceId,
  categories,
  hidden,
  onOpenMonth,
  finishLabel,
  initialCard,
}: {
  spaceId: string;
  categories: Category[];
  hidden: boolean;
  onOpenMonth: (month: MonthKey) => void;
  /** o texto do botão final, quando a importação faz parte do primeiro acesso */
  finishLabel?: string;
  /** abre já na fatura de um cartão ('novo' abre o cadastro rápido) */
  initialCard?: string | null;
}) {
  const cards = useCards(spaceId);
  const accounts = useAccounts(spaceId);
  const subscriptions = useAllSubscriptions(spaceId);
  /** a conta em que o extrato entra; vazio = a principal */
  const [accountId, setAccountId] = React.useState<string>('');
  /** usar o saldo anterior do arquivo como saldo inicial, quando a conta não tem */
  const [useOpening, setUseOpening] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>({ step: 'pick', error: null });
  const [targetType, setTargetType] = React.useState<'account' | 'card'>(initialCard ? 'card' : 'account');
  const [cardId, setCardId] = React.useState<string>(initialCard && initialCard !== 'novo' ? initialCard : '');
  /** o cadastro rápido de cartão, aberto dentro da importação; o banco vem sugerido quando dá */
  const [newCard, setNewCard] = React.useState<{ bank: BankInfo | null } | null>(initialCard === 'novo' ? { bank: null } : null);
  /** fatura escolhida antes de haver cartão: segue sozinha assim que o cartão existir */
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [payments, setPayments] = React.useState<ReviewRow[]>([]);
  /** a fatura que o arquivo é, escolhida pelo vencimento; null = o palpite pelo ciclo */
  const [invoicePick, setInvoicePick] = React.useState<MonthKey | null>(null);
  const [parsed, setParsed] = React.useState<ParsedStatement | null>(null);
  const [invert, setInvert] = React.useState(false);
  const [rows, setRows] = React.useState<ReviewRow[]>([]);
  const [fileName, setFileName] = React.useState('');

  const chosenCard = cardId || cards[0]?.id || '';
  const chosenAccount = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.primary) ?? accounts[0] ?? null;
  const target: ImportTarget = React.useMemo(
    () =>
      targetType === 'card' && chosenCard ? { type: 'card', cardId: chosenCard } : { type: 'account', accountId: chosenAccount?.id ?? null },
    [targetType, chosenCard, chosenAccount?.id],
  );
  const accountHasStart =
    !!chosenAccount && (!!chosenAccount.openingDate || chosenAccount.openingBalance !== 0 || (chosenAccount.checkpoints?.length ?? 0) > 0);

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
      /**
       * Fatura sem cartão escolhido: as compras não teriam ciclo onde cair. Em
       * vez de importar como conta (e contar tudo no dia errado), a importação
       * para, pede o cartão ali mesmo e continua sozinha.
       */
      if ((result.creditCard && targetType !== 'card') || (targetType === 'card' && !chosenCard)) {
        setTargetType('card');
        setPendingFile(file);
        if (!cards.length) setNewCard({ bank: null });
        setPhase({ step: 'pick', error: null });
        return;
      }
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
    // pagamentos de fatura achados no extrato da conta: as compras deles moram na fatura
    // fatura paga de um cartão que não está no app: o convite para importá-la
    setPayments(target.type === 'account' ? rows.filter((r) => r.billPayment && r.outflow && !r.payCardId && r.include) : []);
    setPhase({ step: 'saving' });
    const result = await commitReview(rows, {
      spaceId,
      target,
      source: SOURCE_BY_FORMAT[parsed.format],
      invoiceMonth: target.type === 'card' ? invoicePick : null,
      fileName,
      balance: parsed.balance,
      useOpening: useOpening && !accountHasStart,
    });
    setParsed(null);
    setRows([]);
    setPhase({ step: 'done', result });
    toast('Extrato importado.');
  }

  function reset() {
    setParsed(null);
    setRows([]);
    setInvoicePick(null);
    setInvert(false);
    setPendingFile(null);
    setPhase({ step: 'pick', error: null });
  }

  /** do "Pronto" da conta para a fatura do cartão que ela pagou */
  function importCardOf(bank: BankInfo | null) {
    reset();
    setPayments([]);
    setTargetType('card');
    const card = cardOfBank(cards, bank);
    if (card) {
      setCardId(card.id);
      setNewCard(null);
    } else {
      setNewCard({ bank });
    }
  }

  // a fatura que estava esperando o cartão segue assim que ele existe
  React.useEffect(() => {
    if (!pendingFile || targetType !== 'card' || !chosenCard || newCard) return;
    const file = pendingFile;
    const t = window.setTimeout(() => {
      setPendingFile(null);
      void onFile(file);
    }, 0);
    return () => window.clearTimeout(t);
    // onFile lê o estado atual; disparar só quando o cartão aparece
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile, targetType, chosenCard, newCard]);

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
        <Done
          spaceId={spaceId}
          result={phase.result}
          onOpenMonth={onOpenMonth}
          onAgain={reset}
          finishLabel={finishLabel}
          payments={payments}
          hidden={hidden}
          onImportCard={importCardOf}
          onAnotherInvoice={() => {
            // mesmo cartão, próxima leitura
            reset();
            setTargetType('card');
          }}
        />
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
          card={targetType === 'card' ? (cards.find((c) => c.id === chosenCard) ?? null) : null}
          invoicePick={invoicePick}
          setInvoicePick={setInvoicePick}
          saving={phase.step === 'saving'}
          onRemap={(map) => {
            const next = remapTable(parsed, map);
            setParsed(next);
            void review(next, invert, fileName);
          }}
          onCancel={reset}
          onCommit={onCommit}
          otherAccounts={accounts.filter((a) => a.id !== chosenAccount?.id).map((a) => ({ id: a.id, name: a.name }))}
          cardOptions={cards}
          openingOffer={targetType === 'account' && !accountHasStart && parsed.balance?.opening ? parsed.balance.opening : null}
          useOpening={useOpening}
          setUseOpening={setUseOpening}
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
          newCard={newCard}
          setNewCard={setNewCard}
          pendingFile={pendingFile}
          onCardCreated={(id) => {
            setCardId(id);
            setNewCard(null);
          }}
          spaceId={spaceId}
          accounts={accounts}
          chosenAccount={chosenAccount?.id ?? ''}
          setAccountId={setAccountId}
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
  newCard,
  setNewCard,
  pendingFile,
  onCardCreated,
  spaceId,
  accounts,
  chosenAccount,
  setAccountId,
}: {
  accounts: { id: string; name: string; institution: string }[];
  chosenAccount: string;
  setAccountId: (id: string) => void;
  phase: Phase;
  targetType: 'account' | 'card';
  setTargetType: (t: 'account' | 'card') => void;
  cards: { id: string; name: string; last4: string; institution: string }[];
  chosenCard: string;
  setCardId: (id: string) => void;
  onFile: (file: File | undefined) => void;
  newCard: { bank: BankInfo | null } | null;
  setNewCard: (v: { bank: BankInfo | null } | null) => void;
  pendingFile: File | null;
  onCardCreated: (id: string) => void;
  spaceId: string;
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
          {targetType === 'account' && accounts.length > 1 ? (
            <div className="mt-3">
              <Field label="Conta" htmlFor="import-account">
                <Select id="import-account" value={chosenAccount} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.institution ? ` · ${a.institution}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          {targetType === 'card' ? (
            <div className="mt-3 grid gap-3">
              {pendingFile ? (
                <p className="rounded-field border border-accent/40 bg-accent-soft px-3 py-2.5 text-[13px] leading-relaxed text-ink">
                  <strong className="font-semibold">{pendingFile.name}</strong> é uma fatura de cartão.{' '}
                  {cards.length ? 'Diga de qual cartão é' : 'Cadastre o cartão'} e a leitura continua sozinha.
                </p>
              ) : (
                <p className="text-[13px] leading-relaxed text-ink-3">
                  As compras entram no dia em que foram feitas e saem da conta no vencimento da fatura, como no banco. O limite
                  mostra quanto ainda dá para usar, contando as parcelas que vêm.
                </p>
              )}
              {cards.length && !newCard ? (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
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
                  </div>
                  <Button onClick={() => setNewCard({ bank: null })} className="shrink-0">
                    <Plus size={15} /> Novo
                  </Button>
                </div>
              ) : null}
              {newCard ? (
                <QuickCard
                  key={newCard.bank?.key ?? 'livre'}
                  spaceId={spaceId}
                  initialBank={newCard.bank}
                  onCancel={cards.length ? () => setNewCard(null) : undefined}
                  onCreated={onCardCreated}
                />
              ) : null}
            </div>
          ) : null}
        </Panel>

        <DropZone disabled={targetType === 'card' && (!chosenCard || Boolean(newCard))} onFile={onFile}>
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
        accept={isAppleMobile() ? undefined : ACCEPT}
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
  card,
  invoicePick,
  setInvoicePick,
  saving,
  onRemap,
  onCancel,
  onCommit,
  otherAccounts,
  cardOptions,
  openingOffer,
  useOpening,
  setUseOpening,
}: {
  /** as contas que não são a de destino: o outro lado de uma transferência */
  otherAccounts: { id: string; name: string }[];
  cardOptions: { id: string; name: string; institution: string }[];
  /** o saldo anterior do arquivo, oferecido como saldo inicial quando a conta ainda não tem */
  openingOffer: { amount: Cents; date: IsoDate } | null;
  useOpening: boolean;
  setUseOpening: (v: boolean) => void;
  card: Card | null;
  invoicePick: MonthKey | null;
  setInvoicePick: (m: MonthKey | null) => void;
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
  // transferência e pagamento de fatura mexem na conta, mas não são entrada nem saída
  const moving = chosen.filter((r) => r.status === 'transfer' || (r.status === 'internal' && !r.withdrawal));
  const creating = chosen.filter((r) => r.status !== 'settle' && !moving.includes(r));
  const settling = chosen.filter((r) => r.status === 'settle');
  const totals = creating.reduce(
    (acc, r) => {
      if (!r.outflow) acc.in += r.amount;
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

  const pick = (key: string, field: 'counterpartAccountId' | 'payCardId', id: string | null) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: id, include: !!id } : r)));

  // o arquivo confere consigo mesmo? a prova de que foi lido certo, antes de gravar
  const integrity = React.useMemo(() => (targetType === 'account' ? statementIntegrity(parsed, invert) : null), [parsed, invert, targetType]);

  const confirmAll = (group: ReviewGroup) =>
    setRows((list) => list.map((r) => (groupOf(r) === group && r.categoryId ? { ...r, confidence: 'alta', unsure: false, include: true } : r)));

  const recon = targetType === 'card' ? invoiceReconciliation(rows) : null;
  // o palpite de qual fatura é o arquivo: a da compra mais recente, pelo ciclo do cartão
  const lastPurchase = rows.filter((r) => r.kind !== 'in' && r.status !== 'transfer').reduce((max, r) => (r.date > max ? r.date : max), '');
  const invoiceGuess = card && lastPurchase ? invoiceMonthOf(card, lastPurchase) : null;
  // fatura já importada: reimportar não cria nada, mas põe as compras antigas na fatura certa
  const refit = targetType === 'card' && rows.some((r) => r.status === 'imported');
  const includeLeft = () => {
    const keys = new Set(recon?.left.map((r) => r.key));
    setRows((list) => list.map((r) => (keys.has(r.key) ? { ...r, include: true } : r)));
  };

  return (
    <div className="grid gap-4">
      {recon ? (
        <Panel className={cn('p-5', recon.left.length ? 'border-warn/40' : 'border-in/30')}>
          <SectionTitle>Confere com a fatura do banco?</SectionTitle>
          {card && invoiceGuess ? (
            <div className="mb-3">
              <p className="mb-2 text-[13px] text-ink-2">Qual fatura é este arquivo? Pelo vencimento:</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Vencimento da fatura">
                {[-1, 0, 1].map((d) => {
                  const m = addMonthsToKey(invoiceGuess, d);
                  const active = (invoicePick ?? invoiceGuess) === m;
                  return (
                    <Chip key={m} active={active} onClick={() => setInvoicePick(m === invoiceGuess ? null : m)}>
                      vence {formatDayShort(dueDateOf(card, m))}
                    </Chip>
                  );
                })}
              </div>
              {invoicePick && invoicePick !== invoiceGuess ? (
                <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                  Pelo fechamento cadastrado (dia {card.closingDay}), o app achou outra fatura. Se o banco fecha em outro dia, ajuste o
                  cartão em Cartões para as próximas compras caírem certo.
                </p>
              ) : null}
            </div>
          ) : null}
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-field bg-surface-2 px-3 py-2">
              <dt className="text-[12px] text-ink-3">Total da fatura no arquivo</dt>
              <dd className="tnum text-[18px] font-semibold text-ink">{formatMoney(recon.fileTotal, { hidden })}</dd>
            </div>
            <div className="rounded-field bg-surface-2 px-3 py-2">
              <dt className="text-[12px] text-ink-3">Vai entrar no app</dt>
              <dd className={cn('tnum text-[18px] font-semibold', recon.left.length ? 'text-warn' : 'text-in')}>
                {formatMoney(recon.entering + recon.alreadyTotal, { hidden })}
              </dd>
            </div>
          </dl>
          <ul className="mt-3 grid gap-1 text-[12.5px] leading-relaxed text-ink-3">
            <li>
              {formatMoney(recon.charges, { hidden })} em compras
              {recon.credits ? ` menos ${formatMoney(recon.credits, { hidden })} em estornos e créditos` : ''}. O pagamento da fatura anterior não
              entra na conta.
            </li>

            {recon.alreadyTotal ? <li>{formatMoney(recon.alreadyTotal, { hidden })} já estavam no app de uma importação anterior.</li> : null}
          </ul>
          {recon.left.length ? (
            <div className="mt-3 rounded-field border border-warn/40 bg-warn-soft px-3 py-2.5">
              <p className="text-[13px] leading-relaxed text-ink">
                <strong className="font-semibold">
                  {recon.left.length} {recon.left.length === 1 ? 'compra ficou' : 'compras ficaram'} de fora ({formatMoney(recon.leftTotal, { hidden })})
                </strong>{' '}
                — {recon.left.length === 1 ? 'parece' : 'parecem'} com algo já lançado ou com uma assinatura. Se{' '}
                {recon.left.length === 1 ? 'for compra de verdade' : 'forem compras de verdade'} desta fatura, inclua.
              </p>
              <Button size="sm" className="mt-2" onClick={includeLeft}>
                Incluir {recon.left.length === 1 ? 'a compra' : `as ${recon.left.length}`}
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {integrity?.checked ? (
        <Panel className={cn('p-5', integrity.ok ? 'border-in/30' : 'border-warn/40')}>
          <SectionTitle>O arquivo confere consigo mesmo?</SectionTitle>
          {integrity.ok ? (
            <p className="flex items-start gap-2 text-[14px] leading-relaxed text-ink">
              <Check size={17} className="mt-0.5 shrink-0 text-in" strokeWidth={3} />
              <span>
                Sim.{' '}
                {integrity.opening && integrity.closing && integrity.expectedClosing !== undefined
                  ? `Saldo anterior ${formatMoney(integrity.opening.amount, { hidden, signed: integrity.opening.amount < 0 })} ${integrity.sum < 0 ? '−' : '+'} ${formatMoney(Math.abs(integrity.sum), { hidden })} em lançamentos = ${formatMoney(integrity.closing.amount, { hidden, signed: integrity.closing.amount < 0 })}, o saldo final que o banco escreveu.`
                  : 'O saldo de cada dia no arquivo fecha com os lançamentos lidos.'}{' '}
                Cada valor foi lido como está no arquivo.
              </span>
            </p>
          ) : (
            <div className="grid gap-2 text-[13px] leading-relaxed text-ink">
              <p className="flex items-start gap-2">
                <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warn" />
                <span>
                  <strong className="font-semibold">Inconsistência no arquivo.</strong> Os saldos que o banco escreveu não fecham com os lançamentos lidos
                  {integrity.diff ? ` — diferença de ${formatMoney(integrity.diff, { hidden, signed: true })} no fim` : ''}. Algum valor pode ter sido lido com o sinal
                  ou o decimal errado: confira as colunas em “Algo errado na leitura?”, ou o dia abaixo.
                </span>
              </p>
              {integrity.badDays.length ? (
                <ul className="grid gap-1 pl-6 text-[12.5px] text-ink-2">
                  {integrity.badDays.slice(0, 5).map((d) => (
                    <li key={d.date}>
                      {formatDayShort(d.date)}: o banco diz {formatMoney(d.declared, { hidden, signed: d.declared < 0 })}, as linhas somam{' '}
                      {formatMoney(d.expected, { hidden, signed: d.expected < 0 })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
          {openingOffer ? (
            <label className="mt-3 flex items-start gap-2.5 rounded-field bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
              <input type="checkbox" checked={useOpening} onChange={(e) => setUseOpening(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
              <span>
                Usar o saldo anterior do extrato — {formatMoney(openingOffer.amount, { hidden, signed: openingOffer.amount < 0 })} em{' '}
                {formatDayShort(openingOffer.date)} — como saldo inicial da conta. A conta ainda não tem um.
              </span>
            </label>
          ) : null}
        </Panel>
      ) : null}

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
                  accounts={otherAccounts}
                  cards={cardOptions}
                  onPick={(field, id) => pick(r.key, field, id)}
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
          {settling.length ? ` · ${settling.length} ${settling.length === 1 ? 'conta prevista marcada' : 'contas previstas marcadas'} como paga` : ''}
          {moving.length ? ` · ${moving.length} ${moving.length === 1 ? 'transferência ou pagamento de fatura' : 'transferências e pagamentos de fatura'}` : ''}.
          <span className="block text-[12px] text-ink-3">
            Entra {formatMoney(totals.in, { hidden })} · sai {formatMoney(totals.out, { hidden })}
          </span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" disabled={(!chosen.length && !refit) || saving} onClick={onCommit}>
            {saving ? 'Importando…' : !chosen.length && refit ? 'Acertar a fatura' : 'Importar lançamentos'}
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
  accounts,
  cards,
  onPick,
}: {
  row: ReviewRow;
  categories: Category[];
  hidden: boolean;
  targetType: 'account' | 'card';
  onToggle: () => void;
  onCategory: (id: string) => void;
  /** as outras contas, para a transferência dizer para onde foi */
  accounts: { id: string; name: string }[];
  cards: { id: string; name: string; institution: string }[];
  onPick: (field: 'counterpartAccountId' | 'payCardId', id: string | null) => void;
}) {
  const options = categories.filter((c) => c.kind === row.kind);
  const locked = row.status === 'imported';
  const isTransfer = row.status === 'internal' && !row.withdrawal;
  const isPayment = row.status === 'transfer' && targetType === 'account';

  let note = row.note ?? '';
  if (!note) {
    if (row.status === 'settle' && row.match) note = `marca “${row.match.description}” como paga`;
    if (row.status === 'similar' && row.match) note = `parecido com “${row.match.description}”, que já está lançado`;
    if (row.status === 'imported') note = 'já importado';
    if (row.installment && row.status === 'new') note = `parcela ${row.installment.index} de ${row.installment.total} · lança a compra inteira`;
  }

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
          <p
            className={cn(
              'tnum shrink-0 text-[14px] font-semibold',
              row.kind === 'invest' ? 'text-inv' : !row.outflow ? 'text-in' : isTransfer || isPayment ? 'text-ink' : 'text-out',
            )}
          >
            {row.outflow ? '−' : '+'}
            {formatMoney(row.amount, { hidden })}
          </p>
        </div>

        <p className="mt-0.5 text-[12px] text-ink-3">
          {formatDayShort(row.date)}
          {note ? <span className={cn(row.status === 'settle' && 'text-in')}> · {note}</span> : null}
        </p>

        {isTransfer ? (
          <div className="mt-2">
            <Select
              aria-label={`Outra conta de ${row.description}`}
              value={row.counterpartAccountId ?? ''}
              onChange={(e) => onPick('counterpartAccountId', e.target.value || null)}
              className={cn('h-9 text-[13px]', !row.counterpartAccountId && 'border-warn/60')}
            >
              <option value="">{row.outflow ? 'Foi para qual conta sua?' : 'Veio de qual conta sua?'}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {row.outflow ? 'para ' : 'de '}
                  {a.name}
                </option>
              ))}
            </Select>
            {!accounts.length ? (
              <p className="mt-1 text-[12px] text-ink-3">Cadastre a outra conta em Contas para registrar a transferência.</p>
            ) : null}
          </div>
        ) : null}

        {isPayment ? (
          <div className="mt-2">
            <Select
              aria-label={`Cartão pago por ${row.description}`}
              value={row.payCardId ?? ''}
              onChange={(e) => onPick('payCardId', e.target.value || null)}
              className={cn('h-9 text-[13px]', !row.payCardId && 'border-warn/60')}
            >
              <option value="">Qual cartão foi pago?</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  fatura {c.name || c.institution}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {row.include && row.status !== 'settle' && !isTransfer && row.status !== 'transfer' ? (
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

/* ------------------------------------------------- cartão, sem sair daqui */

const TOP_BANKS = ['nubank', 'itau', 'inter', 'bradesco', 'santander', 'bb', 'caixa', 'c6', 'mercadopago', 'picpay'];

/**
 * O cadastro de cartão que a fatura precisa, dentro da importação.
 *
 * Antes, quem escolhia "Fatura do cartão" sem cartão cadastrado dava de cara
 * com um aviso para ir a outra tela. Aqui ficam só os quatro dados que mudam
 * a conta: o banco, o limite e os dias de fechamento e vencimento — o
 * fechamento decide em que fatura cada compra cai. Cor, bandeira e final dá
 * para ajustar depois em Cartões.
 */
function QuickCard({
  spaceId,
  initialBank,
  onCancel,
  onCreated,
}: {
  spaceId: string;
  initialBank: BankInfo | null;
  onCancel?: () => void;
  onCreated: (id: string) => void;
}) {
  const [bank, setBank] = React.useState<BankInfo | null>(initialBank);
  const [other, setOther] = React.useState('');
  const [limit, setLimit] = React.useState('');
  const [closing, setClosing] = React.useState('');
  const [due, setDue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const day = (v: string) => v.replace(/\D/g, '').slice(0, 2);
  // quem só sabe o vencimento: a maioria dos cartões fecha uns sete dias antes
  const closingGuess = !closing && Number(due) >= 1 && Number(due) <= 31 ? String(((Number(due) - 8 + 31) % 31) + 1) : '';

  async function save() {
    const name = bank?.name ?? other.trim();
    const closingDay = Number(closing || closingGuess);
    const dueDay = Number(due);
    if (!name) return setError('Escolha o banco do cartão ou escreva o nome.');
    if (!(dueDay >= 1 && dueDay <= 31)) return setError('Informe o dia do vencimento da fatura, entre 1 e 31.');
    if (!(closingDay >= 1 && closingDay <= 31)) return setError('Informe o dia em que a fatura fecha, entre 1 e 31.');
    const parsedLimit = limit.trim() ? parseMoney(limit) : 0;
    if (parsedLimit === null) return setError('Digite o limite, como 5.000,00 — ou deixe em branco.');
    setError(null);
    setSaving(true);
    try {
      const card = await createCard({
        spaceId,
        name,
        institution: bank?.name ?? other.trim(),
        brand: 'other',
        last4: '',
        color: '',
        limit: parsedLimit,
        closingDay,
        dueDay,
      });
      toast(`Cartão ${name} cadastrado.`);
      onCreated(card.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui salvar o cartão.');
    } finally {
      setSaving(false);
    }
  }

  const banks = TOP_BANKS.map((k) => BANKS.find((b) => b.key === k)!).filter(Boolean);

  return (
    <div className="grid gap-3 rounded-card border border-line-strong bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        <CreditCard size={16} className="text-accent" aria-hidden /> Qual é o cartão?
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Banco do cartão">
        {banks.map((b) => (
          <Chip key={b.key} active={bank?.key === b.key} onClick={() => setBank(bank?.key === b.key ? null : b)} className="pl-1.5">
            <Logo domain={b.domain} initials={b.name.slice(0, 2)} color={b.brandColor ?? 'var(--surface-3)'} size={22} radius={11} />
            {b.name}
          </Chip>
        ))}
      </div>
      {!bank ? (
        <Field label="Outro banco" htmlFor="qc-other">
          <Input
            id="qc-other"
            value={other}
            onChange={(e) => {
              setOther(e.target.value);
              const hit = matchBank(e.target.value);
              if (hit && hit.name.toLowerCase() === e.target.value.trim().toLowerCase()) setBank(hit);
            }}
            placeholder="Ex.: Sicredi, XP, Will Bank"
            autoComplete="off"
          />
        </Field>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <Field label="Limite" htmlFor="qc-limit">
          <Input id="qc-limit" value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" placeholder="5.000,00" className="tnum" />
        </Field>
        <Field label="Fecha dia" htmlFor="qc-closing">
          <Input
            id="qc-closing"
            value={closing}
            onChange={(e) => setClosing(day(e.target.value))}
            inputMode="numeric"
            placeholder={closingGuess || '—'}
            className="tnum text-center"
          />
        </Field>
        <Field label="Vence dia" htmlFor="qc-due">
          <Input id="qc-due" value={due} onChange={(e) => setDue(day(e.target.value))} inputMode="numeric" placeholder="10" className="tnum text-center" />
        </Field>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-3">
        Os dois dias estão na fatura, no app do banco. O fechamento decide em que fatura cada compra cai
        {closingGuess ? `; sem ele, uso dia ${closingGuess}, uma semana antes do vencimento` : ''}.
      </p>
      {error ? (
        <p role="alert" className="text-[12.5px] text-out">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={saving} className="flex-1">
          {saving ? 'Salvando…' : 'Salvar cartão'}
        </Button>
        {onCancel ? (
          <Button variant="quiet" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- 4 · pronto */

function Done({
  spaceId,
  result,
  onOpenMonth,
  onAgain,
  finishLabel,
  payments,
  hidden,
  onImportCard,
  onAnotherInvoice,
}: {
  spaceId: string;
  result: ImportResult;
  onOpenMonth: (m: MonthKey) => void;
  onAgain: () => void;
  finishLabel?: string;
  /** pagamentos de fatura encontrados no extrato da conta */
  payments: ReviewRow[];
  hidden: boolean;
  onImportCard: (bank: BankInfo | null) => void;
  /** outra fatura do mesmo cartão */
  onAnotherInvoice: () => void;
}) {
  const { created, settled, lastMonth } = result;

  // um convite por banco: duas faturas do Nubank pagas no extrato são um cartão só
  const byBank = new Map<string, { bank: BankInfo | null; total: Cents; count: number; last: string }>();
  for (const p of payments) {
    const bank = bankInText(p.description);
    const key = bank?.key ?? 'desconhecido';
    const cur = byBank.get(key) ?? { bank, total: 0, count: 0, last: p.date };
    byBank.set(key, { bank, total: cur.total + p.amount, count: cur.count + 1, last: p.date > cur.last ? p.date : cur.last });
  }
  const invites = [...byBank.values()];

  return (
    <div className="grid gap-4">
    <Panel className="px-6 py-10 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-in-soft text-in motion-safe:animate-[pop-in_var(--t-slow)_var(--ease-out)]">
        <Check size={26} strokeWidth={2.6} />
      </span>
      <p className="mt-4 font-display text-[26px] text-ink">Extrato no lugar</p>
      <p className="mx-auto mt-2 max-w-[36ch] text-[14px] leading-relaxed text-ink-3">
        {created ? `${created} ${created === 1 ? 'lançamento criado' : 'lançamentos criados'}` : 'Nenhum lançamento novo'}
        {settled ? ` · ${settled} ${settled === 1 ? 'conta prevista marcada' : 'contas previstas marcadas'} como paga` : ''}
        {result.transfers ? ` · ${result.transfers} ${result.transfers === 1 ? 'transferência ou pagamento de fatura' : 'transferências e pagamentos de fatura'}` : ''}
        {result.linked ? ` · ${result.linked} ${result.linked === 1 ? 'linha reconhecida' : 'linhas reconhecidas'} numa transferência já registrada` : ''}.
      </p>
      {result.invoiceMonth ? (
        <p className="mx-auto mt-2 max-w-[36ch] text-[13px] leading-relaxed text-ink-3">
          As compras ficaram na fatura de {formatMonthLabel(result.invoiceMonth)}, a mesma do arquivo — confira em Cartões.
        </p>
      ) : null}
      {result.invoiceMonth && result.previousInvoiceMissing ? (
        <div className="mx-auto mt-5 max-w-[44ch] rounded-card border border-accent/40 bg-accent-soft p-4 text-left">
          <p className="text-[14px] font-semibold text-ink">
            Importe também a fatura de {formatMonthLabel(addMonthsToKey(result.invoiceMonth, -1))}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            A fatura do banco inclui parcelas de compras antigas (“3 de 6”), que em geral não vêm neste arquivo. Com a fatura
            anterior, elas entram aqui e nos meses seguintes, sem duplicar nada.
          </p>
          <Button size="sm" variant="primary" className="mt-3" onClick={onAnotherInvoice}>
            Importar a fatura anterior <ArrowRight size={14} />
          </Button>
        </div>
      ) : null}
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        {lastMonth ? (
          <Button variant="primary" onClick={() => onOpenMonth(lastMonth)}>
            {finishLabel ?? `Ver ${formatMonthLabel(lastMonth)}`}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onAgain}>
          Importar outro arquivo
        </Button>
      </div>
    </Panel>

    <ReconciliationPanel spaceId={spaceId} result={result} hidden={hidden} />

    {invites.length ? (
      <Panel className="p-5">
        <SectionTitle>Falta o cartão</SectionTitle>
        <p className="text-[14px] leading-relaxed text-ink-2">
          Este extrato pagou {invites.length === 1 ? 'uma fatura' : 'faturas'} de um cartão que não está no app, e o pagamento entrou como gasto.
          Importe a fatura para ver onde esse dinheiro foi — o pagamento passa a ser reconhecido como pagamento, e não conta duas vezes.
        </p>
        <ul className="mt-3 grid gap-2">
          {invites.map((inv) => (
            <li
              key={inv.bank?.key ?? 'desconhecido'}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-2 px-3 py-3"
            >
              {inv.bank ? (
                <Logo domain={inv.bank.domain} initials={inv.bank.name.slice(0, 2)} color={inv.bank.brandColor ?? 'var(--surface-3)'} size={36} radius={18} />
              ) : (
                <span className="grid size-9 place-items-center rounded-full bg-surface-3 text-ink-2" aria-hidden>
                  <CreditCard size={16} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">Fatura {inv.bank ? inv.bank.name : 'do cartão'}</span>
                <span className="block text-[12px] text-ink-3">
                  {inv.count === 1 ? 'paga' : `${inv.count} pagamentos, o último`} em {formatDayShort(inv.last)} ·{' '}
                  {formatMoney(inv.total, { hidden })}
                </span>
              </span>
              <Button size="sm" variant="primary" onClick={() => onImportCard(inv.bank)}>
                Importar a fatura <ArrowRight size={14} />
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    ) : null}
    </div>
  );
}

/**
 * O saldo do banco contra o do app, depois de importar.
 *
 * Bateu: está escrito, com os dois números. Não bateu: a diferença aparece
 * com nome — as linhas do arquivo que ficaram de fora e o que está no app
 * sem ter vindo do arquivo — e três saídas: ver a conta, registrar um ajuste
 * visível, ou deixar para depois. O app nunca corrige sozinho: a conta fica
 * marcada com a diferença até alguém resolver.
 */
function ReconciliationPanel({ spaceId, result, hidden }: { spaceId: string; result: ImportResult; hidden: boolean }) {
  const r = result.reconciliation;
  const [dismissed, setDismissed] = React.useState(false);
  const [adjusted, setAdjusted] = React.useState(false);
  if (!r) return null;
  const m = (v: Cents) => formatMoney(v, { hidden, signed: v < 0 });

  if (r.diff === 0) {
    return (
      <Panel className="border-in/30 p-5">
        <p className="flex items-start gap-2 text-[14px] leading-relaxed text-ink">
          <Check size={17} className="mt-0.5 shrink-0 text-in" strokeWidth={3} />
          <span>
            <strong className="font-semibold">Extrato reconciliado.</strong> Saldo do banco em {formatDayShort(r.date)}: {m(r.declared)} · saldo do app:{' '}
            {m(r.computed)}. A conta fica marcada como conferida nesse dia — se algo mudar depois, ela avisa.
          </span>
        </p>
        {result.openingSet ? (
          <p className="mt-2 pl-6 text-[12.5px] text-ink-3">
            O saldo anterior do arquivo ({m(result.openingSet.amount)} em {formatDayShort(result.openingSet.date)}) virou o saldo inicial da conta.
          </p>
        ) : null}
      </Panel>
    );
  }

  if (dismissed) return null;

  return (
    <Panel className="border-warn/40 p-5">
      <p className="flex items-start gap-2 text-[14px] leading-relaxed text-ink">
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warn" />
        <span>
          <strong className="font-semibold">Diferença encontrada: {formatMoney(Math.abs(r.diff), { hidden })}.</strong> O banco diz {m(r.declared)} em{' '}
          {formatDayShort(r.date)}; o app calcula {m(r.computed)} ({r.diff > 0 ? 'o banco tem mais' : 'o app tem mais'}).
        </span>
      </p>

      {r.left.length ? (
        <div className="mt-3 pl-6">
          <p className="text-[12px] font-medium text-ink-2">Linhas do arquivo que ficaram de fora</p>
          <ul className="mt-1 grid gap-0.5 text-[12.5px] text-ink-3">
            {r.left.slice(0, 8).map((l, i) => (
              <li key={`${l.date}-${i}`} className="flex justify-between gap-3">
                <span className="truncate">
                  {formatDayShort(l.date)} · {l.description}
                </span>
                <span className="tnum shrink-0">{m(l.signed)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {r.extra.length ? (
        <div className="mt-3 pl-6">
          <p className="text-[12px] font-medium text-ink-2">No app, no mesmo período, sem ter vindo deste arquivo</p>
          <ul className="mt-1 grid gap-0.5 text-[12.5px] text-ink-3">
            {r.extra.slice(0, 8).map((l, i) => (
              <li key={`${l.date}-${i}`} className="flex justify-between gap-3">
                <span className="truncate">
                  {formatDayShort(l.date)} · {l.description}
                </span>
                <span className="tnum shrink-0">{m(l.signed)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-ink-3">Lançado à mão, vindo de outro arquivo, ou cobrança automática que o banco não fez — algum desses pode ser o que sobra.</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 pl-6">
        <Button size="sm" variant="primary" onClick={() => navigate({ view: 'contas', param: r.accountId })}>
          Ver o problema na conta
        </Button>
        <Button
          size="sm"
          disabled={adjusted}
          onClick={async () => {
            await setBalance({ spaceId, accountId: r.accountId, balance: r.declared, date: r.date, source: 'ajuste após importar' });
            setAdjusted(true);
            toast(`Ajuste de ${formatMoney(Math.abs(r.diff))} registrado. Ele aparece na conta, com nome — não é receita nem despesa.`);
          }}
        >
          {adjusted ? 'Ajuste registrado' : `Corrigir com ajuste de ${formatMoney(Math.abs(r.diff), { hidden })}`}
        </Button>
        <Button size="sm" variant="quiet" onClick={() => setDismissed(true)}>
          Ignorar por enquanto
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
  { key: 'balance', label: 'Saldo (confere, não soma)', optional: true },
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
