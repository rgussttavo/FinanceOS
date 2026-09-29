import * as React from 'react';
import { CalendarClock, CreditCard, FileUp, Landmark, PiggyBank, Receipt, Users, type LucideIcon } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { AppLink, TopBar, Trilho } from './chrome';
import { BehaviorScene, ConnectScene, DiagnosisBlock, Hero, IntelligenceScene, MonthScene, PlanScene, ProblemScene, PuzzleScene } from './scenes';
import { CtaGroup, StoryHeading } from './story';

/**
 * A vitrine: a história de um quebra-cabeça financeiro.
 *
 * As peças do mês — saldo, contas, cartões, assinaturas, dívidas, metas,
 * patrimônio — começam espalhadas e vão se ligando enquanto a página desce:
 * o problema (o saldo não conta tudo), o mês (o que ainda vai acontecer), as
 * ligações (uma compra vira fatura, que vira saldo futuro), a leitura (o que
 * os números significam), o plano, o comportamento e, no fim, tudo junto.
 * Depois vêm as referências — recursos, privacidade, perguntas — e o convite.
 *
 * Nada aqui promete o que o app não faz. As frases entre aspas são as que o
 * app escreve; os números são exemplos e fecham entre si (scenes.tsx).
 */

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
    'O app não conecta em banco nenhum e não tem pixel de anúncio nem métrica de terceiros. A entrada na conta é com o Google ou com e-mail e senha.',
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
          <StoryHeading id="privacidade-titulo" eyebrow="Privacidade">
            Onde seus dados ficam
          </StoryHeading>
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
    ['Saldo previsto dia a dia até o fim do mês', 'Quanto dá para gastar até o salário', 'Alertas antes de o saldo apertar', 'Diagnóstico por área, com o porquê em números'],
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

function Recursos() {
  return (
    <section id="recursos" aria-labelledby="recursos-titulo" className="scroll-mt-20 border-t border-line bg-surface/40 px-5 py-20 sm:py-24">
      <div className="mx-auto max-w-[72rem]">
        <StoryHeading id="recursos-titulo" eyebrow="Recursos">
          Organizado pelo problema que resolve
        </StoryHeading>

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
    'Não para usar: em “Começar agora”, toque em “Continuar sem conta” e tudo funciona no aparelho. A conta — com o Google ou com e-mail e senha — serve para levar os dados a outro aparelho, e o que você já lançou vai junto.',
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
    'Com conta, entre com a mesma conta no aparelho novo e tudo desce sozinho. Sem conta, exporte um backup em Ajustes e restaure no aparelho novo.',
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
    <section id="comecar" aria-labelledby="comecar-titulo" className="relative overflow-hidden border-t border-line px-5 py-24 sm:py-32">
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 size-[34rem] -translate-x-1/2 rounded-full opacity-[0.12] blur-[110px]"
        style={{ background: 'radial-gradient(circle, var(--accent), transparent 66%)' }}
      />
      <div className="mx-auto max-w-[72rem]">
        <StoryHeading id="comecar-titulo" lead="Entenda antes. Planeje melhor. Decida com clareza.">
          Pare de descobrir no fim do mês.
        </StoryHeading>
        <CtaGroup secondary="Explorar primeiro" className="mt-8" />
        <p className="mt-4 text-[13px] text-ink-3">
          Grátis, sem cartão e sem senha de banco. A conta é opcional; o exemplo abre com dados fictícios.
        </p>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="border-t border-line px-5 py-10">
      <div className="mx-auto flex max-w-[72rem] flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-[13px] text-ink-2">
          {BRAND.name} — {BRAND.tagline.toLowerCase()}
        </p>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
          <AppLink href="/entrar" className="text-ink-2 hover:text-ink">
            Entrar
          </AppLink>
          <AppLink href="/demo" className="text-ink-2 hover:text-ink">
            Explorar o exemplo
          </AppLink>
          <a href="#privacidade" className="text-ink-2 hover:text-ink">
            Privacidade
          </a>
        </nav>
      </div>
      <p className="mx-auto mt-4 max-w-[72rem] text-[12px] text-ink-3">Os valores mostrados nas telas desta página são exemplos.</p>
    </footer>
  );
}

/* ------------------------------------------------------------------ página */

/** sem JavaScript, nada fica escondido esperando uma animação */
const NO_SCRIPT_CSS =
  '.reveal,.reveal-child,.step,.assemble,.emerge{opacity:1!important;transform:none!important;filter:none!important}.submerge{opacity:0!important}.link-x,.link-y{transform:none!important}.meter-fill{transform:scaleX(var(--w,1))!important}';

export function Landing() {
  return (
    <>
      <a
        href="#problema"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-field focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        Pular para o conteúdo
      </a>
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>

      <TopBar />
      <Trilho />

      <main className="overflow-x-clip">
        <Hero />
        <ProblemScene />
        <MonthScene />
        <ConnectScene />
        <IntelligenceScene />
        <DiagnosisBlock />
        <PlanScene />
        <BehaviorScene />
        <PuzzleScene />
        <Recursos />
        <Privacidade />
        <Perguntas />
        <Fechamento />
      </main>

      <Rodape />
    </>
  );
}
