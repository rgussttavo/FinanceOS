import { normalize } from './categories';
import { MONTHS_PT, addMonthsToKey, formatDayShort, formatMonthLabel, monthKeyParts } from './dates';
import { formatMoney, formatPercent, ratio } from './money';
import { buildInvoice, futureInstallments, invoiceMonthOf } from './cards';
import type { CashSnapshot } from './cashflow';
import { goalProgress } from './goals';
import { parseMoney } from './money';
import type { Route } from './nav';
import { firstNegativeDay, occurrencesInMonth, summarizeMonth, type DayPoint, type MonthSummary, type Occurrence } from './occurrences';
import type { Asset, Card, Category, Cents, Debt, Entry, Goal, MonthKey, Subscription } from './types';
import { wealthHistory } from './wealth';

/**
 * Assistente de regras.
 *
 * Não é modelo de linguagem: a pergunta é desmontada em partes e a resposta é
 * calculada com os números reais da conta. A escolha é deliberada — roda
 * offline, não custa nada por pergunta e nunca inventa um valor, que é o pior
 * defeito possível num app de dinheiro.
 *
 * O ganho de entendimento não vem de mais palavras-chave, e sim de separar a
 * pergunta em quatro coisas independentes:
 *
 *   forma    o que se quer: um total, uma lista, uma contagem, o maior
 *   tipo     de quê: gasto, receita ou aporte
 *   período  de quando: este mês, o passado, um mês nomeado
 *   filtro   de qual parte: uma categoria, ou um texto do lançamento
 *
 * Combinando as quatro, uma dúzia de regras responde centenas de perguntas
 * diferentes — "quais foram meus gastos em agosto", "quanto gastei com
 * mercado", "quantas compras no ifood" — sem nenhuma delas estar escrita.
 */

export interface AssistantContext {
  month: MonthKey;
  /** todos os lançamentos até a competência aberta; o motor expande o mês que precisar */
  entries: Entry[];
  summary: MonthSummary;
  occurrences: Occurrence[];
  projection: DayPoint[];
  history: MonthSummary[];
  categories: Category[];
  cards: Card[];
  subscriptions: Subscription[];
  goals: Goal[];
  debts: Debt[];
  market: {
    indicators: { id: string; label: string; value: number | null }[];
    currencies: { id: string; label: string; price: number | null; changePercent: number | null }[];
    crypto: { id: string; label: string; price: number | null; changePercent: number | null }[];
  } | null;
  today: string;
  /**
   * Expande um mês qualquer do mesmo jeito que as telas: lançamentos mais
   * assinaturas e parcelas de dívida. Sem isso, o assistente somaria um mês
   * diferente do que a pessoa vê em Movimentos.
   */
  expand?: (month: MonthKey) => Occurrence[];
  assets?: Asset[];
  /** a régua do caixa, a mesma do Início: quando presente, "cruza o zero" sai dela */
  cash?: CashSnapshot;
}

export interface Answer {
  text: string;
  highlight?: { label: string; value: string };
  /** linhas de detalhe, quando a resposta é uma lista */
  list?: { label: string; detail: string; value: string }[];
  /** de onde a resposta saiu: "12 lançamentos de agosto" */
  basis?: string;
  /** a tela onde a pessoa vê e mexe no que foi respondido */
  link?: { label: string; route: Route };
}

/* -------------------------------------------------------------- sinônimos */

/**
 * Cada grupo vira uma etiqueta. "gastei", "saiu" e "paguei" viram todos GASTO,
 * então a regra é escrita uma vez e entende as três formas — e qualquer
 * conjugação nova é uma linha aqui, não uma regra nova.
 */
const SYNONYMS: Record<string, string[]> = {
  GASTO: ['gasto', 'gastos', 'gastei', 'gastar', 'gasta', 'despesa', 'despesas', 'saiu', 'saida', 'saidas', 'sairam', 'paguei', 'pagamento', 'pagamentos', 'pagar', 'comprei', 'compra', 'compras', 'torrei'],
  RECEITA: ['receita', 'receitas', 'entrada', 'entradas', 'entrou', 'entraram', 'recebi', 'receber', 'recebo', 'ganhei', 'ganho', 'ganhos', 'renda', 'rendas', 'salario'],
  INVEST: ['investimento', 'investimentos', 'investi', 'investir', 'aporte', 'aportes', 'aportei', 'apliquei', 'aplicacao'],
  LISTA: ['quais', 'lista', 'listar', 'listagem', 'mostra', 'mostrar', 'mostre', 'ver', 'detalhar', 'detalhe', 'detalhes', 'discriminar', 'todos', 'todas', 'quem'],
  TOTAL: ['quanto', 'quantia', 'total', 'soma', 'somam', 'somei', 'somou', 'valor'],
  CONTAGEM: ['quantos', 'quantas', 'numero', 'quantidade'],
  MAIOR: ['maior', 'maiores', 'caro', 'cara', 'caros', 'principal', 'pesou', 'pesa', 'pesado'],
  MENOR: ['menor', 'menores', 'barato', 'barata'],
  MEDIA: ['media', 'medio', 'medias'],
  PENDENTE: ['falta', 'faltam', 'faltando', 'aberto', 'abertas', 'pendente', 'pendentes', 'vencer', 'vencidas', 'vencido', 'atrasada', 'atrasadas', 'devendo'],
  PAGO: ['pago', 'pagas', 'pagos', 'quitado', 'quitadas', 'baixado', 'baixadas'],
  MES_PASSADO: ['passado', 'anterior', 'antes'],
  COMPARAR: ['comparar', 'comparado', 'comparacao', 'versus', 'diferenca'],
  RESUMO: ['resumo', 'situacao', 'panorama', 'geral'],
  ECONOMIZAR: ['economizar', 'economia', 'cortar', 'corte', 'poupar', 'reduzir', 'diminuir'],
  SOBRA: ['sobra', 'sobrou', 'sobram', 'saldo', 'resta', 'restou', 'liquido'],
  CONSEGUIR: ['conseguir', 'consigo', 'dar', 'da', 'fecha', 'fechar', 'alcanca'],
};

const TAG_OF = new Map<string, string>();
for (const [tag, words] of Object.entries(SYNONYMS)) {
  for (const word of words) TAG_OF.set(word, tag);
}

/**
 * Palavras que nunca são filtro de busca.
 *
 * A lista é longa de propósito: o que sobra depois de tirar etiquetas e
 * stopwords vira busca por nome de estabelecimento, e uma palavra de ligação
 * esquecida aqui faz o assistente procurar por "tive" nas descrições — que foi
 * exatamente o que aconteceu antes de ela crescer.
 */
const STOPWORDS = new Set([
  // artigos, preposições e pronomes
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'o', 'a', 'os', 'as',
  'ao', 'aos', 'um', 'uma', 'uns', 'umas', 'com', 'para', 'pra', 'por', 'que', 'se', 'e',
  'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'eu', 'me', 'mim', 'nosso', 'nossa',
  'esse', 'este', 'essa', 'esta', 'isso', 'aquilo', 'ele', 'ela', 'qual', 'quais',
  // verbos de ligação e auxiliares, que aparecem em quase toda pergunta
  'foi', 'foram', 'era', 'eram', 'sao', 'ser', 'sendo', 'esta', 'estao', 'estou', 'estava',
  'ter', 'tem', 'tenho', 'temos', 'tinha', 'tive', 'teve', 'tiveram', 'havia', 'houve',
  'fiz', 'fez', 'fazer', 'faco', 'fizemos', 'vai', 'vou', 'ir', 'pode', 'posso', 'poderia',
  'quero', 'queria', 'saber', 'diga', 'dizer', 'fala', 'falar', 'conte', 'contar',
  // advérbios e conectivos frequentes
  'ja', 'mais', 'menos', 'tudo', 'todo', 'toda', 'muito', 'muita', 'pouco', 'ainda',
  'entao', 'assim', 'tambem', 'so', 'apenas', 'agora', 'hoje', 'sobre', 'como', 'onde',
  'quando', 'porque', 'mesmo', 'coisa', 'tipo', 'ate', 'nao', 'sim',
  // palavras de tempo que já são tratadas na extração de período
  'mes', 'meses', 'ano', 'anos', 'dia', 'dias', 'semana', 'semanas',
]);

