import type { Area, AreaId, Checkup } from './checkup';
import type {
  FinancialProfile,
  ProfileDebts,
  ProfileFocus,
  ProfileIncome,
  ProfileMonthEnd,
  ProfileReserve,
  ProfileSituation,
} from './types';

/**
 * O perfil declarado: o que a pessoa disse sobre o próprio momento.
 *
 * Serve para personalizar — por onde o diagnóstico começa, que perguntas o
 * assistente sugere primeiro, a ordem do Início — e nunca substitui o número.
 * Quando o que foi dito e o que os dados mostram discordam, o app diz isso com
 * calma, sem corrigir a pessoa: a declaração pode estar certa e o dado
 * incompleto.
 */

export interface ProfileOption<T> {
  value: T;
  label: string;
  /** uma linha de apoio, nas telas de uma pergunta por vez */
  detail?: string;
}

export const FOCUS_OPTIONS: ProfileOption<ProfileFocus>[] = [
  { value: 'vermelho', label: 'Parar de ficar no vermelho' },
  { value: 'gastos', label: 'Controlar gastos' },
  { value: 'dividas', label: 'Quitar dívidas' },
  { value: 'cartoes', label: 'Organizar cartões' },
  { value: 'reserva', label: 'Montar reserva' },
  { value: 'objetivo', label: 'Juntar para algo' },
  { value: 'investir', label: 'Investir' },
  { value: 'organizar', label: 'Organizar a vida' },
];

export const SITUATION_OPTIONS: ProfileOption<ProfileSituation>[] = [
  { value: 'tranquila', label: 'Tranquila' },
  { value: 'organizada', label: 'Organizada, quero melhorar' },
  { value: 'apertada', label: 'Apertada' },
  { value: 'sem-dinheiro', label: 'Sempre fico sem dinheiro' },
  { value: 'endividado', label: 'Endividado' },
  { value: 'nao-sei', label: 'Não sei' },
];

export const DEBTS_OPTIONS: ProfileOption<ProfileDebts>[] = [
  { value: 'nao', label: 'Não tenho' },
  { value: 'em-dia', label: 'Tenho, e estão em dia' },
  { value: 'atrasadas', label: 'Tenho, e alguma está atrasada' },
];

export const RESERVE_OPTIONS: ProfileOption<ProfileReserve>[] = [
  { value: 'nao', label: 'Ainda não' },
  { value: 'pouca', label: 'Tenho um pouco', detail: 'Menos que um mês de despesas' },
  { value: 'meses', label: 'Cobre alguns meses', detail: 'Guardada fora da conta do dia a dia' },
  { value: 'nao-sei', label: 'Não sei dizer' },
];

export const MONTH_END_OPTIONS: ProfileOption<ProfileMonthEnd>[] = [
  { value: 'quase-sempre', label: 'Quase sempre' },
  { value: 'as-vezes', label: 'Às vezes' },
  { value: 'raramente', label: 'Raramente' },
  { value: 'nunca', label: 'Quase nunca' },
];

export const INCOME_OPTIONS: ProfileOption<ProfileIncome>[] = [
  { value: 'fixa', label: 'Fixa', detail: 'Salário, aposentadoria: o mesmo valor todo mês' },
  { value: 'variavel', label: 'Variável', detail: 'Autônomo, comissão, freela: muda de um mês para outro' },
  { value: 'mista', label: 'As duas', detail: 'Uma parte fixa e outra que varia' },
];

const FOCUS_PHRASE: Record<ProfileFocus, string> = {
  vermelho: 'parar de ficar no vermelho',
  gastos: 'controlar os gastos',
  dividas: 'quitar dívidas',
  cartoes: 'organizar os cartões',
  reserva: 'montar uma reserva',
  objetivo: 'juntar para um objetivo',
  investir: 'investir',
  organizar: 'organizar a vida financeira',
};

const FOCUS_AREA: Record<ProfileFocus, AreaId | null> = {
  vermelho: 'fluxo',
  gastos: 'fluxo',
  dividas: 'dividas',
  cartoes: 'cartoes',
  reserva: 'reserva',
  objetivo: 'metas',
  investir: 'reserva',
  organizar: null,
};

const STATE: Record<Area['status'], string> = {
  ok: 'está saudável',
  attention: 'pede atenção',
  alert: 'pede ação agora',
  info: 'está assim',
  unknown: 'ainda não tem dados',
};

export const answered = (p: FinancialProfile | null | undefined): p is FinancialProfile => !!p?.answeredAt;

/* ----------------------------------------------------------- o Início por perfil */

/**
 * Por onde o Início começa.
 *
 * - aperto: o mês está no limite. Fluxo, compromissos, dívidas e cartões.
 * - plano: a base está de pé e o foco é construir. Metas, patrimônio, reserva.
 * - comeco: ainda conhecendo o próprio dinheiro. Saldo, gastos, organização.
 *
 * O sinal de aperto vence os outros: quem tem conta atrasada e quer investir
 * precisa ver o fluxo primeiro. Sem resposta, o Início fica como sempre foi.
 */
