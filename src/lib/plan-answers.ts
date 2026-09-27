import type { Answer, AssistantContext } from './assistant';
import { normalize } from './categories';
import { MONTHS_PT, addMonthsToKey, formatMonthLabel, monthKeyOf } from './dates';
import { spendAmount } from './decision-answers';
import { goalPlan, type GoalPlan } from './goal-plan';
import { formatMoney } from './money';
import { moneyStory } from './money-story';
import { expander } from './story-answers';
import type { Cents, IsoDate, MonthKey } from './types';

/**
 * Objetivos e cenários no assistente (fase 4):
 *
 *   "Quero viajar em dezembro, R$ 8 mil, consigo?"
 *   "Se eu economizar R$ 500 por mês, o que acontece?"
 *
 * A capacidade é a sobra média dos meses completos, menos o que as metas com
 * prazo já pedem — o dinheiro novo não pode ser contado duas vezes. Nunca
 * promete: "no ritmo atual", "mantendo essas premissas". Os números saem de
 * `money-story.ts` e `goal-plan.ts`.
 */

const money = (v: Cents) => formatMoney(v, { signed: v < 0 });
const WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3 };

const monthsBetween = (from: MonthKey, to: MonthKey) => {
  const [a, b] = [from, to].map((k) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)));
  return b - a;
};

/**
 * O prazo dito na pergunta: "em dezembro", "até junho de 2027", "daqui a 2
 * anos", "em 18 meses". Mês sem ano é o próximo daquele nome — "dezembro",
 * dito em setembro, é este dezembro; dito em dezembro, o do ano que vem.
 */
export function horizonIn(raw: string, today: IsoDate): MonthKey | null {
  const current = monthKeyOf(today);
  const rel = /\b(?:daqui a|daqui|em|dentro de|nos proximos|ate)\s+(\d{1,3}|um|uma|dois|duas|tres)\s+(mes|meses|ano|anos)\b/.exec(raw);
  if (rel) {
    const n = WORDS[rel[1]] ?? Number(rel[1]);
    if (n > 0) return addMonthsToKey(current, /ano/.test(rel[2]) ? n * 12 : n);
  }
  const y = Number(current.slice(0, 4));
  const m = Number(current.slice(5, 7));
  for (let i = 0; i < 12; i++) {
    const name = normalize(MONTHS_PT[i]);
    const found = new RegExp(`\\b(?:em|ate|para|pra|no mes de|de) ${name}(?: de (\\d{4}))?\\b`).exec(raw);
    if (!found) continue;
    const year = found[1] ? Number(found[1]) : i + 1 > m ? y : y + 1;
    return `${year}-${String(i + 1).padStart(2, '0')}`;
  }
  const year = /\b(?:em|ate) (20\d\d)\b/.exec(raw);
  if (year && Number(year[1]) >= y) return `${year[1]}-12`;
  return null;
}

/* --------------------------------------------------------- o objetivo */

export function isGoalQuestion(raw: string, today: IsoDate): boolean {
  return (
    /\b(consigo|conseguiria|conseguir|da pra|da para|dava pra|e possivel|vai dar|posso|quero|como (faco|fazer|chego))\b/.test(raw) &&
    /\b(juntar|guardar|viajar|viagem|comprar|compra|ter|trocar|quitar|fazer|ir|chegar)\b/.test(raw) &&
    horizonIn(raw, today) !== null
  );
}

/** o valor, sem confundir o ano ("junho de 2027") com dinheiro */
function goalAmount(original: string): Cents | null {
  const clean = original.replace(/\b(?:de |em |até |ate )?20\d\d\b/gi, ' ');
  return spendAmount(clean)?.amount ?? null;
}

interface Capacity {
  story: NonNullable<ReturnType<typeof moneyStory>>;
  plan: GoalPlan;
  /** sobra média menos o que as metas com prazo já pedem */
  free: Cents;
}

function capacityOf(ctx: AssistantContext, extra: Cents = 0): Capacity | null {
  const story = moneyStory(expander(ctx), ctx.entries, ctx.today);
  if (!story) return null;
  const boosted = { ...story, margin: story.margin + extra };
  const plan = goalPlan(ctx.goals, ctx.entries, boosted, ctx.today);
  return { story: boosted, plan, free: Math.max(0, Math.max(0, boosted.margin) - plan.asked) };
}

