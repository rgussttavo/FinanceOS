/**
 * Identidade da marca num lugar só.
 * Trocar o nome do produto é trocar estas linhas — nada mais.
 */
export const BRAND = {
  name: 'FinanceOS',
  /** usado em títulos longos e no <title> das páginas */
  tagline: 'O fim do mês, visto do começo',
  /** frase curta do topo, aparece no onboarding e na vitrine */
  promise: 'Saiba quanto sobra antes do mês acabar. Grátis e sem senha de banco.',
  domain: 'financeosgg.vercel.app',
  locale: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
} as const;

export type Brand = typeof BRAND;
