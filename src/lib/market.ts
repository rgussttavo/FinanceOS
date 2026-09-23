'use client';

import * as React from 'react';

/* ------------------------------------------------------------------ tipos */

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  image: string | null;
}

export interface NewsPayload {
  items: NewsItem[];
  fetchedAt: string;
}

export interface Indicator {
  id: string;
  label: string;
  value: number | null;
  detail: string;
}

export interface RealGain {
  id: string;
  label: string;
  nominal: number | null;
  real: number | null;
}

export interface Quote {
  id: string;
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

export interface PendingSection {
  id: string;
  label: string;
  reason: string;
}

export interface MarketPayload {
  indicators: Indicator[];
  real: RealGain[];
  currencies: Quote[];
  crypto: Quote[];
  /** IPCA mensal, para comparar com a inflacao de quem usa */
  ipcaSeries: { month: string; value: number }[];
  /** ja no contrato; vazios enquanto nao houver fonte */
  indices: Quote[];
  commodities: Quote[];
  stocks: Quote[];
  pending: PendingSection[];
  fetchedAt: string;
}

/* ------------------------------------------------------------------ cache */

const CACHE_PREFIX = 'financecs:cache:';

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // cota cheia ou armazenamento bloqueado: seguir sem cache é aceitável aqui
  }
}

export type RemoteState<T> = {
  data: T | null;
  /** o dado veio do cache do aparelho, não da rede */
  stale: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * Busca com cache no aparelho.
 *
 * Pinta na hora o que já se sabe e vai buscar o novo por baixo. Num app que
 * precisa abrir no metrô, mostrar a cotação de ontem marcada como velha é
 * muito melhor do que mostrar um espaço vazio girando.
 */
export function useRemote<T>(key: string, url: string): RemoteState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [stale, setStale] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let alive = true;

    /**
     * O cache é lido depois do primeiro paint, não durante ele: no servidor não
     * existe localStorage, e semear o estado com ele na renderização faria o
     * HTML entregue divergir do que o navegador monta.
     */
    const run = async () => {
      await Promise.resolve();
      if (!alive) return;

      const cached = readCache<T>(key);
      if (cached) {
        setData(cached);
        setStale(true);
      }

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Resposta ${res.status}`);
        const fresh = (await res.json()) as T;
        if (!alive) return;
        setData(fresh);
        setStale(false);
        setError(null);
        writeCache(key, fresh);
      } catch (err: unknown) {
        if (alive) setError(err instanceof Error ? err.message : 'Falhou');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, [key, url, nonce]);

  const reload = React.useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return { data, stale, loading, error, reload };
}

export const useNews = () => useRemote<NewsPayload>('news', '/api/news');
export const useMarket = () => useRemote<MarketPayload>('market', '/api/market');

/* --------------------------------------------------------------- formato */

const pctFmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRate(value: number | null, opts: { signed?: boolean } = {}): string {
  if (value == null) return '—';
  const body = `${pctFmt.format(Math.abs(value))}%`;
  if (value < 0) return `−${body}`;
  return opts.signed ? `+${body}` : body;
}

const priceFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

const priceBigFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const priceTinyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/**
 * Cotação em reais, com casas decimais conforme a ordem de grandeza.
 *
 * Acima de mil o centavo só polui; abaixo de dez centavos ele é a informação
 * inteira — o peso argentino vale cerca de R$ 0,0037 e sairia como "R$ 0,00"
 * na formatação de duas casas.
 */
export function formatQuote(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1000) return priceBigFmt.format(value);
  if (value < 0.1) return priceTinyFmt.format(value);
  return priceFmt.format(value);
}

/** "há 3 h", "há 2 d" — a idade da notícia importa mais que o horário dela */
export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}