export function answerGoalQuestion(ctx: AssistantContext, raw: string, original: string): Answer {
  const current = monthKeyOf(ctx.today);
  const target = horizonIn(raw, ctx.today);
  if (!target) return { text: 'Até quando? Com o prazo, eu calculo quanto guardar por mês.' };
  const when = formatMonthLabel(target);
  const months = Math.max(1, monthsBetween(current, target));
  const amount = goalAmount(original);
  if (!amount) {
    return { text: `Quanto vai custar? Com o valor, eu calculo se dá até ${when} com o que sobra por mês.` };
  }
  const perMonth = Math.ceil(amount / months);
  const link = { label: 'Criar a meta', route: { view: 'metas' } } as Answer['link'];
  const intro = `Para juntar ${formatMoney(amount)} até ${when} (${months} ${months === 1 ? 'mês' : 'meses'}), seriam ${formatMoney(perMonth)} por mês.`;

  const cap = capacityOf(ctx);
  if (!cap) {
    return { text: `${intro} Ainda não há um mês completo de movimento para eu saber quanto sobra por mês e dizer se cabe.`, link };
  }
  const { story, plan, free } = cap;
  const parts = [intro];
  parts.push(
    story.margin > 0
      ? `Nos últimos meses sobraram ${formatMoney(story.margin)} por mês${plan.asked > 0 ? `, e suas metas com prazo já pedem ${formatMoney(plan.asked)}` : ''}: ficam ${formatMoney(free)} livres.`
      : `Nos últimos meses não sobrou dinheiro (${money(story.margin)} por mês), então o objetivo depende de cortar gastos ou aumentar a renda.`,
  );
  const saved = free * months;
  if (free >= perMonth) {
    parts.push(`Cabe: mantendo esse ritmo, você junta o valor até lá${free > perMonth ? `, e ainda sobram ${formatMoney(free - perMonth)} por mês` : ''}.`);
  } else {
    if (free > 0) {
      const need = Math.ceil(amount / free);
      parts.push(`No ritmo atual, você juntaria ${formatMoney(saved)} até ${when}: faltariam ${formatMoney(amount - saved)}.`);
      parts.push(`Com ${formatMoney(free)} por mês, levaria ${need} meses, até ${formatMonthLabel(addMonthsToKey(current, need))}.`);
    }
    // para sobrar o que o objetivo pede depois das metas atuais, a sobra precisa cobrir as duas coisas
    const raise = Math.max(0, plan.asked + perMonth - story.margin);
    parts.push(
      `Dá para reduzir o custo, estender o prazo, aumentar a sobra em ${formatMoney(raise)} por mês${story.margin > 0 && plan.asked > 0 ? ', rever a prioridade das metas atuais' : ''} — ou combinar.`,
    );
  }
  return {
    text: parts.join(' '),
    highlight: { label: `Por mês até ${when}`, value: formatMoney(perMonth) },
    list: [
      { label: 'Sobra média por mês', detail: '', value: money(story.margin) },
      ...(plan.asked > 0 ? [{ label: '− Metas com prazo', detail: `${plan.needs.filter((n) => n.need !== null).length} metas`, value: formatMoney(plan.asked) }] : []),
      { label: '= Livre para este objetivo', detail: '', value: formatMoney(free) },
      { label: 'O objetivo pede', detail: `${months} ${months === 1 ? 'mês' : 'meses'}`, value: formatMoney(perMonth) },
    ],
    basis: `sobra média de ${story.months.length} ${story.months.length === 1 ? 'mês' : 'meses'} completos`,
    link,
  };
}

/* ---------------------------------------------- e se eu economizar X? */

export function isSaveMoreQuestion(raw: string, original: string): boolean {
  return /\bse (eu )?(economizar|cortar|reduzir|diminuir|gastar menos|economizasse|cortasse)\b/.test(raw) && spendAmount(original) !== null;
}

export function answerSaveMore(ctx: AssistantContext, original: string): Answer {
  const amount = spendAmount(original)?.amount ?? 0;
  const before = capacityOf(ctx);
  const after = capacityOf(ctx, amount);
  if (!before || !after) {
    return { text: `Economizando ${formatMoney(amount)} por mês, seriam ${formatMoney(amount * 12)} em um ano. Com um mês completo de movimento, eu mostro o efeito nas suas metas.` };
  }
  const parts = [
    `Sua sobra passaria de ${money(before.story.margin)} para ${money(after.story.margin)} por mês — ${formatMoney(amount * 12)} a mais em um ano.`,
  ];
  const b = before.plan.scenarios[1];
  const a = after.plan.scenarios[1];
  const changes = a.rows
    .map((row) => ({ row, prev: b.rows.find((r) => r.goal.id === row.goal.id)! }))
    .filter(({ row, prev }) => row.reaches !== prev.reaches);
  if (a.rows.length) {
    if (changes.length) {
      const describe = ({ row, prev }: (typeof changes)[number]) => {
        const now = row.reaches ? formatMonthLabel(row.reaches) : 'sem previsão';
        const late = row.onTime === false ? ', ainda depois do prazo' : row.onTime === true ? ', no prazo' : '';
        if (!prev.reaches) return `${row.goal.name} passa a receber ${formatMoney(row.monthly)} por mês e chega em ${now}${late}`;
        const gained = monthsBetween(row.reaches ?? prev.reaches, prev.reaches);
        return `${row.goal.name} chega em ${now}${gained > 0 ? `, ${gained} ${gained === 1 ? 'mês' : 'meses'} antes` : ''}${late}`;
      };
      parts.push(`Nas metas, pelo cenário equilibrado: ${changes.map(describe).join('; ')}.`);
    } else {
      parts.push('As metas já estavam cobertas no ritmo atual: o valor ficaria livre para reserva ou para uma meta nova.');
    }
    if (before.plan.conflict && !after.plan.conflict) parts.push('E as metas deixam de competir pelo mesmo dinheiro: todas cabem no prazo.');
    else if (after.plan.conflict) parts.push(`Ainda faltariam ${formatMoney(after.plan.gap)} por mês para todas chegarem no prazo.`);
  } else {
    parts.push('Sem metas ativas, esse valor poderia começar uma reserva ou um objetivo novo.');
  }
  return {
    text: parts.join(' '),
    highlight: { label: 'Sobra por mês', value: money(after.story.margin) },
    list: changes.map(({ row, prev }) => ({
      label: row.goal.name,
      detail: `${prev.reaches ? formatMonthLabel(prev.reaches) : 'sem previsão'} → ${row.reaches ? formatMonthLabel(row.reaches) : 'sem previsão'}`,
      value: `${formatMoney(row.monthly)}/mês`,
    })),
    basis: `sobra média de ${before.story.months.length} meses completos, mais ${formatMoney(amount)} por mês`,
    link: { label: 'Ver o plano das metas', route: { view: 'metas' } },
  };
}