interface Parsed {
  raw: string;
  words: string[];
  tags: Set<string>;
  /** palavras que não viraram etiqueta nem stopword: viram filtro de texto */
  rest: string[];
}

function parse(question: string): Parsed {
  const raw = normalize(question);
  const words = raw.split(/\s+/).filter(Boolean);
  const tags = new Set<string>();
  const rest: string[] = [];

  for (const word of words) {
    const tag = TAG_OF.get(word);
    if (tag) {
      tags.add(tag);
      continue;
    }
    if (!STOPWORDS.has(word) && word.length > 2) rest.push(word);
  }

  // "mais caro" e "mais cara" viram MAIOR mesmo com o "mais" caindo em stopword
  if (/\bmais car[oa]\b/.test(raw)) tags.add('MAIOR');
  if (/\bmes passado\b|\bmes anterior\b|\bultimo mes\b/.test(raw)) tags.add('MES_PASSADO');

  return { raw, words, tags, rest };
}

/* ----------------------------------------------------------------- slots */

type Kind = 'out' | 'in' | 'invest';

interface Slots {
  /** o que a pessoa quer de volta */
  form: 'total' | 'list' | 'count' | 'max' | 'min' | 'avg' | null;
  kind: Kind | null;
  month: MonthKey;
  /** o mês foi dito na pergunta, ou é o que está aberto na tela? */
  monthExplicit: boolean;
  category: Category | null;
  /** texto livre que sobrou, usado para achar por descrição */
  term: string;
  onlyPending: boolean;
  onlySettled: boolean;
}

/**
 * Os meses, casados como palavra inteira.
 *
 * Por pedaço de texto isto erra feio: "pagos" contém "agos", e "maior" contém
 * "maio". A fronteira de palavra é o que separa uma pergunta sobre agosto de
 * uma pergunta sobre contas pagas.
 */
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const MONTH_PATTERNS = MONTHS_PT.map(
  (name, i) => new RegExp(`\\b(${normalize(name)}|${MONTH_SHORT[i]})\\b`),
);

/** nome e abreviação de todos os meses, para não virarem filtro de texto */
const MONTH_WORDS = new Set([...MONTHS_PT.map((m) => normalize(m)), ...MONTH_SHORT]);

/** o mês citado na pergunta, se houver */
function extractMonth(parsed: Parsed, ctx: AssistantContext): { month: MonthKey; explicit: boolean } {
  if (parsed.tags.has('MES_PASSADO')) {
    return { month: addMonthsToKey(ctx.month, -1), explicit: true };
  }

  for (let i = 0; i < MONTHS_PT.length; i++) {
    if (!MONTH_PATTERNS[i].test(parsed.raw)) continue;

    // "agosto" sem ano quer dizer o agosto mais recente que já passou
    const { y, m } = monthKeyParts(ctx.month);
    const year = i > m ? y - 1 : y;
    return { month: `${year}-${String(i + 1).padStart(2, '0')}`, explicit: true };
  }

  return { month: ctx.month, explicit: false };
}

/** a categoria citada na pergunta, comparando com as que a conta realmente tem */
function extractCategory(parsed: Parsed, ctx: AssistantContext): Category | null {
  let best: { category: Category; length: number } | null = null;

  for (const category of ctx.categories) {
    const name = normalize(category.name);
    const first = name.split(' ')[0];
    if (first.length < 4) continue;
    if (!parsed.raw.includes(first)) continue;
    if (!best || first.length > best.length) best = { category, length: first.length };
  }

  return best?.category ?? null;
}

function extractSlots(parsed: Parsed, ctx: AssistantContext): Slots {
  const { month, explicit } = extractMonth(parsed, ctx);
  const category = extractCategory(parsed, ctx);

  const kind: Kind | null = parsed.tags.has('RECEITA')
    ? 'in'
    : parsed.tags.has('INVEST')
      ? 'invest'
      : parsed.tags.has('GASTO')
        ? 'out'
        : (category?.kind ?? null);

  const form: Slots['form'] = parsed.tags.has('CONTAGEM')
    ? 'count'
    : parsed.tags.has('MAIOR')
      ? 'max'
      : parsed.tags.has('MENOR')
        ? 'min'
        : parsed.tags.has('MEDIA')
          ? 'avg'
          : parsed.tags.has('LISTA')
            ? 'list'
            : parsed.tags.has('TOTAL')
              ? 'total'
              : null;

  // o que sobrou depois de tirar etiquetas, mês e categoria vira busca por texto
  const categoryWords = category ? new Set(normalize(category.name).split(' ')) : new Set<string>();
  const term = parsed.rest
    .filter((w) => !categoryWords.has(w) && !MONTH_WORDS.has(w))
    .join(' ')
    .trim();

  return {
    form,
    kind,
    month,
    monthExplicit: explicit,
    category,
    term,
    onlyPending: parsed.tags.has('PENDENTE'),
    onlySettled: parsed.tags.has('PAGO'),
  };
}

/* ------------------------------------------------------------- consultas */

const monthName = (key: MonthKey) => formatMonthLabel(key).replace(/ de \d{4}$/, '');

const categoryName = (ctx: AssistantContext, id: string | null): string =>
  ctx.categories.find((c) => c.id === id)?.name ?? 'Sem categoria';

/** as ocorrências de um mês qualquer, expandidas na hora */
function occurrencesOfMonth(ctx: AssistantContext, month: MonthKey): Occurrence[] {
  if (month === ctx.month) return ctx.occurrences;
  return ctx.expand ? ctx.expand(month) : occurrencesInMonth(ctx.entries, month, ctx.today);
}

const MOV_PARAM: Record<Kind, string> = { out: 'saidas', in: 'entradas', invest: 'investimentos' };

/** "12 lançamentos de agosto", o rodapé que diz de onde veio o número */
const basisOf = (rows: Occurrence[], slots: Slots) =>
  `${rows.length} ${rows.length === 1 ? 'lançamento' : 'lançamentos'} de ${monthName(slots.month)}`;

const movLink = (slots: Slots) => ({ label: 'Ver em Movimentos', route: { view: 'movimentos', param: MOV_PARAM[slots.kind ?? 'out'] } as Route });

function summaryOfMonth(ctx: AssistantContext, month: MonthKey): MonthSummary {
  if (month === ctx.month) return ctx.summary;
  return summarizeMonth(occurrencesOfMonth(ctx, month), month, ctx.today);
}

/** aplica os filtros da pergunta sobre as ocorrências do mês */
function select(ctx: AssistantContext, slots: Slots): Occurrence[] {
  let rows = occurrencesOfMonth(ctx, slots.month);

  if (slots.kind) rows = rows.filter((o) => o.kind === slots.kind);
  if (slots.category) rows = rows.filter((o) => o.categoryId === slots.category!.id);
  if (slots.onlyPending) rows = rows.filter((o) => o.settlement === null);
  if (slots.onlySettled) rows = rows.filter((o) => o.settlement !== null);

  if (slots.term) {
    const needle = slots.term;
    rows = rows.filter((o) => normalize(o.description).includes(needle));
  }

  return rows;
}

