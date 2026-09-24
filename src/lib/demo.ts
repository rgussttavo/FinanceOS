import { buildSeedCategories } from './categories';
import { addMonthsToKey, clampDayToMonth, monthKeyOf, monthKeyParts, partsToIso } from './dates';
import type {
  Asset,
  Card,
  Category,
  Cents,
  Debt,
  Entry,
  FlowKind,
  Goal,
  IsoDate,
  MonthKey,
  Repeat,
  Settings,
  Subscription,
} from './types';

/**
 * O FinanceOS de exemplo.
 *
 * Um mês de alguém que não existe, montado a partir do dia de hoje para a
 * linha do tempo sempre ter passado e futuro. Os valores são inventados e a
 * tela diz isso o tempo todo — o modo demonstração existe para mostrar o que
 * o app faz, não para parecer a vida de ninguém.
 *
 * Mora numa base separada da de verdade: explorar o exemplo nunca encosta nos
 * dados da pessoa, e sair dele não deixa rastro.
 */

export const DEMO_SPACE_ID = 'demo-space';

export interface DemoData {
  categories: Category[];
  entries: Entry[];
  cards: Card[];
  subscriptions: Subscription[];
  goals: Goal[];
  debts: Debt[];
  assets: Asset[];
  settings: Settings;
}

