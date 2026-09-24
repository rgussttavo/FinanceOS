import * as React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { Esteira, TopBar, Trilho } from './chrome';
import {
  MockAssinaturas,
  MockCalendario,
  MockCartoes,
  MockComprovantes,
  MockDividas,
  MockInicio,
  MockMetas,
  MockNews,
  MockOrcamento,
  MockPatrimonio,
  MockRateio,
} from './mocks';

/**
 * A vitrine.
 *
 * Uma página só, dez seções numeradas, cada uma mostrando uma tela de verdade
 * do app. A ordem é a mesma do produto: quem rolar até o fim já sabe navegar
 * antes de entrar.
 *
 * Nada aqui promete o que o app não faz. É uma regra chata de manter e a única
 * que impede a vitrine de virar dívida: cada linha abaixo tem uma tela atrás.
 */

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <header className="relative overflow-hidden px-5 pb-20 pt-28 sm:pb-28 sm:pt-32">
      {/* o brilho de latão atrás do celular, que dá profundidade sem imagem */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-24 -z-10 size-[42rem] -translate-x-1/2 rounded-full opacity-[0.16] blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 66%)' }}
      />

      <div className="mx-auto grid max-w-[72rem] items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="order-2 lg:order-1">
          <MockInicio />
        </div>

        <div className="order-1 text-center lg:order-2 lg:text-left">
          <h1 className="font-display text-[42px] leading-[1.06] tracking-[-0.01em] text-ink sm:text-[58px]">
            O sistema operacional da sua{' '}
            <span className="text-accent">vida financeira</span>
          </h1>

          <p className="mx-auto mt-5 max-w-[34ch] text-[17px] leading-relaxed text-ink-2 lg:mx-0">
            Contas, cartões, metas e investimentos. Seu mês inteiro numa tela só.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              href="/app"
              className="inline-flex h-12 w-full items-center justify-center rounded-field bg-accent px-8 text-[15px] font-medium text-accent-ink transition-[filter,transform] duration-[var(--t-fast)] hover:brightness-110 active:scale-[0.98] sm:w-auto"
            >
              Começar agora
            </Link>
            <a
              href="#news"
              className="inline-flex h-12 w-full items-center justify-center rounded-field border border-line px-8 text-[15px] text-ink-2 transition-colors duration-[var(--t-fast)] hover:bg-surface-2 sm:w-auto"
            >
              Ver o que tem dentro
            </a>
          </div>

          <p className="mt-4 text-[13px] text-ink-3">
            Grátis. Sem cadastro para começar, sem conectar banco.
          </p>
        </div>
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------- provas */

