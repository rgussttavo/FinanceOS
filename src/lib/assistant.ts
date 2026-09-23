import { normalize } from './categories';
import { addMonthsToKey, formatDayShort, formatMonthLabel, todayIso } from './dates';
import { formatMoney, formatPercent, ratio } from './money';
import { firstNegativeDay, type DayPoint, type MonthSummary, type Occurrence } from './occurrences';
import type { Card, Category, Cents, Debt, Goal, MonthKey, Subscription } from './types';

/**
 * Assistente de regras.
 *
 * Não é modelo de linguagem: é um conjunto de perguntas reconhecidas por
 * palavra, respondidas com os números reais da conta. A escolha é deliberada —
 * roda offline, não custa nada por pergunta e nunca inventa um valor, que é o
 * pior defeito possível num app de dinheiro.
 *
 * O limite é honesto e a própria resposta o admite: pergunta fora do que ele
 * sabe recebe "não sei" com a lista do que sabe, em vez de um chute.
 */

export interface AssistantContext {
  month: MonthKey;
  summary: MonthSummary;
  occurrences: Occurrence[];
  projection: DayPoint[];
  history: MonthSummary[];
  categories: Category[];
  cards: Card[];
  subscriptions: Subscription[];
  goals: Goal[];
  debts: Debt[];
  /** indicadores de mercado, quando já carregados */
  market: {
    indicators: { id: string; label: string; value: number | null }[];
    currencies: { id: string; label: string; price: number | null; changePercent: number | null }[];
    crypto: { id: string; label: string; price: number | null; changePercent: number | null }[];
  } | null;
}

export interface Answer {
  text: string;
  /** destaque opcional: um número grande junto da resposta */
  highlight?: { label: string; value: string };
}

type Handler = (ctx: AssistantContext) => Answer;

interface Intent {
  id: string;
  /** todos os termos de pelo menos um grupo precisam aparecer */
  match: string[][];
  answer: Handler;
}

const monthName = (key: MonthKey) => formatMonthLabel(key).replace(/ de \d{4}$/, '');

const categoryName = (ctx: AssistantContext, id: string | null): string =>
  ctx.categories.find((c) => c.id === id)?.name ?? 'Sem categoria';

/** a categoria que mais pesou no mês, se houver */
function topCategory(ctx: AssistantContext): { name: string; value: Cents; share: number } | null {
  const rows = [...ctx.summary.byCategory.entries()].sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  const total = rows.reduce((sum, [, v]) => sum + v, 0);
  return { name: categoryName(ctx, rows[0][0]), value: rows[0][1], share: ratio(rows[0][1], total) };
}

const biggestExpense = (ctx: AssistantContext): Occurrence | null =>
  ctx.occurrences
    .filter((o) => o.kind === 'out')
    .reduce<Occurrence | null>((max, o) => (!max || o.amount > max.amount ? o : max), null);

/* ------------------------------------------------------------------ temas */

