import { describe, expect, it } from 'vitest';
import type { Area, AreaId, AreaStatus, Checkup } from './checkup';
import { focusNote, homeFocus, momentSummary, suggestionsFor } from './profile';
import type { FinancialProfile } from './types';

/**
 * O perfil declarado: personaliza por onde começar e fala com calma quando o
 * que foi dito e o que os números mostram discordam.
 */

const area = (id: AreaId, title: string, status: AreaStatus, label: string): Area => ({
  id,
  title,
  status,
  label,
  why: '',
  action: null,
  facts: {},
});

const checkup = (over: Partial<Record<AreaId, [AreaStatus, string]>> = {}): Checkup => {
  const base: Record<AreaId, [string, AreaStatus, string]> = {
    fluxo: ['Fluxo de caixa', 'ok', 'saudável'],
    reserva: ['Reserva', 'attention', '0,8 mês'],
    dividas: ['Dívidas', 'attention', '25% da renda'],
    cartoes: ['Cartões', 'ok', '12% do limite'],
    metas: ['Metas', 'ok', 'no ritmo'],
    patrimonio: ['Patrimônio', 'info', '↑ R$ 1.000,00'],
  };
  const areas = (Object.keys(base) as AreaId[]).map((id) => {
    const [title, status, label] = base[id];
    const o = over[id];
    return area(id, title, o ? o[0] : status, o ? o[1] : label);
  });
  return { areas, attention: [], summary: { tone: 'ok', text: '' }, confidence: { percent: 77, level: 'média', checks: [] } };
};

const profile = (p: Partial<FinancialProfile>): FinancialProfile => ({
  focus: [],
  situation: null,
  monthEnd: null,
  income: null,
  answeredAt: '2026-09-18T12:00:00.000Z',
  ...p,
});

describe('o foco declarado, ligado ao que os números mostram', () => {
  it('sem resposta, não há nota', () => {
    expect(focusNote(undefined, checkup())).toBeNull();
    expect(focusNote({ ...profile({ focus: ['dividas'] }), answeredAt: null, skippedAt: '2026-09-18T12:00:00.000Z' }, checkup())).toBeNull();
  });

  it('quitar dívidas: a área de dívidas, com o estado e o número', () => {
    expect(focusNote(profile({ focus: ['dividas', 'reserva'] }), checkup())?.text).toBe(
      'Você informou que quer quitar dívidas. Hoje, dívidas pede atenção: 25% da renda.',
    );
  });

  it('investir com a base incompleta: olhar reserva e dívidas antes', () => {
    const note = focusNote(profile({ focus: ['investir'] }), checkup());
    expect(note?.text).toContain('Antes, vale olhar a base: reserva 0,8 mês, e as dívidas levam 25% da renda.');
  });

  it('investir com a base de pé: o próximo passo é o para quê e o prazo', () => {
    const note = focusNote(profile({ focus: ['investir'] }), checkup({ reserva: ['ok', '6,2 meses'], dividas: ['ok', 'nenhuma'] }));
    expect(note?.text).toContain('A base está de pé (reserva: 6,2 meses)');
  });

  it('organizar: começa pela qualidade dos dados', () => {
    expect(focusNote(profile({ focus: ['organizar'] }), checkup())?.text).toContain('hoje ela está em 77% (confiança média)');
  });
});

describe('o declarado e o medido', () => {
  it('"tranquila", com o fluxo em alerta: diz com calma, sem corrigir', () => {
    const note = focusNote(profile({ situation: 'tranquila' }), checkup({ fluxo: ['alert', 'conta descoberta'] }));
    expect(note?.mismatch).toBe(
      'Você descreveu sua situação como tranquila, e os números de agora mostram outra coisa no fluxo de caixa: conta descoberta. Pode ser um mês fora da curva, ou algum dado faltando.',
    );
  });

  it('"endividado" sem dívida cadastrada: sugere cadastrar', () => {
    const note = focusNote(profile({ situation: 'endividado' }), checkup({ dividas: ['ok', 'nenhuma'] }));
    expect(note?.mismatch).toContain('não há dívida cadastrada');
  });

  it('quando bate, não há ressalva', () => {
    expect(focusNote(profile({ situation: 'apertada' }), checkup({ fluxo: ['attention', 'saídas acima das entradas'] }))?.mismatch).toBeNull();
  });
});

describe('sugestões do assistente', () => {
  it('as do foco vão na frente, sem repetir', () => {
    const base = ['Como está minha vida financeira?', 'Quanto posso gastar?', 'Qual a Selic?'];
    expect(suggestionsFor(profile({ focus: ['vermelho'] }), base)).toEqual([
      'Por que estou fechando no vermelho?',
      'Quanto posso gastar?',
      'Como está minha vida financeira?',
      'Qual a Selic?',
    ]);
    expect(suggestionsFor(undefined, base)).toEqual(base);
  });
});

