import { NextResponse } from 'next/server';

/**
 * Notícias de economia, vindas de vários RSS brasileiros.
 *
 * A busca acontece no servidor de propósito: RSS não manda cabeçalho de CORS,
 * então um app que tenta ler direto do navegador precisa de proxy público de
 * terceiros para funcionar — três ou quatro deles, em cascata, porque vivem
 * caindo. Aqui o próprio Next faz a chamada, sem intermediário e sem entregar
 * o tráfego de quem usa o app para serviço nenhum.
 */

export const revalidate = 600; // dez minutos: notícia de economia não muda a cada clique

interface Feed {
  id: string;
  source: string;
  url: string;
}

const FEEDS: Feed[] = [
  { id: 'g1', source: 'G1 Economia', url: 'https://g1.globo.com/dynamo/economia/rss2.xml' },
  { id: 'infomoney', source: 'InfoMoney', url: 'https://www.infomoney.com.br/mercados/feed/' },
  { id: 'moneytimes', source: 'Money Times', url: 'https://www.moneytimes.com.br/feed/' },
  { id: 'exame', source: 'Exame Invest', url: 'https://exame.com/invest/feed/' },
  { id: 'valor', source: 'Valor Investe', url: 'https://valorinveste.globo.com/rss/valorinveste/' },
];

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  image: string | null;
}

/** tira CDATA e devolve as entidades ao texto normal */
function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagValue(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decode(match[1]) : null;
}

/** a imagem do item vem em um de três lugares, conforme o feed */
function itemImage(block: string): string | null {
  const patterns = [
    /<media:content[^>]+url="([^"]+)"/i,
    /<media:thumbnail[^>]+url="([^"]+)"/i,
    /<enclosure[^>]+url="([^"]+)"[^>]*type="image/i,
    /<enclosure[^>]+type="image[^"]*"[^>]*url="([^"]+)"/i,
    /<img[^>]+src="([^"]+)"/i,
  ];
  for (const rx of patterns) {
    const hit = block.match(rx);
    if (hit?.[1]) return hit[1];
  }
  return null;
}

function parseFeed(xml: string, feed: Feed): NewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const out: NewsItem[] = [];

  for (const block of blocks) {
    const title = tagValue(block, 'title');
    const linkTag = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const link = linkTag ? decode(linkTag[1]) : null;
    if (!title || !link) continue;

    const pub = tagValue(block, 'pubDate') ?? tagValue(block, 'dc:date');
    const date = pub ? new Date(pub) : null;

    out.push({
      id: `${feed.id}:${link}`,
      title,
      link,
      source: feed.source,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      image: itemImage(block),
    });
  }

  return out;
}

async function loadFeed(feed: Feed): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'user-agent': 'FinanceOS/1.0 (+leitor de RSS)' },
      next: { revalidate },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed);
  } catch {
    // uma fonte fora do ar não pode derrubar a tela inteira
    return [];
  }
}

export async function GET() {
  const results = await Promise.all(FEEDS.map(loadFeed));

  const seen = new Set<string>();
  const items = results
    .flat()
    .filter((item) => {
      // a mesma manchete costuma sair em dois portais; vale a primeira
      const key = item.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 30);

  return NextResponse.json(
    { items, fetchedAt: new Date().toISOString() },
    { headers: { 'cache-control': `public, s-maxage=${revalidate}, stale-while-revalidate=1800` } },
  );
}