const INTENTS: Intent[] = [
  {
    id: 'resumo',
    match: [['como', 'estou'], ['resumo'], ['como', 'vou'], ['situacao']],
    answer: (ctx) => {
      const s = ctx.summary;
      if (!s.count) {
        return { text: `Ainda não há nada lançado em ${monthName(ctx.month)}. Assim que você registrar o primeiro valor eu consigo te responder de verdade.` };
      }
      const sobra = s.balance;
      const negativo = firstNegativeDay(ctx.projection);
      const parts = [
        `Em ${monthName(ctx.month)} entraram ${formatMoney(s.income)} e saíram ${formatMoney(s.expense)}.`,
        s.invested > 0 ? `Você investiu ${formatMoney(s.invested)}.` : '',
        sobra >= 0
          ? `Sobram ${formatMoney(sobra)}.`
          : `Está faltando ${formatMoney(-sobra)} para fechar o mês.`,
        negativo ? `O saldo cruza o zero no dia ${Number(negativo.date.slice(8))}.` : '',
        s.overdueExpense > 0 ? `Atenção: ${formatMoney(s.overdueExpense)} já venceram e não foram baixados.` : '',
      ].filter(Boolean);

      return {
        text: parts.join(' '),
        highlight: { label: sobra >= 0 ? 'Sobra do mês' : 'Falta no mês', value: formatMoney(Math.abs(sobra)) },
      };
    },
  },
  {
    id: 'gasto-mes',
    match: [['quanto', 'gastei'], ['total', 'gasto'], ['quanto', 'saiu'], ['despesas', 'mes']],
    answer: (ctx) => ({
      text: `Em ${monthName(ctx.month)} saíram ${formatMoney(ctx.summary.expense)} em ${
        ctx.occurrences.filter((o) => o.kind === 'out').length
      } lançamentos. Desses, ${formatMoney(ctx.summary.settledExpense)} já foram pagos.`,
      highlight: { label: 'Gasto no mês', value: formatMoney(ctx.summary.expense) },
    }),
  },
  {
    id: 'maior-gasto',
    match: [['maior', 'gasto'], ['gasto', 'caro'], ['maior', 'despesa'], ['mais', 'caro']],
    answer: (ctx) => {
      const biggest = biggestExpense(ctx);
      if (!biggest) return { text: `Nenhuma despesa lançada em ${monthName(ctx.month)} ainda.` };
      return {
        text: `O maior gasto de ${monthName(ctx.month)} foi ${biggest.description}, de ${formatMoney(biggest.amount)}, em ${formatDayShort(biggest.date)} — categoria ${categoryName(ctx, biggest.categoryId)}.`,
        highlight: { label: biggest.description, value: formatMoney(biggest.amount) },
      };
    },
  },
  {
    id: 'categoria-pesada',
    match: [['categoria', 'pesou'], ['categoria', 'mais'], ['onde', 'foi', 'dinheiro'], ['para', 'onde', 'foi']],
    answer: (ctx) => {
      const top = topCategory(ctx);
      if (!top) return { text: 'Ainda não há gastos categorizados neste mês.' };
      return {
        text: `A categoria que mais pesou foi ${top.name}, com ${formatMoney(top.value)} — ${formatPercent(top.share)} de tudo que saiu.`,
        highlight: { label: top.name, value: formatMoney(top.value) },
      };
    },
  },
  {
    id: 'contas-faltam',
    match: [['quantas', 'contas'], ['falta', 'pagar'], ['faltam', 'pagar'], ['contas', 'abertas']],
    answer: (ctx) => {
      const open = ctx.occurrences.filter((o) => o.kind === 'out' && o.settlement === null);
      if (!open.length) return { text: `Tudo pago em ${monthName(ctx.month)}. Nenhuma conta em aberto.` };
      const total = open.reduce((sum, o) => sum + o.amount, 0);
      const overdue = open.filter((o) => o.overdue);
      return {
        text: `Faltam ${open.length} ${open.length === 1 ? 'conta' : 'contas'}, somando ${formatMoney(total)}.${
          overdue.length ? ` ${overdue.length} já ${overdue.length === 1 ? 'venceu' : 'venceram'}.` : ''
        } A próxima é ${open[0].description}, em ${formatDayShort(open[0].date)}.`,
        highlight: { label: 'A pagar', value: formatMoney(total) },
      };
    },
  },
  {
    id: 'compara-mes',
    match: [['gastei', 'mais'], ['mes', 'passado'], ['comparado'], ['comparacao']],
    answer: (ctx) => {
      const current = ctx.history.at(-1);
      const previous = ctx.history.at(-2);
      if (!current || !previous || previous.expense === 0) {
        return { text: 'Ainda não tenho dois meses com gastos para comparar.' };
      }
      const diff = current.expense - previous.expense;
      const pct = ratio(Math.abs(diff), previous.expense);
      const anterior = monthName(previous.month);
      if (diff === 0) return { text: `Gastou exatamente o mesmo que em ${anterior}: ${formatMoney(current.expense)}.` };
      return {
        text: `Você gastou ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'a mais' : 'a menos'} que em ${anterior} — ${formatPercent(pct)} ${diff > 0 ? 'acima' : 'abaixo'}. Foram ${formatMoney(current.expense)} contra ${formatMoney(previous.expense)}.`,
        highlight: { label: diff > 0 ? 'A mais' : 'A menos', value: formatMoney(Math.abs(diff)) },
      };
    },
  },
  {
    id: 'saldo',
    match: [['meu', 'saldo'], ['quanto', 'tenho'], ['quanto', 'sobra'], ['quanto', 'sobrou']],
    answer: (ctx) => ({
      text:
        ctx.summary.balance >= 0
          ? `Sobram ${formatMoney(ctx.summary.balance)} em ${monthName(ctx.month)}, contando o que já entrou e tudo que ainda está previsto sair.`
          : `O mês está negativo em ${formatMoney(-ctx.summary.balance)}. As saídas previstas passam das entradas.`,
      highlight: { label: 'Saldo do mês', value: formatMoney(ctx.summary.balance) },
    }),
  },
  {
    id: 'vou-conseguir',
    match: [['vou', 'conseguir'], ['consigo', 'pagar'], ['da', 'para', 'pagar'], ['fecha', 'mes']],
    answer: (ctx) => {
      const negativo = firstNegativeDay(ctx.projection);
      if (!negativo) {
        return {
          text: `Pelo que está lançado, sim. O saldo não fica negativo em nenhum dia de ${monthName(ctx.month)}, e sobram ${formatMoney(ctx.summary.balance)} no fim.`,
        };
      }
      return {
        text: `Pelo que está lançado, o dinheiro não alcança: o saldo cruza o zero no dia ${Number(negativo.date.slice(8))}, faltando ${formatMoney(-negativo.balance)}. Dá tempo de antecipar uma entrada ou adiar uma saída até lá.`,
        highlight: { label: `Falta no dia ${Number(negativo.date.slice(8))}`, value: formatMoney(-negativo.balance) },
      };
    },
  },
  {
    id: 'economizar',
    match: [['onde', 'economizar'], ['posso', 'economizar'], ['como', 'economizar'], ['cortar']],
    answer: (ctx) => {
      const subs = ctx.subscriptions.filter((s) => !s.canceledAt);
      const subsTotal = subs.reduce((sum, s) => sum + (s.cycle === 'monthly' ? s.amount : 0), 0);
      const top = topCategory(ctx);

      const lines: string[] = [];
      if (top) lines.push(`${top.name} levou ${formatMoney(top.value)} neste mês — ${formatPercent(top.share)} de tudo.`);
      if (subs.length) {
        lines.push(
          `Você tem ${subs.length} ${subs.length === 1 ? 'assinatura ativa' : 'assinaturas ativas'} somando ${formatMoney(subsTotal)} por mês, ou ${formatMoney(subsTotal * 12)} por ano. É o corte mais fácil, porque não muda nada do seu dia.`,
        );
      }
      if (!lines.length) return { text: 'Ainda não tenho gasto suficiente registrado para apontar onde cortar.' };
      return { text: lines.join(' ') };
    },
  },
  {
    id: 'assinaturas',
    match: [['assinatura'], ['assinaturas'], ['streaming']],
    answer: (ctx) => {
      const subs = ctx.subscriptions.filter((s) => !s.canceledAt);
      if (!subs.length) return { text: 'Você não tem assinatura cadastrada. Se tiver alguma, vale registrar — é o gasto que mais passa despercebido.' };
      const mensal = subs.reduce((sum, s) => sum + (s.cycle === 'monthly' ? s.amount : 0), 0);
      const cara = [...subs].sort((a, b) => b.amount - a.amount)[0];
      return {
        text: `São ${subs.length} ${subs.length === 1 ? 'assinatura' : 'assinaturas'}, ${formatMoney(mensal)} por mês e ${formatMoney(mensal * 12)} no ano. A mais cara é ${cara.name}, de ${formatMoney(cara.amount)}.`,
        highlight: { label: 'Por mês', value: formatMoney(mensal) },
      };
    },
  },
  {
    id: 'fatura',
    match: [['fatura'], ['cartao'], ['cartoes']],
    answer: (ctx) => {
      if (!ctx.cards.length) return { text: 'Você ainda não cadastrou cartão nenhum.' };
      const names = ctx.cards.map((c) => c.name || c.institution).join(', ');
      return {
        text: `Você tem ${ctx.cards.length} ${ctx.cards.length === 1 ? 'cartão' : 'cartões'}: ${names}. Abra a tela de Cartões para ver a fatura montada, o limite comprometido e as parcelas em aberto de cada um.`,
      };
    },
  },
  {
    id: 'mes-caro',
    match: [['mes', 'caro'], ['mes', 'mais'], ['pior', 'mes']],
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
    id: 'metas',
    match: [['meta'], ['metas'], ['objetivo']],
    answer: (ctx) => {
      if (!ctx.goals.length) return { text: 'Você não tem meta cadastrada ainda.' };
      const nomes = ctx.goals.map((g) => `${g.icon} ${g.name}`).join(', ');
      return { text: `Você tem ${ctx.goals.length} ${ctx.goals.length === 1 ? 'meta' : 'metas'}: ${nomes}. A tela de Metas mostra quanto falta e quanto guardar por mês em cada uma.` };
    },
  },
  {
    id: 'dividas',
    match: [['divida'], ['dividas'], ['devo'], ['saldo', 'devedor']],
    answer: (ctx) => {
      if (!ctx.debts.length) return { text: 'Você não tem dívida cadastrada. Se tiver financiamento ou parcelamento, vale registrar para acompanhar o saldo devedor.' };
      const total = ctx.debts.reduce((sum, d) => sum + d.installment * d.installments, 0);
      const mensal = ctx.debts.reduce((sum, d) => sum + d.installment, 0);
      return {
        text: `São ${ctx.debts.length} ${ctx.debts.length === 1 ? 'dívida' : 'dívidas'}, comprometendo ${formatMoney(mensal)} por mês. O total contratado soma ${formatMoney(total)}.`,
        highlight: { label: 'Por mês', value: formatMoney(mensal) },
      };
    },
  },
  {
    id: 'reserva',
    match: [['reserva', 'meses'], ['reserva', 'cobre'], ['reserva', 'emergencia']],
    answer: (ctx) => {
      const invested = ctx.history.reduce((sum, m) => sum + m.invested, 0);
      const gastoMedio = Math.round(
        ctx.history.filter((m) => m.expense > 0).reduce((sum, m) => sum + m.expense, 0) /
          Math.max(1, ctx.history.filter((m) => m.expense > 0).length),
      );
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
    id: 'dolar',
    match: [['dolar'], ['euro'], ['cambio'], ['moeda']],
    answer: (ctx) => {
      const quotes = ctx.market?.currencies ?? [];
      if (!quotes.length) return { text: 'Ainda não carreguei as cotações. Abra a tela de News uma vez e eu passo a saber.' };
      const linhas = quotes
        .filter((q) => q.price != null)
        .slice(0, 3)
        .map((q) => `${q.label} a ${formatMoney(Math.round((q.price ?? 0) * 100))}`)
        .join(', ');
      return { text: `Agora: ${linhas}.` };
    },
  },
  {
    id: 'cripto',
    match: [['bitcoin'], ['cripto'], ['ethereum']],
    answer: (ctx) => {
      const quotes = (ctx.market?.crypto ?? []).filter((q) => q.price != null);
      if (!quotes.length) return { text: 'Ainda não carreguei as cotações de cripto. Abra a tela de News uma vez.' };
      const linhas = quotes.map((q) => `${q.label} a ${formatMoney(Math.round((q.price ?? 0) * 100))}`).join(', ');
      return { text: `Agora: ${linhas}. Lembrando que cripto oscila muito — o valor de hoje diz pouco sobre o de amanhã.` };
    },
  },
  {
    id: 'selic',
    match: [['selic'], ['cdi'], ['ipca'], ['juros'], ['inflacao'], ['poupanca']],
    answer: (ctx) => {
      const ind = ctx.market?.indicators ?? [];
      if (!ind.length) return { text: 'Ainda não carreguei os indicadores. Abra a tela de News uma vez e eu passo a saber.' };
      const linhas = ind
        .filter((i) => i.value != null)
        .map((i) => `${i.label} em ${(i.value ?? 0).toFixed(2).replace('.', ',')}%`)
        .join(', ');
      return { text: `Pelos dados do Banco Central: ${linhas}.` };
    },
  },
];

/* -------------------------------------------------------------- glossário */

interface Entry {
  terms: string[];
  text: string;
}

const GLOSSARY: Entry[] = [
  {
    terms: ['tesouro direto', 'tesouro'],
    text: 'Tesouro Direto é o programa que vende títulos da dívida do governo federal para pessoa física. Você empresta dinheiro ao governo e recebe de volta com juros. É considerado o investimento de menor risco do país, porque quem paga é o próprio Tesouro Nacional.',
  },
  {
    terms: ['tesouro selic'],
    text: 'Tesouro Selic é o título que acompanha a taxa Selic. É o mais usado como reserva de emergência: tem liquidez no dia útil seguinte e quase não oscila, então o dinheiro não encolhe se você precisar sacar antes do prazo.',
  },
  {
    terms: ['cdb'],
    text: 'CDB é um empréstimo que você faz a um banco. Ele devolve com juros, normalmente uma porcentagem do CDI. Tem proteção do FGC até R$ 250 mil por CPF e por instituição — o que faz do banco pequeno uma opção razoável, desde que você respeite esse teto.',
  },
  {
    terms: ['lci', 'lca'],
    text: 'LCI e LCA são títulos de banco ligados ao crédito imobiliário e ao agronegócio. A vantagem é serem isentos de Imposto de Renda para pessoa física. Por isso, uma LCI de 90% do CDI pode render mais que um CDB de 100%: no CDB o IR ainda vai descontar.',
  },
  {
    terms: ['cdb ou lci', 'lci ou cdb'],
    text: 'Depende do imposto. O CDB paga IR de 22,5% a 15%, conforme o prazo; a LCI é isenta. Para comparar de verdade, calcule o rendimento líquido dos dois. Regra prática: uma LCI acima de 85% do CDI costuma ganhar de um CDB de 100% no curto prazo. Olhe também a liquidez — LCI costuma ter carência.',
  },
  {
    terms: ['fgc'],
    text: 'O FGC é o Fundo Garantidor de Créditos. Ele devolve até R$ 250 mil por CPF e por instituição, com teto de R$ 1 milhão a cada quatro anos, se o banco quebrar. Cobre poupança, CDB, LCI e LCA — mas não cobre ações, fundos nem Tesouro Direto.',
  },
  {
    terms: ['selic'],
    text: 'A Selic é a taxa básica de juros da economia, definida pelo Copom a cada 45 dias. Ela puxa todo o resto: quando sobe, renda fixa rende mais e crédito fica mais caro; quando cai, o contrário.',
  },
  {
    terms: ['cdi'],
    text: 'O CDI é a taxa que os bancos usam para emprestar entre si, e anda coladinha na Selic. Quase toda renda fixa é anunciada como uma porcentagem dele — "110% do CDI" quer dizer 110% dessa taxa.',
  },
  {
    terms: ['ipca', 'inflacao'],
    text: 'O IPCA é o índice oficial de inflação do país, medido pelo IBGE. Ele mede quanto uma cesta média de consumo ficou mais cara. É a régua para saber se um investimento rendeu de verdade: render menos que o IPCA é perder poder de compra.',
  },
  {
    terms: ['fii', 'fundo imobiliario'],
    text: 'FII é um fundo que investe em imóveis ou em papéis ligados a eles, e distribui aluguel aos cotistas todo mês. Negocia em bolsa como uma ação. Os rendimentos mensais são isentos de IR para pessoa física, mas o lucro na venda da cota não é.',
  },
  {
    terms: ['juros compostos', 'juro composto'],
    text: 'Juros compostos são juros que rendem sobre juros. É o que faz o dinheiro crescer devagar no começo e acelerar depois — e é por isso que começar cedo importa mais que começar com muito. O simulador de investimentos mostra o mês exato em que o rendimento passa o seu aporte.',
  },
  {
    terms: ['reserva de emergencia', 'reserva'],
    text: 'Reserva de emergência é o dinheiro que cobre seus gastos se a renda parar. A recomendação comum é de seis a doze meses de despesa, guardado em algo com liquidez diária e baixa oscilação — Tesouro Selic ou CDB de liquidez diária. Não é investimento para render: é para estar lá.',
  },
  {
    terms: ['fire', 'viver de renda', 'independencia financeira'],
    text: 'Viver de renda é ter patrimônio suficiente para que o rendimento cubra seus gastos. A regra clássica é a dos 4%: você precisa de 25 vezes o gasto anual. O simulador daqui faz essa conta com juro real, já descontada a inflação — projetar com juro nominal dá um número animador e falso.',
  },
  {
    terms: ['iof'],
    text: 'IOF é o imposto sobre operações financeiras. Aparece no câmbio (3,5% em cartão e espécie), no crédito e em resgates de renda fixa feitos antes de 30 dias, onde ele come parte do rendimento. É por isso que o valor da casa de câmbio nunca bate com a cotação da notícia.',
  },
  {
    terms: ['come cotas', 'come-cotas'],
    text: 'Come-cotas é a antecipação semestral do Imposto de Renda em fundos de renda fixa e multimercado. Em maio e novembro, a Receita recolhe uma parte em cotas. Não muda o imposto total, mas tira dinheiro de render antes da hora — Tesouro e CDB não têm isso.',
  },
];

/* ---------------------------------------------------------------- motor */

const STOPWORDS = new Set([
  'qual', 'quais', 'quanto', 'quanta', 'quantos', 'quantas', 'como', 'onde', 'que', 'por',
  'para', 'com', 'meu', 'minha', 'meus', 'minhas', 'esse', 'este', 'essa', 'esta', 'isso',
  'the', 'sobre', 'esta', 'estao', 'ser', 'tem', 'uma', 'dos', 'das', 'nos', 'nas',
]);

function matchesIntent(question: string, intent: Intent): number {
  for (const group of intent.match) {
    if (group.every((term) => question.includes(term))) {
      // grupo maior é mais específico e desempata contra grupo de uma palavra só
      return group.join('').length;
    }
  }
  return 0;
}

function findGlossary(question: string): Entry | null {
  let best: { entry: Entry; length: number } | null = null;
  for (const entry of GLOSSARY) {
    for (const term of entry.terms) {
      if (!question.includes(term)) continue;
      if (!best || term.length > best.length) best = { entry, length: term.length };
    }
  }
  return best?.entry ?? null;
}

const FALLBACK = [
  'Essa eu não sei responder.',
  '',
  'Eu sei falar sobre: o resumo do seu mês, quanto você gastou, o maior gasto, a categoria que mais pesou, quantas contas faltam pagar, a comparação com o mês passado, se o dinheiro vai dar, onde dá para economizar, suas assinaturas, cartões, metas e dívidas, sua reserva, e as cotações e indicadores do dia.',
  '',
  'Também explico termos como CDB, LCI, Tesouro Direto, Selic, CDI, IPCA, FGC, FII, juros compostos e IOF.',
].join('\n');

/**
 * Responde uma pergunta.
 *
 * A ordem importa: pergunta sobre os SEUS números ganha do glossário. Quem
 * escreve "quanto rende meu CDB" quer o próprio dinheiro, não a definição de
 * CDB — e responder com a definição seria tecnicamente certo e inútil.
 */
export function ask(rawQuestion: string, ctx: AssistantContext): Answer {
  const question = normalize(rawQuestion);
  if (question.length < 2) {
    return { text: 'Pode perguntar. Comece por "como estou?" ou toque numa das sugestões.' };
  }

  let bestIntent: { intent: Intent; score: number } | null = null;
  for (const intent of INTENTS) {
    const score = matchesIntent(question, intent);
    if (score > 0 && (!bestIntent || score > bestIntent.score)) bestIntent = { intent, score };
  }

  if (bestIntent) return bestIntent.intent.answer(ctx);

  const entry = findGlossary(question);
  if (entry) return { text: entry.text };

  // nenhuma palavra reconhecida: diz o que sabe, em vez de chutar
  const words = question.split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
  void words;
  return { text: FALLBACK };
}

/** as sugestões que aparecem em cima do campo, como no original */
export const SUGGESTIONS = [
  'Como estou?',
  'Quanto gastei esse mês?',
  'Qual foi meu maior gasto?',
  'Quantas contas faltam pagar?',
  'Gastei mais que no mês passado?',
  'Vou conseguir pagar tudo?',
  'Onde posso economizar?',
  'Qual categoria mais pesou?',
  'Quanto somam minhas assinaturas?',
  'Meu mês mais caro',
  'Minha reserva cobre quantos meses?',
  'Quanto está o dólar?',
  'Qual a Selic?',
  'O que é Tesouro Direto?',
  'O que é CDB?',
  'CDB ou LCI?',
] as const;

/** saudação de abertura, pelo horário */
export function greeting(name: string, date = new Date()): string {
  const h = date.getHours();
  const hello = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return `${hello}, ${name}. Pergunte sobre o seu dinheiro — eu respondo com os seus próprios números, sem enviar nada para lugar nenhum.`;
}

/** mês seguinte, usado nas respostas que olham para frente */
export const nextMonth = (month: MonthKey) => addMonthsToKey(month, 1);

/** hoje, exposto para a tela carimbar a hora de cada mensagem */
export const now = () => todayIso();
