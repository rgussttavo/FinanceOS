import type { Area, AreaId, Checkup } from './checkup';
import type { FinancialProfile, ProfileFocus, ProfileIncome, ProfileMonthEnd, ProfileSituation } from './types';

/**
 * O perfil declarado: o que a pessoa disse sobre o próprio momento.
 *
 * Serve para personalizar — por onde o diagnóstico começa, que perguntas o
 * assistente sugere primeiro — e nunca substitui o número. Quando o que foi
 * dito e o que os dados mostram discordam, o app diz isso com calma, sem
 * corrigir a pessoa: a declaração pode estar certa e o dado incompleto.
 */

export const FOCUS_OPTIONS: { value: ProfileFocus; label: string }[] = [
  { value: 'vermelho', label: 'Parar de ficar no vermelho' },
  { value: 'gastos', label: 'Controlar gastos' },
  { value: 'dividas', label: 'Quitar dívidas' },
  { value: 'cartoes', label: 'Organizar cartões' },
  { value: 'reserva', label: 'Montar reserva' },
  { value: 'objetivo', label: 'Juntar para algo' },
  { value: 'investir', label: 'Investir' },
  { value: 'organizar', label: 'Organizar a vida' },
];

export const SITUATION_OPTIONS: { value: ProfileSituation; label: string }[] = [
  { value: 'tranquila', label: 'Tranquila' },
  { value: 'organizada', label: 'Organizada, quero melhorar' },
  { value: 'apertada', label: 'Apertada' },
  { value: 'sem-dinheiro', label: 'Sempre fico sem dinheiro' },
  { value: 'endividado', label: 'Endividado' },
  { value: 'nao-sei', label: 'Não sei' },
];

export const MONTH_END_OPTIONS: { value: ProfileMonthEnd; label: string }[] = [
  { value: 'quase-sempre', label: 'Quase sempre' },
  { value: 'as-vezes', label: 'Às vezes' },
  { value: 'raramente', label: 'Raramente' },
  { value: 'nunca', label: 'Quase nunca' },
];

export const INCOME_OPTIONS: { value: ProfileIncome; label: string }[] = [
  { value: 'fixa', label: 'Fixa' },
  { value: 'variavel', label: 'Variável' },
  { value: 'mista', label: 'As duas' },
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
  if ((profile.situation === 'tranquila' || profile.situation === 'organizada') && flow && (flow.status === 'alert' || flow.status === 'attention')) {
    mismatch = `Você descreveu sua situação como ${situation}, e os números de agora mostram outra coisa no fluxo de caixa: ${flow.label}. Pode ser um mês fora da curva, ou algum dado faltando.`;
  } else if (profile.monthEnd === 'quase-sempre' && flow?.status === 'attention') {
    mismatch = 'Você disse que o dinheiro quase sempre chega ao fim do mês; nos últimos meses, pelo que está lançado, as saídas passaram das entradas em média.';
  } else if (profile.situation === 'endividado' && find('dividas')?.label === 'nenhuma') {
    mismatch = 'Você disse que está endividado, mas não há dívida cadastrada. Cadastrar ajuda a ver o tamanho dela e o que atacar primeiro.';
  }

  return { text, area, mismatch };
}

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
  return [...new Set([...first, ...base])];
}
