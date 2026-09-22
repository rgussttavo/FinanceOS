/**
 * Mapa de navegação do app.
 *
 * Quatro abas fixas embaixo (o dia a dia) e as ferramentas no menu lateral (o
 * que se usa de vez em quando). A separação é o que impede a barra de baixo de
 * virar uma lista de dezesseis ícones que ninguém lê.
 */

export type TabId = 'inicio' | 'receitas' | 'despesas' | 'investimentos';

export type ToolId =
  | 'news'
  | 'assinaturas'
  | 'cartoes'
  | 'metas'
  | 'dividas'
  | 'rateio'
  | 'orcamento'
  | 'comprovantes'
  | 'patrimonio';

export type ViewId = TabId | ToolId | 'ia' | 'perfil';

export interface NavItem<T extends string> {
  id: T;
  label: string;
  /** título grande no topo quando a tela está aberta */
  title?: string;
  description?: string;
}

export const TABS: NavItem<TabId>[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'receitas', label: 'Receitas' },
  { id: 'despesas', label: 'Despesas' },
  { id: 'investimentos', label: 'Investimentos' },
];

export const TOOLS: NavItem<ToolId>[] = [
  { id: 'news', label: 'News', title: 'News', description: 'Manchetes, indicadores do Banco Central, moedas e cripto' },
  { id: 'assinaturas', label: 'Assinaturas', title: 'Assinaturas', description: 'O que se repete todo mês' },
  { id: 'cartoes', label: 'Cartões', title: 'Cartões', description: 'Faturas, limite e compras parceladas' },
  { id: 'metas', label: 'Metas', title: 'Metas', description: 'Quanto falta e quanto guardar por mês' },
  { id: 'dividas', label: 'Dívidas', title: 'Dívidas', description: 'Parcelas pagas e saldo devedor' },
  { id: 'rateio', label: 'Rateio', title: 'Rateio', description: 'Quem pagou o quê e quem acerta com quem' },
  { id: 'orcamento', label: 'Orçamento', title: 'Orçamento', description: 'Orce antes de gastar' },
  { id: 'comprovantes', label: 'Comprovantes', title: 'Comprovantes', description: 'A notinha guardada e achável' },
  { id: 'patrimonio', label: 'Patrimônio', title: 'Patrimônio', description: 'Bens e investido, somados' },
];

const TOOL_TITLES = new Map(TOOLS.map((t) => [t.id, t]));

export const isTab = (view: ViewId): view is TabId =>
  TABS.some((t) => t.id === view);

export function viewTitle(view: ViewId): string {
  const tool = TOOL_TITLES.get(view as ToolId);
  if (tool) return tool.title ?? tool.label;
  if (view === 'ia') return 'Norte IA';
  if (view === 'perfil') return 'Meu perfil';
  return TABS.find((t) => t.id === view)?.label ?? '';
}

/** o tipo de lançamento que o botão + cria em cada aba */
export const ADD_KIND_BY_TAB: Record<TabId, 'in' | 'out' | 'invest'> = {
  inicio: 'out',
  receitas: 'in',
  despesas: 'out',
  investimentos: 'invest',
};