const sum = (rows: Occurrence[]): Cents => rows.reduce((total, o) => total + o.amount, 0);

/**
 * Cotação em reais.
 *
 * Moeda pequena precisa de quatro casas: o peso argentino vale cerca de
 * R$ 0,0037 e sairia como "R$ 0,00" na formatação de centavos.
 */
function formatPrice(value: number): string {
  if (value < 0.1) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(value);
  }
  return formatMoney(Math.round(value * 100));
}

const KIND_NOUN: Record<Kind, { one: string; many: string; verb: string }> = {
  out: { one: 'gasto', many: 'gastos', verb: 'saiu' },
  in: { one: 'receita', many: 'receitas', verb: 'entrou' },
  invest: { one: 'aporte', many: 'aportes', verb: 'foi investido' },
};

/**
 * A situação de uma ocorrência, dita conforme o tipo.
 *
 * "Venceu" só faz sentido em conta a pagar. Receita em atraso está "a receber",
 * e aporte não tem vencimento nenhum — dizer que um aporte venceu seria
 * simplesmente errado.
 */
function statusOf(o: Occurrence): string {
  if (o.settlement !== null) return o.kind === 'in' ? 'recebido' : 'pago';
  if (o.kind === 'in') return 'a receber';
  if (o.kind === 'invest') return '';
  return o.overdue ? 'venceu' : 'a pagar';
}

/** como a resposta se refere ao recorte que a pergunta pediu */
function describeScope(slots: Slots): string {
  const parts: string[] = [];
  if (slots.category) parts.push(`em ${slots.category.name}`);
  if (slots.term) parts.push(`com "${slots.term}"`);
  if (slots.onlyPending) parts.push('ainda em aberto');
  if (slots.onlySettled) parts.push('já pagos');
  return parts.length ? ` ${parts.join(', ')}` : '';
}

/* -------------------------------------------------------- respostas base */

function answerList(ctx: AssistantContext, slots: Slots, rows: Occurrence[]): Answer {
  const kind = slots.kind ?? 'out';
  const noun = KIND_NOUN[kind];
  const scope = describeScope(slots);

  if (!rows.length) {
    return { text: `Não encontrei ${noun.many}${scope} em ${monthName(slots.month)}.` };
  }

  const ordered = [...rows].sort((a, b) => b.amount - a.amount);
  const shown = ordered.slice(0, 12);
  const total = sum(rows);

  const intro = `${rows.length === 1 ? `Foi 1 ${noun.one}` : `Foram ${rows.length} ${noun.many}`}${scope} em ${monthName(slots.month)}, somando ${formatMoney(total)}.`;
  const tail = ordered.length > shown.length ? `\n\nMostrei os ${shown.length} maiores; há mais ${ordered.length - shown.length}.` : '';

  return {
    text: intro + tail,
    basis: basisOf(rows, slots),
    link: movLink(slots),
    highlight: { label: `Total em ${monthName(slots.month)}`, value: formatMoney(total) },
    list: shown.map((o) => ({
      label: o.description,
      detail: [
        categoryName(ctx, o.categoryId),
        formatDayShort(o.date),
        o.installment ? `${o.installment.index}/${o.installment.total}` : '',
        statusOf(o),
      ]
        .filter(Boolean)
        .join(' · '),
      value: formatMoney(o.amount),
    })),
  };
}

function answerTotal(ctx: AssistantContext, slots: Slots, rows: Occurrence[]): Answer {
  const kind = slots.kind ?? 'out';
  const noun = KIND_NOUN[kind];
  const scope = describeScope(slots);
  const total = sum(rows);

  if (!rows.length) {
    return { text: `Não encontrei ${noun.many}${scope} em ${monthName(slots.month)}.` };
  }

  // compra no cartão não tem baixa própria: quem se paga é a fatura
  const payable = rows.filter((o) => !o.cardId || o.virtual);
  const settled = payable.filter((o) => o.settlement !== null);
  const extra =
    kind !== 'out' || slots.onlyPending || slots.onlySettled || !payable.length || settled.length === payable.length
      ? ''
      : settled.length === 0
        ? ' Nenhum deles foi baixado como pago ainda.'
        : ` Desses, ${formatMoney(sum(settled))} já foram pagos.`;

  const ordered = [...rows].sort((a, b) => b.amount - a.amount);
  return {
    text: `Em ${monthName(slots.month)}${scope ? '' : ''} ${noun.verb} ${formatMoney(total)}${scope} em ${rows.length} ${rows.length === 1 ? 'lançamento' : 'lançamentos'}.${extra}`,
    highlight: { label: scope.trim() || `${noun.many} de ${monthName(slots.month)}`, value: formatMoney(total) },
    basis: basisOf(rows, slots),
    link: movLink(slots),
    list: ordered.slice(0, 8).map((o) => ({
      label: o.description,
      detail: [categoryName(ctx, o.categoryId), formatDayShort(o.date)].join(' · '),
      value: formatMoney(o.amount),
    })),
  };
}

function answerCount(slots: Slots, rows: Occurrence[]): Answer {
  const kind = slots.kind ?? 'out';
  const noun = KIND_NOUN[kind];
  const scope = describeScope(slots);
  return {
    text: rows.length
      ? `São ${rows.length} ${rows.length === 1 ? noun.one : noun.many}${scope} em ${monthName(slots.month)}, somando ${formatMoney(sum(rows))}.`
      : `Nenhum ${noun.one}${scope} em ${monthName(slots.month)}.`,
    highlight: rows.length ? { label: 'Quantidade', value: String(rows.length) } : undefined,
    basis: rows.length ? basisOf(rows, slots) : undefined,
    link: movLink(slots),
  };
}

function answerExtreme(ctx: AssistantContext, slots: Slots, rows: Occurrence[], want: 'max' | 'min'): Answer {
  const kind = slots.kind ?? 'out';
  const noun = KIND_NOUN[kind];
  const scope = describeScope(slots);

  if (!rows.length) return { text: `Não encontrei ${noun.many}${scope} em ${monthName(slots.month)}.` };

  const pick = rows.reduce((best, o) =>
    want === 'max' ? (o.amount > best.amount ? o : best) : o.amount < best.amount ? o : best,
  );

  return {
    text: `O ${want === 'max' ? 'maior' : 'menor'} ${noun.one}${scope} de ${monthName(slots.month)} foi ${pick.description}, de ${formatMoney(pick.amount)}, em ${formatDayShort(pick.date)} — categoria ${categoryName(ctx, pick.categoryId)}.`,
    highlight: { label: pick.description, value: formatMoney(pick.amount) },
    basis: basisOf(rows, slots),
    link: movLink(slots),
  };
}

function answerAverage(slots: Slots, rows: Occurrence[]): Answer {
  const kind = slots.kind ?? 'out';
  const noun = KIND_NOUN[kind];
  if (!rows.length) return { text: `Não encontrei ${noun.many} em ${monthName(slots.month)}.` };
  const media = Math.round(sum(rows) / rows.length);
  return {
    text: `A média por ${noun.one} em ${monthName(slots.month)} é de ${formatMoney(media)}, em ${rows.length} lançamentos.`,
    highlight: { label: 'Média', value: formatMoney(media) },
    basis: basisOf(rows, slots),
    link: movLink(slots),
  };
}

