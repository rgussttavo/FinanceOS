import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  FileUp,
  Landmark,
  Lightbulb,
  PiggyBank,
  Receipt,
  Users,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { WEEKDAYS_SHORT_PT } from '@/lib/dates';
import { TopBar, Trilho } from './chrome';
import { HeroDemo } from './hero-demo';
import {
  MockAssinaturas,
  MockCalendario,
  MockCartoes,
  MockCelularInicio,
  MockCelularRegistro,
  MockDividas,
  MockImportar,
  MockMetas,
  MockPatrimonio,
  MockTrajetoria,
} from './mocks';
import { ProblemaDemo } from './problema';

/**
 * A vitrine.
 *
 * A ordem segue a de quem chega: o problema que a pessoa já sente (o saldo do
 * banco não diz quanto dá para gastar), a resposta do produto, como ele
 * funciona e, no meio da página, um mês contado do dia 1 ao dia 30 — cada
 * parada é a tela que faz diferença naquele dia.
 *
 * Nada aqui promete o que o app não faz. Cada linha abaixo tem uma tela atrás,
 * e os números das maquetes são exemplos, ditos como exemplos.
 */

const botaoPrimario =
  'inline-flex h-12 items-center justify-center rounded-field bg-accent px-8 text-[15px] font-medium text-accent-ink transition-[filter,transform] duration-[var(--t-fast)] hover:brightness-110 active:scale-[0.98]';

const botaoSecundario =
  'inline-flex h-12 items-center justify-center rounded-field border border-line-strong px-8 text-[15px] text-ink transition-colors duration-[var(--t-fast)] hover:bg-surface-2';

/** título de seção: o mesmo tamanho e ritmo em toda a página */
function TituloSecao({ id, olho, children, className }: { id?: string; olho?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {olho ? <p className="text-[13px] font-medium text-accent">{olho}</p> : null}
      <h2 id={id} className="mt-2 max-w-[22ch] text-balance font-display text-[34px] leading-[1.08] text-ink sm:text-[44px]">
        {children}
      </h2>
    </div>
  );
}

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
          <p className="text-[15px] text-ink-2">
            Você sabe quanto tem hoje.{' '}
            <span className="text-ink">Mas sabe quanto pode gastar até o fim do mês?</span>
          </p>

          <h1 className="mt-4 font-display text-[44px] leading-[1.02] tracking-[-0.015em] text-ink sm:text-[64px]">
            Saiba quanto sobra <span className="text-accent">antes</span> do mês acabar.
          </h1>

          <p className="mt-6 max-w-[44ch] text-[17px] leading-relaxed text-ink-2">
            O {BRAND.name} transforma seus lançamentos, cartões, contas e metas em uma visão clara do seu mês: o que
            já saiu, o que ainda vai sair e quanto dá para gastar até o próximo salário.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/app" className={cn(botaoPrimario, 'w-full sm:w-auto')}>
              Começar agora
            </Link>
            <a href="#como-funciona" className={cn(botaoSecundario, 'w-full sm:w-auto')}>
              Ver como funciona
            </a>
          </div>

          <p className="mt-5 text-[13px] text-ink-3">
            Grátis, sem cadastro para começar e sem senha de banco.{' '}
            <Link href="/demo" className="font-medium text-accent underline-offset-4 hover:underline">
              Explorar {BRAND.name} com dados de exemplo →
            </Link>
          </p>
        </div>

        <div className="lg:pl-4">
          <HeroDemo />
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

/* ------------------------------------------------------------ o problema */