export type HomeFocus = 'aperto' | 'plano' | 'comeco';

export function homeFocus(p: FinancialProfile | null | undefined): HomeFocus | null {
  if (!answered(p)) return null;
  if (p.debts === 'atrasadas' || p.situation === 'endividado' || p.situation === 'sem-dinheiro' || p.situation === 'apertada') return 'aperto';
  const focus = p.focus[0];
  if (focus === 'vermelho' || focus === 'dividas' || focus === 'cartoes') return 'aperto';
  if (focus === 'reserva' || focus === 'objetivo' || focus === 'investir') return 'plano';
  if (focus === 'gastos' || focus === 'organizar') return 'comeco';
  if (p.situation === 'tranquila' || p.situation === 'organizada') return 'plano';
  if (p.situation === 'nao-sei') return 'comeco';
  return null;
}

/** as áreas do diagnóstico que o Início mostra primeiro, em cada foco */
export const HOME_AREAS: Record<HomeFocus, AreaId[]> = {
  aperto: ['fluxo', 'dividas', 'cartoes'],
  plano: ['metas', 'patrimonio', 'reserva'],
  comeco: ['fluxo'],
};

/** o que o Início mostra primeiro, na ordem da tela — é o que "Vamos começar por isso" promete */
const HOME_FIRST: Record<HomeFocus, string[]> = {
  aperto: ['O que entra e sai até o próximo recebimento', 'O fluxo, as dívidas e os cartões', 'O que merece atenção agora'],
  plano: ['Suas metas e o patrimônio', 'A saúde de cada área, começando pelas metas', 'O que merece atenção'],
  comeco: ['Quanto entrou, saiu e foi investido no mês', 'Atalhos para registrar e importar', 'O que merece atenção'],
};

/* ------------------------------------------------------ "Entendemos seu momento" */

export interface MomentSummary {
  /** a frase principal: o objetivo, nas palavras da pessoa */
  headline: string;
  /** até duas observações sobre o que foi dito, sem julgar */
  notes: string[];
  /** o que o Início vai mostrar primeiro */
  first: string[];
  focus: HomeFocus | null;
}

const SITUATION_PHRASE: Record<ProfileSituation, string> = {
  tranquila: 'Sua situação está tranquila',
  organizada: 'Você já se organiza e quer melhorar',
  apertada: 'O mês anda apertado',
  'sem-dinheiro': 'O dinheiro costuma acabar antes do mês',
  endividado: 'As dívidas pesam hoje',
  'nao-sei': 'Você ainda não sabe dizer como está',
};

/**
 * O retorno logo depois das perguntas: o que a pessoa disse, devolvido numa
 * frase, e por onde o app vai começar. É declaração — "você contou" —, não
 * diagnóstico: os números ainda nem chegaram.
 */
export function momentSummary(p: FinancialProfile | null | undefined): MomentSummary | null {
  if (!p || !(p.focus.length || p.situation || p.debts || p.reserve || p.income)) return null;
  const focus = homeFocus({ ...p, answeredAt: p.answeredAt ?? 'agora' });
  const goal = p.focus[0];

  const headline = goal
    ? `Seu principal objetivo é ${FOCUS_PHRASE[goal]}.`
    : p.situation
      ? `${SITUATION_PHRASE[p.situation]}.`
      : 'Obrigado por contar um pouco do seu momento.';

  const notes: string[] = [];
  // o objetivo é construir, mas o mês está no limite: o fluxo vem antes, e isso é dito
  if (focus === 'aperto' && goal && FOCUS_AREA[goal] !== 'fluxo' && goal !== 'dividas' && goal !== 'cartoes')
    notes.push('Antes, o app começa pelo fluxo do mês: com ele apertado, é o fluxo que decide o que dá para fazer.');
  if (p.debts === 'atrasadas') notes.push('Com conta atrasada, o primeiro passo é ver o tamanho das dívidas e o que cresce com juros.');
  else if (p.debts === 'em-dia' && focus === 'aperto') notes.push('As dívidas estão em dia: o cuidado é o mês não apertar a ponto de atrasar alguma.');
  if (p.reserve === 'nao' && focus !== 'aperto') notes.push('Sem reserva, um imprevisto vira dívida. Ela entra no plano como um dos primeiros passos.');
  if (p.reserve === 'meses') notes.push('Cadastrando onde a reserva está guardada, o diagnóstico passa a medi-la em meses.');
  if (p.income === 'variavel' || p.income === 'mista') notes.push('Com renda que varia, registre cada entrada quando cair: a previsão usa só o que está lançado.');

  return { headline, notes: notes.slice(0, 2), first: focus ? HOME_FIRST[focus] : [], focus };
}

/* ------------------------------------------------------------ o foco no diagnóstico */