/* ------------------------------------------------------- temas nomeados */

type Named = (ctx: AssistantContext, slots: Slots) => Answer;

/** perguntas que não são "quanto/quais de alguma coisa" e precisam de resposta própria */
const NAMED: { id: string; test: (p: Parsed) => boolean; answer: Named }[] = [
  {
    id: 'resumo',
    test: (p) => p.tags.has('RESUMO') || /\bcomo (estou|vou|ando|anda)\b/.test(p.raw),
    answer: (ctx, slots) => {
      const s = summaryOfMonth(ctx, slots.month);
      if (!s.count) {
        return { text: `Ainda não há nada lançado em ${monthName(slots.month)}. Assim que você registrar o primeiro valor eu consigo te responder de verdade.` };
      }
      const negativo =
        slots.month !== ctx.month
          ? null
          : ctx.cash
            ? ctx.cash.negative[0]
              ? { date: ctx.cash.negative[0].from, balance: ctx.cash.negative[0].lowest }
              : null
            : firstNegativeDay(ctx.projection);
      const parts = [
        `Em ${monthName(slots.month)} entraram ${formatMoney(s.income)} e saíram ${formatMoney(s.expense)}.`,
        s.invested > 0 ? `Você investiu ${formatMoney(s.invested)}.` : '',
        s.balance >= 0 ? `Sobram ${formatMoney(s.balance)}.` : `Está faltando ${formatMoney(-s.balance)} para fechar o mês.`,
        negativo ? `O saldo cruza o zero no dia ${Number(negativo.date.slice(8))}.` : '',
        s.overdueExpense > 0 ? `${formatMoney(s.overdueExpense)} já venceram e não foram baixados.` : '',
      ].filter(Boolean);

      return {
        text: parts.join(' '),
        highlight: { label: s.balance >= 0 ? 'Sobra do mês' : 'Falta no mês', value: formatMoney(Math.abs(s.balance)) },
      };
    },
  },
  {
    id: 'saldo',
    test: (p) => p.tags.has('SOBRA') && !p.tags.has('GASTO') && !p.tags.has('RECEITA'),
    answer: (ctx, slots) => {
      const s = summaryOfMonth(ctx, slots.month);
      return {
        text:
          s.balance >= 0
            ? `Sobram ${formatMoney(s.balance)} em ${monthName(slots.month)}, contando o que entrou e tudo que ainda está previsto sair.`
            : `${monthName(slots.month)} está negativo em ${formatMoney(-s.balance)}. As saídas previstas passam das entradas.`,
        highlight: { label: 'Saldo do mês', value: formatMoney(s.balance) },
      };
    },
  },
  {
    id: 'contas-pendentes',
    /**
     * "Quais contas faltam pagar" precisa vir antes da composição por partes:
     * a palavra "contas" também é o começo da categoria "Contas de casa", e sem
     * esta regra a pergunta viraria uma busca dentro daquela categoria.
     */
    test: (p) => p.tags.has('PENDENTE') && /\bpagar|conta|contas|boleto|boletos\b/.test(p.raw),
    answer: (ctx, slots) => {
      const open = occurrencesOfMonth(ctx, slots.month).filter(
        (o) => o.kind === 'out' && o.settlement === null,
      );
      if (!open.length) {
        return { text: `Tudo pago em ${monthName(slots.month)}. Nenhuma conta em aberto.` };
      }

      const total = sum(open);
      const vencidas = open.filter((o) => o.overdue);
      const ordenadas = [...open].sort((a, b) => (a.date < b.date ? -1 : 1));

      return {
        text: `${open.length === 1 ? 'Falta 1 conta' : `Faltam ${open.length} contas`}, somando ${formatMoney(total)}.${
          vencidas.length ? ` ${vencidas.length} já ${vencidas.length === 1 ? 'venceu' : 'venceram'}.` : ''
        }`,
        highlight: { label: 'A pagar', value: formatMoney(total) },
        list: ordenadas.map((o) => ({
          label: o.description,
          detail: `${categoryName(ctx, o.categoryId)} · ${formatDayShort(o.date)}${o.overdue ? ' · venceu' : ''}`,
          value: formatMoney(o.amount),
        })),
      };
    },
  },
  {
    id: 'vai-dar',
    test: (p) => p.tags.has('CONSEGUIR') && /\bpagar|contas|mes\b/.test(p.raw),
    answer: (ctx) => {
      const negativo = ctx.cash
        ? ctx.cash.negative[0]
          ? { date: ctx.cash.negative[0].from, balance: ctx.cash.negative[0].lowest }
          : null
        : firstNegativeDay(ctx.projection);
      if (!negativo) {
        return { text: `Pelo que está lançado, sim. O saldo não fica negativo em nenhum dia de ${monthName(ctx.month)}, e sobram ${formatMoney(ctx.summary.balance)} no fim.` };
      }
      return {
        text: `Pelo que está lançado, o dinheiro não alcança: o saldo cruza o zero no dia ${Number(negativo.date.slice(8))}, faltando ${formatMoney(-negativo.balance)}. Dá tempo de antecipar uma entrada ou adiar uma saída até lá.`,
        highlight: { label: `Falta no dia ${Number(negativo.date.slice(8))}`, value: formatMoney(-negativo.balance) },
      };
    },
  },
  {
    id: 'compara',
    test: (p) => p.tags.has('COMPARAR') || (p.tags.has('MES_PASSADO') && /\bmais|menos\b/.test(p.raw)),
    answer: (ctx) => {
      const atual = summaryOfMonth(ctx, ctx.month);
      const anterior = summaryOfMonth(ctx, addMonthsToKey(ctx.month, -1));
      if (anterior.expense === 0) return { text: 'Ainda não tenho dois meses com gastos para comparar.' };

      const diff = atual.expense - anterior.expense;
      if (diff === 0) return { text: `Gastou exatamente o mesmo que em ${monthName(anterior.month)}: ${formatMoney(atual.expense)}.` };

      return {
        text: `Você gastou ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'a mais' : 'a menos'} que em ${monthName(anterior.month)} — ${formatPercent(ratio(Math.abs(diff), anterior.expense))} ${diff > 0 ? 'acima' : 'abaixo'}. Foram ${formatMoney(atual.expense)} contra ${formatMoney(anterior.expense)}.`,
        highlight: { label: diff > 0 ? 'A mais' : 'A menos', value: formatMoney(Math.abs(diff)) },
      };
    },
  },
  {
    id: 'categoria-top',
    test: (p) => p.tags.has('MAIOR') && /\bcategoria\b/.test(p.raw),
    answer: (ctx, slots) => {
      const s = summaryOfMonth(ctx, slots.month);
      const rows = [...s.byCategory.entries()].sort((a, b) => b[1] - a[1]);
      if (!rows.length) return { text: `Ainda não há gastos categorizados em ${monthName(slots.month)}.` };
      const total = rows.reduce((acc, [, v]) => acc + v, 0);

      return {
        text: `A categoria que mais pesou em ${monthName(slots.month)} foi ${categoryName(ctx, rows[0][0])}, com ${formatMoney(rows[0][1])} — ${formatPercent(ratio(rows[0][1], total))} de tudo que saiu.`,
        highlight: { label: categoryName(ctx, rows[0][0]), value: formatMoney(rows[0][1]) },
        list: rows.slice(0, 6).map(([id, value]) => ({
          label: categoryName(ctx, id),
          detail: formatPercent(ratio(value, total)),
          value: formatMoney(value),
        })),
      };
    },
  },
  {
    id: 'por-categoria',
    test: (p) => /\bpor categoria\b|\bcategorias\b/.test(p.raw),
    answer: (ctx, slots) => {
      const s = summaryOfMonth(ctx, slots.month);
      const rows = [...s.byCategory.entries()].sort((a, b) => b[1] - a[1]);
      if (!rows.length) return { text: `Ainda não há gastos categorizados em ${monthName(slots.month)}.` };
      const total = rows.reduce((acc, [, v]) => acc + v, 0);

      return {
        text: `Assim ficou ${monthName(slots.month)} por categoria, somando ${formatMoney(total)}:`,
        list: rows.map(([id, value]) => ({
          label: categoryName(ctx, id),
          detail: formatPercent(ratio(value, total)),
          value: formatMoney(value),
        })),
      };
    },
  },
  {
    id: 'mes-caro',
    test: (p) => p.tags.has('MAIOR') && /\bmes\b/.test(p.raw),
    answer: (ctx) => {
      const worst = ctx.history.reduce<MonthSummary | null>((max, m) => (!max || m.expense > max.expense ? m : max), null);
      if (!worst || worst.expense === 0) return { text: 'Ainda não tenho meses suficientes com gasto para comparar.' };
      return {
        text: `Dos últimos meses, o mais caro foi ${monthName(worst.month)}, com ${formatMoney(worst.expense)} em despesas.`,
        highlight: { label: monthName(worst.month), value: formatMoney(worst.expense) },
      };
    },
  },
  {
    id: 'economizar',
    test: (p) => p.tags.has('ECONOMIZAR'),
    answer: (ctx, slots) => {
      const s = summaryOfMonth(ctx, slots.month);
      const rows = [...s.byCategory.entries()].sort((a, b) => b[1] - a[1]);
      const subs = ctx.subscriptions.filter((x) => !x.canceledAt);
      const subsTotal = subs.reduce((acc, x) => acc + (x.cycle === 'monthly' ? x.amount : 0), 0);

      const lines: string[] = [];
      if (rows.length) {
        const total = rows.reduce((acc, [, v]) => acc + v, 0);
        lines.push(`${categoryName(ctx, rows[0][0])} levou ${formatMoney(rows[0][1])} — ${formatPercent(ratio(rows[0][1], total))} de tudo que saiu.`);
      }
      if (subs.length) {
        lines.push(`As ${subs.length} assinaturas somam ${formatMoney(subsTotal)} por mês, ou ${formatMoney(subsTotal * 12)} por ano. É o corte mais fácil, porque não muda nada do seu dia.`);
      }
      if (!lines.length) return { text: 'Ainda não tenho gasto suficiente registrado para apontar onde cortar.' };
      return { text: lines.join(' ') };
    },
  },
  {
    id: 'parcelas-futuras',
    test: (p) =>
      /\bparcelas?\b/.test(p.raw) &&
      /\bfutur|faltam|que vem|restam|ainda\b/.test(p.raw) &&
      !/\bdivida|financiamento|emprestimo|consignado\b/.test(p.raw),
    answer: (ctx) => {
      const lines = ctx.cards.flatMap((card) =>
        futureInstallments(card, ctx.entries, invoiceMonthOf(card, ctx.today)).map((f) => ({ card, f })),
      );
      if (!lines.length) return { text: 'Você não tem compra parcelada com parcelas por vir nos cartões.' };
      const total = lines.reduce((t, { f }) => t + f.perInstallment * f.left, 0);
      return {
        text: `Você tem ${formatMoney(total)} em parcelas futuras, depois das faturas abertas, em ${lines.length} ${lines.length === 1 ? 'compra' : 'compras'}.`,
        highlight: { label: 'Parcelas futuras', value: formatMoney(total) },
        list: lines.map(({ card, f }) => ({
          label: f.description,
          detail: `${card.name || card.institution} · faltam ${f.left}× de ${formatMoney(f.perInstallment)}`,
          value: formatMoney(f.perInstallment * f.left),
        })),
        basis: 'compras parceladas nos seus cartões',
        link: { label: 'Ver cartões', route: { view: 'cartoes' } },
      };
    },
  },
  {
    id: 'cartao-proximo',
    test: (p) => /\bcartao|cartoes|fatura|faturas\b/.test(p.raw) && /\bmes que vem|proximo mes|proxima fatura|mes seguinte|vou gastar|vou pagar\b/.test(p.raw),
    answer: (ctx) => {
      if (!ctx.cards.length) return { text: 'Você ainda não cadastrou cartão nenhum.' };
      const next = addMonthsToKey(ctx.month, 1);
      const invoices = ctx.cards.map((c) => ({ c, inv: buildInvoice(c, ctx.entries, ctx.subscriptions, next, ctx.today) }));
      const total = invoices.reduce((t, { inv }) => t + inv.total, 0);
      return {
        text: `As faturas de ${monthName(next)} somam ${formatMoney(total)} até agora — parcelas, assinaturas e o que já foi comprado depois do fechamento. Compras novas até o próximo fechamento ainda entram.`,
        highlight: { label: `Faturas de ${monthName(next)}`, value: formatMoney(total) },
        list: invoices.map(({ c, inv }) => ({
          label: c.name || c.institution,
          detail: `vence ${formatDayShort(inv.dueOn)} · ${inv.lines.length} ${inv.lines.length === 1 ? 'linha' : 'linhas'}`,
          value: formatMoney(inv.total),
        })),
        basis: `faturas de ${monthName(next)} dos seus cartões`,
        link: { label: 'Ver cartões', route: { view: 'cartoes' } },
      };
    },
  },
  {
    id: 'meta-guardar',
    test: (p) => /\bse (eu )?(guardar|juntar|poupar|aportar|investir)\b/.test(p.raw) && /\d/.test(p.raw),
    answer: (ctx) => {
      const raw = ctx.goals.length ? pickGoal(ctx) : null;
      if (!raw) return { text: 'Crie uma meta primeiro e eu digo quando você chega nela.' };
      const amount = parseMoney((lastQuestion.match(/(\d[\d.,]*)/) ?? [])[1] ?? '');
      if (!amount) return { text: 'Diga quanto quer guardar por mês, por exemplo: "se eu guardar 500 por mês".' };
      const p = goalProgress(raw, ctx.entries, ctx.month, ctx.today);
      if (p.reached) return { text: `${raw.name} já foi batida.` };
      const months = Math.ceil(p.missing / amount);
      const when = addMonthsToKey(ctx.month, months);
      return {
        text: `Guardando ${formatMoney(amount)} por mês, faltam ${formatMoney(p.missing)} para ${raw.name}: você chega em ${formatMonthLabel(when)}, daqui a ${months} ${months === 1 ? 'mês' : 'meses'}.${
          raw.deadline ? (when <= raw.deadline.slice(0, 7) ? ' Dentro do prazo.' : ` Depois do prazo, que é ${formatMonthLabel(raw.deadline.slice(0, 7))}.`) : ''
        }`,
        highlight: { label: raw.name, value: formatMonthLabel(when) },
        basis: `meta ${raw.name}: ${formatMoney(p.current)} de ${formatMoney(p.target)}`,
        link: { label: 'Ver metas', route: { view: 'metas' } },
      };
    },
  },
  {
    id: 'meta-falta',
    test: (p) =>
      /\bfalta|faltam|chegar|atingir\b/.test(p.raw) &&
      /\bmeta|metas|objetivo|para (a |o |minha |meu )?\w{4,}/.test(p.raw) &&
      !/\bpagar|conta|contas|boleto|mes\b/.test(p.raw),
    answer: (ctx) => {
      const goal = pickGoal(ctx);
      if (!goal) return { text: 'Você não tem meta cadastrada ainda.' };
      const p = goalProgress(goal, ctx.entries, ctx.month, ctx.today);
      if (p.reached) return { text: `${goal.name} já foi batida: ${formatMoney(p.current)} de ${formatMoney(p.target)}.` };
      return {
        text: `Faltam ${formatMoney(p.missing)} para ${goal.name} — você tem ${formatMoney(p.current)} de ${formatMoney(p.target)}.${
          p.perMonth != null && p.monthsLeft != null && p.monthsLeft > 0 ? ` Para chegar no prazo, são ${formatMoney(p.perMonth)} por mês.` : ''
        }`,
        highlight: { label: 'Falta', value: formatMoney(p.missing) },
        basis: `meta ${goal.name}`,
        link: { label: 'Ver metas', route: { view: 'metas' } },
      };
    },
  },
  {
    id: 'patrimonio',
    test: (p) => /\bpatrimonio\b/.test(p.raw),
    answer: (ctx) => {
      const { m } = monthKeyParts(ctx.month);
      const months = m + 1;
      const history = wealthHistory({ assets: ctx.assets ?? [], entries: ctx.entries, debts: ctx.debts, today: ctx.today }, months + 1);
      const first = history[0]?.net ?? 0;
      const last = history[history.length - 1]?.net ?? 0;
      const delta = last - first;
      return {
        text:
          delta === 0
            ? 'Seu patrimônio (investimentos, bens e dívidas) não mudou este ano, pelo que está registrado.'
            : `Seu patrimônio ${delta > 0 ? 'cresceu' : 'diminuiu'} ${formatMoney(Math.abs(delta))} este ano: de ${formatMoney(first)} para ${formatMoney(last)}, contando investimentos, bens e dívidas.`,
        highlight: { label: delta >= 0 ? 'Cresceu no ano' : 'Diminuiu no ano', value: formatMoney(Math.abs(delta)) },
        basis: 'aportes, bens e saldo das dívidas, mês a mês',
        link: { label: 'Ver patrimônio', route: { view: 'patrimonio' } },
      };
    },
  },
  {
    id: 'assinaturas',
    test: (p) => /\bassinatura|assinaturas|streaming\b/.test(p.raw),
    answer: (ctx) => {
      const subs = ctx.subscriptions.filter((s) => !s.canceledAt);
      if (!subs.length) return { text: 'Você não tem assinatura cadastrada. Se tiver alguma, vale registrar — é o gasto que mais passa despercebido.' };
      const mensal = subs.reduce((acc, s) => acc + (s.cycle === 'monthly' ? s.amount : 0), 0);
      const ordenadas = [...subs].sort((a, b) => b.amount - a.amount);

      return {
        text: `São ${subs.length} ${subs.length === 1 ? 'assinatura' : 'assinaturas'}, ${formatMoney(mensal)} por mês e ${formatMoney(mensal * 12)} no ano.`,
        highlight: { label: 'Por mês', value: formatMoney(mensal) },
        list: ordenadas.map((s) => ({
          label: s.name,
          detail: `dia ${String(s.billingDay).padStart(2, '0')}${s.cycle === 'yearly' ? ' · anual' : ''}`,
          value: formatMoney(s.amount),
        })),
      };
    },
  },
  {
    id: 'cartoes',
    test: (p) => /\bfatura|cartao|cartoes\b/.test(p.raw),
    answer: (ctx) => {
      if (!ctx.cards.length) return { text: 'Você ainda não cadastrou cartão nenhum.' };
      return {
        text: `Você tem ${ctx.cards.length} ${ctx.cards.length === 1 ? 'cartão' : 'cartões'}. A tela de Cartões mostra a fatura montada, o limite comprometido e as parcelas em aberto de cada um.`,
        list: ctx.cards.map((c) => ({
          label: c.name || c.institution,
          detail: `fecha dia ${c.closingDay} · vence dia ${c.dueDay}`,
          value: c.limit ? `limite ${formatMoney(c.limit, { compact: true })}` : '—',
        })),
      };
    },
  },
  {
    id: 'metas',
    test: (p) => /\bmeta|metas|objetivo\b/.test(p.raw),
    answer: (ctx) => {
      if (!ctx.goals.length) return { text: 'Você não tem meta cadastrada ainda.' };
      return {
        text: `Você tem ${ctx.goals.length} ${ctx.goals.length === 1 ? 'meta' : 'metas'}. A tela de Metas mostra quanto falta e quanto guardar por mês em cada uma.`,
        list: ctx.goals.map((g) => ({ label: `${g.icon} ${g.name}`, detail: 'meta', value: formatMoney(g.target, { compact: true }) })),
      };
    },
  },
  {
    id: 'dividas',
    test: (p) => /\bdivida|dividas|devo|devedor|financiamento\b/.test(p.raw),
    answer: (ctx) => {
      if (!ctx.debts.length) return { text: 'Você não tem dívida cadastrada. Se tiver financiamento ou parcelamento, vale registrar para acompanhar o saldo devedor.' };
      const mensal = ctx.debts.reduce((acc, d) => acc + d.installment, 0);
      return {
        text: `São ${ctx.debts.length} ${ctx.debts.length === 1 ? 'dívida' : 'dívidas'}, comprometendo ${formatMoney(mensal)} por mês.`,
        highlight: { label: 'Por mês', value: formatMoney(mensal) },
        list: ctx.debts.map((d) => ({
          label: `${d.icon} ${d.name}`,
          detail: `${d.installments}x de ${formatMoney(d.installment)}`,
          value: formatMoney(d.installment * d.installments, { compact: true }),
        })),
      };
    },
  },
  {
    id: 'reserva',
    test: (p) => /\breserva\b/.test(p.raw) && /\bmeses|cobre|dura|aguenta\b/.test(p.raw),
    answer: (ctx) => {
      const invested = ctx.history.reduce((acc, m) => acc + m.invested, 0);
      const comGasto = ctx.history.filter((m) => m.expense > 0);
      const gastoMedio = comGasto.length ? Math.round(comGasto.reduce((acc, m) => acc + m.expense, 0) / comGasto.length) : 0;

      if (!invested || !gastoMedio) {
        return { text: 'Para responder eu preciso de aportes registrados e de pelo menos um mês com gastos.' };
      }
      const meses = invested / gastoMedio;
      return {
        text: `Com ${formatMoney(invested)} investidos e um gasto médio de ${formatMoney(gastoMedio)} por mês, sua reserva cobre cerca de ${meses.toFixed(1)} ${meses < 2 ? 'mês' : 'meses'} parada. A recomendação comum é de seis a doze meses.`,
        highlight: { label: 'Cobertura', value: `${meses.toFixed(1)} meses` },
      };
    },
  },
  {
    id: 'moedas',
    test: (p) => /\bdolar|euro|libra|cambio|moeda\b/.test(p.raw),
    answer: (ctx) => {
      const quotes = (ctx.market?.currencies ?? []).filter((q) => q.price != null);
      if (!quotes.length) return { text: 'Ainda não carreguei as cotações. Abra a tela de News uma vez e eu passo a saber.' };
      return {
        text: 'Cotações de agora:',
        list: quotes.map((q) => ({
          label: q.label,
          detail: q.changePercent != null ? `${q.changePercent > 0 ? '+' : ''}${q.changePercent.toFixed(2)}% no dia` : '',
          value: formatPrice(q.price ?? 0),
        })),
      };
    },
  },
  {
    id: 'cripto',
    test: (p) => /\bbitcoin|cripto|ethereum|btc\b/.test(p.raw),
    answer: (ctx) => {
      const quotes = (ctx.market?.crypto ?? []).filter((q) => q.price != null);
      if (!quotes.length) return { text: 'Ainda não carreguei as cotações de cripto. Abra a tela de News uma vez.' };
      return {
        text: 'Cripto agora. Lembrando que oscila muito — o valor de hoje diz pouco sobre o de amanhã.',
        list: quotes.map((q) => ({
          label: q.label,
          detail: q.changePercent != null ? `${q.changePercent > 0 ? '+' : ''}${q.changePercent.toFixed(2)}% no dia` : '',
          value: formatPrice(q.price ?? 0),
        })),
      };
    },
  },
  {
    id: 'indicadores',
    test: (p) => /\bselic|cdi\b/.test(p.raw) || (/\bipca|inflacao|poupanca\b/.test(p.raw) && /\bquanto|qual|esta|taxa\b/.test(p.raw)),
    answer: (ctx) => {
      const ind = (ctx.market?.indicators ?? []).filter((i) => i.value != null);
      if (!ind.length) return { text: 'Ainda não carreguei os indicadores. Abra a tela de News uma vez e eu passo a saber.' };
      return {
        text: 'Pelos dados do Banco Central:',
        list: ind.map((i) => ({ label: i.label, detail: '', value: `${(i.value ?? 0).toFixed(2).replace('.', ',')}%` })),
      };
    },
  },
];

