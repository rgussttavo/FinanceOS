import { nowInstant } from './dates';
import type { Category, FlowKind } from './types';

/* --------------------------------------------------------------- sementes */

interface SeedCategory {
  slug: string;
  name: string;
  kind: FlowKind;
  icon: string;
  color: string;
}

/**
 * As categorias que toda conta nasce tendo. Sao poucas de proposito: lista
 * longa demais faz a pessoa parar para escolher, e quem para nao lanca. O
 * detalhamento fino fica nas tags e nas categorias que ela mesma cria.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  // saidas
  { slug: 'moradia', name: 'Moradia', kind: 'out', icon: '\u{1F3E0}', color: '#8a6a33' },
  { slug: 'contas', name: 'Contas de casa', kind: 'out', icon: '\u{1F4A1}', color: '#a3742c' },
  { slug: 'mercado', name: 'Mercado', kind: 'out', icon: '\u{1F6D2}', color: '#4f7a3d' },
  { slug: 'alimentacao', name: 'Comer fora', kind: 'out', icon: '\u{1F37D}', color: '#b06334' },
  { slug: 'transporte', name: 'Transporte', kind: 'out', icon: '\u{1F697}', color: '#2c5f80' },
  { slug: 'saude', name: 'Saúde', kind: 'out', icon: '\u{1FA7A}', color: '#2f6a4a' },
  { slug: 'educacao', name: 'Educação', kind: 'out', icon: '\u{1F393}', color: '#4a4f8a' },
  { slug: 'lazer', name: 'Lazer', kind: 'out', icon: '\u{1F3AC}', color: '#7d4a86' },
  { slug: 'compras', name: 'Compras', kind: 'out', icon: '\u{1F6CD}', color: '#a63d6b' },
  { slug: 'cuidados', name: 'Cuidados pessoais', kind: 'out', icon: '\u{2702}', color: '#96506e' },
  { slug: 'assinaturas', name: 'Assinaturas', kind: 'out', icon: '\u{1F501}', color: '#5a4b9c' },
  { slug: 'pets', name: 'Pets', kind: 'out', icon: '\u{1F415}', color: '#7a5c2e' },
  { slug: 'impostos', name: 'Impostos e taxas', kind: 'out', icon: '\u{1F9FE}', color: '#6e6a5e' },
  { slug: 'viagem', name: 'Viagem', kind: 'out', icon: '\u{2708}', color: '#20707f' },
  { slug: 'presentes', name: 'Presentes', kind: 'out', icon: '\u{1F381}', color: '#a63d35' },
  { slug: 'outros-out', name: 'Outros', kind: 'out', icon: '\u{1F4E6}', color: '#6e6a5e' },
  // entradas
  { slug: 'salario', name: 'Salário', kind: 'in', icon: '\u{1F4BC}', color: '#2f6a4a' },
  { slug: 'beneficios', name: 'Benefícios', kind: 'in', icon: '\u{1F3AB}', color: '#3d7a5c' },
  { slug: 'extra', name: 'Renda extra', kind: 'in', icon: '\u{2728}', color: '#4f8a5e' },
  { slug: 'rendimentos', name: 'Rendimentos', kind: 'in', icon: '\u{1F4C8}', color: '#2c7f6b' },
  { slug: 'reembolso', name: 'Reembolso', kind: 'in', icon: '\u{21A9}', color: '#5a8a6e' },
  { slug: 'outros-in', name: 'Outros', kind: 'in', icon: '\u{1F4B0}', color: '#6e6a5e' },
  // investimentos
  { slug: 'renda-fixa', name: 'Renda fixa', kind: 'invest', icon: '\u{1F3E6}', color: '#2c5f80' },
  { slug: 'acoes', name: 'Ações', kind: 'invest', icon: '\u{1F4CA}', color: '#2f6a9c' },
  { slug: 'fiis', name: 'Fundos imobiliários', kind: 'invest', icon: '\u{1F3E2}', color: '#3d6f8a' },
  { slug: 'cripto', name: 'Cripto', kind: 'invest', icon: '\u{20BF}', color: '#a3742c' },
  { slug: 'reserva', name: 'Reserva de emergência', kind: 'invest', icon: '\u{1F6DF}', color: '#4a7a8a' },
  { slug: 'previdencia', name: 'Previdência', kind: 'invest', icon: '\u{1F54A}', color: '#5a6a8a' },
];

export function buildSeedCategories(spaceId: string, idFor: (slug: string) => string): Category[] {
  const at = nowInstant();
  return SEED_CATEGORIES.map((s, i) => ({
    id: idFor(s.slug),
    spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: s.name,
    kind: s.kind,
    icon: s.icon,
    color: s.color,
    system: true,
    order: i,
    budget: 0,
  }));
}

/* ------------------------------------------------------------ normalizacao */

