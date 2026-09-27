'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, FileUp, PenLine, ShieldCheck } from 'lucide-react';
import { reducedMotion } from '@/components/motion';
import { BrandMark } from '@/components/shell';
import { Button, Field, Input, Money, SignToggle } from '@/components/ui';
import type { CashSnapshot } from '@/lib/cashflow';
import { normalize } from '@/lib/categories';
import { cn } from '@/lib/cn';
import { addMonthsToKey, currentMonthKey, dateInMonth, formatDayShort, formatMonthLabel, todayIso } from '@/lib/dates';
import { parseMoney } from '@/lib/money';
import type { MonthSummary } from '@/lib/occurrences';
import { setBalance as setAccountBalance } from '@/lib/accounts';
import {
  DEBTS_OPTIONS,
  FOCUS_OPTIONS,
  INCOME_OPTIONS,
  RESERVE_OPTIONS,
  SITUATION_OPTIONS,
  momentSummary,
  type ProfileOption,
} from '@/lib/profile';
import { createEntry } from '@/lib/store';
import type { Category, MonthKey } from '@/lib/types';
import { emptyDraft, hasAnswer, type ProfileDraft } from './profile';

/**
 * O primeiro acesso: entender o momento, depois o mês.
 *
 * Nada de tutorial nem de formulário comprido. Primeiro, cinco perguntas de
 * toque, uma por tela e todas puláveis — é o que faz o app começar pelo que
 * importa à pessoa. Logo depois, a devolutiva: o que ela contou numa frase e
 * por onde o Início vai começar. Por fim, o mínimo que produz o número que o
 * FinanceOS promete — quanto sobra —: o extrato ou dois números digitados.
 */

export type QuestionStep = 'objetivo' | 'situacao' | 'dividas' | 'reserva' | 'renda';
export type OnboardingStep = 'hello' | QuestionStep | 'momento' | 'start' | 'manual' | 'done';

const QUESTIONS: QuestionStep[] = ['objetivo', 'situacao', 'dividas', 'reserva', 'renda'];

/** três etapas à vista, não dez: o progresso tranquiliza em vez de contar o que falta */
const PHASES = ['Você', 'Seu momento', 'Seu mês'] as const;

function phaseOf(step: OnboardingStep): { phase: number; fraction: number } {
  if (step === 'hello') return { phase: 0, fraction: 1 };
  const q = QUESTIONS.indexOf(step as QuestionStep);
  if (q >= 0) return { phase: 1, fraction: q / QUESTIONS.length };
  if (step === 'momento') return { phase: 1, fraction: 1 };
  return { phase: 2, fraction: step === 'start' ? 1 / 3 : step === 'manual' ? 2 / 3 : 1 };
}