function Problema() {
  return (
    <section id="problema" aria-labelledby="problema-titulo" className="scroll-mt-20 px-5 pt-20 sm:pt-28">
      <div className="mx-auto grid max-w-[72rem] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
        <div>
          <TituloSecao id="problema-titulo" olho="O problema">
            Seu saldo não conta a história inteira.
          </TituloSecao>
          <p className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-ink-2">
            O banco mostra quanto você tem hoje. Não mostra quanto disso já tem dono: o aluguel da semana que vem, a
            fatura que fecha no dia 8, as assinaturas que se renovam sozinhas, a parcela do notebook.
          </p>
          <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-ink-2">
            Gastar olhando só para o saldo é descobrir no dia 25 que o dinheiro acabou no dia 20.
          </p>
        </div>
        <ProblemaDemo />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- a solução */

function Solucao() {
  return (
    <section aria-labelledby="solucao-titulo" className="px-5 pt-20 sm:pt-28">
      <div className="mx-auto grid max-w-[72rem] items-center gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
        <div className="lg:order-2">
          <TituloSecao id="solucao-titulo" olho="A solução">
            O {BRAND.name} coloca seu mês inteiro em uma linha do tempo.
          </TituloSecao>
          <p className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-ink-2">
            Salário, contas fixas, fatura, assinaturas e parcelas aparecem no dia em que caem. O saldo é recalculado
            dia a dia até o fim do mês — e o dia em que ele aperta aparece antes de chegar.
          </p>
        </div>
        <div className="lg:order-1">
          <MockTrajetoria />
          <p className="mt-3 text-center text-[12px] text-ink-3 lg:text-left">
            A escola do dia 15 põe o saldo no vermelho; o adiantamento do dia 20 cobre. Você fica sabendo no dia 14.
          </p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- como funciona */

const PASSOS: readonly (readonly [string, string, string, LucideIcon])[] = [
  ['01', 'Importe', 'Seu extrato entra em segundos: OFX, CSV, Excel ou QIF, lido no seu aparelho. Ou comece digitando dois números.', FileUp],
  ['02', 'Organize', 'O FinanceOS categoriza, reconhece assinaturas e transferências e põe cada compra na fatura certa.', WandSparkles],
  ['03', 'Antecipe', 'Veja o saldo de cada dia até o fim do mês e quanto dá para gastar até o próximo salário.', CalendarClock],
  ['04', 'Decida', 'Alertas com a ação para resolver — adiar, antecipar, guardar — antes de o problema acontecer.', Lightbulb],
];

function ComoFunciona() {
  return (
    <section id="como-funciona" aria-labelledby="como-titulo" className="scroll-mt-20 px-5 pt-20 sm:pt-28">
      <div className="mx-auto max-w-[72rem]">
        <TituloSecao id="como-titulo" olho="Como funciona">
          Do extrato à decisão, em quatro passos
        </TituloSecao>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS.map(([n, titulo, texto, Icone]) => (
            <li key={n} className="flex flex-col gap-3 bg-canvas p-6">
              <span className="flex items-center justify-between">
                <span className="font-display text-[40px] leading-none text-accent tnum">{n}</span>
                <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
                  <Icone size={17} />
                </span>
              </span>
              <span className="text-[18px] font-semibold text-ink">{titulo}</span>
              <span className="text-[14px] leading-relaxed text-ink-3">{texto}</span>
            </li>
          ))}
        </ol>
      </div>
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

/** na ordem de uso: importar, ver o mês, e então cada compromisso até o patrimônio */
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
      'Pagamento de fatura e transferência entre suas contas ficam de fora.',
      'O arquivo é lido no seu aparelho e não vai para servidor nenhum.',
    ],
    maquete: <MockImportar />,
  },
  {
    dia: 5,
    etiqueta: 'Calendário',
    titulo: 'O salário caiu. Quanto dele já tem dono?',
    texto:
      'Aluguel no 6, fatura no 8, escola no 15: o que vai sair aparece no dia em que sai, antes de sair, com o saldo de cada dia e os feriados nacionais marcados.',
    maquete: <MockCalendario hoje={5} />,
  },
  {
    dia: 8,
    etiqueta: 'Cartões',
    titulo: 'A compra em três vezes, nas três faturas certas',
    texto:
      'Comprou depois do fechamento, cai na fatura seguinte, como no banco. E o limite usado conta as parcelas que ainda vêm, não só a fatura do mês.',
    maquete: <MockCartoes />,
  },
  {
    dia: 12,
    etiqueta: 'Assinaturas',
    titulo: 'O que se renova sem pedir licença',
    texto:
      'Cada serviço com o valor e o dia da cobrança, somados por mês e por ano. Marque o que é dispensável e veja quanto sobra cancelando.',
    maquete: <MockAssinaturas />,
  },
  {
    dia: 18,
    etiqueta: 'Metas',
    titulo: 'Sobrou? Já tem destino',
    texto:
      'Quanto falta, quanto guardar por mês até o prazo e, no ritmo de hoje, quando você chega lá. A meta ligada a um investimento sobe sozinha a cada aporte.',
    maquete: <MockMetas />,
  },
  {
    dia: 22,
    etiqueta: 'Dívidas',
    titulo: 'A dívida que encolhe à vista',
    texto:
      'Parcelas pagas de um lado, o saldo do outro. E o simulador mostra quanto de juros e de tempo você economiza pagando um pouco a mais por mês.',
    maquete: <MockDividas />,
  },
  {
    dia: 30,
    etiqueta: 'Patrimônio',
    titulo: 'Fecha o mês e olha o todo',
    texto:
      'O que você tem menos o que deve, e como isso andou. Carro e moto buscam o valor na tabela FIPE; imóvel é corrigido pelo IPCA desde a compra.',
    maquete: <MockPatrimonio />,
  },
];

function Mes() {
  return (
    <section id="mes" aria-labelledby="mes-titulo" className="scroll-mt-20 px-5 pt-20 sm:pt-28">
      <div className="mx-auto max-w-[72rem]">
        <p className="text-[13px] font-medium text-accent">Setembro, do dia 1 ao dia 30</p>
        <h2 id="mes-titulo" className="mt-2 max-w-[20ch] font-display text-[34px] leading-[1.08] text-ink sm:text-[44px]">
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

/* ------------------------------------------------------------ inteligência */

/**
 * O diferencial dito com frases que o app realmente mostra. O "aplicativo
 * comum" é o extrato com gráfico; do outro lado, o texto dos alertas e do
 * Início, com os mesmos números de exemplo.
 */
const COMPARACAO: readonly (readonly [string, string, string])[] = [
  [
    'Você gastou R$ 800 com mercado.',
    'Seu gasto com Mercado já está 29% acima da média: R$ 800 até agora, contra R$ 620 nos últimos 3 meses.',
    'Contexto',
  ],
  [
    'Saldo: R$ 3.141,90.',
    'Até o salário, dia 30, dá para gastar R$ 875. O resto já tem dono: fatura, assinaturas e academia.',
    'Previsão',
  ],
  [
    'Fatura: R$ 1.846,00.',
    'A fatura do Nubank vence amanhã: R$ 1.846 saem da conta nesse dia. Se já pagou, marque como paga para o saldo bater.',
    'Ação',
  ],
];

function Inteligencia() {
  return (
    <section id="inteligencia" aria-labelledby="inteligencia-titulo" className="scroll-mt-20 border-t border-line bg-surface/40 px-5 py-20 sm:py-24">
      <div className="mx-auto max-w-[72rem]">
        <p className="text-[13px] font-medium text-accent">Não é só controle de gastos</p>
        <h2 id="inteligencia-titulo" className="mt-2 max-w-[24ch] text-balance font-display text-[34px] leading-[1.08] text-ink sm:text-[44px]">
          Não mostramos apenas o que aconteceu.{' '}
          <span className="text-ink-2">Mostramos o que provavelmente vai acontecer.</span>
        </h2>

        <div className="mt-10 overflow-hidden rounded-panel border border-line">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] border-b border-line bg-surface-2 text-[12px] font-semibold uppercase tracking-[0.12em] sm:grid">
            <span className="px-5 py-3 text-ink-3">Aplicativo comum</span>
            <span className="border-l border-line px-5 py-3 text-accent">{BRAND.name}</span>
          </div>
          <ul>
            {COMPARACAO.map(([comum, nosso, tipo], i) => (
              <li
                key={tipo}
                className={cn('grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]', i > 0 && 'border-t border-line')}
              >
                <p className="bg-canvas px-5 py-4 text-[15px] text-ink-3">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3 sm:hidden">
                    Aplicativo comum
                  </span>
                  “{comum}”
                </p>
                <p className="border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink sm:border-l">
                  <span className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent sm:hidden">{BRAND.name}</span>
                    <span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">{tipo}</span>
                  </span>
                  “{nosso}”
                </p>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
          Contexto, previsão e ação — calculados no seu aparelho, a partir dos seus lançamentos. A busca também
          responde: “mercado agosto” devolve o total e os lançamentos que somam nele.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- privacidade */

/**
 * Onde os dados ficam, dito como a arquitetura é.
 *
 * Nada de "100% seguro" nem de selo inventado. Cada item abaixo corresponde a
 * uma decisão do código: base no navegador, sync só com conta, extrato lido
 * no aparelho, o que os serviços de terceiros recebem.
 */
const PRIVACIDADE: readonly (readonly [string, string])[] = [
  [
    'No seu aparelho, primeiro',
    'Tudo o que você registra fica guardado no navegador deste aparelho. O app funciona inteiro sem conta e sem internet.',
  ],
  [
    'Sem conta, nada sai daqui',
    'Enquanto você não cria uma conta, seus lançamentos não são enviados para servidor nenhum.',
  ],
  [
    'Com conta, uma cópia sincroniza',
    'Ao entrar com seu e-mail ou Google, uma cópia dos dados e dos comprovantes vai para o servidor do FinanceOS, separada por conta, para aparecer nos seus outros aparelhos.',
  ],
  [
    'O extrato não viaja',
    'O arquivo do banco é lido no navegador. Só os lançamentos que você confirma são gravados — e, com conta, sincronizados.',
  ],
  [
    'O que vai para terceiros',
    'Logotipos de assinaturas e cartões vêm de serviços públicos de ícones, que recebem só o endereço do serviço (como netflix.com). Cotações, notícias e a tabela FIPE passam pelo servidor do FinanceOS, sem dados seus.',
  ],
  [
    'Sem senha de banco, sem rastreador',
    'O app não conecta em banco nenhum e não tem pixel de anúncio nem métrica de terceiros. A entrada na conta é por link ou código no e-mail, ou pelo Google.',
  ],
  [
    'Backup quando quiser',
    'Em Ajustes, “Exportar backup” baixa um arquivo com tudo; “Restaurar backup” traz de volta, neste ou em outro aparelho.',
  ],
  [
    'Apagar',
    'Em Ajustes, “Apagar todos os dados” limpa este aparelho. Com conta, o que você exclui no app é excluído nos outros aparelhos; a cópia da conta continua lá para eles.',
  ],
];

function Privacidade() {
  return (
    <section id="privacidade" aria-labelledby="privacidade-titulo" className="scroll-mt-20 border-t border-line px-5 py-20 sm:py-24">
      <div className="mx-auto grid max-w-[72rem] gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
        <div>
          <TituloSecao id="privacidade-titulo" olho="Privacidade">
            Onde seus dados ficam
          </TituloSecao>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
            Sem letra miúda: é assim que o app funciona. A mesma explicação está dentro dele, em Ajustes.
          </p>
        </div>

        <ul className="grid gap-x-10 sm:grid-cols-2">
          {PRIVACIDADE.map(([titulo, texto]) => (
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

/* ----------------------------------------------------------- funcionalidades */

/** cada cartão é um problema de quem chega, e as telas que respondem a ele */
const PROBLEMAS: readonly (readonly [string, LucideIcon, readonly string[]])[] = [
  [
    'Não sei para onde meu dinheiro vai',
    FileUp,
    ['Importar extrato: OFX, CSV, XLSX, XLS, QIF, ODS e TXT', 'Categorias sugeridas que aprendem com as suas correções', 'Movimentos por categoria, mês a mês', 'Busca que responde com o total'],
  ],
  [
    'Todo fim de mês é uma surpresa',
    CalendarClock,
    ['Saldo previsto dia a dia até o fim do mês', 'Quanto dá para gastar até o salário', 'Alertas antes de o saldo apertar', 'Saúde do mês, com o porquê da nota'],
  ],
  [
    'O cartão e as parcelas se acumulam',
    CreditCard,
    ['Cada compra na fatura certa, pelo dia de fechamento', 'Parcelas futuras e limite comprometido', 'Assinaturas com custo por mês e por ano', 'Boleto e Pix copia e cola viram lançamento'],
  ],
  [
    'Quero sair das dívidas',
    Receipt,
    ['Saldo devedor e juros que ainda vêm', 'Quanto economiza pagando a mais por mês', 'Qual dívida atacar primeiro', 'Simulador de empréstimo e de cheque especial'],
  ],
  [
    'Quero juntar dinheiro',
    PiggyBank,
    ['Metas com projeção de quando você chega', 'Quanto guardar por mês até o prazo', 'Orçamento da viagem antes de gastar', 'Simuladores de investimento e de viver de renda'],
  ],
  [
    'Quero ver o todo',
    Landmark,
    ['Patrimônio: o que tem menos o que deve', 'Carro pela FIPE, imóvel corrigido pelo IPCA', 'Sua inflação contra o IPCA oficial', 'Notícias e indicadores do Banco Central'],
  ],
  [
    'Divido contas com outras pessoas',
    Users,
    ['Rateio que acerta no menor número de Pix', 'Centavos distribuídos sem ninguém sair devendo', 'Comprovantes em pastas, achados pelo nome'],
  ],
];

function Funcionalidades() {
  return (
    <section id="funcionalidades" aria-labelledby="funcionalidades-titulo" className="scroll-mt-20 border-t border-line bg-surface/40 px-5 py-20 sm:py-24">
      <div className="mx-auto max-w-[72rem]">
        <TituloSecao id="funcionalidades-titulo" olho="Funcionalidades">
          Organizado pelo problema que resolve
        </TituloSecao>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMAS.map(([problema, Icone, itens], i) => {
            // o sétimo cartão fecha a grade na largura toda, em vez de ficar sozinho numa linha
            const largo = i === PROBLEMAS.length - 1 && PROBLEMAS.length % 3 === 1;
            return (
            <li
              key={problema}
              className={cn(
                'rounded-panel border border-line bg-surface p-5',
                largo && 'lg:col-span-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-center lg:gap-8',
              )}
            >
              <div>
                <span className="grid size-10 place-items-center rounded-field bg-accent-soft text-accent" aria-hidden>
                  <Icone size={18} strokeWidth={1.9} />
                </span>
                <p className="mt-4 font-display text-[22px] leading-tight text-ink">“{problema}”</p>
              </div>
              <ul className={cn('mt-3 grid gap-2', largo && 'lg:mt-0 lg:grid-cols-3 lg:gap-4')}>
                {itens.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                    <span aria-hidden className="mt-[10px] h-px w-3 shrink-0 bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ celular */

const NO_CELULAR = [
  ['Instala como aplicativo', 'Direto do navegador, sem loja. No iPhone, pelo Safari; no Android e no computador, pelo aviso do navegador.'],
  ['Abre sem internet', 'Os lançamentos já estão no aparelho. Sem sinal no metrô, você registra igual.'],
  ['Registrar leva segundos', 'Quanto, onde, e a categoria já vem sugerida. O resto é opcional.'],
  ['Atalhos no ícone', 'Segure o ícone para registrar um gasto, importar um extrato ou abrir o calendário.'],
] as const;

function Celular() {
  return (
    <section id="celular" aria-labelledby="celular-titulo" className="scroll-mt-20 border-t border-line px-5 py-20 sm:py-24">
      <div className="mx-auto grid max-w-[72rem] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <TituloSecao id="celular-titulo" olho="No celular">
            Pensado para o bolso, não encolhido para ele
          </TituloSecao>
          <ul className="mt-8 grid gap-5">
            {NO_CELULAR.map(([titulo, texto]) => (
              <li key={titulo}>
                <p className="text-[15px] font-medium text-ink">{titulo}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-3">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center gap-5 overflow-hidden sm:gap-8">
          <MockCelularInicio />
          <div className="hidden sm:block sm:pt-14">
            <MockCelularRegistro />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- perguntas */

const FAQ = [
  [
    'É grátis mesmo?',
    'É. Não há plano pago, cobrança escondida nem recurso trancado esperando cartão.',
  ],
  [
    'Preciso conectar meu banco?',
    'Não, e nem dá: o app não fala com banco nenhum. Baixe o extrato no app ou no site do banco e importe o arquivo — ele é lido aqui, no seu aparelho.',
  ],
  [
    'Quais extratos dá para importar?',
    'OFX, CSV, XLSX, XLS, QIF, ODS e TXT, de conta e de fatura de cartão. Prefira OFX quando o banco oferecer. Importar o mesmo arquivo duas vezes não duplica nada: o que já entrou é reconhecido e pulado.',
  ],
  [
    'Preciso criar conta?',
    'Não para usar. Tudo funciona antes de qualquer cadastro. A conta só serve para levar os dados a outro aparelho, e o que você já lançou vai junto.',
  ],
  [
    'Onde ficam meus dados?',
    'No seu aparelho, primeiro. Com conta, uma cópia fica no servidor para sincronizar. A seção “Onde seus dados ficam”, acima, explica cada detalhe.',
  ],
  [
    'Funciona no celular e sem internet?',
    'Sim. Instale pelo navegador e ele abre como aplicativo, inclusive offline. Só notícias e cotações precisam de conexão.',
  ],
  [
    'E se eu trocar de celular?',
    'Com conta, entre com o mesmo e-mail no aparelho novo e tudo desce sozinho. Sem conta, exporte um backup em Ajustes e restaure no aparelho novo.',
  ],
] as const;

function Perguntas() {
  return (
    <section id="perguntas" aria-labelledby="perguntas-titulo" className="scroll-mt-20 border-t border-line bg-surface/40 px-5 py-20">
      <div className="mx-auto grid max-w-[72rem] gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
        <h2 id="perguntas-titulo" className="font-display text-[30px] leading-tight text-ink sm:text-[36px]">
          Perguntas frequentes
        </h2>

        <div className="border-b border-line">
          {FAQ.map(([pergunta, resposta]) => (
            <details key={pergunta} className="group border-t border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-4 text-[15px] text-ink [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{pergunta}</span>
                <span aria-hidden className="shrink-0 text-[18px] leading-none text-ink-3 transition-transform duration-[var(--t-base)] group-open:rotate-45">
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
        <p className="mt-5 max-w-[40ch] text-[20px] leading-relaxed text-ink">Chegue sabendo quanto sobra.</p>
        <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-ink-2">
          Abre e usa: sem cadastro para começar, sem cartão, sem senha de banco.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/app" className={cn(botaoPrimario, 'w-full sm:w-auto')}>
            Começar agora
          </Link>
          <Link href="/demo" className={cn(botaoSecundario, 'w-full sm:w-auto')}>
            Explorar {BRAND.name} <ArrowRight size={16} className="ml-2" aria-hidden />
          </Link>
        </div>
        <p className="mt-4 text-[13px] text-ink-3">O exemplo abre sem cadastro, com dados fictícios. Instala como aplicativo pelo navegador — sem loja.</p>
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
        href="#problema"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-field focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        Pular para o conteúdo
      </a>

      <TopBar />
      <Trilho />

      <main>
        <Hero />
        <Fatos />
        <Problema />
        <Solucao />
        <ComoFunciona />
        <Mes />
        <Inteligencia />
        <Privacidade />
        <Funcionalidades />
        <Celular />
        <Perguntas />
        <Fechamento />
      </main>

      <Rodape />
    </>
  );
}
