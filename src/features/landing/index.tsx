import * as React from 'react';
import Link from 'next/link';
import {
  Calculator,
  ClipboardList,
  FileText,
  Newspaper,
  ScanLine,
  Search,
  Sparkles,
  TrendingUp,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { WEEKDAYS_SHORT_PT } from '@/lib/dates';
import { TopBar, Trilho } from './chrome';
import {
  MockAssinaturas,
  MockCalendario,
  MockCartoes,
  MockDividas,
  MockImportar,
  MockMetas,
  MockPatrimonio,
  MockRateio,
  MockTrajetoria,
} from './mocks';

/**
 * A vitrine.
 *
 * A página conta um mês, do dia 1 ao dia 30, e cada parada é a tela que faz
 * diferença naquele dia. É a ideia do produto dita em forma de página: o fim
 * do mês visto do começo. Uma lista de recursos numerados diria o que o app
 * tem; o mês diz para que ele serve.
 *
 * Nada aqui promete o que o app não faz. Cada linha abaixo tem uma tela atrás,
 * e os números das maquetes são exemplos, ditos como exemplos.
 */

const botaoPrimario =
  'inline-flex h-12 items-center justify-center rounded-field bg-accent px-8 text-[15px] font-medium text-accent-ink transition-[filter,transform] duration-[var(--t-fast)] hover:brightness-110 active:scale-[0.98]';

/* ------------------------------------------------------------------ topo */

function Hero() {
  return (
    <header className="relative overflow-hidden px-5 pb-16 pt-28 sm:pb-24 sm:pt-32">
      <span
        aria-hidden
        className="pointer-events-none absolute right-[-10rem] top-10 -z-10 size-[40rem] rounded-full opacity-[0.14] blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 66%)' }}
      />

      <div className="mx-auto grid max-w-[72rem] items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-[13px] text-ink-3">
            Salário no dia 5, fatura no dia 8, Pix a toda hora.
          </p>

          <h1 className="mt-4 font-display text-[44px] leading-[1.02] tracking-[-0.015em] text-ink sm:text-[64px]">
            Saiba quanto sobra <span className="text-accent">antes</span> do mês acabar.
          </h1>

          <p className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-ink-2">
            Traga o extrato do banco e o {BRAND.name} desenha o seu mês dia a dia: o que já saiu, o
            que ainda cai e o dia exato em que o saldo aperta — a tempo de fazer alguma coisa.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/app" className={cn(botaoPrimario, 'w-full sm:w-auto')}>
              Começar agora
            </Link>
            <a
              href="#mes"
              className="inline-flex h-12 w-full items-center justify-center rounded-field border border-line px-8 text-[15px] text-ink-2 transition-colors duration-[var(--t-fast)] hover:bg-surface-2 sm:w-auto"
            >
              Ver um mês por dentro
            </a>
          </div>

          <p className="mt-4 text-[13px] text-ink-3">
            Grátis. Sem cadastro para começar e sem senha de banco.
          </p>
        </div>

        <div className="lg:pl-4">
          <MockTrajetoria />
          <p className="mt-3 text-center text-[12px] text-ink-3 lg:text-left">
            A escola do dia 15 põe o saldo no vermelho; o adiantamento do dia 20 cobre. Você fica
            sabendo no dia 14.
          </p>
        </div>
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------- fatos */

/**
 * O lugar do contador de usuários que toda landing tem. Nós temos zero, e
 * número inventado num site no ar é mentira com enfeite. Ficam três fatos que
 * qualquer um confere abrindo o app.
 */
function Fatos() {
  const fatos = [
    ['R$ 0', 'para usar tudo, sem plano pago'],
    ['7 formatos', 'de extrato: OFX, CSV, XLSX, XLS, QIF, ODS e TXT'],
    ['0', 'senhas de banco pedidas'],
  ] as const;

  return (
    <section className="border-y border-line bg-surface/40 px-5">
      <ul className="mx-auto grid max-w-[72rem] divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {fatos.map(([numero, nota]) => (
          <li key={nota} className="flex items-baseline gap-3 py-5 sm:flex-col sm:gap-1 sm:px-6 sm:first:pl-0">
            <span className="amount shrink-0 text-[26px] text-accent">{numero}</span>
            <span className="text-[13px] leading-snug text-ink-3">{nota}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ o mês */

interface Parada {
  dia: number;
  etiqueta: string;
  titulo: string;
  texto: string;
  pontos?: readonly string[];
  maquete: React.ReactNode;
}

const PARADAS: readonly Parada[] = [
  {
    dia: 1,
    etiqueta: 'Importar extrato',
    titulo: 'O mês passado entra de uma vez',
    texto:
      'Baixe o extrato no app do banco e solte o arquivo aqui. Antes de gravar qualquer coisa, você vê linha por linha o que vai entrar.',
    pontos: [
      'O que já foi importado é reconhecido e pulado.',
      'O aluguel que você já tinha lançado vira baixa, não duplicata.',
      'Pagamento de fatura fica de fora: as compras do cartão já contam.',
      'O arquivo é lido no seu aparelho e não vai para servidor nenhum.',
    ],
    maquete: <MockImportar />,
  },
  {
    dia: 5,
    etiqueta: 'Calendário',
    titulo: 'O salário caiu. Quanto dele já tem dono?',
    texto:
      'Aluguel no 6, fatura no 8, escola no 15: o que vai sair aparece no dia em que sai, antes de sair. Feriados e a agenda do Copom e do IBGE no mesmo mês.',
    maquete: <MockCalendario hoje={5} />,
  },
  {
    dia: 8,
    etiqueta: 'Assinaturas',
    titulo: 'O que se renova sem pedir licença',
    texto:
      'Cada serviço com o valor e o dia da cobrança, somados num número por mês. As que estão no cartão entram na fatura sozinhas.',
    maquete: <MockAssinaturas />,
  },
  {
    dia: 12,
    etiqueta: 'Cartões',
    titulo: 'A compra em três vezes, nas três faturas certas',
    texto:
      'Comprou depois do fechamento, cai na fatura seguinte, como no banco. E o limite usado conta as parcelas que ainda vêm, não só a fatura do mês.',
    maquete: <MockCartoes />,
  },
  {
    dia: 18,
    etiqueta: 'Rateio',
    titulo: 'O churrasco fecha sem planilha no grupo',
    texto:
      'Anote quem pagou o quê. O app acerta no menor número de pagamentos e distribui a sobra de centavos um a um, para ninguém sair devendo um real.',
    maquete: <MockRateio />,
  },
  {
    dia: 22,
    etiqueta: 'Dívidas',
    titulo: 'A dívida que encolhe à vista',
    texto:
      'Parcelas pagas de um lado, o saldo do outro. E o simulador mostra se vale atacar a mais cara ou a menor primeiro.',
    maquete: <MockDividas />,
  },
  {
    dia: 26,
    etiqueta: 'Metas',
    titulo: 'Sobrou? Já tem destino',
    texto:
      'Quanto falta e quanto guardar por mês até o prazo. A meta ligada a um investimento sobe sozinha a cada aporte lançado.',
    maquete: <MockMetas />,
  },
  {
    dia: 30,
    etiqueta: 'Patrimônio',
    titulo: 'Fecha o mês e olha o todo',
    texto:
      'Bens somados ao que está investido. Carro e moto buscam o valor na tabela FIPE; imóvel é corrigido pelo IPCA desde a compra.',
    maquete: <MockPatrimonio />,
  },
];

function Mes() {
  return (
    <section id="mes" className="scroll-mt-20 px-5 pt-20 sm:pt-24">
      <div className="mx-auto max-w-[72rem]">
        <p className="text-[13px] text-ink-3">Setembro, do dia 1 ao dia 30</p>
        <h2 className="mt-2 max-w-[20ch] font-display text-[34px] leading-[1.08] text-ink sm:text-[44px]">
          Um mês inteiro, na ordem em que ele acontece
        </h2>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
          Cada parada abaixo é uma tela do app, no dia do mês em que ela faz diferença.
        </p>

        <ol className="mt-12">
          {PARADAS.map((p) => (
            <ParadaDoMes key={p.dia} parada={p} />
          ))}
        </ol>
      </div>
    </section>
  );
}

/** setembro de 2026 começa numa terça; o dia da semana sai daí, não de uma tabela */
const diaDaSemana = (dia: number) => WEEKDAYS_SHORT_PT[(1 + dia) % 7];

function ParadaDoMes({ parada }: { parada: Parada }) {
  const { dia, etiqueta, titulo, texto, pontos, maquete } = parada;

  return (
    <li
      id={`dia-${dia}`}
      className="grid scroll-mt-24 gap-6 border-t border-line py-12 lg:grid-cols-[7rem_minmax(0,1fr)_minmax(0,25rem)] lg:gap-10 lg:py-16"
    >
      <p className="flex items-baseline gap-3 lg:block">
        <span className="font-display text-[56px] leading-none text-accent tnum lg:text-[72px]">{dia}</span>
        <span className="text-[12px] uppercase tracking-[0.14em] text-ink-3 lg:mt-2 lg:block">
          {diaDaSemana(dia)}, set
        </span>
      </p>

      <div className="lg:pt-2">
        <p className="text-[12px] font-medium text-ink-3">{etiqueta}</p>
        <h3 className="mt-2 font-display text-[28px] leading-tight text-ink sm:text-[32px]">{titulo}</h3>
        <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-2">{texto}</p>
        {pontos ? (
          <ul className="mt-5 grid max-w-[44ch] gap-2.5">
            {pontos.map((ponto) => (
              <li key={ponto} className="flex gap-3 text-[14px] leading-relaxed text-ink-2">
                <span aria-hidden className="mt-[9px] h-px w-3 shrink-0 bg-accent" />
                {ponto}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>{maquete}</div>
    </li>
  );
}

/* ------------------------------------------------------------- ferramentas */

const FERRAMENTAS: readonly (readonly [LucideIcon, string, string])[] = [
  [ScanLine, 'Boleto e Pix copia e cola', 'Cole o código e o lançamento se preenche: valor, vencimento e tudo.'],
  [Newspaper, 'News', 'Manchetes de economia, moedas, cripto e os indicadores do Banco Central.'],
  [ClipboardList, 'Orçamento', 'Orce a viagem antes de gastar, com folga e a divisão por pessoa.'],
  [FileText, 'Comprovantes', 'Foto ou PDF em pastas, achável pelo nome e levado para os outros aparelhos.'],
  [Calculator, 'Simuladores', 'Câmbio, investimentos, empréstimo e quanto falta para viver de renda.'],
  [TrendingUp, 'Sua inflação', 'O quanto a sua vida subiu, comparado ao IPCA oficial.'],
  [Sparkles, 'Assistente', '“Quanto gastei com mercado em agosto?” — e a resposta vem com a lista.'],
  [Search, 'Busca em tudo', 'Um campo só acha lançamento, meta, cartão e comprovante.'],
  [WifiOff, 'Offline de verdade', 'Lança sem sinal no metrô; ao sair, já está no computador.'],
];

function Ferramentas() {
  return (
    <section className="border-t border-line bg-surface/40 px-5 py-20">
      <div className="mx-auto max-w-[72rem]">
        <h2 className="max-w-[22ch] font-display text-[30px] leading-tight text-ink sm:text-[36px]">
          E o que não tem dia certo, também está lá
        </h2>

        <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FERRAMENTAS.map(([Icone, titulo, texto]) => (
            <li key={titulo} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-field bg-accent-soft text-accent">
                <Icone size={18} strokeWidth={1.9} aria-hidden />
              </span>
              <span>
                <span className="block text-[15px] font-medium text-ink">{titulo}</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-ink-3">{texto}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- privacidade */

/**
 * Privacidade dita pelo que o app NÃO faz.
 *
 * Um produto novo não tem selo nem certificação, e inventar segurança é o
 * único tipo de mentira que machuca quem acreditou. O que dá para afirmar é o
 * que o código deixa de fazer — e isso qualquer um confere.
 */
const NAO_FAZ = [
  ['Não pede a senha do seu banco', 'Nem conecta em banco nenhum. O extrato entra por arquivo, quando você quiser.'],
  ['Não manda o seu extrato para servidor', 'O arquivo é lido no navegador. Só os lançamentos que você confirma entram na conta.'],
  ['Não depende de internet', 'Tudo é gravado no aparelho primeiro. Sem sinal, lança igual e sincroniza depois.'],
  ['Não guarda senha nenhuma', 'A entrada é por link ou código no e-mail. Senha que não existe não vaza.'],
  ['Não tem rastreador de anúncio', 'Nenhum pixel de terceiros, nenhuma métrica vendida. Seus números não são o produto.'],
  ['Não esconde nada atrás de pagamento', 'Não existe plano pago. O que está no app está liberado.'],
] as const;

function Privacidade() {
  return (
    <section className="border-t border-line px-5 py-20">
      <div className="mx-auto grid max-w-[72rem] gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 className="text-balance font-display text-[30px] leading-tight text-ink sm:text-[36px]">
            O que o {BRAND.name} não faz
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            Privacidade não é uma promessa na vitrine. É uma lista do que o app foi construído para
            nunca fazer.
          </p>
        </div>

        <ul className="grid gap-x-10 sm:grid-cols-2">
          {NAO_FAZ.map(([titulo, texto]) => (
            <li key={titulo} className="border-t border-line py-5">
              <p className="text-[15px] font-medium text-ink">{titulo}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">{texto}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- perguntas */

const FAQ = [
  [
    'É grátis mesmo?',
    'É. Não há plano pago, cobrança escondida nem recurso trancado esperando cartão. O app está em teste aberto e é assim que ele funciona hoje.',
  ],
  [
    'Preciso conectar meu banco?',
    'Não, e nem dá: o app não fala com banco nenhum. Se quiser trazer o histórico, baixe o extrato no app ou no site do banco e importe o arquivo. Ele é lido aqui, no seu aparelho.',
  ],
  [
    'Quais extratos dá para importar?',
    'OFX, CSV, XLSX, XLS, QIF, ODS e TXT, que são os formatos que os bancos exportam. Prefira OFX quando o banco oferecer, porque ele traz o identificador de cada transação. Fatura de cartão também entra, e a compra parcelada vira as parcelas certas.',
  ],
  [
    'E se eu importar o mesmo extrato duas vezes?',
    'Nada duplica. O que já entrou é reconhecido e pulado, e a conta que você já tinha lançada à mão é marcada como paga em vez de virar uma segunda.',
  ],
  [
    'Preciso criar conta para usar?',
    'Não para começar. Abra e use: tudo funciona antes de qualquer cadastro. A conta só serve para levar os seus dados a um segundo aparelho, e o que você já lançou vai junto.',
  ],
  [
    'Onde ficam meus dados?',
    'No seu aparelho, primeiro. Se você criar conta, eles também ficam no servidor para sincronizar, separados por conta e transmitidos por HTTPS.',
  ],
  [
    'Funciona no iPhone e no computador?',
    'Sim. É um site que instala como aplicativo: no iPhone pelo Safari, em Compartilhar › Adicionar à Tela de Início; no Android e no computador, pelo próprio aviso do navegador.',
  ],
  [
    'E se eu trocar de celular?',
    'Entre com o mesmo e-mail no aparelho novo e ele entra no seu espaço — o mesmo, não um segundo. Lançamentos, cartões, metas e comprovantes descem sozinhos.',
  ],
] as const;

function Perguntas() {
  return (
    <section className="border-t border-line bg-surface/40 px-5 py-20">
      <div className="mx-auto grid max-w-[72rem] gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
        <h2 className="font-display text-[30px] leading-tight text-ink sm:text-[36px]">Antes de começar</h2>

        <div className="border-b border-line">
          {FAQ.map(([pergunta, resposta]) => (
            <details key={pergunta} className="group border-t border-line">
              <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-[15px] text-ink [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{pergunta}</span>
                <span className="shrink-0 text-[18px] leading-none text-ink-3 transition-transform duration-[var(--t-base)] group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-5 pr-8 text-[14px] leading-relaxed text-ink-2">{resposta}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- fim */

function Fechamento() {
  return (
    <section className="relative overflow-hidden border-t border-line px-5 py-24">
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 size-[34rem] -translate-x-1/2 rounded-full opacity-[0.12] blur-[110px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 66%)' }}
      />

      <div className="mx-auto max-w-[72rem]">
        <h2 className="max-w-[16ch] font-display text-[40px] leading-[1.05] text-ink sm:text-[56px]">
          O dia 30 vai chegar de qualquer jeito.
        </h2>
        <p className="mt-5 max-w-[40ch] text-[16px] leading-relaxed text-ink-2">
          Chegue sabendo quanto sobra. Abre e usa: sem cadastro para começar, sem cartão, sem senha
          de banco.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <Link href="/app" className={cn(botaoPrimario, 'w-full sm:w-auto')}>
            Começar agora
          </Link>
          <p className="text-[13px] text-ink-3">Instala como aplicativo pelo navegador — sem loja.</p>
        </div>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="border-t border-line px-5 py-10">
      <div className="mx-auto flex max-w-[72rem] flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-[13px] text-ink-2">
          {BRAND.name} — {BRAND.tagline.toLowerCase()}
        </p>
        <p className="text-[12px] text-ink-3">Os valores mostrados nas telas desta página são exemplos.</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ página */

export function Landing() {
  return (
    <>
      <a
        href="#mes"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-field focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        Pular para o conteúdo
      </a>

      <TopBar />
      <Trilho />

      <main>
        <Hero />
        <Fatos />
        <Mes />
        <Ferramentas />
        <Privacidade />
        <Perguntas />
        <Fechamento />
      </main>

      <Rodape />
    </>
  );
}