/** para onde cada tema leva, quando a resposta não diz */
const NAMED_LINKS: Record<string, { label: string; route: Route }> = {
  resumo: { label: 'Ver o Início', route: { view: 'inicio' } },
  saldo: { label: 'Ver o Início', route: { view: 'inicio' } },
  'contas-pendentes': { label: 'Ver despesas', route: { view: 'movimentos', param: 'saidas' } },
  'vai-dar': { label: 'Ver o mês dia a dia', route: { view: 'calendario' } },
  compara: { label: 'Ver movimentos', route: { view: 'movimentos' } },
  'categoria-top': { label: 'Ver despesas', route: { view: 'movimentos', param: 'saidas' } },
  'por-categoria': { label: 'Ver despesas', route: { view: 'movimentos', param: 'saidas' } },
  'mes-caro': { label: 'Ver movimentos', route: { view: 'movimentos' } },
  economizar: { label: 'Ver assinaturas', route: { view: 'assinaturas' } },
  assinaturas: { label: 'Ver assinaturas', route: { view: 'assinaturas' } },
  cartoes: { label: 'Ver cartões', route: { view: 'cartoes' } },
  metas: { label: 'Ver metas', route: { view: 'metas' } },
  dividas: { label: 'Ver dívidas', route: { view: 'dividas' } },
  reserva: { label: 'Ver metas', route: { view: 'metas' } },
  moedas: { label: 'Ver News', route: { view: 'news' } },
  cripto: { label: 'Ver News', route: { view: 'news' } },
  indicadores: { label: 'Ver News', route: { view: 'news' } },
};

