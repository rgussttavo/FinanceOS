import { describe, expect, it } from 'vitest';
import { parseAmountText, parseDateText, parseDelimited, parseOfx, parseStatementFile, statementIntegrity } from './statement';

/**
 * O leitor de extrato é a porta de entrada do dinheiro da pessoa. Cada caso
 * aqui é um formato que um banco de verdade produz; se um deles quebra, o app
 * mostra um valor que não é o do arquivo — e isso é o único erro que não pode
 * acontecer.
 */

describe('valores: o número do arquivo é o número do app', () => {
  const casos: [string, number][] = [
    ['1250,75', 125075],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1234.56', 123456],
    ['-1234.56', -123456],
    ['R$ 1.234,56', 123456],
    ['R$ -1.234,56', -123456],
    ['- R$ 12,00', -1200],
    ['-R$ 12,00', -1200],
    ['(1.234,56)', -123456],
    ['1.234,56-', -123456],
    ['50,00 D', -5000],
    ['50,00 C', 5000],
    ['0,01', 1],
    ['0,10', 10],
    ['999.999,99', 99999999],
    ['1 234,56', 123456],
    ['1500', 150000],
    // sinal de menos tipográfico, que planilhas e PDFs convertidos usam
    ['−12,50', -1250],
    ['– 12,50', -1250],
  ];
  for (const [texto, centavos] of casos) {
    it(`"${texto}" vira ${centavos} centavos`, () => {
      expect(parseAmountText(texto)).toBe(centavos);
    });
  }

  it('nunca perde centavo em conta de ponto flutuante', () => {
    // 1.005, 2.675 e amigos: multiplicar por 100 em float erra a última casa
    for (let reais = 0; reais < 3000; reais++) {
      for (const c of [1, 5, 9, 10, 15, 29, 35, 57, 99]) {
        const txt = `${reais},${String(c).padStart(2, '0')}`;
        expect(parseAmountText(txt)).toBe(reais * 100 + c);
      }
    }
  });
});

describe('datas: 30/09 continua 30/09', () => {
  it('formato brasileiro', () => {
    expect(parseDateText('30/09/2026')).toBe('2026-09-30');
    expect(parseDateText('01/10/2026')).toBe('2026-10-01');
    expect(parseDateText('3/9/26')).toBe('2026-09-03');
  });
  it('formato ISO e com hora junto', () => {
    expect(parseDateText('2026-09-30')).toBe('2026-09-30');
    expect(parseDateText('2026-09-30T23:59:59')).toBe('2026-09-30');
    expect(parseDateText('30/09/2026 23:59')).toBe('2026-09-30');
  });
  it('data impossível não vira outro dia', () => {
    expect(parseDateText('31/09/2026')).toBeNull();
    expect(parseDateText('29/02/2026')).toBeNull();
  });
});

