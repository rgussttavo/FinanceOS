import { describe, expect, it } from 'vitest';
import { scanCode } from './scan';

/** um Pix copia e cola montado bloco a bloco (id + tamanho + valor) */
function pix(amount: string | null): string {
  const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  return [
    tlv('00', '01'),
    tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', 'fulano@exemplo.com')),
    tlv('52', '0000'),
    tlv('53', '986'),
    amount ? tlv('54', amount) : '',
    tlv('58', 'BR'),
    tlv('59', 'Fulano de Tal'),
    tlv('60', 'Brasilia'),
    '6304ABCD',
  ].join('');
}

describe('Pix copia e cola', () => {
  it('lê o valor em centavos exatos', () => {
    expect(scanCode(pix('10.05'))).toMatchObject({ kind: 'pix', amount: 1005 });
    expect(scanCode(pix('1234.56'))).toMatchObject({ kind: 'pix', amount: 123456 });
  });

  it('valor com mais casas segue a regra única de arredondamento (FIN-010)', () => {
    expect(scanCode(pix('1.005'))?.amount).toBe(101);
    expect(scanCode(pix('2.675'))?.amount).toBe(268);
  });

  it('Pix sem valor deixa o valor em aberto', () => {
    expect(scanCode(pix(null))).toMatchObject({ kind: 'pix', amount: null });
  });
});
