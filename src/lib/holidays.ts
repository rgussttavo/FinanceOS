import { addDaysIso, partsToIso } from './dates';
import type { IsoDate } from './types';

/**
 * Feriados nacionais, calculados — não baixados.
 *
 * Os fixos são data; os móveis giram em torno da Páscoa, que sai de uma conta
 * conhecida desde o século XIX. Calcular aqui mantém o calendário funcionando
 * offline e sem depender de ninguém para saber que o boleto do dia 7 de
 * setembro só compensa no dia 8.
 */

export interface Holiday {
  date: IsoDate;
  name: string;
  /** banco fecha? ponto facultativo não fecha agência em todo lugar */
  bankClosed: boolean;
}

const FIXED: [number, number, string][] = [
  [1, 1, 'Confraternização Universal'],
  [4, 21, 'Tiradentes'],
  [5, 1, 'Dia do Trabalho'],
  [9, 7, 'Independência do Brasil'],
  [10, 12, 'Nossa Senhora Aparecida'],
  [11, 2, 'Finados'],
  [11, 15, 'Proclamação da República'],
  [11, 20, 'Consciência Negra'],
  [12, 25, 'Natal'],
];

/** domingo de Páscoa pelo algoritmo anônimo gregoriano (Meeus/Jones/Butcher) */
function easter(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return partsToIso(year, month - 1, day);
}

const cache = new Map<number, Holiday[]>();

export function holidaysOf(year: number): Holiday[] {
  const hit = cache.get(year);
  if (hit) return hit;

  const e = easter(year);
  const list: Holiday[] = [
    ...FIXED.map(([m, d, name]) => ({ date: partsToIso(year, m - 1, d), name, bankClosed: true })),
    { date: addDaysIso(e, -48), name: 'Carnaval', bankClosed: true },
    { date: addDaysIso(e, -47), name: 'Carnaval', bankClosed: true },
    { date: addDaysIso(e, -2), name: 'Sexta-feira Santa', bankClosed: true },
    { date: addDaysIso(e, 60), name: 'Corpus Christi (ponto facultativo)', bankClosed: false },
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  cache.set(year, list);
  return list;
}

/** feriados entre duas datas, inclusive */
export function holidaysBetween(from: IsoDate, to: IsoDate): Holiday[] {
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const out: Holiday[] = [];
  for (let y = y1; y <= y2; y++) {
    for (const h of holidaysOf(y)) if (h.date >= from && h.date <= to) out.push(h);
  }
  return out;
}
