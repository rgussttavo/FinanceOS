/**
 * Modelo de domínio do FinanceOS.
 *
 * Duas decisões valem para tudo o que está aqui:
 *
 * 1. Dinheiro é `number` em CENTAVOS INTEIROS. Nunca reais em ponto flutuante.
 *    0.1 + 0.2 !== 0.3 e um app de dinheiro não pode conviver com isso.
 * 2. Toda entidade carrega os campos de sincronização (`SyncFields`). O sync é
 *    incremental por registro: sobe o que mudou, desce o que mudou depois do
 *    último `pulledAt`. Exclusão é `deletedAt` (soft delete), não remoção — é o
 *    que faz um item apagado continuar apagado nos outros aparelhos.
 */

/** valor monetário em centavos; 1234 = R$ 12,34 */
export type Cents = number;

/** data civil sem fuso, no formato AAAA-MM-DD */
export type IsoDate = string;

/** competência mensal, no formato AAAA-MM */
export type MonthKey = string;

/** instante em ISO-8601 UTC */
export type IsoInstant = string;

export interface SyncFields {
  id: string;
  spaceId: string;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  /** preenchido quando o registro é excluído; nunca some da base local */
  deletedAt: IsoInstant | null;
}

/* ------------------------------------------------------------------ espaço */

/**
 * Tudo pertence a um espaço. Hoje cada pessoa tem o seu; quando entrar o
 * espaço compartilhado (casal, família), nenhuma tabela precisa migrar.
 */
export interface Space extends Omit<SyncFields, 'spaceId'> {
  name: string;
  ownerId: string;
}

export type SpaceRole = 'owner' | 'editor' | 'viewer';

export interface SpaceMember extends SyncFields {
  userId: string;
  role: SpaceRole;
  displayName: string;
}

/* --------------------------------------------------------------- categoria */

export type FlowKind = 'in' | 'out' | 'invest';

export interface Category extends SyncFields {
  name: string;
  kind: FlowKind;
  /** emoji ou nome de ícone; a UI resolve */
  icon: string;
  color: string;
  /** categoria de sistema não pode ser excluída, só renomeada */
  system: boolean;
  /** ordem manual na lista */
  order: number;
  /** orçamento mensal para a categoria, em centavos; 0 = sem teto */
  budget: Cents;
}

/* ------------------------------------------------------------------- conta */

export type AccountKind = 'checking' | 'savings' | 'cash' | 'broker' | 'other';

export interface Account extends SyncFields {
  name: string;
  kind: AccountKind;
  institution: string;
  color: string;
  /**
   * Saldo no começo do dia `openingDate`. É o ponto de partida: o saldo de
   * qualquer dia é ele mais o que se realizou na conta de `openingDate` em
   * diante. O que aconteceu antes já está dentro dele e não conta de novo.
   */
  openingBalance: Cents;
  /** a data a que o saldo inicial se refere; ausente nas contas antigas = desde sempre */
  openingDate?: IsoDate | null;
  /**
   * A conta principal: onde cai o lançamento que não diz de qual conta é.
   * Existe exatamente uma por espaço.
   */
  primary?: boolean;
  /**
   * Saldos que o banco declarou (extrato importado ou conferido à mão). São
   * conferidos o tempo todo: se um lançamento some ou muda depois, a conta
   * volta a mostrar a diferença, em vez de o saldo "conferido" mentir calado.
   */
  checkpoints?: BalanceCheckpoint[];
  archived: boolean;
}

export interface BalanceCheckpoint {
  /** o saldo no FIM deste dia, segundo o banco */
  date: IsoDate;
  amount: Cents;
  /** de onde veio: nome do arquivo importado, ou "informado" */
  source: string;
  at: IsoInstant;
  /**
   * Saldo de um instante, não do fim do dia: o "hoje eu tenho X" dito à mão.
   * O que foi lançado depois, no mesmo dia, não entra na conferência dele —
   * senão a transferência feita à tarde "quebraria" o saldo informado de
   * manhã. O saldo de extrato é sempre de fim de dia.
   */
  moment?: boolean;
}

/* ----------------------------------------------------------- transferência */

