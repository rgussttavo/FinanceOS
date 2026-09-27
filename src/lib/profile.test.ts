import { describe, expect, it } from 'vitest';
import type { Area, AreaId, AreaStatus, Checkup } from './checkup';
import { focusNote, suggestionsFor } from './profile';
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