/** a pergunta crua da vez; os temas que precisam de número leem daqui */
let lastQuestion = '';

/** a meta citada pelo nome; sem nome, a primeira ativa */
function pickGoal(ctx: AssistantContext): Goal | null {
  const raw = normalize(lastQuestion);
  const active = ctx.goals.filter((g) => !g.archivedAt && !g.pausedAt);
  const named = active.find((g) =>
    normalize(g.name)
      .split(' ')
      .some((w) => w.length >= 4 && raw.includes(w)),
  );
  return named ?? active[0] ?? null;
}

/* -------------------------------------------------------------- glossário */

interface GlossaryEntry {
  terms: string[];
  text: string;
}

const GLOSSARY: GlossaryEntry[] = [
  { terms: ['tesouro selic'], text: 'Tesouro Selic é o título que acompanha a taxa Selic. É o mais usado como reserva de emergência: tem liquidez no dia útil seguinte e quase não oscila, então o dinheiro não encolhe se você precisar sacar antes do prazo.' },
  { terms: ['tesouro direto', 'tesouro'], text: 'Tesouro Direto é o programa que vende títulos da dívida do governo federal para pessoa física. Você empresta dinheiro ao governo e recebe de volta com juros. É considerado o investimento de menor risco do país, porque quem paga é o próprio Tesouro Nacional.' },
  { terms: ['cdb ou lci', 'lci ou cdb'], text: 'Depende do imposto. O CDB paga IR de 22,5% a 15%, conforme o prazo; a LCI é isenta. Para comparar de verdade, calcule o rendimento líquido dos dois. Regra prática: uma LCI acima de 85% do CDI costuma ganhar de um CDB de 100% no curto prazo. Olhe também a liquidez — LCI costuma ter carência.' },
  { terms: ['cdb'], text: 'CDB é um empréstimo que você faz a um banco. Ele devolve com juros, normalmente uma porcentagem do CDI. Tem proteção do FGC até R$ 250 mil por CPF e por instituição — o que faz do banco pequeno uma opção razoável, desde que você respeite esse teto.' },
  { terms: ['lci', 'lca'], text: 'LCI e LCA são títulos de banco ligados ao crédito imobiliário e ao agronegócio. A vantagem é serem isentos de Imposto de Renda para pessoa física. Por isso, uma LCI de 90% do CDI pode render mais que um CDB de 100%: no CDB o IR ainda vai descontar.' },
  { terms: ['fgc'], text: 'O FGC é o Fundo Garantidor de Créditos. Ele devolve até R$ 250 mil por CPF e por instituição, com teto de R$ 1 milhão a cada quatro anos, se o banco quebrar. Cobre poupança, CDB, LCI e LCA — mas não cobre ações, fundos nem Tesouro Direto.' },
  { terms: ['selic'], text: 'A Selic é a taxa básica de juros da economia, definida pelo Copom a cada 45 dias. Ela puxa todo o resto: quando sobe, renda fixa rende mais e crédito fica mais caro; quando cai, o contrário.' },
  { terms: ['cdi'], text: 'O CDI é a taxa que os bancos usam para emprestar entre si, e anda coladinha na Selic. Quase toda renda fixa é anunciada como uma porcentagem dele — "110% do CDI" quer dizer 110% dessa taxa.' },
  { terms: ['ipca', 'inflacao'], text: 'O IPCA é o índice oficial de inflação do país, medido pelo IBGE. Ele mede quanto uma cesta média de consumo ficou mais cara. É a régua para saber se um investimento rendeu de verdade: render menos que o IPCA é perder poder de compra.' },
  { terms: ['fii', 'fundo imobiliario'], text: 'FII é um fundo que investe em imóveis ou em papéis ligados a eles, e distribui aluguel aos cotistas todo mês. Negocia em bolsa como uma ação. Os rendimentos mensais são isentos de IR para pessoa física, mas o lucro na venda da cota não é.' },
  { terms: ['juros compostos', 'juro composto'], text: 'Juros compostos são juros que rendem sobre juros. É o que faz o dinheiro crescer devagar no começo e acelerar depois — e é por isso que começar cedo importa mais que começar com muito. O simulador de investimentos mostra o mês exato em que o rendimento passa o seu aporte.' },
  { terms: ['reserva de emergencia'], text: 'Reserva de emergência é o dinheiro que cobre seus gastos se a renda parar. A recomendação comum é de seis a doze meses de despesa, guardado em algo com liquidez diária e baixa oscilação. Não é investimento para render: é para estar lá.' },
  { terms: ['fire', 'viver de renda', 'independencia financeira'], text: 'Viver de renda é ter patrimônio suficiente para que o rendimento cubra seus gastos. A regra clássica é a dos 4%: você precisa de 25 vezes o gasto anual. O simulador daqui faz essa conta com juro real, já descontada a inflação.' },
  { terms: ['iof'], text: 'IOF é o imposto sobre operações financeiras. Aparece no câmbio (3,5% em cartão e espécie), no crédito e em resgates de renda fixa feitos antes de 30 dias. É por isso que o valor da casa de câmbio nunca bate com a cotação da notícia.' },
  { terms: ['come cotas', 'come-cotas'], text: 'Come-cotas é a antecipação semestral do Imposto de Renda em fundos de renda fixa e multimercado. Em maio e novembro, a Receita recolhe uma parte em cotas. Não muda o imposto total, mas tira dinheiro de render antes da hora.' },
];

