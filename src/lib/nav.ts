/**
 * Mapa de navegação do app.
 *
 * Cinco lugares fixos respondem às perguntas de todo dia — como estou, para
 * onde foi, o que vem aí, quanto tenho e o resto. Cada ferramenta mora dentro
 * de um deles, e é esse "dentro de" que decide o botão de voltar e qual item
 * da barra fica aceso.
 */

import { BRAND } from './brand';

export type RootId = 'inicio' | 'movimentos' | 'planejamento' | 'patrimonio' | 'mais';

export type SubId =
  | 'calendario'
  | 'orcamento'
  | 'metas'
  | 'assinaturas'
  | 'cartoes'
  | 'dividas'
  | 'importar'
  | 'simuladores'
  | 'rateio'
  | 'comprovantes'
  | 'news'
  | 'busca'
  | 'ia'
  | 'ajustes'
  | 'categorias';

export type ViewId = RootId | SubId;

/** filtro da tela de movimentos, que também vai na URL */
export type MovFilter = 'tudo' | 'entradas' | 'saidas' | 'investimentos';

export interface Route {
  view: ViewId;
  /** detalhe da tela: filtro de movimentos, seção de ajustes */
  param?: string;
}

export const ROOTS: { id: RootId; label: string }[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'movimentos', label: 'Movimentos' },
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'patrimonio', label: 'Patrimônio' },
  { id: 'mais', label: 'Mais' },
];

export const PARENT: Record<SubId, RootId> = {
  calendario: 'planejamento',
  orcamento: 'planejamento',
  metas: 'planejamento',
  assinaturas: 'planejamento',
  cartoes: 'planejamento',
  dividas: 'planejamento',
  importar: 'mais',
  simuladores: 'mais',
  rateio: 'mais',
  comprovantes: 'mais',
  news: 'mais',
  busca: 'mais',
  ia: 'mais',
  ajustes: 'mais',
  categorias: 'mais',
};

export interface ViewMeta {
  title: string;
  /** a frase que diz para que a tela serve — aparece nos atalhos e no menu */
  description: string;
}

export const VIEW_META: Record<ViewId, ViewMeta> = {
  inicio: { title: 'Início', description: 'Como está seu mês hoje' },
  movimentos: { title: 'Movimentos', description: 'Veja para onde seu dinheiro foi' },
  planejamento: { title: 'Planejamento', description: 'O que vem por aí e o que você quer alcançar' },
  patrimonio: { title: 'Seu patrimônio', description: 'O que você tem menos o que deve' },
  mais: { title: 'Mais', description: 'Ferramentas, busca e ajustes' },
  calendario: { title: 'Calendário', description: 'O mês dia a dia, com o saldo de cada dia' },
  orcamento: { title: 'Orçamento', description: 'Orce antes de gastar' },
  metas: { title: 'Metas', description: 'Quanto falta e quanto guardar por mês' },
  assinaturas: { title: 'Assinaturas', description: 'Quanto custa seu estilo de vida digital' },
  cartoes: { title: 'Cartões', description: 'Faturas, limite e parcelas que ainda vêm' },
  dividas: { title: 'Dívidas', description: 'Empréstimos e financiamentos encolhendo' },
  importar: { title: 'Importar extrato', description: 'OFX, CSV, XLS ou XLSX do seu banco' },
  simuladores: { title: 'Simuladores', description: 'Câmbio, investimento, empréstimo e viver de renda' },
  rateio: { title: 'Rateio', description: 'Quem pagou o quê e quem acerta com quem' },
  comprovantes: { title: 'Comprovantes', description: 'A notinha guardada e achável' },
  news: { title: 'News', description: 'Manchetes, indicadores do Banco Central, moedas e cripto' },
  busca: { title: 'Buscar', description: `Busque em tudo no ${BRAND.name}` },
  ia: { title: 'Assistente', description: 'Pergunte sobre seu dinheiro' },
  ajustes: { title: 'Ajustes', description: 'Perfil, preferências, privacidade e dados' },
  categorias: { title: 'Categorias', description: 'Nomes e ícones das suas categorias' },
};

export const isRoot = (view: ViewId): view is RootId => ROOTS.some((r) => r.id === view);

/** o item da barra que fica aceso quando esta tela está aberta */
export const rootOf = (view: ViewId): RootId => (isRoot(view) ? view : PARENT[view]);

export function viewTitle(view: ViewId): string {
  if (view === 'ia') return `${BRAND.name} Assistente`;
  return VIEW_META[view]?.title ?? '';
}

const VIEWS = new Set<string>([...ROOTS.map((r) => r.id), ...Object.keys(PARENT)]);

/**
 * Endereços antigos continuam valendo: quem salvou um atalho para "despesas"
 * cai na tela de movimentos já filtrada.
 */
const LEGACY: Record<string, Route> = {
  receitas: { view: 'movimentos', param: 'entradas' },
  despesas: { view: 'movimentos', param: 'saidas' },
  investimentos: { view: 'movimentos', param: 'investimentos' },
  perfil: { view: 'ajustes' },
};

/** "#/movimentos/saidas" → { view: 'movimentos', param: 'saidas' } */
export function parseHash(hash: string): Route | null {
  const clean = hash.replace(/^#\/?/, '');
  if (!clean) return null;
  const [head, param] = clean.split('/');
  if (LEGACY[head]) return { ...LEGACY[head], ...(param ? { param } : {}) };
  if (!VIEWS.has(head)) return null;
  return { view: head as ViewId, ...(param ? { param } : {}) };
}

export const routeHash = (route: Route): string =>
  route.view === 'inicio' && !route.param ? '' : `#/${route.view}${route.param ? `/${route.param}` : ''}`;
