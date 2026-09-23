import { NextResponse } from 'next/server';

/**
 * Indicadores e cotações.
 *
 * Duas fontes públicas e sem chave: o SGS do Banco Central para Selic, CDI,
 * IPCA e poupança, e a AwesomeAPI para moedas e cripto. Assim como nas
 * notícias, quem chama é o servidor — o navegador de quem usa o app não fala
 * com terceiro nenhum.
 */

export const revalidate = 300; // cinco minutos

/** séries do SGS do Banco Central */
const SGS = {
  selic: 432, // meta Selic definida pelo Copom, % a.a.
  cdi: 4389, // CDI anualizado, % a.a.
  ipca: 433, // IPCA mensal, %
  poupanca: 195, // rendimento mensal da poupança, %
} as const;

export interface Indicator {
  id: string;
  label: string;
  /** valor já em porcentagem (13.75 = 13,75%) */
  value: number | null;
  detail: string;
}

export interface Quote {
  id: string;
  symbol: string;
  label: string;
  price: number | null;
  /** variação do dia, em porcentagem */
  changePercent: number | null;
}

interface SgsRow {
  data: string;
  valor: string;
}

async function sgs(series: number, last: number): Promise<SgsRow[]> {
  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados/ultimos/${last}?formato=json`,
      { next: { revalidate }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const rows: unknown = await res.json();
    return Array.isArray(rows) ? (rows as SgsRow[]) : [];
  } catch {
    return [];
  }
}

const lastValue = (rows: SgsRow[]): number | null => {
  const raw = rows.at(-1)?.valor;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/**
 * Doze meses de uma série mensal viram a taxa acumulada do período.
 *
 * Somar as variações mensais erra — 1% ao mês não é 12% ao ano. O acumulado é
 * o produto dos fatores, e é assim que o IPCA de 12 meses é publicado.
 */
function compound12(rows: SgsRow[]): number | null {
  if (rows.length < 12) return null;
  const factor = rows.slice(-12).reduce((acc, row) => {
    const monthly = Number(row.valor);
    return Number.isFinite(monthly) ? acc * (1 + monthly / 100) : acc;
  }, 1);
  return (factor - 1) * 100;
}

interface AwesomeQuote {
  code: string;
  codein: string;
  name: string;
  bid: string;
  pctChange: string;
}

async function awesome(pairs: string[]): Promise<Record<string, AwesomeQuote>> {
  try {
    const res = await fetch(`https://economia.awesomeapi.com.br/last/${pairs.join(',')}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, AwesomeQuote>;
  } catch {
    return {};
  }
}

const QUOTE_LABELS: Record<string, { label: string; symbol: string }> = {
  USDBRL: { label: 'Dólar americano', symbol: 'USD/BRL' },
  EURBRL: { label: 'Euro', symbol: 'EUR/BRL' },
  GBPBRL: { label: 'Libra', symbol: 'GBP/BRL' },
  ARSBRL: { label: 'Peso argentino', symbol: 'ARS/BRL' },
  BTCBRL: { label: 'Bitcoin', symbol: 'BTC/BRL' },
  ETHBRL: { label: 'Ethereum', symbol: 'ETH/BRL' },
  SOLBRL: { label: 'Solana', symbol: 'SOL/BRL' },
};

function toQuote(key: string, raw: AwesomeQuote | undefined): Quote {
  const meta = QUOTE_LABELS[key] ?? { label: key, symbol: key };
  const price = Number(raw?.bid);
  const change = Number(raw?.pctChange);
  return {
    id: key,
    symbol: meta.symbol,
    label: meta.label,
    price: Number.isFinite(price) ? price : null,
    changePercent: Number.isFinite(change) ? change : null,
  };
}

/**
 * Blocos de mercado que ainda não têm fonte.
 *
 * Índices, commodities e papéis da B3 não têm API pública, gratuita e sem
 * chave que seja confiável — ao contrário do Banco Central e do câmbio. O
 * contrato já prevê os campos e a resposta diz que estão pendentes, então
 * ligar um provedor depois é preencher estes arrays: nem a rota nem a tela
 * mudam de forma.
 *
 * Nada de fonte improvisada ou número inventado no lugar. Em tela de dinheiro,
 * um valor errado é pior do que um espaço vazio.
 */
