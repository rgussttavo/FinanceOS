import type { Answer } from './assistant';
import type { CashSnapshot } from './cashflow';
import { normalize } from './categories';
import { addDaysIso, formatDayShort, monthKeyOf } from './dates';
import { availableLines, checkSpend, spendLines, type CalcLine, type CardData, type MoneyToDecide, type SpendMethod } from './decision';
import { formatMoney, parseMoney } from './money';
import type { Card, Cents, IsoDate } from './types';

/**
 * As respostas de "quanto posso gastar" e "posso gastar R$ X".
 *
 * Aqui só há linguagem: todo número vem de `decision.ts`. A resposta segue a
 * mesma ordem sempre — o veredito, o porquê em números, a alternativa — e
 * traz a conta inteira na lista, para quem quiser ver de onde saiu.
 */

const money = (v: Cents) => formatMoney(v, { signed: v < 0 });

/** "hoje", "amanhã", "dia 27" no mês corrente, "27 de out" fora dele */
function day(date: IsoDate, today: IsoDate): string {
  if (date === today) return 'hoje';
  if (date === addDaysIso(today, 1)) return 'amanhã';
  return monthKeyOf(date) === monthKeyOf(today) ? `dia ${Number(date.slice(8))}` : formatDayShort(date);
}

/** "dia 27 o saldo…", "hoje o saldo…": o dia como começo de frase */
const onDay = (date: IsoDate, today: IsoDate) => day(date, today);