const ofx = (body: string, extra = '') => `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0260<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
${body}
</BANKTRANLIST>${extra}
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const trn = (date: string, amount: string, name: string, fitid: string) =>
  `<STMTTRN><TRNTYPE>OTHER<DTPOSTED>${date}<TRNAMT>${amount}<FITID>${fitid}<MEMO>${name}</STMTTRN>`;

describe('OFX', () => {
  it('lê valor, sinal, descrição e identificador', () => {
    const p = parseOfx(ofx([trn('20260905', '-200.00', 'MERCADO', 'A1'), trn('20260910', '5000.00', 'SALARIO', 'A2')].join('\n')));
    expect(p.rows).toEqual([
      { date: '2026-09-05', description: 'MERCADO', amount: -20000, fitId: 'A1' },
      { date: '2026-09-10', description: 'SALARIO', amount: 500000, fitId: 'A2' },
    ]);
    expect(p.accountKey).toBe('0260:12345-6');
  });

  it('OFX com vírgula decimal (banco brasileiro fora da norma)', () => {
    const p = parseOfx(ofx(trn('20260905', '-50,00', 'PADARIA', 'B1')));
    expect(p.rows[0].amount).toBe(-5000);
  });

  it('OFX segue a norma: ponto é decimal mesmo com três casas', () => {
    // TRNAMT é sempre ponto decimal; "1.500" é um real e meio, não mil e quinhentos
    const p = parseOfx(ofx([trn('20260905', '-1.500', 'TARIFA', 'C1'), trn('20260906', '-12.50', 'CAFE', 'C2')].join('\n')));
    expect(p.rows.map((r) => r.amount)).toEqual([-150, -1250]);
  });

  it('data com fuso: 02h de 1/10 em GMT é 30/09 em Brasília', () => {
    const p = parseOfx(ofx(trn('20261001020000[0:GMT]', '-10.00', 'X', 'D1')));
    expect(p.rows[0].date).toBe('2026-09-30');
  });

  it('data com fuso de Brasília fica como está', () => {
    const p = parseOfx(ofx(trn('20260930235959[-3:BRT]', '-10.00', 'X', 'D2')));
    expect(p.rows[0].date).toBe('2026-09-30');
  });

  it('guarda o saldo final que o banco informa, para conferir depois', () => {
    const p = parseOfx(
      ofx(trn('20260905', '-200.00', 'MERCADO', 'E1'), '<LEDGERBAL><BALAMT>3450.00<DTASOF>20260930</LEDGERBAL>'),
    );
    expect(p.balance?.closing).toEqual({ amount: 345000, date: '2026-09-30' });
  });
});

describe('CSV', () => {
  it('extrato brasileiro com ponto e vírgula, saldo e "saldo anterior"', () => {
    const csv = [
      'Extrato Conta Corrente',
      'Agência 1234 Conta 56789-0',
      '',
      'Data;Histórico;Valor;Saldo',
      '01/09/2026;SALDO ANTERIOR;;1.000,00',
      '02/09/2026;PIX RECEBIDO SALARIO;3.000,00;4.000,00',
      '03/09/2026;ALUGUEL;-500,00;3.500,00',
      '05/09/2026;MERCADO EXTRA;-200,00;3.300,00',
      '05/09/2026;UBER TRIP;-100,00;3.200,00',
      '10/09/2026;TED RECEBIDA;500,00;3.700,00',
      '15/09/2026;PAGAMENTO FATURA CARTAO;-250,00;3.450,00',
      '30/09/2026;SALDO DO DIA;;3.450,00',
    ].join('\n');
    const p = parseDelimited(csv);
    expect(p.rows.map((r) => [r.date, r.amount])).toEqual([
      ['2026-09-02', 300000],
      ['2026-09-03', -50000],
      ['2026-09-05', -20000],
      ['2026-09-05', -10000],
      ['2026-09-10', 50000],
      ['2026-09-15', -25000],
    ]);
    expect(p.balance?.opening).toEqual({ amount: 100000, date: '2026-09-01' });
    expect(p.balance?.closing).toEqual({ amount: 345000, date: '2026-09-30' });
    // a coluna de saldo linha a linha também vem, para achar onde a conta desvia
    expect(p.rows.map((r) => r.balanceAfter)).toEqual([400000, 350000, 330000, 320000, 370000, 345000]);
  });

  it('não descarta transação só porque o nome começa com "Total" ou "Saldo"', () => {
    const csv = ['Data;Descrição;Valor', '05/09/2026;TOTAL ACADEMIA;-99,90', '06/09/2026;Saldo Devedor Cheque Especial Juros;-12,34'].join('\n');
    const p = parseDelimited(csv);
    expect(p.rows.map((r) => r.amount)).toEqual([-9990, -1234]);
  });

  it('crédito e débito em colunas separadas', () => {
    const csv = ['Data;Descrição;Crédito;Débito', '02/09/2026;SALARIO;3.000,00;', '03/09/2026;ALUGUEL;;500,00'].join('\n');
    const p = parseDelimited(csv);
    expect(p.rows.map((r) => r.amount)).toEqual([300000, -50000]);
  });

  it('CSV do Nubank (vírgula, ponto decimal)', () => {
    const csv = ['Data,Valor,Identificador,Descrição', '01/09/2026,-12.50,abc-1,Padaria', '02/09/2026,1500.00,abc-2,Transferência recebida'].join('\n');
    const p = parseDelimited(csv);
    expect(p.rows.map((r) => r.amount)).toEqual([-1250, 150000]);
  });

  it('duas transações iguais no mesmo dia são duas', () => {
    const csv = ['Data;Descrição;Valor', '05/09/2026;CAFE;-6,00', '05/09/2026;CAFE;-6,00'].join('\n');
    expect(parseDelimited(csv).rows).toHaveLength(2);
  });
});

describe('planilha', () => {
  it('XLSX com data de verdade e número de verdade', async () => {
    const XLSX = await import('@e965/xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Data', 'Descrição', 'Valor'],
      [new Date(2026, 8, 30), 'MERCADO', -200.5],
      [new Date(2026, 9, 1), 'SALARIO', 5000],
    ], { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const p = await parseStatementFile(new File([bytes], 'extrato.xlsx'));
    expect(p.rows.map((r) => [r.date, r.amount])).toEqual([
      ['2026-09-30', -20050],
      ['2026-10-01', 500000],
    ]);
  });
});

describe('o arquivo confere consigo mesmo', () => {
  it('um valor lido com o sinal trocado aparece no dia exato', () => {
    // o banco diz 3.500 depois do aluguel; se o aluguel fosse lido como +500, o dia não fecha
    const csv = ['Data;Histórico;Valor;Saldo', '01/09/2026;SALDO ANTERIOR;;1.000,00', '02/09/2026;SALARIO;3.000,00;4.000,00', '03/09/2026;ALUGUEL;500,00;3.500,00'].join('\n');
    const integ = statementIntegrity(parseDelimited(csv));
    expect(integ.ok).toBe(false);
    expect(integ.badDays).toEqual([{ date: '2026-09-03', expected: 450000, declared: 350000 }]);
  });

  it('dia listado em outra ordem ainda fecha', () => {
    const csv = [
      'Data;Histórico;Valor;Saldo',
      '01/09/2026;SALDO ANTERIOR;;100,00',
      '02/09/2026;B;-30,00;50,00',
      '02/09/2026;A;-20,00;80,00',
    ].join('\n');
    // o saldo corrido está em outra ordem que a das linhas; o fim do dia é 50
    const integ = statementIntegrity(parseDelimited(csv));
    expect(integ.badDays).toEqual([]);
  });

  it('sem saldo nenhum no arquivo, não finge que conferiu', () => {
    const integ = statementIntegrity(parseDelimited(['Data;Descrição;Valor', '02/09/2026;X;-10,00'].join('\n')));
    expect(integ.checked).toBe(false);
    expect(integ.ok).toBe(false);
  });
});