export function buildDemoData(today: IsoDate): DemoData {
  const at = `${today}T12:00:00.000Z`;
  const base = { spaceId: DEMO_SPACE_ID, createdAt: at, updatedAt: at, deletedAt: null };
  const month = monthKeyOf(today);
  const cat = (slug: string) => `demo-cat-${slug}`;
  const categories = buildSeedCategories(DEMO_SPACE_ID, cat);

  const day = (key: MonthKey, d: number): IsoDate => {
    const { y, m } = monthKeyParts(key);
    return partsToIso(y, m, clampDayToMonth(d, y, m));
  };
  const todayDay = Number(today.slice(8));

  let seq = 0;
  const entries: Entry[] = [];
  const entry = (
    kind: FlowKind,
    description: string,
    amount: Cents,
    date: IsoDate,
    slug: string | null,
    opts: { repeat?: Repeat; cardId?: string; tags?: string[] } = {},
  ) => {
    const id = `demo-e-${++seq}`;
    // o que já passou está pago; o resto espera
    const settled: Entry['settled'] = {};
    if (!opts.cardId && opts.repeat?.kind !== 'monthly' && date <= today) settled[monthKeyOf(date)] = { at };
    entries.push({
      ...base,
      id,
      kind,
      description,
      amount,
      date,
      categoryId: slug ? cat(slug) : null,
      accountId: null,
      cardId: opts.cardId ?? null,
      repeat: opts.repeat ?? { kind: 'once' },
      settled,
      notes: '',
      tags: opts.tags ?? [],
      source: 'manual',
      externalId: null,
      attachmentIds: [],
    });
    return id;
  };

  const start = addMonthsToKey(month, -4);

  // o que se repete: salário, aluguel, condomínio, internet, aporte da reserva
  entry('in', 'Salário', 620000, day(start, 5), 'salario', { repeat: { kind: 'monthly' } });
  entry('out', 'Aluguel', 185000, day(start, 6), 'moradia', { repeat: { kind: 'monthly' } });
  entry('out', 'Condomínio', 48000, day(start, 10), 'moradia', { repeat: { kind: 'monthly' } });
  entry('out', 'Internet e celular', 15990, day(start, 15), 'contas', { repeat: { kind: 'monthly' } });
  entry('invest', 'Aporte na reserva', 60000, day(start, 8), 'reserva', { repeat: { kind: 'monthly' } });

  // baixas das recorrências nos meses que já passaram
  for (const e of entries) {
    if (e.repeat.kind !== 'monthly') continue;
    for (let k = start; k <= month; k = addMonthsToKey(k, 1)) {
      const d = day(k, Number(e.date.slice(8)));
      if (d <= today) e.settled[k] = { at };
    }
  }

  // o dia a dia de cada mês, com restaurante subindo no mês atual
  for (let i = 0; i <= 4; i++) {
    const k = addMonthsToKey(start, i);
    const current = k === month;
    const add = (kind: FlowKind, desc: string, amount: Cents, d: number, slug: string) => {
      const date = day(k, d);
      // no mês corrente, o que ainda não aconteceu fica de fora; é previsão
      if (current && date > today && slug !== 'contas') return;
      entry(kind, desc, amount, date, slug);
    };
    add('out', 'Supermercado Dia', 31240 + i * 870, 3, 'mercado');
    add('out', 'Hortifruti', 8650, 9, 'mercado');
    add('out', 'Supermercado Dia', 27890 + i * 450, 17, 'mercado');
    add('out', 'Padaria', 4320, 21, 'mercado');
    add('out', 'Conta de luz · Enel', 18900 + i * 1140, 12, 'contas');
    add('out', 'Farmácia', 6790, 14, 'saude');
    add('out', 'Posto Shell', 22000, 19, 'transporte');
    add('out', 'Restaurante japonês', current ? 21800 : 14200, 7, 'alimentacao');
    add('out', 'Pizzaria', current ? 12900 : 8900, 13, 'alimentacao');
    if (current) add('out', 'Bar com amigos', 16400, Math.max(1, Math.min(todayDay, 16)), 'alimentacao');
  }

  // saldo que sobrou do mês passado
  entry('in', 'Saldo do mês anterior', 118000, day(month, 1), null, { tags: ['saldo-anterior'] });
  // um freela que entra na semana que vem
  entry('in', 'Freela · site da padaria', 180000, day(month, Math.min(todayDay + 9, 28)), 'extra');

  // cartões
  const nubank: Card = {
    ...base,
    id: 'demo-card-nubank',
    name: 'Nubank Ultravioleta',
    institution: 'Nubank',
    brand: 'mastercard',
    last4: '4291',
    color: '',
    limit: 800000,
    closingDay: 28,
    dueDay: 5,
    accountId: null,
    archived: false,
  };
  const itau: Card = {
    ...base,
    id: 'demo-card-itau',
    name: 'Itaú Click',
    institution: 'Itaú',
    brand: 'visa',
    last4: '8807',
    color: '',
    limit: 300000,
    closingDay: 2,
    dueDay: 10,
    accountId: null,
    archived: false,
  };

  const prev = addMonthsToKey(month, -1);
  entry('out', 'Notebook', 42000, day(addMonthsToKey(month, -3), 20), 'compras', {
    cardId: nubank.id,
    repeat: { kind: 'installments', count: 10 },
  });
  entry('out', 'Fone bluetooth', 8997, day(prev, 11), 'compras', {
    cardId: nubank.id,
    repeat: { kind: 'installments', count: 3 },
  });
  entry('out', 'Uber', 2890, day(prev, 22), 'transporte', { cardId: nubank.id });
  entry('out', 'iFood', 6450, day(prev, 25), 'alimentacao', { cardId: nubank.id });
  entry('out', 'Uber', 3140, day(month, Math.max(1, todayDay - 2)), 'transporte', { cardId: nubank.id });
  entry('out', 'Livraria', 11990, day(month, Math.max(1, todayDay - 4)), 'educacao', { cardId: nubank.id });
  entry('out', 'Tênis de corrida', 45990, day(prev, 16), 'compras', {
    cardId: itau.id,
    repeat: { kind: 'installments', count: 5 },
  });

  // assinaturas: uma cobrada amanhã, duas marcadas como dispensáveis
  const tomorrowDay = Math.min(todayDay + 1, 28);
  const sub = (
    name: string,
    domain: string,
    amount: Cents,
    billingDay: number,
    color: string,
    cardId: string | null,
    essential: boolean | null,
    history?: Subscription['priceHistory'],
  ): Subscription => ({
    ...base,
    id: `demo-sub-${name.toLowerCase().replace(/\W+/g, '-')}`,
    name,
    domain,
    amount,
    billingDay,
    cycle: 'monthly',
    categoryId: cat('assinaturas'),
    cardId,
    accountId: null,
    color,
    startedAt: day(addMonthsToKey(month, -14), billingDay),
    canceledAt: null,
    remindDaysBefore: 2,
    essential,
    priceHistory: history,
  });
  const subscriptions = [
    sub('Netflix', 'netflix.com', 4490, 12, '#e50914', nubank.id, false, [{ amount: 3990, until: day(addMonthsToKey(month, -2), 11) }]),
    sub('Spotify', 'spotify.com', 2190, tomorrowDay, '#1db954', null, true),
    sub('YouTube Premium', 'youtube.com', 2490, 8, '#ff0000', nubank.id, null),
    sub('iCloud+', 'icloud.com', 1290, 2, '#6e6e73', nubank.id, true),
    sub('Globoplay', 'globoplay.globo.com', 2290, 20, '#f70', null, false),
    sub('Academia Smart Fit', 'smartfit.com.br', 11990, 10, '#ffb612', itau.id, true),
  ];

  // metas
  const goals: Goal[] = [
    {
      ...base,
      id: 'demo-goal-reserva',
      name: 'Reserva de emergência',
      icon: '🛟',
      target: 3000000,
      source: 'category',
      categoryId: cat('reserva'),
      saved: 0,
      deadline: null,
      color: '#4a7a8a',
      archivedAt: null,
      pausedAt: null,
    },
    {
      ...base,
      id: 'demo-goal-viagem',
      name: 'Viagem para o Chile',
      icon: '✈️',
      target: 1000000,
      source: 'manual',
      categoryId: null,
      saved: 700000,
      deadline: day(addMonthsToKey(month, 3), 28),
      color: '#20707f',
      archivedAt: null,
      pausedAt: null,
      deposits: [
        { at: `${day(addMonthsToKey(month, -3), 6)}T12:00:00.000Z`, amount: 250000 },
        { at: `${day(addMonthsToKey(month, -2), 6)}T12:00:00.000Z`, amount: 150000 },
        { at: `${day(addMonthsToKey(month, -1), 6)}T12:00:00.000Z`, amount: 150000 },
        { at: `${day(month, 6)}T12:00:00.000Z`, amount: 150000 },
      ],
    },
    {
      ...base,
      id: 'demo-goal-carro',
      name: 'Trocar de carro',
      icon: '🚗',
      target: 6000000,
      source: 'manual',
      categoryId: null,
      saved: 1800000,
      deadline: day(addMonthsToKey(month, 30), 28),
      color: '#2c5f80',
      archivedAt: null,
      pausedAt: at,
    },
  ];

  // dívidas
  const debts: Debt[] = [
    {
      ...base,
      id: 'demo-debt-carro',
      name: 'Financiamento do carro',
      kind: 'financing',
      icon: '🚗',
      installment: 114000,
      installments: 48,
      startMonth: addMonthsToKey(month, -17),
      monthlyRate: 1.49,
      inFlow: true,
      dueDay: 20,
      settledAt: null,
    },
    {
      ...base,
      id: 'demo-debt-pessoal',
      name: 'Empréstimo pessoal',
      kind: 'loan',
      icon: '💸',
      installment: 38000,
      installments: 12,
      startMonth: addMonthsToKey(month, -5),
      monthlyRate: 4.2,
      inFlow: true,
      dueDay: 25,
      settledAt: null,
    },
  ];

  const assets: Asset[] = [
    {
      ...base,
      id: 'demo-asset-carro',
      name: 'Onix 1.0 Turbo 2022',
      kind: 'vehicle',
      icon: '🚗',
      value: 7240000,
      purchaseValue: 8190000,
      purchasedAt: day(addMonthsToKey(month, -17), 3),
      indexedByIpca: false,
      fipe: null,
      notes: '',
    },
    {
      ...base,
      id: 'demo-asset-notebook',
      name: 'Notebook e equipamentos',
      kind: 'other',
      icon: '💻',
      value: 650000,
      purchaseValue: 840000,
      purchasedAt: day(addMonthsToKey(month, -3), 20),
      indexedByIpca: false,
      fipe: null,
      notes: '',
    },
  ];

  const settings: Settings = {
    ...base,
    id: 'demo-settings',
    theme: 'system',
    privateMode: false,
    monthStartsOn: 1,
    onboardedAt: at,
    displayName: '',
    bio: '',
    birthDate: null,
    location: '',
    phone: '',
    cardsEnabled: true,
    newsEnabled: true,
  };

  return {
    categories,
    entries,
    cards: [nubank, itau],
    subscriptions,
    goals,
    debts,
    assets,
    settings,
  };
}
