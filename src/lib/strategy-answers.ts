import type { Answer, AssistantContext } from './assistant';
import { normalize } from './categories';
import { MONTHS_PT, addMonthsToKey, formatMonthLabel, monthKeyOf } from './dates';
import { expander } from './story-answers';
import { STAGES, monthReview, reviewText } from './strategy';
import { habitLines } from './behavior';
import type { MonthKey } from './types';

/**
 * A estratégia no assistente: "o que eu faço agora?", "em que etapa estou?",
 * "como foi meu mês?". As ações e a etapa são as mesmas do Início e do
 * diagnóstico; o fechamento do mês, o mesmo do cartão de acompanhamento.
 */

export const STRATEGY_TESTS = {
  nextStep: (raw: string) =>
    /\b(o que (eu )?(faco|devo fazer|fazer|posso fazer)( agora| primeiro| hoje)?\b|por onde (eu )?comeco|proximo passo|o que priorizar|qual (e )?(a )?(minha )?prioridade)/.test(raw),
  stage: (raw: string) => /\b(em que|qual|que) (etapa|fase|estagio)\b|\bminha trilha\b/.test(raw),
  progress: (raw: string) => /\b(estou|to|tou|eu estou) (evoluindo|melhorando|progredindo|indo bem)\b|\bminha evolucao\b|\bevoluindo financeiramente\b/.test(raw),
  monthReview: (raw: string) =>
    /\bcomo foi (o )?(meu )?(mes|ultimo mes|mes passado)\b|\bfechamento do mes\b/.test(raw) ||
    new RegExp(`\\bcomo foi (o mes de )?(${MONTHS_PT.map((m) => normalize(m)).join('|')})\\b`).test(raw),
};

export function answerNextStep(ctx: AssistantContext): Answer {
  const s = ctx.strategy;
  if (!s || !s.actions.length) return { text: 'Nada urgente pelo que está lançado. Um objetivo de longo prazo ajuda a dar direção ao que sobra.' };
  const [first, ...rest] = s.actions;
  return {
    text: [first.title + '.', first.reason, first.impact, s.stage ? s.stage.situation : ''].filter(Boolean).join(' '),
    highlight: { label: 'Seu próximo passo', value: first.title },
    list: rest.slice(0, 3).map((a) => ({ label: a.title, detail: a.reason, value: '' })),
    basis: 'o diagnóstico por áreas, o caixa e o plano das metas',
    link: { label: 'Fazer agora', route: first.route },
  };
}

export function answerStage(ctx: AssistantContext): Answer {
  const stage = ctx.strategy?.stage;
  if (!stage) return { text: 'Ainda faltam dados para dizer a etapa: comece pelo saldo das contas e pelo que entra e sai.' };
  return {
    text: `${stage.situation} Para a próxima etapa: ${stage.next.replace(/^./, (c) => c.toLowerCase())}`,
    highlight: { label: `Etapa ${stage.index + 1} de ${STAGES.length}`, value: stage.label },
    list: STAGES.map((s, i) => ({ label: `${i + 1}. ${s.label}`, detail: s.aim, value: i < stage.index ? 'feito' : i === stage.index ? 'agora' : '' })),
    link: { label: 'Ver a trilha', route: { view: 'checkup' } },
  };
}

/** o mês citado: o mais recente daquele nome que já terminou; sem nome, o anterior */
function reviewedMonth(raw: string, current: MonthKey): MonthKey {
  const y = Number(current.slice(0, 4));
  const m = Number(current.slice(5, 7));
  for (let i = 0; i < 12; i++) {
    if (!new RegExp(`\\b${normalize(MONTHS_PT[i])}\\b`).test(raw)) continue;
    const year = i + 1 < m ? y : y - 1;
    return `${year}-${String(i + 1).padStart(2, '0')}`;
  }
  return addMonthsToKey(current, -1);
}

export function answerMonthReview(ctx: AssistantContext, raw: string): Answer {
  const month = reviewedMonth(raw, monthKeyOf(ctx.today));
  const r = monthReview(expander(ctx), ctx.entries, ctx.goals, ctx.today, month);
  if (!r) return { text: `Não há movimento lançado em ${formatMonthLabel(month)} para eu fechar o mês.` };
  const name = (id: string) => ctx.categories.find((c) => c.id === id)?.name ?? 'Sem categoria';
  const t = reviewText(r, name);
  const closing = t.tone === 'good' ? 'O resultado veio do padrão que você manteve.' : t.tone === 'watch' ? 'Um mês abaixo do esperado acontece: o que ajuda é ver o que mudou.' : '';
  return {
    text: [t.headline, ...t.lines, closing].filter(Boolean).join(' '),
    basis: r.averageResult !== null ? 'comparado com a média dos três meses anteriores' : undefined,
    link: { label: 'Ver as saídas', route: { view: 'movimentos', param: 'saidas' } },
  };
}

/** "Estou evoluindo?": as sequências, o patrimônio e a etapa — com evidência, sem motivação vazia */
export function answerProgress(ctx: AssistantContext): Answer {
  const s = ctx.strategy;
  const wealth = ctx.checkup?.areas.find((a) => a.id === 'patrimonio');
  const lines = s?.getHabits ? habitLines(s.getHabits()) : [];
  const parts: string[] = [];
  if (lines.length) parts.push(`Pelo que os dados mostram: ${lines.map((l) => l.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())).join('; ')}.`);
  else parts.push('Ainda não há uma sequência de meses para mostrar evolução: com dois meses completos seguidos, eu começo a comparar.');
  if (wealth && wealth.label !== 'sem dados') parts.push(`Patrimônio em três meses: ${wealth.label}.`);
  if (s?.stage) parts.push(s.stage.situation);
  return { text: parts.join(' '), link: { label: 'Ver o diagnóstico', route: { view: 'checkup' } } };
}