export interface FocusNote {
  /** o foco declarado ligado à área que o mede */
  text: string;
  area: Area | null;
  /** quando o declarado e o medido não batem, dito com calma */
  mismatch: string | null;
}

export function focusNote(profile: FinancialProfile | null | undefined, checkup: Checkup): FocusNote | null {
  if (!answered(profile)) return null;
  const find = (id: AreaId) => checkup.areas.find((a) => a.id === id) ?? null;
  const flow = find('fluxo');
  let text = '';
  let area: Area | null = null;

  const focus = profile.focus[0];
  if (focus === 'investir') {
    const reserve = find('reserva');
    const debts = find('dividas');
    area = reserve;
    const baseOk = reserve?.status === 'ok' && (!debts || debts.status === 'ok');
    text = baseOk
      ? `Você informou que quer investir. A base está de pé (reserva: ${reserve?.label}): o próximo passo é definir para quê e em quanto tempo, porque o prazo decide o tipo de investimento.`
      : `Você informou que quer investir. Antes, vale olhar a base: reserva ${reserve?.label ?? 'sem dados'}${
          debts && debts.status !== 'ok' ? `, e as dívidas levam ${debts.label}` : ''
        }. Investir com a reserva incompleta costuma obrigar a resgatar na hora errada.`;
  } else if (focus === 'organizar') {
    const c = checkup.confidence;
    text = `Você informou que quer organizar a vida financeira. O primeiro passo é a qualidade dos dados: hoje ela está em ${c.percent}% (confiança ${c.level}).`;
  } else if (focus) {
    area = find(FOCUS_AREA[focus] as AreaId);
    text = area
      ? `Você informou que quer ${FOCUS_PHRASE[focus]}. Hoje, ${area.title.toLowerCase()} ${STATE[area.status]}: ${area.label}.`
      : `Você informou que quer ${FOCUS_PHRASE[focus]}.`;
  } else {
    text = 'Você respondeu sobre o seu momento, sem escolher um foco.';
  }

  let mismatch: string | null = null;
  const situation = SITUATION_OPTIONS.find((o) => o.value === profile.situation)?.label.toLowerCase();
  const noDebts = find('dividas')?.label === 'nenhuma';
  const reserve = find('reserva');
  if ((profile.situation === 'tranquila' || profile.situation === 'organizada') && flow && (flow.status === 'alert' || flow.status === 'attention')) {
    mismatch = `Você descreveu sua situação como ${situation}, e os números de agora mostram outra coisa no fluxo de caixa: ${flow.label}. Pode ser um mês fora da curva, ou algum dado faltando.`;
  } else if (profile.monthEnd === 'quase-sempre' && flow?.status === 'attention') {
    mismatch = 'Você disse que o dinheiro quase sempre chega ao fim do mês; nos últimos meses, pelo que está lançado, as saídas passaram das entradas em média.';
  } else if ((profile.situation === 'endividado' || profile.debts === 'atrasadas' || profile.debts === 'em-dia') && noDebts) {
    mismatch = `Você disse que ${profile.situation === 'endividado' ? 'está endividado' : 'tem dívidas'}, mas não há dívida cadastrada. Cadastrar ajuda a ver o tamanho dela e o que atacar primeiro.`;
  } else if (profile.reserve === 'meses' && reserve && (reserve.status === 'alert' || reserve.label === 'sem dados')) {
    mismatch = 'Você disse que a reserva cobre alguns meses; pelo que está cadastrado, o diagnóstico ainda não a encontra. Se ela está em outra conta ou aplicação, cadastrar faz o número aparecer.';
  }

  return { text, area, mismatch };
}

/* ------------------------------------------------------------ o assistente */

const FOCUS_QUESTIONS: Record<ProfileFocus, string[]> = {
  vermelho: ['Por que estou fechando no vermelho?', 'Quanto posso gastar?'],
  gastos: ['Estou gastando demais?', 'Por que meu dinheiro some?'],
  dividas: ['Qual dívida devo pagar primeiro?'],
  cartoes: ['Por que minha fatura está tão alta?'],
  reserva: ['Minha reserva cobre quantos meses?'],
  objetivo: ['Quero viajar em dezembro com R$ 8 mil, consigo?'],
  investir: ['Minha reserva cobre quantos meses?', 'Como está minha vida financeira?'],
  organizar: ['Como está minha vida financeira?'],
};

/** as sugestões do assistente, com as do foco declarado na frente */
export function suggestionsFor(profile: FinancialProfile | null | undefined, base: readonly string[]): string[] {
  const first = answered(profile) ? profile.focus.flatMap((f) => FOCUS_QUESTIONS[f]) : [];
  // conta atrasada vem antes de qualquer foco
  if (answered(profile) && profile.debts === 'atrasadas') first.unshift('Qual dívida devo pagar primeiro?');
  return [...new Set([...first, ...base])];
}
