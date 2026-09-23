import { normalize } from './categories';
import { MONTHS_PT, addMonthsToKey, formatDayShort, formatMonthLabel, monthKeyParts } from './dates';
import { formatMoney, formatPercent, ratio } from './money';
import { firstNegativeDay, occurrencesInMonth, summarizeMonth, type DayPoint, type MonthSummary, type Occurrence } from './occurrences';
import type { Card, Category, Cents, Debt, Entry, Goal, MonthKey, Subscription } from './types';

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
}

export interface Answer {
  text: string;
  highlight?: { label: string; value: string };
  /** linhas de detalhe, quando a resposta é uma lista */
  list?: { label: string; detail: string; value: string }[];
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
  return occurrencesInMonth(ctx.entries, month, ctx.today);
}

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

  const settled = rows.filter((o) => o.settlement !== null);
  const extra =
    kind !== 'out' || slots.onlyPending || slots.onlySettled || settled.length === rows.length
      ? ''
      : settled.length === 0
        ? ' Nenhum deles foi baixado como pago ainda.'
        : ` Desses, ${formatMoney(sum(settled))} já foram pagos.`;

  return {
    text: `Em ${monthName(slots.month)}${scope ? '' : ''} ${noun.verb} ${formatMoney(total)}${scope} em ${rows.length} ${rows.length === 1 ? 'lançamento' : 'lançamentos'}.${extra}`,
    highlight: { label: scope.trim() || `${noun.many} de ${monthName(slots.month)}`, value: formatMoney(total) },
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
      const negativo = slots.month === ctx.month ? firstNegativeDay(ctx.projection) : null;
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
      const negativo = firstNegativeDay(ctx.projection);
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
    if (named.test(parsed)) return named.answer(ctx, slots);
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
  return `${hello}, ${name}. Pergunte sobre o seu dinheiro — eu respondo com os seus próprios números, sem enviar nada para lugar nenhum.`;
}
