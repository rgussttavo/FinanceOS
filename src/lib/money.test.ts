import { describe, expect, it } from 'vitest';
import { decimalToCents, numberToCents, parseMoney, splitCents } from './money';

/**
 * Texto e número para centavos (FIN-010).
 *
 * A regra é uma só, em todo lugar que grava dinheiro: meio para cima, sobre o
 * valor absoluto — 2,675 vira 2,68 e −1,005 vira −1,01. O que mudou foi a
 * conta: ela é feita nos dígitos, e não multiplicando ponto flutuante por
 * 100, que fazia 1,005 virar 1,00 e 2,675 virar 2,68 no mesmo arquivo.
 */

describe('decimalToCents: a conta nos dígitos', () => {
  const casos: [string, number | null][] = [
    ['0', 0],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1.005', 101],
    ['2.675', 268],
    ['10.555', 1056],
    ['0.005', 1],
    ['0.0049', 0],
    ['1.0049', 100],
    ['10.5551', 1056],
    ['10.5549', 1055],
    ['-1.005', -101],
    ['-2.675', -268],
    ['.5', 50],
    ['999999999999.995', 100000000000000],
    ['9999999999999.99', 999999999999999],
    // passa do que um número do JavaScript guarda sem perder centavo: recusa em vez de errar
    ['99999999999999.99', null],
    ['abc', null],
    ['', null],
    ['1.2.3', null],
  ];
  for (const [texto, centavos] of casos) {
    it(`"${texto}" → ${centavos}`, () => expect(decimalToCents(texto)).toBe(centavos));
  }
});

describe('numberToCents: número de planilha', () => {
  const casos: [number, number | null][] = [
    [2.675, 268],
    [1.005, 101],
    [0.1 + 0.2, 30],
    [-2.675, -268],
    [12345678.9, 1234567890],
    [1e-7, 0],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [1e21, null],
  ];
  for (const [n, centavos] of casos) {
    it(`${n} → ${centavos}`, () => expect(numberToCents(n)).toBe(centavos));
  }
});

describe('parseMoney: o que se digita nos formulários', () => {
  const casos: [string, number | null][] = [
    ['1,005', 101],
    ['2,675', 268],
    ['10,555', 1056],
    ['-1,005', -101],
    ['1.234,567', 123457],
    // o comportamento de sempre continua
    ['12,50', 1250],
    ['12.50', 1250],
    ['5.800', 580000],
    ['1.250.000', 125000000],
    ['R$ 1.234,56', 123456],
    ['', null],
    ['abc', null],
  ];
  for (const [texto, centavos] of casos) {
    it(`"${texto}" → ${centavos}`, () => expect(parseMoney(texto)).toBe(centavos));
  }
});

describe('divisão sem perder centavo', () => {
  it('as partes somam o total, com a sobra nas primeiras', () => {
    expect(splitCents(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitCents(1, 3)).toEqual([1, 0, 0]);
  });
});
