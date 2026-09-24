/*
 * FinanceOS — service worker.
 *
 * Os dados já moram no aparelho (IndexedDB). O que faltava para o app abrir
 * sem internet era a casca: o HTML das páginas e os arquivos do build. É só
 * disso que este worker cuida.
 *
 * - Arquivos do build (/_next/static): têm o hash no nome e nunca mudam.
 *   Cache primeiro; a rede só na primeira vez.
 * - Páginas: rede primeiro, para quem está online ver sempre a versão
 *   publicada. Se a rede falha ou demora demais, vale a última cópia guardada.
 * - Ícones e manifesto: a cópia guardada responde na hora e a rede atualiza
 *   por trás.
 * - API (cotações, notícias, FIPE), Supabase e qualquer outro domínio: não
 *   passam por aqui. Dado de mercado velho, servido como se fosse novo, seria
 *   pior do que avisar que está sem conexão.
 */

const VERSION = 'v1';
const STATIC = `financeos-static-${VERSION}`;
const PAGES = `financeos-pages-${VERSION}`;
const ASSETS = `financeos-assets-${VERSION}`;
const KEEP = [STATIC, PAGES, ASSETS];

/** páginas que a rede tem este tempo para responder antes da cópia guardada entrar */
const NETWORK_TIMEOUT = 3500;
/** o build antigo se acumula a cada publicação; mais que isso, sai o mais velho */
const STATIC_LIMIT = 300;

/** o mínimo para a aba e o ícone aparecerem certos mesmo sem rede */
const SHELL_ASSETS = ['/favicon.ico', '/icon.svg', '/icon-192.png', '/manifest.webmanifest'];

// sem skipWaiting na instalação: a primeira versão assume sozinha (não há
// outra), e as seguintes esperam a pessoa tocar em "Atualizar"
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('financeos-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'WARM') {
    event.waitUntil(warm(Array.isArray(data.urls) ? data.urls : [], typeof data.page === 'string' ? data.page : null));
  }
});

/** guarda o que a página baixou antes de este worker existir */
async function warm(urls, page) {
  const cache = await caches.open(STATIC);
  await Promise.all(
    urls
      .filter((u) => sameOrigin(u) && new URL(u).pathname.startsWith('/_next/static/'))
      .map(async (u) => {
        if (await cache.match(u)) return;
        try {
          const res = await fetch(u);
          if (res.ok) await cache.put(u, res);
        } catch {
          // sem rede agora: entra na próxima vez
        }
      }),
  );
  // a página só na primeira vez; depois quem a mantém em dia é a própria navegação
  const pages = await caches.open(PAGES);
  if (page && isPagePath(page) && !(await pages.match(page))) {
    try {
      const res = await fetch(page, { credentials: 'same-origin' });
      if (res.ok && isHtml(res)) await pages.put(page, res);
    } catch {
      // idem
    }
  }
  await trim(STATIC, STATIC_LIMIT);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // navegação interna do Next (RSC): sem rede, ele mesmo cai para a página inteira
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  if (req.mode === 'navigate') {
    if (!isPagePath(url.pathname)) return;
    event.respondWith(page(event, url));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (/\.(png|svg|ico|webmanifest|json)$/.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

/* ----------------------------------------------------------------- páginas */

async function page(event, url) {
  const cache = await caches.open(PAGES);
  // a cópia é guardada pelo caminho: /app?code=… e /app são a mesma casca
  const key = url.pathname;

  const network = fetch(event.request)
    .then(async (res) => {
      if (res.ok && isHtml(res) && !url.search) await cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);

  const saved = await cache.match(key);
  if (!saved) {
    const res = await network;
    return res || offline();
  }

  // com cópia guardada, a rede tem um tempo para responder; depois disso vale a cópia
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT));
  event.waitUntil(network);
  const res = await Promise.race([network, timeout]);
  return res || saved;
}

/** sem rede e sem cópia desta página: um aviso simples, na cara do app */
function offline() {
  return new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/* ----------------------------------------------------------------- arquivos */

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    void trim(STATIC, STATIC_LIMIT);
  }
  return res;
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(ASSETS);
  // o favicon vem com um sufixo de versão na busca (?favicon.abc.ico)
  const hit = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req)
    .then(async (res) => {
      if (res.ok) await cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

async function trim(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

/* -------------------------------------------------------------------- util */

function sameOrigin(u) {
  try {
    return new URL(u).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isPagePath(pathname) {
  return pathname === '/' || pathname === '/app' || pathname === '/demo';
}

function isHtml(res) {
  return (res.headers.get('Content-Type') || '').includes('text/html');
}

const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0b0c">
<title>Sem conexão · FinanceOS</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b0c; color: #f5f3ee;
         font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px; box-sizing: border-box; }
  main { max-width: 34ch; text-align: center; }
  h1 { font-weight: 500; font-size: 26px; margin: 16px 0 8px; }
  p { color: #a5a29a; margin: 0 0 20px; }
  button { font: inherit; font-weight: 600; background: #c9a36b; color: #17140d; border: 0; border-radius: 12px; height: 44px; padding: 0 20px; cursor: pointer; }
</style>
</head>
<body>
<main>
  <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="none" stroke="#c9a36b" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" fill="#c9a36b"/></svg>
  <h1>Sem conexão agora</h1>
  <p>Esta página ainda não foi aberta com internet neste aparelho. Depois da primeira vez, o FinanceOS abre mesmo offline.</p>
  <button type="button" onclick="location.reload()">Tentar de novo</button>
</main>
</body>
</html>`;