/**
 * Dinheiro que muda de lugar sem entrar nem sair da vida da pessoa.
 *
 * Um registro só, com os dois lados dentro — e não uma despesa numa conta e
 * uma receita na outra. Assim não existe transferência pela metade: editar ou
 * excluir mexe nos dois lados de uma vez, e ela nunca aparece como gasto nem
 * como renda.
 *
 *   account     conta → conta (TED, Pix entre contas suas, aplicação em
 *               corretora cadastrada como conta)
 *   card        conta → cartão: o pagamento da fatura. A compra já pesou no
 *               cartão; o pagamento só tira o dinheiro da conta.
 *   adjustment  correção de saldo feita pela pessoa para bater com o banco.
 *               Aparece como tal, nunca como receita ou despesa.
 */
export type TransferKind = 'account' | 'card' | 'adjustment';

export interface Transfer extends SyncFields {
  kind: TransferKind;
  date: IsoDate;
  /** sempre positivo; em ajuste, o sentido vem de `direction` */
  amount: Cents;
  description: string;
  /** de onde sai; em ajuste, a conta ajustada */
  fromAccountId: string | null;
  /** para onde vai, em conta → conta */
  toAccountId: string | null;
  /** o cartão pago, em pagamento de fatura */
  toCardId: string | null;
  /** a fatura que o pagamento quita (AAAA-MM) */
  invoiceMonth: MonthKey | null;
  /** só no ajuste: o saldo subiu ('in') ou desceu ('out') */
  direction?: 'in' | 'out';
  notes: string;
  /** linhas de extrato que já correspondem a esta transferência (dos dois lados) */
  externalIds: string[];
  source: EntrySource;
}

/* ----------------------------------------------------------------- cartão */

export interface Card extends SyncFields {
  name: string;
  institution: string;
  brand: 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'other';
  last4: string;
  color: string;
  limit: Cents;
  /** dia do mês em que a fatura fecha (1–31, ajustado para meses curtos) */
  closingDay: number;
  /** dia do mês do vencimento */
  dueDay: number;
  /** conta de onde a fatura é debitada */
  accountId: string | null;
  archived: boolean;
}

/* ------------------------------------------------------------ recorrência */

export type RepeatKind = 'once' | 'monthly' | 'weekly' | 'yearly' | 'installments';

export interface Repeat {
  kind: RepeatKind;
  /** para 'installments': número total de parcelas. Para os demais, opcional. */
  count?: number;
  /**
   * Para 'installments': o valor total da compra, quando conhecido. As
   * parcelas saem dele com a sobra de centavos na primeira — R$ 100 em 3x é
   * 33,34 + 33,33 + 33,33, e não 3 × 33,33 = 99,99. Ausente, cada parcela vale
   * `amount`.
   */
  total?: Cents;
  /** repete até esta data, inclusive */
  until?: IsoDate | null;
}

/**
 * Baixa de uma ocorrência. A chave é a competência (AAAA-MM) para repetições
 * mensais, ou a data (AAAA-MM-DD) para semanais e avulsas.
 */
export interface Settlement {
  at: IsoInstant;
  /** valor efetivamente pago, quando diferente do previsto */
  amount?: Cents;
}

/* ------------------------------------------------------------- lançamento */

export interface Entry extends SyncFields {
  kind: FlowKind;
  description: string;
  /** valor de UMA ocorrência, em centavos e sempre positivo */
  amount: Cents;
  /** data da primeira ocorrência */
  date: IsoDate;
  categoryId: string | null;
  accountId: string | null;
  /** preenchido quando a despesa cai no cartão em vez da conta */
  cardId: string | null;
  repeat: Repeat;
  /** baixas por ocorrência, indexadas pela chave da ocorrência */
  settled: Record<string, Settlement>;
  notes: string;
  tags: string[];
  /** origem do registro — usado para não duplicar em reimportação */
  source: EntrySource;
  /** hash do lançamento no extrato importado; único por espaço */
  externalId: string | null;
  attachmentIds: string[];
  /**
   * A fatura em que a (primeira) parcela cai, quando a compra veio do arquivo
   * de uma fatura. O arquivo diz qual é a fatura; o dia de fechamento
   * cadastrado é só um palpite, e errar por dois dias mudava compras de fatura.
   */
  invoiceMonth?: MonthKey | null;
  /**
   * A cobrança real de uma assinatura cadastrada, vinda do extrato. Naquele
   * mês ela toma o lugar da cobrança prevista — com o valor e o dia que o
   * banco mostrou —, em vez de as duas pesarem juntas.
   */
  subscriptionId?: string | null;
  /** o mesmo, para a parcela de uma dívida cadastrada */
  debtId?: string | null;
  /**
   * Só em investimento: resgate. O dinheiro volta da aplicação para a conta —
   * entra na conta, sai do investido, e não é renda.
   */
  withdrawal?: boolean;
}