export function Onboarding({
  step,
  onStep,
  spaceId,
  categories,
  cash,
  summary,
  importedMonth,
  name,
  onName,
  signedIn,
  onImport,
  onSignIn,
  onOpenMonth,
  onFinish,
  onProfile,
}: {
  step: OnboardingStep;
  onStep: (step: OnboardingStep) => void;
  spaceId: string;
  categories: Category[];
  cash: CashSnapshot;
  summary: MonthSummary;
  /** último mês do extrato importado no passo 2, quando houve importação */
  importedMonth: MonthKey | null;
  name: string;
  onName: (name: string) => void;
  /** entrou com uma conta: os dados também vão para a nuvem */
  signedIn: boolean;
  onImport: () => void;
  onSignIn?: () => void;
  onOpenMonth: (month: MonthKey) => void;
  /** encerra o primeiro acesso; com respostas ainda não gravadas, grava junto */
  onFinish: (draft?: ProfileDraft) => void;
  /** grava as respostas das cinco perguntas */
  onProfile: (draft: ProfileDraft) => void;
}) {
  const { phase, fraction } = phaseOf(step);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  // as respostas vivem aqui enquanto a pessoa vai e volta entre as perguntas
  const [draft, setDraft] = React.useState<ProfileDraft>(() => emptyDraft());
  const question = QUESTIONS.indexOf(step as QuestionStep);

  // cada passo novo leva o foco (e o leitor de tela) ao título dele
  React.useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  // recebe as respostas já com a última escolha: o estado ainda não virou quando o toque avança
  const nextQuestion = (answers: ProfileDraft) => {
    if (question < QUESTIONS.length - 1) return onStep(QUESTIONS[question + 1]);
    if (hasAnswer(answers)) {
      onProfile(answers);
      onStep('momento');
    } else {
      onStep('start');
    }
  };
  const prevQuestion = () => onStep(question > 0 ? QUESTIONS[question - 1] : 'hello');

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-[calc(var(--sa-bottom)+24px)] pt-[calc(var(--sa-top)+16px)] sm:max-w-[540px] sm:justify-center sm:px-6 sm:py-10">
        {/* no celular ocupa a tela, com a ação no pé; do tablet para cima vira um cartão no centro */}
        <div className="flex flex-1 flex-col sm:flex-none sm:rounded-panel sm:border sm:border-line sm:bg-surface sm:p-8 sm:shadow-e2">
          <header className="flex items-center justify-between gap-3 py-2">
            <span className="flex items-center gap-2.5">
              <BrandMark size={30} />
              <span className="font-display text-[20px] text-ink">FinanceOS</span>
            </span>
            {step !== 'done' ? (
              <button
                type="button"
                // pular tudo não joga fora o que já foi respondido
                onClick={() => onFinish(question >= 0 && hasAnswer(draft) ? draft : undefined)}
                className="h-9 rounded-field px-2 text-[13px] font-medium text-ink-3 hover:text-ink"
              >
                Pular
              </button>
            ) : null}
          </header>

          <ProgressIndicator phase={phase} fraction={fraction} className="mt-4" />

          <main key={step} className="flex flex-1 flex-col pt-10 sm:pt-8 motion-safe:animate-[rise-in_var(--t-slow)_var(--ease-out)]">
            {step === 'hello' ? (
              <Hello
                headingRef={headingRef}
                name={name}
                onName={onName}
                signedIn={signedIn}
                onNext={() => onStep(QUESTIONS[0])}
                onSignIn={onSignIn}
              />
            ) : question >= 0 ? (
              <ProfileQuestion
                step={step as QuestionStep}
                index={question}
                headingRef={headingRef}
                draft={draft}
                onDraft={setDraft}
                onNext={nextQuestion}
                onBack={prevQuestion}
              />
            ) : step === 'momento' ? (
              <MomentScreen headingRef={headingRef} draft={draft} onNext={() => onStep('start')} onBack={() => onStep(QUESTIONS[QUESTIONS.length - 1])} />
            ) : step === 'start' ? (
              <Start
                headingRef={headingRef}
                onImport={onImport}
                onManual={() => onStep('manual')}
                onBack={() => onStep(hasAnswer(draft) ? 'momento' : QUESTIONS[QUESTIONS.length - 1])}
              />
            ) : step === 'manual' ? (
              <Manual
                headingRef={headingRef}
                spaceId={spaceId}
                categories={categories}
                onBack={() => onStep('start')}
                onDone={() => onStep('done')}
              />
            ) : (
              <Ready
                headingRef={headingRef}
                spaceId={spaceId}
                cash={cash}
                summary={summary}
                importedMonth={importedMonth}
                onOpenMonth={onOpenMonth}
                onFinish={() => onFinish()}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

type HeadingRef = React.RefObject<HTMLHeadingElement | null>;

function Title({ headingRef, id, children }: { headingRef: HeadingRef; id?: string; children: React.ReactNode }) {
  return (
    // o foco vem do código, para o leitor de tela anunciar o passo; não precisa de anel
    <h1 ref={headingRef} id={id} tabIndex={-1} style={{ outline: 'none' }} className="font-display text-[34px] leading-[1.08] text-ink sm:text-[38px]">
      {children}
    </h1>
  );
}

/**
 * As três etapas do primeiro acesso. A etapa atual enche aos poucos (só
 * `transform`, sem refazer o layout); as anteriores ficam cheias.
 */
export function ProgressIndicator({ phase, fraction, className }: { phase: number; fraction: number; className?: string }) {
  return (
    <ol aria-label={`Etapa ${phase + 1} de ${PHASES.length}: ${PHASES[phase]}`} className={cn('grid grid-cols-3 gap-1.5', className)}>
      {PHASES.map((label, i) => {
        const fill = i < phase ? 1 : i === phase ? Math.max(0.08, fraction) : 0;
        return (
          <li key={label} aria-current={i === phase ? 'step' : undefined} className="grid gap-1.5">
            <span className="relative block h-1 overflow-hidden rounded-full bg-surface-3">
              <span
                className="absolute inset-0 origin-left rounded-full bg-accent transition-transform duration-[var(--t-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
                style={{ transform: `scaleX(${fill})` }}
              />
            </span>
            <span className={cn('text-[11px] font-medium', i === phase ? 'text-ink-2' : 'text-ink-3')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ 1 · o convite */

function Hello({
  headingRef,
  name,
  onName,
  signedIn,
  onNext,
  onSignIn,
}: {
  headingRef: HeadingRef;
  name: string;
  onName: (name: string) => void;
  signedIn: boolean;
  onNext: () => void;
  onSignIn?: () => void;
}) {
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <Title headingRef={headingRef}>Antes de começar, queremos entender onde você está.</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        Cinco perguntas de toque, uma por vez. Depois, você vê quanto sobra até o próximo recebimento.
      </p>

      <div className="mt-8">
        <Field label="Como quer ser chamado?" htmlFor="onb-name" hint="Opcional. Aparece só na saudação.">
          <Input
            id="onb-name"
            value={name}
            onChange={(e) => onName(e.target.value)}
            autoComplete="given-name"
            placeholder="Seu nome"
            maxLength={40}
          />
        </Field>
      </div>

      <p className="mt-6 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-3">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-in" aria-hidden />
        {signedIn
          ? 'Seus dados ficam neste aparelho e sincronizam com a sua conta. Nunca pedimos senha de banco.'
          : 'Tudo fica neste aparelho. Não pedimos senha de banco nem cadastro para começar.'}
      </p>

      <div className="mt-auto grid gap-3 pt-10">
        <Button type="submit" variant="primary" size="lg" className="w-full">
          Começar <ArrowRight size={17} />
        </Button>
        {onSignIn ? (
          <p className="text-center text-[13px] text-ink-3">
            Já usa o FinanceOS em outro aparelho?{' '}
            <button type="button" onClick={onSignIn} className="font-semibold text-accent hover:underline">
              Entrar na conta
            </button>
          </p>
        ) : null}
      </div>
    </form>
  );
}

/* ------------------------------------------------ 2 · as cinco perguntas */

type AnyOption = ProfileOption<string>;

const QUESTION_COPY: Record<QuestionStep, { title: string; hint?: string; options: AnyOption[] }> = {
  objetivo: { title: 'Qual é o seu principal objetivo agora?', options: FOCUS_OPTIONS },
  situacao: { title: 'Como está sua vida financeira hoje?', options: SITUATION_OPTIONS },
  dividas: {
    title: 'Você tem dívidas hoje?',
    hint: 'Empréstimo, financiamento, cheque especial, acordo ou parcela em atraso.',
    options: DEBTS_OPTIONS,
  },
  reserva: {
    title: 'Você tem uma reserva para emergências?',
    hint: 'Dinheiro guardado para imprevistos, fora do que você usa no mês.',
    options: RESERVE_OPTIONS,
  },
  renda: { title: 'Sua renda é fixa ou variável?', options: INCOME_OPTIONS },
};

function currentAnswer(step: QuestionStep, d: ProfileDraft): string | null {
  if (step === 'objetivo') return d.focus[0] ?? null;
  if (step === 'situacao') return d.situation;
  if (step === 'dividas') return d.debts ?? null;
  if (step === 'reserva') return d.reserve ?? null;
  return d.income;
}

function withAnswer(step: QuestionStep, d: ProfileDraft, value: string): ProfileDraft {
  if (step === 'objetivo') return { ...d, focus: [value as ProfileDraft['focus'][number]] };
  if (step === 'situacao') return { ...d, situation: value as ProfileDraft['situation'] };
  if (step === 'dividas') return { ...d, debts: value as ProfileDraft['debts'] };
  if (step === 'reserva') return { ...d, reserve: value as ProfileDraft['reserve'] };
  return { ...d, income: value as ProfileDraft['income'] };
}

/**
 * Uma pergunta por tela. O toque escolhe e já avança — com um instante para a
 * escolha ser vista marcada. Voltar mostra a resposta dada; pular deixa em
 * branco, sem cobrança.
 */
export function ProfileQuestion({
  step,
  index,
  headingRef,
  draft,
  onDraft,
  onNext,
  onBack,
}: {
  step: QuestionStep;
  index: number;
  headingRef: HeadingRef;
  draft: ProfileDraft;
  onDraft: (d: ProfileDraft) => void;
  onNext: (answers: ProfileDraft) => void;
  onBack: () => void;
}) {
  const copy = QUESTION_COPY[step];
  const chosen = currentAnswer(step, draft);
  const advancing = React.useRef(false);
  const titleId = `onb-q-${step}`;

  const choose = (value: string) => {
    if (advancing.current) return;
    advancing.current = true;
    const next = withAnswer(step, draft, value);
    onDraft(next);
    window.setTimeout(() => onNext(next), reducedMotion() ? 0 : 280);
  };

  return (
    <div className="flex flex-1 flex-col">
      <p aria-hidden className="mb-2 text-[13px] font-medium text-ink-3">
        Pergunta {index + 1} de {QUESTIONS.length}
      </p>
      <Title headingRef={headingRef} id={titleId}>
        <span className="sr-only">
          Pergunta {index + 1} de {QUESTIONS.length}:{' '}
        </span>
        {copy.title}
      </Title>
      {copy.hint ? <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{copy.hint}</p> : null}

      <div role="group" aria-labelledby={titleId} className="mt-7 grid gap-2">
        {copy.options.map((o) => {
          const active = chosen === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(o.value)}
              className={cn(
                'group flex min-h-[52px] w-full items-center gap-3 rounded-card border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-[var(--t-fast)] active:scale-[0.99]',
                active ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-surface-2 sm:bg-surface-2 sm:hover:bg-surface-3',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{o.label}</span>
                {o.detail ? <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{o.detail}</span> : null}
              </span>
              <span
                aria-hidden
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-[var(--t-fast)]',
                  active ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong text-transparent',
                )}
              >
                <Check size={14} strokeWidth={2.5} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-10">
        <BackButton onClick={onBack} className="mx-0" />
        <button
          type="button"
          onClick={() => onNext(draft)}
          className="inline-flex h-10 items-center gap-1.5 rounded-field px-3 text-[14px] font-medium text-ink-3 hover:text-ink"
        >
          {chosen ? 'Continuar' : 'Pular pergunta'} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------- 2b · "Entendemos seu momento" */

function MomentScreen({
  headingRef,
  draft,
  onNext,
  onBack,
}: {
  headingRef: HeadingRef;
  draft: ProfileDraft;
  onNext: () => void;
  onBack: () => void;
}) {
  const moment = momentSummary({ ...draft, answeredAt: null });
  return (
    <div className="flex flex-1 flex-col">
      <Title headingRef={headingRef}>Entendemos seu momento.</Title>
      {moment ? (
        <>
          <p className="mt-4 text-[18px] leading-relaxed text-ink">{moment.headline}</p>
          {moment.notes.map((n) => (
            <p key={n} className="mt-3 text-[15px] leading-relaxed text-ink-2">
              {n}
            </p>
          ))}
          {moment.first.length ? (
            <section aria-labelledby="onb-first" className="mt-7 rounded-panel border border-line bg-surface px-5 py-4 sm:bg-surface-2">
              <h2 id="onb-first" className="text-[15px] font-semibold text-ink">
                Vamos começar por isso.
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-3">O seu Início vai mostrar primeiro:</p>
              <ol className="mt-3 grid gap-2.5">
                {moment.first.map((item, i) => (
                  <li key={item} className="flex items-start gap-3 text-[14px] leading-snug text-ink-2">
                    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </>
      ) : null}
      <p className="mt-6 text-[13px] leading-relaxed text-ink-3">
        É o que você contou, não uma avaliação. Dá para mudar as respostas quando quiser, no diagnóstico.
      </p>

      <div className="mt-auto grid gap-3 pt-10">
        <Button variant="primary" size="lg" className="w-full" onClick={onNext}>
          Montar meu mês <ArrowRight size={17} />
        </Button>
        <BackButton onClick={onBack} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 3 · o começo */


function Start({
  headingRef,
  onImport,
  onManual,
  onBack,
}: {
  headingRef: HeadingRef;
  onImport: () => void;
  onManual: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <Title headingRef={headingRef}>Como você quer começar?</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        Você pode começar importando seu extrato ou lançando manualmente.
      </p>

      <div className="mt-8 grid gap-3">
        <Option
          icon={<FileUp size={20} />}
          title="Importar extrato"
          detail="OFX, CSV, Excel ou QIF do seu banco. O arquivo é lido aqui mesmo, e você revisa tudo antes de salvar."
          onClick={onImport}
          primary
        />
        <Option
          icon={<PenLine size={20} />}
          title="Começar manualmente"
          detail="Diga quanto tem hoje e quanto recebe. O resto você registra quando acontecer."
          onClick={onManual}
        />
      </div>

      <p className="mt-6 text-[13px] leading-relaxed text-ink-3">
        Prefere ver como fica antes?{' '}
        <Link href="/demo" className="font-semibold text-accent hover:underline">
          Explorar FinanceOS com dados de exemplo
        </Link>
      </p>

      <div className="mt-auto pt-10">
        <BackButton onClick={onBack} />
      </div>
    </div>
  );
}

function Option({
  icon,
  title,
  detail,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-4 rounded-card border p-4 text-left transition-colors duration-[var(--t-fast)]',
        primary
          ? 'border-accent/40 bg-accent-soft hover:border-accent/70'
          : 'border-line-strong bg-surface hover:bg-surface-2 sm:bg-surface-2 sm:hover:bg-surface-3',
      )}
    >
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-field',
          primary ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-ink-2',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-ink-3">{detail}</span>
      </span>
      <ArrowRight
        size={18}
        className="mt-3 shrink-0 text-ink-3 transition-transform duration-[var(--t-fast)] group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  );
}

/* ------------------------------------------------------ 3b · à mão, o mínimo */

function Manual({
  headingRef,
  spaceId,
  categories,
  onBack,
  onDone,
}: {
  headingRef: HeadingRef;
  spaceId: string;
  categories: Category[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [balance, setBalance] = React.useState('');
  const [negativeSign, setNegativeSign] = React.useState(false);
  const [income, setIncome] = React.useState('');
  const [day, setDay] = React.useState('5');
  const [errors, setErrors] = React.useState<{ balance?: string; income?: string; day?: string }>({});
  const [saving, setSaving] = React.useState(false);

  async function save() {
    const next: typeof errors = {};
    const balanceText = balance.trim();
    const negative = negativeSign || /^[-−]/.test(balanceText);
    const balanceValue = balanceText ? parseMoney(balanceText.replace(/^[-−]/, '')) : null;
    const incomeValue = income.trim() ? parseMoney(income.trim()) : null;
    const dayValue = Number.parseInt(day, 10);

    if (!balanceText && !income.trim()) next.balance = 'Informe pelo menos quanto você tem hoje.';
    if (balanceText && balanceValue === null) next.balance = 'Digite um valor, como 1.250,00 ou -80,00.';
    if (income.trim() && (incomeValue === null || incomeValue <= 0)) next.income = 'Digite um valor, como 4.500,00.';
    if (incomeValue && (!Number.isFinite(dayValue) || dayValue < 1 || dayValue > 31)) next.day = 'Um dia entre 1 e 31.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const month = currentMonthKey();
      // o saldo de hoje vira o ponto de partida da conta principal
      if (balanceValue !== null) await setAccountBalance({ spaceId, balance: negative ? -balanceValue : balanceValue });

      if (incomeValue) {
        // o saldo de hoje já contém o último recebimento: a série começa no próximo
        const today = todayIso();
        const thisMonth = dateInMonth(month, dayValue);
        const date = thisMonth > today ? thisMonth : dateInMonth(addMonthsToKey(month, 1), dayValue);
        const salary = categories.find((c) => c.kind === 'in' && normalize(c.name) === 'salario');
        await createEntry({
          spaceId,
          kind: 'in',
          description: 'Salário',
          amount: incomeValue,
          date,
          categoryId: salary?.id ?? null,
          repeat: { kind: 'monthly' },
        });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Title headingRef={headingRef}>Seu ponto de partida</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        Dois números bastam para o FinanceOS projetar o mês. Contas e gastos você registra quando acontecerem.
      </p>

      <div className="mt-8 grid gap-5">
        <Field
          label="Quanto você tem hoje na conta?"
          htmlFor="onb-balance"
          hint="Some as contas do dia a dia. Está no cheque especial? Marque Negativo."
          error={errors.balance}
        >
          <div className="grid gap-2">
            <SignToggle negative={negativeSign} onChange={setNegativeSign} />
            <MoneyInput id="onb-balance" value={balance} onChange={setBalance} autoFocus aria-describedby="onb-balance-desc" />
          </div>
        </Field>

        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <Field label="Quanto você recebe por mês?" htmlFor="onb-income" hint="Salário ou renda principal, líquido." error={errors.income}>
            <MoneyInput id="onb-income" value={income} onChange={setIncome} />
          </Field>
          <Field label="Em que dia?" htmlFor="onb-day" error={errors.day}>
            <Input
              id="onb-day"
              value={day}
              onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              className="tnum text-center text-[18px] font-semibold"
            />
          </Field>
        </div>
      </div>

      <div className="mt-auto grid gap-3 pt-10">
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={saving}>
          {saving ? 'Montando seu mês…' : 'Ver meu mês'}
        </Button>
        <BackButton onClick={onBack} />
      </div>
    </form>
  );
}

function MoneyInput({
  id,
  value,
  onChange,
  autoFocus,
  className,
  ...aria
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-ink-3" aria-hidden>
        R$
      </span>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="0,00"
        autoComplete="off"
        autoFocus={autoFocus}
        className="tnum pl-11 text-[18px] font-semibold"
        {...aria}
      />
    </div>
  );
}

/* ------------------------------------------------------------ 4 · o mês */

function Ready({
  headingRef,
  spaceId,
  cash,
  summary,
  importedMonth,
  onOpenMonth,
  onFinish,
}: {
  headingRef: HeadingRef;
  spaceId: string;
  cash: CashSnapshot;
  summary: MonthSummary;
  importedMonth: MonthKey | null;
  onOpenMonth: (month: MonthKey) => void;
  onFinish: () => void;
}) {
  const upcoming = cash.items
    .filter((i) => i.kind !== 'in' && i.date > cash.today && !i.settled)
    .slice(0, 3);
  const monthName = formatMonthLabel(cash.month).replace(/ de \d{4}$/, '');
  const pastImport = importedMonth && importedMonth < cash.month ? importedMonth : null;

  return (
    <div className="flex flex-1 flex-col">
      <Title headingRef={headingRef}>Pronto. Seu mês está aqui.</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        {cash.nextIncome
          ? `Até o próximo recebimento, dia ${Number(cash.nextIncome.date.slice(8))}, este é o seu dinheiro.`
          : `Este é o seu dinheiro em ${monthName}.`}
      </p>

      {!cash.hasOpening ? <BalanceNow spaceId={spaceId} cash={cash} /> : null}

      <section aria-label="Resumo do mês" className="mt-7 overflow-hidden rounded-panel border border-line bg-surface sm:bg-surface-2">
        <div className="p-5">
          <p className="text-[13px] text-ink-3">{cash.nextIncome ? 'Disponível até o próximo recebimento' : 'Previsão para o fim do mês'}</p>
          <Money
            value={cash.nextIncome ? cash.safeUntilIncome : cash.endOfMonth}
            animate
            className={cn(
              'amount mt-1 block text-[40px] leading-none',
              (cash.nextIncome ? cash.safeUntilIncome : cash.endOfMonth) < 0 ? 'text-out' : 'text-ink',
            )}
          />
        </div>
        <dl className="grid grid-cols-2 border-t border-line">
          <Stat label="Saldo hoje" value={cash.balanceNow} />
          {cash.nextIncome ? (
            <Stat label="Previsão no fim do mês" value={cash.endOfMonth} className="border-l border-line" />
          ) : (
            <Stat label="Ainda sai neste mês" value={cash.dueBeforeIncome} className="border-l border-line" />
          )}
          {summary.income > 0 || !cash.nextIncome ? (
            <Stat label={`Receitas de ${monthName}`} value={summary.income} tone="text-in" className="border-t border-line" />
          ) : (
            <Stat
              label={`Recebimento em ${formatDayShort(cash.nextIncome.date)}`}
              value={cash.nextIncome.amount}
              tone="text-in"
              className="border-t border-line"
            />
          )}
          <Stat label={`Despesas de ${monthName}`} value={summary.expense} tone="text-out" className="border-l border-t border-line" />
        </dl>
      </section>

      <section aria-labelledby="onb-next" className="mt-4 rounded-panel border border-line bg-surface sm:bg-surface-2 px-5 py-4">
        <h2 id="onb-next" className="text-[13px] font-semibold uppercase tracking-wider text-ink-3">
          Próximos compromissos
        </h2>
        {upcoming.length ? (
          <ul className="mt-2 divide-y divide-line">
            {upcoming.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-ink">{item.label}</span>
                  <span className="block text-[12px] text-ink-3">{formatDayShort(item.date)}</span>
                </span>
                <Money value={item.amount} className="shrink-0 text-[15px] font-semibold text-ink-2" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-3">
            Nenhuma conta registrada ainda. Aluguel, fatura e assinaturas aparecem aqui assim que você registrar.
          </p>
        )}
      </section>

      <div className="mt-auto grid gap-3 pt-10">
        <Button variant="primary" size="lg" className="w-full" onClick={onFinish}>
          Abrir meu mês <ArrowRight size={17} />
        </Button>
        {pastImport ? (
          <Button variant="quiet" className="w-full" onClick={() => onOpenMonth(pastImport)}>
            Ver o extrato de {formatMonthLabel(pastImport)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * O extrato conta o que entrou e saiu, não quanto havia antes. Sem esse número
 * o saldo parte de zero — então ele é pedido aqui, uma vez, com o resto já à
 * vista. É opcional: dá para informar depois no Início.
 */
function BalanceNow({ spaceId, cash }: { spaceId: string; cash: CashSnapshot }) {
  const [text, setText] = React.useState('');
  const [negativeSign, setNegativeSign] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    const trimmed = text.trim();
    const negative = negativeSign || /^[-−]/.test(trimmed);
    const parsed = parseMoney(trimmed.replace(/^[-−]/, ''));
    if (parsed === null) return setError('Digite o saldo, como 1.250,00 ou -80,00.');
    // vira o saldo inicial da conta, ou um ajuste visível se ela já tem histórico
    await setAccountBalance({ spaceId, balance: negative ? -parsed : parsed, date: cash.today });
  }

  return (
    <form
      className="mt-7 rounded-panel border border-accent/40 bg-accent-soft p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field
        label="Falta um número: quanto você tem hoje na conta?"
        htmlFor="onb-now"
        hint="Com ele, o saldo e a previsão abaixo batem com o banco."
        error={error}
      >
        <SignToggle negative={negativeSign} onChange={setNegativeSign} className="mb-2" />
        <div className="flex gap-2">
          <MoneyInput id="onb-now" value={text} onChange={setText} className="min-w-0 flex-1" aria-describedby="onb-now-desc" />
          <Button type="submit" variant="primary" className="shrink-0">
            Salvar
          </Button>
        </div>
      </Field>
    </form>
  );
}

function Stat({ label, value, tone, className }: { label: string; value: number; tone?: string; className?: string }) {
  return (
    <div className={cn('px-5 py-3.5', className)}>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className={cn('mt-0.5 text-[16px] font-semibold', value < 0 ? 'text-out' : value === 0 ? 'text-ink-2' : tone ?? 'text-ink')}>
        <Money value={value} />
      </dd>
    </div>
  );
}

function BackButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('mx-auto inline-flex h-10 items-center gap-1.5 rounded-field px-3 text-[14px] font-medium text-ink-3 hover:text-ink', className)}
    >
      <ArrowLeft size={16} /> Voltar
    </button>
  );
}
