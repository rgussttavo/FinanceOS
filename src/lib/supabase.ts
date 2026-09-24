'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente do Supabase, opcional por natureza.
 *
 * O app funciona inteiro sem nuvem — é local-first, e essa é a proposta. Então
 * nada aqui pode quebrar quando as variáveis não existem: sem configuração, o
 * app roda em modo local e a tela de conta some, em vez de estourar na cara de
 * quem abriu.
 *
 * Só a chave anônima entra aqui. Ela é pública por desenho: quem protege os
 * dados é a política de acesso no banco, não o segredo da chave.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const cloudConfigured = (): boolean => Boolean(URL && ANON);

/**
 * O balde do Storage onde os comprovantes ficam.
 *
 * Fica numa constante só porque o nome é escolhido na hora de criar o balde no
 * painel, e errar por uma letra dá "Bucket not found" sem explicar o porquê.
 * Trocar o nome é trocar aqui — ou a variável de ambiente, quando o balde do
 * ambiente de produção tiver outro nome.
 */
export const RECEIPTS_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'receipts';

/**
 * Quais jeitos de entrar estão ligados no projeto.
 *
 * O login social redireciona direto para o Supabase; se o provedor estiver
 * desligado, a pessoa cai numa página de erro em JSON, fora do app. Perguntar
 * antes permite explicar ali mesmo, na tela de entrar.
 */
export async function enabledProviders(): Promise<Record<string, boolean> | null> {
  if (!cloudConfigured()) return null;
  try {
    const res = await fetch(`${URL}/auth/v1/settings`, { headers: { apikey: ANON } });
    if (!res.ok) return null;
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return body.external ?? null;
  } catch {
    return null;
  }
}

let client: SupabaseClient | null = null;

/** o cliente, criado sob demanda; null quando a nuvem não está configurada */
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  if (!client) {
    client = createClient(URL, ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // a sessão volta da URL depois do login por link ou pelo Google
        detectSessionInUrl: true,
        storageKey: 'financecs-auth',
        /**
         * PKCE em vez do fluxo implícito.
         *
         * No fluxo antigo, o link do e-mail vale por si só — e é de uso único.
         * Servidor de e-mail costuma "pré-visitar" links para gerar
         * pré-visualização, e ao fazer isso GASTA o link: quando a pessoa
         * clica, já expirou. Foi exatamente o que aconteceu aqui.
         *
         * No PKCE o link traz um código que só vira sessão junto com um
         * segredo guardado neste navegador, no momento em que o login foi
         * pedido. Scanner nenhum consegue completar a troca, então o link
         * continua valendo para quem de fato pediu.
         */
        flowType: 'pkce',
      },
    });
  }
  return client;
}

/** a mesma coisa, mas para quem já sabe que precisa e prefere falhar alto */
export function requireSupabase(): SupabaseClient {
  const client = supabase();
  if (!client) throw new Error('A conta na nuvem não está configurada neste ambiente.');
  return client;
}

/* --------------------------------------------------------------- tabelas */

/** a linha da tabela `records`, como ela vem e vai */
export interface CloudRecord {
  space_id: string;
  collection: string;
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
  deleted_at: string | null;
}