export type MarketSection = 'indices' | 'commodities' | 'stocks' | 'funds' | 'treasury';

export interface PendingSection {
  id: MarketSection;
  label: string;
  reason: string;
}

const PENDING: PendingSection[] = [
  { id: 'indices', label: 'Índices', reason: 'Ibovespa, S&P 500 e Nasdaq' },
  { id: 'commodities', label: 'Commodities', reason: 'Petróleo Brent, WTI e ouro' },
  { id: 'stocks', label: 'Ações e FIIs', reason: 'papéis da B3 que você acompanha' },
];

export async function GET() {
  const [selicRows, cdiRows, ipcaRows, poupancaRows, fx] = await Promise.all([
    sgs(SGS.selic, 1),
    sgs(SGS.cdi, 1),
    sgs(SGS.ipca, 13),
    sgs(SGS.poupanca, 13),
    awesome(['USD-BRL', 'EUR-BRL', 'GBP-BRL', 'ARS-BRL', 'BTC-BRL', 'ETH-BRL', 'SOL-BRL']),
  ]);

  const ipca12 = compound12(ipcaRows);
  const poupanca12 = compound12(poupancaRows);
  const cdi = lastValue(cdiRows);

  const indicators: Indicator[] = [
    { id: 'selic', label: 'Selic', value: lastValue(selicRows), detail: 'meta do Copom, ao ano' },
    { id: 'cdi', label: 'CDI', value: cdi, detail: 'ao ano' },
    { id: 'ipca', label: 'IPCA 12m', value: ipca12, detail: 'inflação acumulada' },
    { id: 'poupanca', label: 'Poupança', value: poupanca12, detail: 'últimos 12 meses' },
  ];

  /**
   * Ganho real: o que sobra depois que a inflação come a rentabilidade.
   * A conta correta é (1+taxa)/(1+inflação)-1, não a subtração simples —
   * a diferença aparece justo quando os dois números são altos.
   */
  const realGain = (rate: number | null) =>
    rate != null && ipca12 != null ? ((1 + rate / 100) / (1 + ipca12 / 100) - 1) * 100 : null;

  const real = [
    { id: 'cdi', label: 'CDI', nominal: cdi, real: realGain(cdi) },
    { id: 'poupanca', label: 'Poupança', nominal: poupanca12, real: realGain(poupanca12) },
    { id: 'selic', label: 'Selic', nominal: lastValue(selicRows), real: realGain(lastValue(selicRows)) },
  ];

  const currencies = ['USDBRL', 'EURBRL', 'GBPBRL', 'ARSBRL'].map((k) => toQuote(k, fx[k]));
  const crypto = ['BTCBRL', 'ETHBRL', 'SOLBRL'].map((k) => toQuote(k, fx[k]));

  /**
   * Série mensal do IPCA, para o app comparar a inflação de quem usa com a
   * oficial. A data vem como DD/MM/AAAA no SGS e é convertida para competência.
   */
  const ipcaSeries = ipcaRows
    .map((row) => {
      const [, m, y] = row.data.split('/');
      const value = Number(row.valor);
      return y && m && Number.isFinite(value) ? { month: `${y}-${m}`, value } : null;
    })
    .filter((row): row is { month: string; value: number } => row !== null);

  return NextResponse.json(
    {
      indicators,
      real,
      currencies,
      crypto,
      ipcaSeries,
      /* já existem no contrato; ficam vazios até haver fonte */
      indices: [] as Quote[],
      commodities: [] as Quote[],
      stocks: [] as Quote[],
      pending: PENDING,
      fetchedAt: new Date().toISOString(),
    },
    { headers: { 'cache-control': `public, s-maxage=${revalidate}, stale-while-revalidate=900` } },
  );
}
