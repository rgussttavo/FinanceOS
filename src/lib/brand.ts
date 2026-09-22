/**
 * Identidade da marca num lugar só.
 * Trocar o nome do produto é trocar estas linhas — nada mais.
 */
export const BRAND = {
  name: 'FinanceCS',
  /** usado em títulos longos e no <title> das páginas */
  tagline: 'O sistema operacional da sua vida financeira',
  /** frase curta do topo, aparece no onboarding e na vitrine */
  promise: 'Seu mês inteiro numa tela. Grátis e sem conectar banco.',
  domain: 'financecs.app',
  locale: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
} as const;

export type Brand = typeof BRAND;