/** minusculas, sem acento, sem pontuacao: a forma em que tudo e comparado */
export function normalize(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Descricao de extrato vem suja: "PIX ENVIADO 12/03 IFOOD*PEDIDO 4432".
 * Aqui saem os ruidos que todo banco acrescenta, para sobrar o nome real.
 */
const NOISE = [
  /\bpix\s+(enviado|recebido|transferencia|qrs?|cp)\b/g,
  /\b(compra|pagamento|pgto|debito|credito|deb|cred)\s+(a\s+vista|parcelad[oa]|cartao|eletronico)?\b/g,
  /\b(tarifa|taxa|estorno|anuidade)\b/g,
  /\bparcela\s*\d+\s*(de|\/)\s*\d+\b/g,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g,
  /\b\d{6,}\b/g,
  /\b(ltda|me|epp|sa|eireli|comercio|servicos)\b/g,
];

export function cleanDescription(text: string): string {
  let out = normalize(text);
  for (const rx of NOISE) out = out.replace(rx, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------- base de palavras */

/**
 * Cada regra aponta para um slug de categoria. A ordem importa pouco porque o
 * casamento e pontuado, nao por primeiro-que-acha: o termo mais especifico e
 * mais longo ganha de "mercado" generico.
 */
const KEYWORDS: Record<string, string[]> = {
  moradia: ['aluguel', 'condominio', 'imobiliaria', 'iptu', 'financiamento imobiliario', 'reforma', 'zelador'],
  contas: [
    'luz', 'energia', 'enel', 'cemig', 'copel', 'cpfl', 'light', 'equatorial', 'neoenergia',
    'agua', 'sabesp', 'cedae', 'caesb', 'sanepar', 'embasa', 'copasa',
    'gas', 'comgas', 'ultragaz',
    'internet', 'vivo', 'claro', 'tim', 'oi', 'net', 'sky', 'algar', 'nextel', 'telefone', 'celular',
  ],
  mercado: [
    'mercado', 'supermercado', 'hipermercado', 'atacadao', 'assai', 'carrefour', 'extra', 'pao de acucar',
    'big', 'sam s club', 'makro', 'tenda', 'dia', 'guanabara', 'prezunic', 'mundial', 'zona sul',
    'hortifruti', 'sacolao', 'feira', 'acougue', 'padaria', 'quitanda', 'emporio',
  ],
  alimentacao: [
    'ifood', 'rappi', 'uber eats', 'restaurante', 'lanchonete', 'hamburgueria', 'pizzaria', 'churrascaria',
    'mcdonalds', 'burger king', 'bobs', 'subway', 'habibs', 'outback', 'madero', 'giraffas',
    'starbucks', 'cafeteria', 'cafe', 'bar', 'boteco', 'sushi', 'temaki', 'doceria', 'sorveteria',
  ],
  transporte: [
    'uber', '99', 'cabify', 'taxi', 'gasolina', 'combustivel', 'etanol', 'alcool', 'posto', 'shell',
    'ipiranga', 'petrobras', 'ale', 'br mania', 'estacionamento', 'estapar', 'zona azul',
    'pedagio', 'sem parar', 'conectcar', 'veloe', 'ipva', 'licenciamento', 'dpvat',
    'onibus', 'metro', 'brt', 'vlt', 'barca', 'bilhete unico', 'riocard', 'passagem',
    'mecanico', 'oficina', 'autopeca', 'pneu', 'lavagem', 'localiza', 'movida', 'unidas', 'buser', 'clickbus',
  ],
  saude: [
    'farmacia', 'drogaria', 'droga raia', 'drogasil', 'pacheco', 'pague menos', 'panvel', 'venancio',
    'remedio', 'medico', 'consulta', 'dentista', 'ortodontia', 'hospital', 'clinica', 'exame',
    'laboratorio', 'fleury', 'sabin', 'dasa', 'unimed', 'amil', 'hapvida', 'sulamerica', 'bradesco saude',
    'plano de saude', 'psicolog', 'terapia', 'fisioterapia', 'nutricionista', 'oculos', 'otica', 'vacina',
    'academia', 'smart fit', 'bluefit', 'bodytech', 'crossfit', 'pilates', 'natacao', 'jiu jitsu', 'muay thai',
  ],
  educacao: [
    'escola', 'colegio', 'faculdade', 'universidade', 'mensalidade', 'matricula', 'creche', 'berçario',
    'curso', 'alura', 'udemy', 'coursera', 'rocketseat', 'ingles', 'cultura inglesa', 'wizard', 'ccaa',
    'livraria', 'livro', 'apostila', 'material escolar', 'kumon',
  ],
  lazer: [
    'cinema', 'cinemark', 'kinoplex', 'uci', 'teatro', 'show', 'ingresso', 'ingresse', 'sympla',
    'eventim', 'ticketmaster', 'parque', 'balada', 'clube', 'boliche', 'jogo', 'steam', 'playstation',
    'xbox', 'nintendo', 'psn', 'epic games',
  ],
  compras: [
    'amazon', 'mercado livre', 'shopee', 'aliexpress', 'shein', 'magalu', 'magazine luiza',
    'americanas', 'casas bahia', 'ponto frio', 'kabum', 'pichau', 'fast shop', 'centauro',
    'netshoes', 'renner', 'riachuelo', 'cea', 'zara', 'hering', 'marisa', 'havaianas', 'nike', 'adidas',
    'leroy merlin', 'telhanorte', 'obramax', 'loja', 'shopping',
  ],
  cuidados: ['cabeleireiro', 'salao', 'barbearia', 'barber', 'manicure', 'depilacao', 'estetica', 'perfume', 'boticario', 'natura', 'sephora', 'skincare'],
  assinaturas: [
    'netflix', 'spotify', 'youtube premium', 'disney', 'hbo', 'max', 'prime video', 'globoplay',
    'paramount', 'apple tv', 'icloud', 'google one', 'dropbox', 'deezer', 'tidal', 'crunchyroll',
    'chatgpt', 'openai', 'notion', 'canva', 'adobe', 'microsoft 365', 'office 365', 'assinatura',
  ],
  pets: ['pet', 'petz', 'cobasi', 'petlove', 'veterinario', 'racao', 'banho e tosa', 'tosa'],
  impostos: ['imposto', 'darf', 'das', 'inss', 'irpf', 'receita federal', 'multa', 'detran', 'cartorio', 'taxa bancaria', 'tarifa'],
  viagem: ['hotel', 'pousada', 'airbnb', 'booking', 'decolar', 'latam', 'gol', 'azul', 'passagem aerea', 'hostel', 'resort', 'cvc', 'hurb'],
  presentes: ['presente', 'flores', 'floricultura', 'lembrancinha'],
  salario: ['salario', 'pagamento', 'holerite', 'contracheque', 'folha', 'remuneracao', 'ordenado'],
  beneficios: ['vale', 'vr', 'va', 'alelo', 'sodexo', 'ticket', 'caju', 'flash', 'beneficio', 'auxilio', 'bolsa', 'plr'],
  extra: ['freela', 'freelance', 'bico', 'comissao', 'venda', 'servico prestado', 'nota fiscal', 'honorario'],
  rendimentos: ['rendimento', 'rend pago', 'dividendo', 'jcp', 'juros', 'provento', 'cashback', 'rendimento poupanca'],
  reembolso: ['reembolso', 'estorno', 'devolucao', 'ressarcimento'],
  'renda-fixa': ['cdb', 'rdb', 'aplicacao', 'aplicacao automatica', 'tesouro', 'selic', 'lci', 'lca', 'poupanca', 'renda fixa', 'cri', 'cra', 'debenture', 'lft', 'ntnb', 'ipca+'],
  acoes: ['acao', 'acoes', 'bolsa', 'b3', 'etf', 'bova11', 'ivvb11', 'petr4', 'vale3', 'itub4', 'bbas3'],
  fiis: ['fii', 'fundo imobiliario', 'mxrf11', 'hglg11', 'knri11', 'xpml11', 'visc11'],
  cripto: ['bitcoin', 'btc', 'ethereum', 'eth', 'cripto', 'binance', 'mercado bitcoin', 'foxbit', 'coinbase', 'solana', 'usdt'],
  reserva: ['reserva', 'emergencia', 'colchao'],
  previdencia: ['previdencia', 'pgbl', 'vgbl', 'aposentadoria'],
};

interface CompiledRule {
  slug: string;
  term: string;
  /** termos maiores sao mais especificos e valem mais */
  weight: number;
}

const COMPILED: CompiledRule[] = Object.entries(KEYWORDS)
  .flatMap(([slug, terms]) =>
    terms.map((term) => ({ slug, term: normalize(term), weight: term.length })),
  )
  .sort((a, b) => b.weight - a.weight);

/* ------------------------------------------------------------- aprendizado */

/**
 * Correcao vira regra. Quando a pessoa troca a categoria de "padaria do ze",
 * a proxima "padaria do ze" ja nasce certa. E a diferenca entre um app que
 * aprende e uma lista de palavras congelada no codigo.
 */
export interface LearnedRule {
  /** descricao limpa que gerou a regra */
  pattern: string;
  categoryId: string;
  /** quantas vezes foi confirmada; desempata contra o dicionario */
  hits: number;
  updatedAt: string;
}

export interface CategorizeInput {
  description: string;
  kind: FlowKind;
  categories: Category[];
  learned?: LearnedRule[];
}

export interface CategorizeResult {
  categoryId: string | null;
  /** 0 a 1; abaixo de 0.35 a UI pergunta em vez de assumir */
  confidence: number;
  reason: 'learned' | 'keyword' | 'fallback' | 'none';
  matchedTerm?: string;
}

/**
 * Descobre a categoria de um lancamento pela descricao.
 *
 * Ordem: regra aprendida > palavra do dicionario > categoria "Outros" do tipo.
 * A confianca sai junto para a UI decidir entre aplicar calado ou sugerir.
 */
export function categorize(input: CategorizeInput): CategorizeResult {
  const clean = cleanDescription(input.description);
  if (!clean) return { categoryId: null, confidence: 0, reason: 'none' };

  const byId = new Map(input.categories.map((c) => [c.id, c]));

  // 1. o que a pessoa ja ensinou
  let bestLearned: LearnedRule | null = null;
  for (const rule of input.learned ?? []) {
    if (!clean.includes(rule.pattern)) continue;
    if (!bestLearned || rule.pattern.length > bestLearned.pattern.length) bestLearned = rule;
  }
  if (bestLearned) {
    const cat = byId.get(bestLearned.categoryId);
    if (cat && !cat.deletedAt && cat.kind === input.kind) {
      return {
        categoryId: cat.id,
        confidence: Math.min(0.95, 0.75 + bestLearned.hits * 0.05),
        reason: 'learned',
        matchedTerm: bestLearned.pattern,
      };
    }
  }

  // 2. dicionario de comerciantes e palavras
  const candidates = input.categories.filter((c) => !c.deletedAt && c.kind === input.kind);
  const nameToCat = new Map(candidates.map((c) => [normalize(c.name), c]));

  for (const rule of COMPILED) {
    if (!matchesTerm(clean, rule.term)) continue;
    const cat = resolveSlug(rule.slug, candidates, nameToCat);
    if (!cat || cat.kind !== input.kind) continue;
    // termo de 3 letras acerta por acidente; de 8, dificilmente
    const confidence = Math.min(0.9, 0.45 + rule.term.length * 0.04);
    return { categoryId: cat.id, confidence, reason: 'keyword', matchedTerm: rule.term };
  }

  // 3. nao soube: "Outros" do tipo certo, com confianca baixa de proposito
  const fallback = candidates.find((c) => normalize(c.name) === 'outros') ?? null;
  return fallback
    ? { categoryId: fallback.id, confidence: 0.1, reason: 'fallback' }
    : { categoryId: null, confidence: 0, reason: 'none' };
}

/** casa a palavra inteira, para "dia" nao acertar dentro de "diaria" */
function matchesTerm(haystack: string, term: string): boolean {
  if (term.includes(' ')) return haystack.includes(term);
  const i = haystack.indexOf(term);
  if (i < 0) return false;
  const before = i === 0 ? ' ' : haystack[i - 1];
  const after = haystack[i + term.length] ?? ' ';
  return before === ' ' && after === ' ';
}

/**
 * O dicionario fala em slug ("mercado"); a conta tem categorias com nome que a
 * pessoa pode ter renomeado. Liga um no outro pelo slug original da semente.
 */
function resolveSlug(
  slug: string,
  candidates: Category[],
  nameToCat: Map<string, Category>,
): Category | null {
  const seed = SEED_CATEGORIES.find((s) => s.slug === slug);
  if (!seed) return null;
  const direct = nameToCat.get(normalize(seed.name));
  if (direct) return direct;
  return candidates.find((c) => normalize(c.name).includes(normalize(seed.name))) ?? null;
}

/** registra a correcao da pessoa como regra nova ou reforca a existente */
export function learnFromCorrection(
  learned: LearnedRule[],
  description: string,
  categoryId: string,
): LearnedRule[] {
  const pattern = cleanDescription(description);
  if (pattern.length < 3) return learned;

  const out = learned.slice();
  const existing = out.find((r) => r.pattern === pattern);
  if (existing) {
    existing.categoryId = categoryId;
    existing.hits += 1;
    existing.updatedAt = nowInstant();
    return out;
  }
  out.push({ pattern, categoryId, hits: 1, updatedAt: nowInstant() });
  return out;
}