function findGlossary(raw: string): GlossaryEntry | null {
  let best: { entry: GlossaryEntry; length: number } | null = null;
  for (const entry of GLOSSARY) {
    for (const term of entry.terms) {
      if (!raw.includes(term)) continue;
      if (!best || term.length > best.length) best = { entry, length: term.length };
    }
  }
  return best?.entry ?? null;
}

/** a pergunta é uma definição? "o que é CDB", "o que significa IOF" */
const asksDefinition = (raw: string): boolean =>
  /\b(o que e|oque e|que e|o que sao|significa|significado|explica|explique|defina)\b/.test(raw);

/* ---------------------------------------------------------------- motor */

const FALLBACK = [
  'Essa eu não sei responder.',
  '',
  'Tente perguntar assim:',
  '• "quais foram meus gastos do mês" — ou as receitas, ou os aportes',
  '• "quanto gastei com mercado" — funciona com qualquer categoria sua',
  '• "quanto gastei no ifood" — procura pelo nome do lançamento',
  '• "quais gastos em agosto" — qualquer mês pelo nome',
  '• "quantas contas faltam pagar"',
  '• "qual meu maior gasto", "gastei mais que no mês passado", "vou conseguir pagar tudo"',
  '',
  'Também explico termos: CDB, LCI, Tesouro Direto, Selic, CDI, IPCA, FGC, FII, IOF, juros compostos e come-cotas.',
].join('\n');