describe('o Início por perfil', () => {
  it('sem resposta, o Início fica como sempre foi', () => {
    expect(homeFocus(undefined)).toBeNull();
    expect(homeFocus({ ...profile({ focus: ['investir'] }), answeredAt: null })).toBeNull();
    expect(homeFocus(profile({}))).toBeNull();
  });

  it('conta atrasada ou mês apertado vencem qualquer objetivo', () => {
    expect(homeFocus(profile({ focus: ['investir'], debts: 'atrasadas' }))).toBe('aperto');
    expect(homeFocus(profile({ focus: ['objetivo'], situation: 'sem-dinheiro' }))).toBe('aperto');
    expect(homeFocus(profile({ situation: 'endividado' }))).toBe('aperto');
  });

  it('o objetivo decide quando não há aperto', () => {
    expect(homeFocus(profile({ focus: ['dividas'], debts: 'em-dia' }))).toBe('aperto');
    expect(homeFocus(profile({ focus: ['investir'], situation: 'tranquila' }))).toBe('plano');
    expect(homeFocus(profile({ focus: ['reserva'] }))).toBe('plano');
    expect(homeFocus(profile({ focus: ['gastos'], situation: 'organizada' }))).toBe('comeco');
    expect(homeFocus(profile({ focus: ['organizar'] }))).toBe('comeco');
  });

  it('sem objetivo, a situação decide', () => {
    expect(homeFocus(profile({ situation: 'organizada' }))).toBe('plano');
    expect(homeFocus(profile({ situation: 'nao-sei' }))).toBe('comeco');
    expect(homeFocus(profile({ income: 'fixa', reserve: 'pouca' }))).toBeNull();
  });
});

describe('"Entendemos seu momento"', () => {
  it('devolve o objetivo numa frase e diz por onde começa', () => {
    const m = momentSummary(profile({ focus: ['vermelho'], situation: 'apertada', debts: 'em-dia' }))!;
    expect(m.headline).toBe('Seu principal objetivo é parar de ficar no vermelho.');
    expect(m.focus).toBe('aperto');
    expect(m.notes).toEqual(['As dívidas estão em dia: o cuidado é o mês não apertar a ponto de atrasar alguma.']);
    expect(m.first[0]).toBe('O que entra e sai até o próximo recebimento');
  });

  it('quer investir com conta atrasada: diz que o fluxo vem antes', () => {
    const m = momentSummary(profile({ focus: ['investir'], debts: 'atrasadas' }))!;
    expect(m.focus).toBe('aperto');
    expect(m.notes).toHaveLength(2);
    expect(m.notes[0]).toMatch(/começa pelo fluxo/);
    expect(m.notes[1]).toMatch(/conta atrasada/);
  });

  it('no máximo duas observações, e nenhuma promete o que o app não faz', () => {
    const m = momentSummary(profile({ focus: ['objetivo'], situation: 'tranquila', reserve: 'nao', income: 'variavel' }))!;
    expect(m.focus).toBe('plano');
    expect(m.notes).toEqual([
      'Sem reserva, um imprevisto vira dívida. Ela entra no plano como um dos primeiros passos.',
      'Com renda que varia, registre cada entrada quando cair: a previsão usa só o que está lançado.',
    ]);
  });

  it('sem objetivo, a frase vem da situação; sem nada respondido, não há tela', () => {
    expect(momentSummary(profile({ situation: 'nao-sei' }))?.headline).toBe('Você ainda não sabe dizer como está.');
    expect(momentSummary(profile({}))).toBeNull();
    expect(momentSummary(null)).toBeNull();
  });
});

describe('o que foi dito sobre dívidas e reserva, contra o cadastro', () => {
  it('disse que tem dívida e não há nenhuma cadastrada: sugere cadastrar', () => {
    const note = focusNote(profile({ debts: 'em-dia' }), checkup({ dividas: ['ok', 'nenhuma'] }));
    expect(note?.mismatch).toMatch(/tem dívidas, mas não há dívida cadastrada/);
  });

  it('disse que a reserva cobre meses e o diagnóstico não a encontra: explica como fazer aparecer', () => {
    const note = focusNote(profile({ reserve: 'meses' }), checkup({ reserva: ['unknown', 'sem dados'] }));
    expect(note?.mismatch).toMatch(/reserva cobre alguns meses/);
    expect(focusNote(profile({ reserve: 'meses' }), checkup({ reserva: ['ok', '4,2 meses'] }))?.mismatch).toBeNull();
  });

  it('conta atrasada põe a pergunta das dívidas na frente do assistente', () => {
    expect(suggestionsFor(profile({ focus: ['investir'], debts: 'atrasadas' }), [])[0]).toBe('Qual dívida devo pagar primeiro?');
  });
});
