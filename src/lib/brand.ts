/**
 * Identidade da marca num lugar só.
 * Trocar o nome do produto é trocar estas linhas — nada mais.
 */
export const BRAND = {
  name: 'Norte',
  /** usado em títulos longos e no <title> das páginas */
  tagline: 'Para onde o seu dinheiro está indo',
  /** frase curta do topo, aparece no onboarding e na landing */
  promise: 'Todo o seu dinheiro numa tela só. Sem conectar banco.',
  domain: 'norte.app',
  locale: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
} as const;

export type Brand = typeof BRAND;