/**
 * Responde uma pergunta.
 *
 * A ordem resolve as ambiguidades reais. Definição explícita ("o que é CDB")
 * vem primeiro. Depois os temas com resposta própria. Só então a composição
 * por partes. O glossário sem pergunta de definição fica por último, senão
 * "quanto rende meu CDB" responderia com a definição de CDB — tecnicamente
 * certo e completamente inútil.
 */
export function ask(rawQuestion: string, ctx: AssistantContext): Answer {
  lastQuestion = rawQuestion;
  const parsed = parse(rawQuestion);
  if (parsed.raw.length < 2) {
    return { text: 'Pode perguntar. Comece por "como estou?" ou toque numa das sugestões.' };
  }

  const slots = extractSlots(parsed, ctx);

  // 1. pediu explicitamente uma definição
  if (asksDefinition(parsed.raw)) {
    const entry = findGlossary(parsed.raw);
    if (entry) return { text: entry.text };
  }

  // 2. temas com resposta própria
  for (const named of NAMED) {
    if (!named.test(parsed)) continue;
    const answer = named.answer(ctx, slots);
    return answer.link || !NAMED_LINKS[named.id] ? answer : { ...answer, link: NAMED_LINKS[named.id] };
  }

  // 3. composição por partes: forma × tipo × período × filtro
  const hasSubject = slots.kind !== null || slots.category !== null || slots.term.length > 2;
  if (slots.form && hasSubject) {
    const rows = select(ctx, slots);
    switch (slots.form) {
      case 'list':
        return answerList(ctx, slots, rows);
      case 'count':
        return answerCount(slots, rows);
      case 'max':
      case 'min':
        // "maiores despesas", no plural, pede a lista e não um item só
        if (/\b(maiores|menores)\b/.test(parsed.raw)) {
          const sorted = [...rows].sort((a, b) => (slots.form === 'max' ? b.amount - a.amount : a.amount - b.amount)).slice(0, 8);
          return answerList(ctx, slots, sorted);
        }
        return answerExtreme(ctx, slots, rows, slots.form);
      case 'avg':
        return answerAverage(slots, rows);
      default:
        return answerTotal(ctx, slots, rows);
    }
  }

  // "quais foram os gastos" sem forma explícita mas com tipo: assume lista
  if (slots.kind && !slots.form) {
    return answerTotal(ctx, slots, select(ctx, slots));
  }

  // 4. o termo bate com um verbete, mesmo sem "o que é"
  const entry = findGlossary(parsed.raw);
  if (entry) return { text: entry.text };

  return { text: FALLBACK };
}

/** as sugestões que aparecem em cima do campo */
export const SUGGESTIONS = [
  'Como estou?',
  'Quanto vou gastar com cartão mês que vem?',
  'Quanto tenho em parcelas futuras?',
  'Quanto falta para minha meta?',
  'Se eu guardar R$ 500 por mês, quando atinjo minha meta?',
  'Quanto meu patrimônio cresceu este ano?',
  'Quais são minhas maiores despesas?',
  'Quais foram meus gastos do mês?',
  'Quais foram minhas receitas?',
  'Quanto gastei esse mês?',
  'Qual foi meu maior gasto?',
  'Gastos por categoria',
  'Quantas contas faltam pagar?',
  'Gastei mais que no mês passado?',
  'Vou conseguir pagar tudo?',
  'Onde posso economizar?',
  'Quanto somam minhas assinaturas?',
  'Quais foram meus aportes?',
  'Meu mês mais caro',
  'Minha reserva cobre quantos meses?',
  'Quanto está o dólar?',
  'Qual a Selic?',
  'O que é CDB?',
  'CDB ou LCI?',
] as const;

/** saudação de abertura, pelo horário */
export function greeting(name: string, date = new Date()): string {
  const h = date.getHours();
  const hello = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const who = name && name !== 'você' ? `, ${name}` : '';
  return `${hello}${who}. Pergunte sobre o seu dinheiro — eu respondo com os seus próprios números, sem enviar nada para lugar nenhum.`;
}

/**
 * A busca que responde.
 *
 * "mercado agosto" não é uma pergunta, mas quer uma resposta: quanto foi para
 * mercado em agosto. Quando a busca cita uma categoria ou um mês, ela vira a
 * pergunta equivalente e volta com o total e os lançamentos que o formaram.
 * Texto solto ("uber") só responde se houver lançamento com ele no mês.
 */
export function searchAnswer(query: string, ctx: AssistantContext): Answer | null {
  lastQuestion = query;
  const parsed = parse(query);
  if (parsed.raw.length < 3) return null;
  const slots = extractSlots(parsed, ctx);
  if (!slots.category && !slots.monthExplicit && !slots.kind) {
    // só texto: responde se houver lançamentos com ele no mês
    if (slots.term.length < 3) return null;
  }
  const kind: Kind = slots.kind ?? slots.category?.kind ?? 'out';
  const filled: Slots = { ...slots, kind, form: slots.form ?? 'total' };
  const rows = select(ctx, filled);
  if (!rows.length) return null;
  if (filled.form === 'list') return answerList(ctx, filled, rows);
  return answerTotal(ctx, filled, rows);
}
