/**
 * Catálogo de serviços de assinatura.
 *
 * Serve para que digitar "netflix" já traga o logotipo, a cor e a inicial
 * certos, sem a pessoa escolher nada. O que não está aqui continua funcionando:
 * vira uma marca d'água com as iniciais do nome e uma cor tirada do próprio
 * texto, que é estável — o mesmo nome dá sempre a mesma cor.
 */

export interface ServiceInfo {
  /** termos que identificam o serviço na descrição digitada */
  keys: string[];
  name: string;
  domain: string;
  color: string;
  /** o que aparece quando o logotipo não carrega */
  initials: string;
}

export const SERVICE_CATALOG: ServiceInfo[] = [
  // vídeo
  { keys: ['netflix'], name: 'Netflix', domain: 'netflix.com', color: '#e50914', initials: 'N' },
  { keys: ['disney'], name: 'Disney+', domain: 'disneyplus.com', color: '#0063e5', initials: 'D+' },
  { keys: ['prime video', 'prime'], name: 'Prime Video', domain: 'primevideo.com', color: '#00a8e1', initials: 'PV' },
  { keys: ['max', 'hbo'], name: 'Max', domain: 'max.com', color: '#002be7', initials: 'M' },
  { keys: ['globoplay', 'globo'], name: 'Globoplay', domain: 'globo.com', color: '#fa3a4a', initials: 'G' },
  { keys: ['paramount'], name: 'Paramount+', domain: 'paramountplus.com', color: '#0064ff', initials: 'P+' },
  { keys: ['apple tv'], name: 'Apple TV+', domain: 'apple.com', color: '#101014', initials: 'tv' },
  { keys: ['crunchyroll'], name: 'Crunchyroll', domain: 'crunchyroll.com', color: '#f47521', initials: 'CR' },
  { keys: ['telecine'], name: 'Telecine', domain: 'telecine.com.br', color: '#ff4e00', initials: 'T' },
  { keys: ['premiere'], name: 'Premiere', domain: 'globo.com', color: '#00a651', initials: 'P' },
  { keys: ['mubi'], name: 'MUBI', domain: 'mubi.com', color: '#001eff', initials: 'M' },
  // música e áudio
  { keys: ['spotify'], name: 'Spotify', domain: 'spotify.com', color: '#1db954', initials: 'S' },
  { keys: ['youtube premium', 'youtube'], name: 'YouTube Premium', domain: 'youtube.com', color: '#ff0000', initials: 'YT' },
  { keys: ['apple music'], name: 'Apple Music', domain: 'apple.com', color: '#fa243c', initials: 'AM' },
  { keys: ['deezer'], name: 'Deezer', domain: 'deezer.com', color: '#a238ff', initials: 'D' },
  { keys: ['tidal'], name: 'Tidal', domain: 'tidal.com', color: '#1a1a1a', initials: 'T' },
  { keys: ['amazon music'], name: 'Amazon Music', domain: 'music.amazon.com', color: '#46c3d0', initials: 'AM' },
  { keys: ['audible'], name: 'Audible', domain: 'audible.com', color: '#f8991c', initials: 'A' },
  { keys: ['ubook'], name: 'Ubook', domain: 'ubook.com', color: '#ff4f00', initials: 'U' },
  { keys: ['skeelo'], name: 'Skeelo', domain: 'skeelo.com', color: '#6c3ce9', initials: 'S' },
  // nuvem e produtividade
  { keys: ['icloud'], name: 'iCloud+', domain: 'icloud.com', color: '#0a84ff', initials: 'iC' },
  { keys: ['google one'], name: 'Google One', domain: 'one.google.com', color: '#4285f4', initials: 'G1' },
  { keys: ['dropbox'], name: 'Dropbox', domain: 'dropbox.com', color: '#0061ff', initials: 'DB' },
  { keys: ['microsoft', 'office', '365'], name: 'Microsoft 365', domain: 'microsoft.com', color: '#0078d4', initials: 'MS' },
  { keys: ['notion'], name: 'Notion', domain: 'notion.so', color: '#101014', initials: 'N' },
  { keys: ['adobe'], name: 'Adobe', domain: 'adobe.com', color: '#fa0f00', initials: 'Ai' },
  { keys: ['canva'], name: 'Canva', domain: 'canva.com', color: '#00c4cc', initials: 'C' },
  { keys: ['figma'], name: 'Figma', domain: 'figma.com', color: '#f24e1e', initials: 'F' },
  // inteligência artificial
  { keys: ['chatgpt', 'openai'], name: 'ChatGPT', domain: 'chatgpt.com', color: '#10a37f', initials: 'AI' },
  { keys: ['claude', 'anthropic'], name: 'Claude', domain: 'claude.ai', color: '#d97757', initials: 'C' },
  { keys: ['gemini'], name: 'Gemini', domain: 'gemini.google.com', color: '#4285f4', initials: 'G' },
  { keys: ['perplexity'], name: 'Perplexity', domain: 'perplexity.ai', color: '#20808d', initials: 'P' },
  { keys: ['copilot', 'github'], name: 'GitHub', domain: 'github.com', color: '#24292e', initials: 'GH' },
  { keys: ['cursor'], name: 'Cursor', domain: 'cursor.com', color: '#1a1a1a', initials: 'C' },
  { keys: ['midjourney'], name: 'Midjourney', domain: 'midjourney.com', color: '#1a1a1a', initials: 'MJ' },
  // jogos
  { keys: ['playstation', 'ps plus'], name: 'PlayStation Plus', domain: 'playstation.com', color: '#003791', initials: 'PS' },
  { keys: ['xbox', 'game pass'], name: 'Xbox Game Pass', domain: 'xbox.com', color: '#107c10', initials: 'XB' },
  { keys: ['nintendo'], name: 'Nintendo Switch Online', domain: 'nintendo.com', color: '#e60012', initials: 'NS' },
  { keys: ['twitch'], name: 'Twitch', domain: 'twitch.tv', color: '#9146ff', initials: 'Tw' },
  { keys: ['discord'], name: 'Discord', domain: 'discord.com', color: '#5865f2', initials: 'D' },
  // educação
  { keys: ['duolingo'], name: 'Duolingo', domain: 'duolingo.com', color: '#58cc02', initials: 'Du' },
  { keys: ['udemy'], name: 'Udemy', domain: 'udemy.com', color: '#a435f0', initials: 'U' },
  { keys: ['coursera'], name: 'Coursera', domain: 'coursera.org', color: '#0056d2', initials: 'C' },
  { keys: ['alura'], name: 'Alura', domain: 'alura.com.br', color: '#051d3b', initials: 'A' },
  { keys: ['descomplica'], name: 'Descomplica', domain: 'descomplica.com.br', color: '#7c4dff', initials: 'D' },
  { keys: ['babbel'], name: 'Babbel', domain: 'babbel.com', color: '#ff7900', initials: 'B' },
  { keys: ['rocketseat'], name: 'Rocketseat', domain: 'rocketseat.com.br', color: '#8257e6', initials: 'RS' },
  // serviços do dia a dia
  { keys: ['ifood'], name: 'iFood', domain: 'ifood.com.br', color: '#ea1d2c', initials: 'iF' },
  { keys: ['rappi'], name: 'Rappi', domain: 'rappi.com.br', color: '#ff441f', initials: 'R' },
  { keys: ['uber'], name: 'Uber', domain: 'uber.com', color: '#101014', initials: 'U' },
  { keys: ['mercado livre', 'meli'], name: 'Mercado Livre', domain: 'mercadolivre.com.br', color: '#ffd400', initials: 'M+' },
  { keys: ['amazon'], name: 'Amazon', domain: 'amazon.com.br', color: '#232f3e', initials: 'A' },
  { keys: ['smart fit', 'smartfit'], name: 'Smart Fit', domain: 'smartfit.com.br', color: '#fdd000', initials: 'SF' },
  { keys: ['wellhub', 'gympass'], name: 'Wellhub', domain: 'wellhub.com', color: '#ff4d3c', initials: 'W' },
  { keys: ['petlove'], name: 'Petlove', domain: 'petlove.com.br', color: '#d81b8c', initials: 'P' },
  { keys: ['wine'], name: 'Wine', domain: 'wine.com.br', color: '#7d1f4e', initials: 'W' },
  { keys: ['linkedin'], name: 'LinkedIn', domain: 'linkedin.com', color: '#0a66c2', initials: 'in' },
  { keys: ['tinder'], name: 'Tinder', domain: 'tinder.com', color: '#fe3c72', initials: 'T' },
  { keys: ['bumble'], name: 'Bumble', domain: 'bumble.com', color: '#ffc629', initials: 'B' },
  { keys: ['x premium', 'twitter'], name: 'X', domain: 'x.com', color: '#101014', initials: 'X' },
  { keys: ['telegram'], name: 'Telegram Premium', domain: 'telegram.org', color: '#229ed9', initials: 'TG' },
  // telecom e imprensa
  { keys: ['vivo'], name: 'Vivo', domain: 'vivo.com.br', color: '#660099', initials: 'V' },
  { keys: ['claro'], name: 'Claro', domain: 'claro.com.br', color: '#ee2e24', initials: 'C' },
  { keys: ['tim'], name: 'TIM', domain: 'tim.com.br', color: '#0033a0', initials: 'T' },
  { keys: ['oi'], name: 'Oi', domain: 'oi.com.br', color: '#ffd400', initials: 'Oi' },
  { keys: ['folha'], name: 'Folha de S.Paulo', domain: 'folha.uol.com.br', color: '#005ead', initials: 'F' },
  { keys: ['estadao'], name: 'Estadão', domain: 'estadao.com.br', color: '#143c8c', initials: 'E' },
  { keys: ['uol'], name: 'UOL', domain: 'uol.com.br', color: '#ff8000', initials: 'U' },
  { keys: ['o globo'], name: 'O Globo', domain: 'oglobo.globo.com', color: '#005098', initials: 'OG' },
];