/** "Nubank ou Itaú", "A, B ou C" */
function orList(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}` : (names[0] ?? '');
}

/** até quando o disponível vale, dito como a pessoa diria */
function untilText(d: MoneyToDecide): string {
  if (d.income) return `até ${day(d.income.date, d.today)}, quando entra ${d.income.label}`;
  return 'até o fim do mês';
}

const OP_LABEL: Record<CalcLine['op'], string> = { '': '', '+': '+ ', '−': '− ', '=': '= ' };

function calcList(lines: CalcLine[]): NonNullable<Answer['list']> {
  return lines.map((l) => ({ label: `${OP_LABEL[l.op]}${l.label}`, detail: l.detail ?? '', value: money(l.amount) }));
}

/** o que merece ser dito sobre a confiança da conta */
function caveats(d: MoneyToDecide): string[] {
  const out: string[] = [];
  if (!d.grounded) out.push('O saldo das contas ainda não foi informado, então esta conta parte de zero e pode não bater com o banco.');
  if (!d.income) out.push('Não há recebimento previsto nos próximos 60 dias, então considerei até o fim do mês.');
  return out;
}

/* ---------------------------------------------------- quanto posso gastar */

export function answerAvailable(d: MoneyToDecide): Answer {
  const parts: string[] = [];
  if (d.available < 0) {
    const low = d.tightest ?? { date: d.today, balance: d.available };
    parts.push(
      `Hoje não há espaço para gasto novo: ${untilText(d)}, faltam ${formatMoney(-d.available)} para cobrir as contas — ${onDay(low.date, d.today)} o saldo previsto fica em ${money(low.balance)}.`,
      'Antecipar uma entrada ou adiar uma saída resolve antes de gastar.',
    );
  } else if (d.free < 0) {
    parts.push(
      `${untilText(d)[0].toUpperCase()}${untilText(d).slice(1)}, sobram ${formatMoney(d.available)} depois das contas — abaixo da margem de segurança de ${formatMoney(d.buffer.amount)}.`,
      'Nenhuma conta fica descoberta, mas o espaço para imprevistos já está sendo usado.',
    );
  } else {
    parts.push(
      `Você pode gastar ${formatMoney(d.free)} ${untilText(d)}, sem deixar nenhuma conta descoberta${
        d.buffer.amount > 0 ? ` e mantendo ${formatMoney(d.buffer.amount)} de margem de segurança` : ''
      }.`,
    );
    if (d.committed > 0) {
      const biggest = d.commitments.reduce((a, b) => (b.amount > a.amount ? b : a));
      parts.push(
        `O saldo de hoje é ${formatMoney(d.balance)}, mas ${formatMoney(d.committed)} já têm destino antes disso; o maior é ${biggest.label}, ${formatMoney(biggest.amount)}.`,
      );
    }
  }
  if (d.later && d.later.balance < 0) {
    parts.push(`Atenção ao depois: ${day(d.later.date, d.today)} o saldo previsto fica em ${money(d.later.balance)}, mesmo com o recebimento.`);
  }
  parts.push(...caveats(d));

  return {
    text: parts.join(' '),
    highlight: { label: 'Disponível para gastar', value: money(d.spendable) },
    list: calcList(availableLines(d)),
    basis: 'saldo das contas hoje e o que já tem data para sair até o próximo recebimento',
    link: { label: 'Ver o mês dia a dia', route: { view: 'calendario' } },
  };
}

/* ------------------------------------------------ posso gastar R$ X? */

export interface SpendParse {
  amount: Cents;
  installments: number;
  method: SpendMethod;
  card: Card | null;
  /** pediu cartão sem dizer qual, e há mais de um */
  ambiguous: Card[];
  /** pediu cartão e não há nenhum cadastrado */
  noCard: boolean;
}

const ASK = /\b(posso|podia|poderia|pode|consigo|conseguiria|da pra|da para|dava pra|daria pra|tenho como|cabe|caberia|devo|se eu)\b/;
const SPEND = /\b(gastar|gasto|comprar|compra|torrar|parcelar|pagar)\b/;
const CARD_WORDS = /\b(cartao|credito|parcelad[oa]|parcelas?|parcelar)\b/;
const ACCOUNT_WORDS = /\b(pix|debito|dinheiro|boleto|conta)\b/;

/** o valor da pergunta, e em quantas vezes; "10x de 150" é 10 parcelas de R$ 150 */
export function spendAmount(original: string): { amount: Cents; installments: number } | null {
  let text = original.toLowerCase();
  const perPart = /(\d{1,2})\s*(?:x|vezes)\s*(?:de\s*)?(?:r\$\s*)?(\d[\d.,]*)/.exec(text);
  if (perPart) {
    const n = Number(perPart[1]);
    const each = parseMoney(perPart[2]);
    if (n >= 2 && n <= 48 && each && each > 0) return { amount: each * n, installments: n };
  }
  let installments = 1;
  const parts = /(?:em\s*)?(\d{1,2})\s*(?:x|vezes|parcelas)(?![a-z])/.exec(text);
  if (parts) {
    const n = Number(parts[1]);
    if (n >= 2 && n <= 48) installments = n;
    text = text.replace(parts[0], ' ');
  }
  // números que não são dinheiro: dia do mês, prazo, porcentagem
  text = text.replace(/\bdia\s+\d{1,2}\b/g, ' ').replace(/\d+\s*(?:dias?|meses|m[eê]s|anos?|%)/g, ' ');
  const m = /(?:r\$\s*)?(\d[\d.,]*)(\s*(?:mil|k)(?![a-z]))?/.exec(text);
  if (!m) return null;
  const value = parseMoney(m[1]);
  if (value === null || value <= 0) return null;
  return { amount: m[2] ? value * 1000 : value, installments };
}

export function isSpendQuestion(raw: string, original: string): boolean {
  if (!ASK.test(raw) || !SPEND.test(raw)) return false;
  // "posso pagar a fatura de 980" é pagar o que já está comprometido, não gasto novo
  if (/\bpagar\b/.test(raw) && /\b(fatura|conta|boleto|parcela)\b/.test(raw) && !/\b(gastar|comprar|compra)\b/.test(raw)) return false;
  return spendAmount(original) !== null;
}

function cardNamed(raw: string, cards: Card[]): Card | null {
  for (const c of cards) {
    for (const text of [c.name, c.institution]) {
      const word = normalize(text)
        .split(' ')
        .find((w) => w.length >= 3 && w !== 'cartao');
      if (word && new RegExp(`\\b${word}\\b`).test(raw)) return c;
    }
  }
  return null;
}

export function parseSpend(raw: string, original: string, cards: Card[]): SpendParse | null {
  const found = spendAmount(original);
  if (!found) return null;
  const named = cardNamed(raw, cards);
  const wantsCard = found.installments > 1 || CARD_WORDS.test(raw) || (!!named && !ACCOUNT_WORDS.test(raw));
  if (!wantsCard) return { ...found, installments: 1, method: 'account', card: null, ambiguous: [], noCard: false };
  const card = named ?? (cards.length === 1 ? cards[0] : null);
  return {
    ...found,
    method: 'card',
    card,
    ambiguous: card ? [] : cards,
    noCard: cards.length === 0,
  };
}

export function answerSpend(
  q: SpendParse,
  d: MoneyToDecide,
  cash: CashSnapshot,
  data: CardData,
): Answer {
  if (q.method === 'card' && q.noCard) {
    return { text: 'Não há cartão cadastrado. Cadastre o cartão para eu calcular a fatura e o limite, ou pergunte pelo gasto na conta.', link: { label: 'Cadastrar cartão', route: { view: 'cartoes' } } };
  }
  if (q.method === 'card' && !q.card) {
    return { text: `Em qual cartão: ${orList(q.ambiguous.map((c) => c.name || c.institution))}? O cartão muda a fatura em que a compra entra e o vencimento.` };
  }

  const c = checkSpend(d, cash, { amount: q.amount, method: q.method, card: q.card, installments: q.installments }, data);
  const parts: string[] = [];
  const cardName = c.card ? c.card.name || c.card.institution : '';
  const beforeUntil = c.schedule.filter((s) => s.date < d.until).reduce((t, s) => t + s.amount, 0);

  if (c.verdict === 'short' && c.shortBy === 'limit' && c.limit) {
    parts.push(`No cartão ${cardName}, não cabe: o limite disponível é ${formatMoney(c.limit.available)}, e a compra passa dele em ${formatMoney(-c.limit.after)}.`);
  } else if (c.verdict === 'short' && c.shortBy === 'cash') {
    parts.push(
      !c.card && c.tightestAfter.date === d.today
        ? `Não cabe hoje: o saldo nas contas é ${money(d.balance)}, e o gasto deixaria ${money(c.tightestAfter.balance)}.`
        : `Não cabe sem descobrir uma conta: ${onDay(c.tightestAfter.date, d.today)} o saldo previsto ficaria em ${money(c.tightestAfter.balance)}${c.card ? `, com a fatura do ${cardName}` : ''}.`,
    );
  } else if (c.verdict === 'short' && c.shortBy === 'later' && c.laterAfter) {
    parts.push(
      `Até ${d.income ? day(d.income.date, d.today) : 'o fim do mês'} cabe, mas depois falta dinheiro: ${day(c.laterAfter.date, d.today)} o saldo previsto ficaria em ${money(c.laterAfter.balance)}, mesmo com o recebimento.`,
    );
  } else if (c.verdict === 'uses-buffer') {
    parts.push(
      `Cabe, mas entra na margem de segurança: depois do gasto, sobrariam ${formatMoney(Math.max(0, c.availableAfter))} ${untilText(d)}, ${formatMoney(-c.freeAfter)} abaixo da margem de ${formatMoney(d.buffer.amount)}. Nenhuma conta fica descoberta, mas sobra menos para imprevistos.`,
    );
  } else {
    parts.push(
      beforeUntil > 0
        ? `Cabe. Depois do gasto, você ainda teria ${formatMoney(c.freeAfter)} para gastar ${untilText(d)}${d.buffer.amount > 0 ? `, já contando ${formatMoney(d.buffer.amount)} de margem` : ''}.`
        : `Cabe. A compra só pesa depois do próximo recebimento: até lá, o disponível para gastar continua ${formatMoney(d.free)}.`,
    );
  }

  // o cartão: em que fatura entra, e o limite
  if (c.card && c.shortBy !== 'limit') {
    const first = c.schedule[0];
    if (c.installments > 1) {
      parts.push(
        `Em ${c.installments}× de ${formatMoney(c.schedule[c.schedule.length - 1].amount)}${c.schedule[0].amount !== c.schedule[c.schedule.length - 1].amount ? ` (a primeira de ${formatMoney(c.schedule[0].amount)})` : ''}, as parcelas vencem de ${formatDayShort(first.date)} a ${formatDayShort(c.schedule[c.schedule.length - 1].date)}.`,
      );
      if (c.beyondHorizon > 0) parts.push(`${c.beyondHorizon === 1 ? 'A última parcela vence' : `As últimas ${c.beyondHorizon} parcelas vencem`} depois dos 60 dias que o app projeta.`);
    } else {
      parts.push(`A compra entra na fatura que vence ${day(first.date, d.today)}.`);
    }
    if (c.limit) parts.push(`O limite disponível cai de ${formatMoney(c.limit.available)} para ${formatMoney(c.limit.after)}${c.installments > 1 ? ', porque o limite reserva a compra inteira' : ''}.`);
  }

  // a alternativa, quando não cabe folgado
  if (c.verdict !== 'fits' && c.maxFree !== null && c.maxFree > 0 && c.maxFree < c.amount) {
    parts.push(`Um gasto de até ${formatMoney(c.maxFree)} cabe sem tocar a margem.`);
  } else if (c.verdict !== 'fits' && !c.card && c.maxFree === 0 && d.available > 0 && d.available < c.amount) {
    parts.push(`Até ${formatMoney(d.available)} não descobre nenhuma conta, mas já sai da margem de segurança.`);
  }
  if (c.verdict === 'short' && c.shortBy === 'cash' && d.income && !c.card) {
    parts.push(`Outra saída é esperar ${d.income.label}, que entra ${day(d.income.date, d.today)}.`);
  }
  parts.push(...caveats(d));

  const list = calcList(spendLines(d, c));

  const highlight =
    c.verdict === 'short'
      ? {
          label: c.shortBy === 'limit' ? 'Passa do limite em' : 'Faltaria',
          value: formatMoney(c.shortBy === 'limit' && c.limit ? -c.limit.after : c.shortBy === 'later' && c.laterAfter ? -c.laterAfter.balance : -c.tightestAfter.balance),
        }
      : { label: 'Sobra para gastar depois', value: money(Math.max(0, c.freeAfter)) };

  return {
    text: parts.join(' '),
    highlight,
    list,
    basis: `gasto de ${formatMoney(c.amount)}${c.card ? ` no cartão ${cardName}` : ' na conta'}, contra o saldo de hoje e o que já tem data para sair`,
    link: c.card ? { label: 'Ver o cartão', route: { view: 'cartoes' } } : { label: 'Ver o mês dia a dia', route: { view: 'calendario' } },
  };
}