function Provas() {
  return (
    <section className="border-y border-line bg-surface/40 px-5 py-14">
      <div className="mx-auto max-w-[72rem]">
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            ['🔓', 'Sem conectar banco', 'Você lança o que quiser. Nada de senha do banco.'],
            ['💳', 'Sem cartão', 'Começar é grátis e não pede pagamento.'],
            ['📱', 'Vira aplicativo', 'Instala no celular e abre como app.'],
          ].map(([emoji, titulo, detalhe]) => (
            <li key={titulo} className="rounded-card border border-line bg-surface px-4 py-4">
              <p className="text-[20px]">{emoji}</p>
              <p className="mt-2 text-[14px] font-medium text-ink">{titulo}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{detalhe}</p>
            </li>
          ))}
        </ul>

        {/*
          Aqui iria o contador de usuários que toda landing tem. Nós temos zero,
          e número inventado num site no ar é mentira com enfeite. O espaço
          ficou com três coisas que dá para conferir abrindo o app.
        */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['R$ 0', 'para usar, sem versão paga escondida'],
            ['14 telas', 'do calendário ao patrimônio'],
            ['0', 'senhas de banco pedidas'],
          ].map(([numero, nota]) => (
            <li
              key={nota}
              className="rounded-card border border-line bg-surface px-4 py-4 text-center"
            >
              <p className="amount text-[28px] text-accent">{numero}</p>
              <p className="mt-1.5 text-[13px] text-ink-3">{nota}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- seções 01–10 */

function Recurso({
  id,
  numero,
  etiqueta,
  titulo,
  texto,
  children,
}: {
  id: string;
  numero: string;
  etiqueta: string;
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <p className="flex items-center justify-center gap-2 text-[12px] text-ink-3">
        <span className="tnum">{numero}</span>
        <span className="h-px w-5 bg-line-strong" />
        <span>{etiqueta}</span>
      </p>

      <h2 className="mt-3 text-center font-display text-[27px] leading-tight text-ink sm:text-[31px]">
        {titulo}
      </h2>

      <p className="mx-auto mt-2.5 max-w-[38ch] text-center text-[14px] leading-relaxed text-ink-2">
        {texto}
      </p>

      <div className="mt-6">{children}</div>
    </div>
  );
}

/** duas colunas em tela larga, uma embaixo da outra no celular */
function Par({ children }: { children: React.ReactNode }) {
  return (
    <section className="px-5 py-14 sm:py-16">
      <div className="mx-auto grid max-w-[72rem] gap-14 lg:grid-cols-2 lg:gap-10">{children}</div>
    </section>
  );
}

function Recursos() {
  return (
    <>
      <Par>
        <Recurso
          id="news"
          numero="01"
          etiqueta="News"
          titulo="Os números do dia"
          texto="Manchetes de economia, moedas, cripto, os indicadores do Banco Central e a agenda do Copom e do IBGE, num lugar só."
        >
          <MockNews />
        </Recurso>

        <Recurso
          id="calendario"
          numero="02"
          etiqueta="Calendário"
          titulo="O mês dia a dia"
          texto="Feriados, o que cai em cada dia, seus eventos e a agenda econômica — tudo no mesmo mês que você está olhando."
        >
          <MockCalendario />
        </Recurso>
      </Par>

      <Par>
        <Recurso
          id="cartoes"
          numero="03"
          etiqueta="Cartões"
          titulo="A fatura se monta sozinha"
          texto="Lance a compra, escolha o cartão e as parcelas. Comprou depois do fechamento, cai na fatura seguinte — como cai no banco."
        >
          <MockCartoes />
        </Recurso>

        <Recurso
          id="assinaturas"
          numero="04"
          etiqueta="Assinaturas"
          titulo="O que se repete todo mês"
          texto="Cada serviço com o valor e o dia da cobrança. As do cartão entram na fatura sozinhas, e o total do mês fica à vista."
        >
          <MockAssinaturas />
        </Recurso>
      </Par>

      <Par>
        <Recurso
          id="metas"
          numero="05"
          etiqueta="Metas"
          titulo="Metas com prazo"
          texto="Quanto já tem, quanto falta e quanto guardar por mês. A meta ligada ao patrimônio sobe sozinha a cada aporte."
        >
          <MockMetas />
        </Recurso>

        <Recurso
          id="dividas"
          numero="06"
          etiqueta="Dívidas"
          titulo="Dívidas que encolhem"
          texto="Parcelas pagas de um lado, o que falta do outro. E o simulador diz se vale atacar a mais cara ou a menor primeiro."
        >
          <MockDividas />
        </Recurso>
      </Par>

      <Par>
        <Recurso
          id="rateio"
          numero="07"
          etiqueta="Rateio"
          titulo="Quem acerta com quem"
          texto="Anote quem pagou o quê. O app fecha no menor número de pagamentos, e a sobra de centavos é distribuída um a um."
        >
          <MockRateio />
        </Recurso>

        <Recurso
          id="orcamento"
          numero="08"
          etiqueta="Orçamento"
          titulo="Orce antes de gastar"
          texto="Monte a lista, guarde uma folga e veja quanto cabe para cada um antes de qualquer um tirar dinheiro do bolso."
        >
          <MockOrcamento />
        </Recurso>
      </Par>

      <Par>
        <Recurso
          id="patrimonio"
          numero="09"
          etiqueta="Patrimônio"
          titulo="Quanto você tem, de verdade"
          texto="Bens somados ao que está investido. Carro e moto buscam o valor na tabela FIPE sozinhos; imóvel é corrigido pelo IPCA."
        >
          <MockPatrimonio />
        </Recurso>

        <Recurso
          id="comprovantes"
          numero="10"
          etiqueta="Comprovantes"
          titulo="Comprovante guardado é comprovante achado"
          texto="Foto ou PDF, em pastas que você organiza. A busca acha pelo nome, e o arquivo acompanha você para os outros aparelhos."
        >
          <MockComprovantes />
        </Recurso>
      </Par>
    </>
  );
}

/* ----------------------------------------------------------------- extras */

function Extras() {
  const itens = [
    ['Boleto e Pix copia e cola', 'Cole o código e o lançamento se preenche sozinho.'],
    ['Simulador de câmbio', 'Converta moedas com a cotação do dia, na hora.'],
    ['Simulador de investimentos', 'Projete aportes e juros compostos, mês a mês.'],
    ['Viver de renda', 'O simulador FIRE mostra quanto falta para parar.'],
    ['Simulador de empréstimo', 'Veja o custo real antes de assinar qualquer coisa.'],
    ['Assistente de perguntas', 'Pergunte em português e ele responde pelos seus números.'],
    ['Sua inflação vs. IPCA', 'Compare o quanto a sua vida subiu com o índice oficial.'],
    ['Busca em tudo', 'Um campo que acha lançamento, meta, cartão e comprovante.'],
    ['Offline e sincronizado', 'Funciona sem internet e sincroniza entre aparelhos.'],
  ];

  return (
    <section className="border-t border-line px-5 py-16">
      <div className="mx-auto max-w-[72rem]">
        <h2 className="text-center font-display text-[29px] text-ink">E ainda tem mais</h2>
        <p className="mx-auto mt-2.5 max-w-[42ch] text-center text-[14px] text-ink-2">
          Ferramentas do dia a dia que já vêm dentro do app, sem instalar nada à parte.
        </p>

        <ul className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map(([titulo, detalhe]) => (
            <li key={titulo} className="rounded-card border border-line bg-surface px-4 py-4">
              <p className="text-[14px] font-medium text-ink">{titulo}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{detalhe}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- cenários */

/**
 * O lugar dos depoimentos — sem depoimentos.
 *
 * Toda landing põe aqui rostos e cidades. Nós não temos usuário nenhum ainda,
 * e nome inventado embaixo de uma frase inventada é review falso, por mais
 * bonito que fique. Então a esteira carrega o que o app faz, dito na situação
 * em que faz, e cada card aponta a tela onde aquilo acontece.
 */
const CENARIOS = [
  { texto: 'Colou o código do boleto e a despesa se preencheu: valor, vencimento e tudo.', fonte: 'Leitor de boleto e Pix' },
  { texto: 'O churrasco fechou sem planilha no grupo: cada um vê quanto paga e para quem.', fonte: 'Rateio' },
  { texto: 'Apartamento, carro na FIPE e o investido somados numa tela só.', fonte: 'Patrimônio' },
  { texto: 'Lançou no metrô sem sinal; ao sair, já estava no computador.', fonte: 'Offline e sincronizado' },
  { texto: 'As assinaturas somadas num número só — o mês inteiro de streaming à vista.', fonte: 'Assinaturas' },
  { texto: 'A meta ligada ao patrimônio sobe sozinha a cada aporte lançado.', fonte: 'Metas' },
  { texto: 'O calendário mostra o que cai em cada dia, antes do dia chegar.', fonte: 'Calendário' },
  { texto: 'Guardou o IPVA nos Comprovantes e achou pelo nome na hora da revisão.', fonte: 'Comprovantes' },
  { texto: 'A compra de três vezes já entrou nas três faturas certas.', fonte: 'Cartões' },
  { texto: 'Dólar, Selic e IPCA sem abrir outro aplicativo.', fonte: 'News' },
  { texto: 'O simulador FIRE devolve um número para perseguir.', fonte: 'Simuladores' },
  { texto: '"Quanto gastei com mercado em agosto?" — e a resposta vem com a lista.', fonte: 'Assistente' },
] as const;

function Cenarios() {
  return (
    <section className="border-t border-line bg-surface/40 px-5 py-16">
      <div className="mx-auto max-w-[72rem]">
        <h2 className="text-center font-display text-[29px] text-ink">O que muda no seu mês</h2>
        <p className="mx-auto mt-2.5 max-w-[46ch] text-center text-[14px] text-ink-2">
          Situações do dia a dia e a tela que resolve cada uma. São exemplos de uso do app — não
          depoimentos de clientes.
        </p>

        <div className="mt-9">
          <Esteira itens={CENARIOS} />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- comparativo */

const COMPARA: readonly (readonly [string, boolean, boolean, boolean])[] = [
  ['Pronto em um minuto', false, true, true],
  ['Sem senha do seu banco', true, false, true],
  ['Funciona offline', false, false, true],
  ['Boleto e Pix copia e cola', false, true, true],
  ['Metas, dívidas e rateio prontos', false, false, true],
  ['Carro e moto na tabela FIPE', false, false, true],
  ['Assinaturas com o total do mês', false, false, true],
  ['Comprovantes guardados e buscáveis', false, false, true],
  ['Cotações, cripto e agenda econômica', false, true, true],
  ['Simuladores de investimento e FIRE', false, false, true],
  ['Todo o seu dinheiro, não só um banco', true, false, true],
  ['Seus dados não viram produto', true, false, true],
  ['Grátis, sem cartão', true, true, true],
];

function Comparativo() {
  return (
    <section className="border-t border-line px-5 py-16">
      <div className="mx-auto max-w-[56rem]">
        <h2 className="text-center font-display text-[29px] text-ink">
          Planilha, app de banco ou {BRAND.name}?
        </h2>
        <p className="mt-2.5 text-center text-[14px] text-ink-2">
          Sem rodeio: o que cada caminho te dá.
        </p>

        <div className="mt-9 overflow-hidden rounded-card border border-line">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-2">
                <th className="px-3 py-3 text-[12px] font-medium text-ink-3 sm:px-4">&nbsp;</th>
                <th className="px-2 py-3 text-center text-[12px] font-medium text-ink-3">
                  Planilha
                </th>
                <th className="px-2 py-3 text-center text-[12px] font-medium text-ink-3">
                  App do banco
                </th>
                <th className="px-2 py-3 text-center text-[12px] font-semibold text-accent">
                  {BRAND.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARA.map(([linha, planilha, banco, nosso], i) => (
                <tr key={linha} className={cn(i % 2 === 1 && 'bg-surface/50')}>
                  <td className="border-t border-line px-3 py-2.5 text-[13px] text-ink sm:px-4">
                    {linha}
                  </td>
                  <Marca sim={planilha} />
                  <Marca sim={banco} />
                  <Marca sim={nosso} destaque />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Marca({ sim, destaque }: { sim: boolean; destaque?: boolean }) {
  return (
    <td
      className={cn(
        'border-t border-line px-2 py-2.5 text-center text-[14px]',
        destaque && 'bg-accent-soft/40',
      )}
    >
      <span className={sim ? 'text-in' : 'text-ink-3/60'} aria-hidden>
        {sim ? '✓' : '✗'}
      </span>
      <span className="sr-only">{sim ? 'sim' : 'não'}</span>
    </td>
  );
}

/* --------------------------------------------------------------- privacidade */

/**
 * O que está escrito aqui é o que o código faz — nem uma linha a mais.
 *
 * É tentador listar certificações e selos; um produto novo não tem nenhum, e
 * inventar segurança é o único tipo de mentira que machuca quem acreditou.
 */
function Privacidade() {
  const itens = [
    ['Nada de senha de banco', 'Você lança o que quiser. O app não conecta em conta nenhuma, de nenhum banco.'],
    ['Primeiro no seu aparelho', 'Tudo é gravado no celular antes de qualquer rede. Sem internet, o app funciona igual.'],
    ['Cada conta vê só o que é dela', 'O servidor separa por espaço e confere a cada consulta, não só na tela.'],
    ['Entrada sem senha para vazar', 'O acesso é por link ou código no e-mail. Não guardamos senha porque não existe senha.'],
    ['Apagou, apagou em todos', 'O que você exclui some dos seus outros aparelhos na próxima sincronização.'],
    ['Sem rastreador de terceiros', 'Nenhum pixel de anúncio, nenhuma métrica vendida. Seus números não são o produto.'],
  ];

  return (
    <section className="border-t border-line bg-surface/40 px-5 py-16">
      <div className="mx-auto max-w-[72rem]">
        <h2 className="text-center font-display text-[29px] text-ink">Seu dinheiro é assunto seu</h2>
        <p className="mx-auto mt-2.5 max-w-[44ch] text-center text-[14px] text-ink-2">
          Privacidade não é promessa: é como o app foi construído.
        </p>

        <ul className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map(([titulo, detalhe]) => (
            <li key={titulo} className="rounded-card border border-line bg-surface px-4 py-4">
              <p className="text-[14px] font-medium text-ink">{titulo}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{detalhe}</p>
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
    'Não, e nem dá. O app não fala com banco nenhum: você lança o que quiser, do jeito que quiser. É por isso que ele nunca vai pedir a sua senha.',
  ],
  [
    'Preciso criar conta para usar?',
    'Não para começar. Abra e lance — tudo funciona antes de qualquer cadastro. A conta só serve para levar os seus dados a um segundo aparelho, e o que você já lançou vai junto.',
  ],
  [
    'Onde ficam meus dados?',
    'No seu aparelho, primeiro. Se você criar conta, eles também ficam no servidor para sincronizar, separados por conta e transmitidos por HTTPS.',
  ],
  [
    'Funciona sem internet?',
    'Funciona inteiro. Lançar, editar, ver o mês, simular — nada disso depende de rede. As cotações e as manchetes, sim, porque vêm de fora.',
  ],
  [
    'Funciona no iPhone e no computador?',
    'Sim. É um site que instala como aplicativo: no iPhone pelo Safari, em Compartilhar › Adicionar à Tela de Início; no Android e no computador, pelo próprio aviso do navegador.',
  ],
  [
    'Preciso digitar tudo na mão?',
    'Quase nada. O boleto e o Pix copia e cola preenchem o lançamento sozinhos, a categoria se sugere pelo que você escreveu, e o que se repete todo mês é lançado uma vez só.',
  ],
  [
    'Dá para dividir contas com amigos?',
    'Dá, no Rateio. Você anota quem pagou o quê e o app fecha no menor número de pagamentos possível, já dizendo quem paga quanto para quem.',
  ],
  [
    'E se eu trocar de celular?',
    'Entre com o mesmo e-mail no aparelho novo e ele entra no seu espaço — o mesmo, não um segundo. Lançamentos, cartões, metas e comprovantes descem sozinhos.',
  ],
] as const;

function Perguntas() {
  return (
    <section className="border-t border-line px-5 py-16">
      <div className="mx-auto max-w-[44rem]">
        <h2 className="text-center font-display text-[29px] text-ink">Perguntas de sempre</h2>
        <p className="mt-2.5 text-center text-[14px] text-ink-2">
          As que todo mundo faz antes de começar.
        </p>

        <div className="mt-9 overflow-hidden rounded-card border border-line">
          {FAQ.map(([pergunta, resposta], i) => (
            <details
              key={pergunta}
              className={cn('group bg-surface', i > 0 && 'border-t border-line')}
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-[14px] text-ink transition-colors duration-[var(--t-fast)] hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{pergunta}</span>
                <span className="shrink-0 text-ink-3 transition-transform duration-[var(--t-base)] group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="px-4 pb-4 text-[13px] leading-relaxed text-ink-2">{resposta}</p>
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
    <section className="relative overflow-hidden border-t border-line px-5 py-20 text-center">
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 size-[34rem] -translate-x-1/2 rounded-full opacity-[0.14] blur-[110px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 66%)' }}
      />

      <div className="mx-auto max-w-[40rem]">
        <h2 className="font-display text-[32px] leading-tight text-ink sm:text-[40px]">
          Comece o mês sabendo para onde o dinheiro vai
        </h2>
        <p className="mx-auto mt-4 max-w-[38ch] text-[15px] leading-relaxed text-ink-2">
          Abre e usa. Sem cadastro para começar, sem cartão, sem acesso ao seu banco.
        </p>

        <Link
          href="/app"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-field bg-accent px-9 text-[15px] font-medium text-accent-ink transition-[filter,transform] duration-[var(--t-fast)] hover:brightness-110 active:scale-[0.98]"
        >
          Começar agora
        </Link>

        <p className="mt-5 text-[13px] text-ink-3">
          Instala como aplicativo pelo próprio navegador — não precisa de loja.
        </p>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="border-t border-line px-5 py-10">
      <div className="mx-auto flex max-w-[72rem] flex-col items-center gap-2 text-center">
        <p className="text-[13px] text-ink-2">
          {BRAND.name} — {BRAND.tagline}
        </p>
        <p className="text-[12px] text-ink-3">
          Os valores mostrados nas telas desta página são exemplos.
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ página */

export function Landing() {
  return (
    <>
      <a
        href="#news"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-field focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        Pular para o conteúdo
      </a>

      <TopBar />
      <Trilho />

      <main>
        <Hero />
        <Provas />
        <Recursos />
        <Extras />
        <Cenarios />
        <Comparativo />
        <Privacidade />
        <Perguntas />
        <Fechamento />
      </main>

      <Rodape />
    </>
  );
}