const norm = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/**
 * Identifica o serviço pelo nome digitado.
 *
 * O termo mais longo ganha, senão "max" acerta dentro de "Max" e de
 * "Telecine Max" indistintamente, e "globo" roubaria "globoplay".
 */
export function matchService(name: string): ServiceInfo | null {
  const n = norm(name);
  if (n.length < 2) return null;

  let best: { info: ServiceInfo; length: number } | null = null;
  for (const info of SERVICE_CATALOG) {
    for (const key of info.keys) {
      const k = norm(key);
      if (!n.includes(k)) continue;
      if (!best || k.length > best.length) best = { info, length: k.length };
    }
  }
  return best?.info ?? null;
}

/** paleta de reserva para serviço que não está no catálogo */
const FALLBACK_COLORS = [
  '#e0463c', '#ff6482', '#ff9500', '#d99a00', '#4f9d4f',
  '#22b8d4', '#0a6fd6', '#6450e0', '#af52de', '#a2845e',
];

/**
 * Cor estável a partir do nome: o mesmo texto dá sempre a mesma cor, então a
 * lista não muda de aparência a cada recarregamento.
 */
export function colorFromName(name: string): string {
  const n = norm(name);
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/** até duas letras, tiradas das iniciais das palavras do nome */
export function initialsFromName(name: string): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export interface ServiceIdentity {
  name: string;
  domain: string;
  color: string;
  initials: string;
  /** veio do catálogo (tem logotipo de verdade) ou foi deduzido? */
  known: boolean;
}

/** a identidade visual de uma assinatura, reconhecida ou deduzida */
export function identify(name: string, overrideDomain = '', overrideColor = ''): ServiceIdentity {
  const hit = matchService(name);
  return {
    name: name.trim() || hit?.name || 'Assinatura',
    domain: overrideDomain || hit?.domain || '',
    color: overrideColor || hit?.color || colorFromName(name),
    initials: hit?.initials ?? initialsFromName(name),
    known: Boolean(hit),
  };
}
