/**
 * A parte do tema que roda antes do React: a chave gravada no navegador e o
 * script do <head> que aplica o claro antes do primeiro paint. Sem ele, quem
 * escolheu claro veria um lampejo escuro a cada abertura.
 *
 * Fica separada de `theme.ts` para o layout (componente de servidor) poder
 * importar sem levar hooks junto.
 */

export const THEME_KEY = 'norte-theme';

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches))document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`;