export type EntrySource = 'manual' | 'ofx' | 'csv' | 'qif' | 'xlsx' | 'boleto' | 'pix' | 'recurring' | 'card';

/* -------------------------------------------------------------- assinatura */

export interface Subscription extends SyncFields {
  name: string;
  /** domínio do serviço, usado para resolver o logo */
  domain: string;
  amount: Cents;
  /** dia do mês da cobrança */
  billingDay: number;
  cycle: 'monthly' | 'yearly';
  categoryId: string | null;
  cardId: string | null;
  accountId: string | null;
  color: string;
  startedAt: IsoDate;
  canceledAt: IsoDate | null;
  /** aviso antes da renovação, em dias; 0 desliga */
  remindDaysBefore: number;
  /** a pessoa marcou como essencial (true) ou dispensável (false); ausente = não disse */
  essential?: boolean | null;
  /** valores anteriores, para mostrar quando a assinatura subiu */
  priceHistory?: { amount: Cents; until: IsoDate }[];
}

/* ------------------------------------------------------------------- meta */

/**
 * De onde o progresso de uma meta vem.
 *
 * `manual` é a pessoa atualizando o quanto já juntou. As demais amarram a meta
 * a uma classe de investimento: cada aporte naquela categoria empurra a barra
 * sozinho, e é isso que faz a meta continuar viva depois da primeira semana.
 */
export type GoalSource = 'manual' | 'invested' | 'category';

export interface Goal extends SyncFields {
  name: string;
  icon: string;
  /** quanto se quer juntar, em centavos */
  target: Cents;
  source: GoalSource;
  /** com source 'category', a categoria de investimento que alimenta a meta */
  categoryId: string | null;
  /** com source 'manual', o quanto já foi guardado */
  saved: Cents;
  /** prazo opcional; define quanto guardar por mês */
  deadline: IsoDate | null;
  color: string;
  archivedAt: IsoInstant | null;
  /** meta pausada: sai dos alertas e das contas de ritmo até ser retomada */
  pausedAt?: IsoInstant | null;
  /** aportes feitos numa meta manual, para o histórico e o ritmo */
  deposits?: { at: IsoInstant; amount: Cents }[];
}

/* ------------------------------------------------------------------ dívida */

export type DebtKind = 'loan' | 'financing' | 'payroll' | 'card' | 'other';

export interface Debt extends SyncFields {
  name: string;
  kind: DebtKind;
  icon: string;
  /** valor de cada parcela, em centavos */
  installment: Cents;
  /** número total de parcelas */
  installments: number;
  /** mês da primeira parcela */
  startMonth: MonthKey;
  /** juros ao mês, em porcentagem (2.5 = 2,5% a.m.); 0 quando não se sabe */
  monthlyRate: number;
  /** lança a parcela nas despesas do mês automaticamente */
  inFlow: boolean;
  /** dia do mês em que a parcela vence; ausente nas cadastradas antes do campo */
  dueDay?: number;
  settledAt: IsoInstant | null;
}

/* ------------------------------------------------------------------ rateio */

export interface Participant {
  id: string;
  name: string;
  /** o participante é o dono da conta */
  me: boolean;
}

export interface SplitItem {
  id: string;
  description: string;
  amount: Cents;
  /** quem pagou */
  paidBy: string;
  /** entre quem divide; vazio significa todos */
  sharedWith: string[];
}

export interface Split extends SyncFields {
  name: string;
  icon: string;
  date: IsoDate;
  participants: Participant[];
  items: SplitItem[];
  closedAt: IsoInstant | null;
}

/* --------------------------------------------------------------- orçamento */

export interface BudgetItem {
  id: string;
  description: string;
  icon: string;
  /** quantidade; 4 passagens, 6 diárias */
  quantity: number;
  /** preço unitário, em centavos */
  unitPrice: Cents;
}

export interface Budget extends SyncFields {
  name: string;
  icon: string;
  /** por quantas pessoas o total é dividido; 1 quando é só seu */
  people: number;
  items: BudgetItem[];
  /** folga sobre o total, em porcentagem (10 = 10%) */
  bufferPercent: number;
  notes: string;
}

/* --------------------------------------------------------------- patrimônio */

export type AssetKind = 'property' | 'vehicle' | 'other';

/** referência de um veículo na tabela FIPE, guardada para reconsultar o valor */
export interface FipeRef {
  /** carros, motos ou caminhoes */
  vehicleType: 'carros' | 'motos' | 'caminhoes';
  brandCode: string;
  modelCode: string;
  yearCode: string;
  label: string;
  /** quando o valor foi consultado pela última vez */
  checkedAt: IsoInstant | null;
}

export interface Asset extends SyncFields {
  name: string;
  kind: AssetKind;
  icon: string;
  /** valor atual, em centavos */
  value: Cents;
  /** valor e data de aquisição, para medir valorização */
  purchaseValue: Cents;
  purchasedAt: IsoDate | null;
  /** imóvel pode ser corrigido pelo IPCA a partir da compra */
  indexedByIpca: boolean;
  fipe: FipeRef | null;
  notes: string;
}

/* ------------------------------------------------------------- comprovante */

export interface Attachment extends SyncFields {
  name: string;
  mime: string;
  size: number;
  /** caminho no Storage; nulo enquanto o arquivo só existe neste aparelho */
  storagePath: string | null;
  folderId: string | null;
  /** já subiu para a nuvem? o binário vive no IndexedDB até subir */
  uploaded: boolean;
}

export interface Folder extends SyncFields {
  name: string;
  icon: string;
  order: number;
}

/* ------------------------------------------------------- preferências */

export type ThemeChoice = 'light' | 'dark' | 'system';

export interface Settings extends SyncFields {
  theme: ThemeChoice;
  /** esconde todos os valores da tela (modo ombro do ônibus) */
  privateMode: boolean;
  /** primeiro dia do mês financeiro; 1 = mês civil */
  monthStartsOn: number;
  onboardedAt: IsoInstant | null;

  /* ------- perfil -------
     Mora junto das preferências porque é o mesmo registro por espaço e
     sincroniza pelo mesmo caminho. Tudo opcional: o app funciona inteiro sem
     a pessoa preencher nada disso. */
  displayName: string;
  bio: string;
  birthDate: IsoDate | null;
  location: string;
  phone: string;

  /* ------- funcionalidades que podem ser desligadas -------
     Quem não usa cartão não quer a fatura ocupando a aba de despesas. */
  cardsEnabled: boolean;
  newsEnabled: boolean;

  /* ------- o Início -------
     Blocos que a pessoa escolheu esconder. Ausente = tudo aparece. */
  hiddenBlocks?: string[];
}

/* ------------------------------------------------------------------ sync */

export type MutationOp = 'put' | 'delete';

/** tabelas que participam do sync incremental */
export type SyncTable =
  | 'categories'
  | 'accounts'
  | 'transfers'
  | 'cards'
  | 'entries'
  | 'subscriptions'
  | 'goals'
  | 'debts'
  | 'splits'
  | 'budgets'
  | 'assets'
  | 'attachments'
  | 'folders'
  | 'settings';

/**
 * Uma mutação pendente de subir. É a fila que torna o app utilizável offline:
 * a UI escreve no IndexedDB e enfileira aqui; o sync drena quando há rede.
 */
export interface Mutation {
  /** autoincremento local */
  seq?: number;
  table: SyncTable;
  op: MutationOp;
  recordId: string;
  /** payload já no formato da linha do Postgres */
  payload: Record<string, unknown>;
  queuedAt: IsoInstant;
  attempts: number;
  lastError: string | null;
}

export interface SyncState {
  id: 'singleton';
  /** marca d'água do último pull bem-sucedido */
  pulledAt: IsoInstant | null;
  lastPushAt: IsoInstant | null;
  spaceId: string | null;
  userId: string | null;
}
