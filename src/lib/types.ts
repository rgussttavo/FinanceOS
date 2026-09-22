/**
 * Modelo de domínio do Norte.
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
  /** saldo declarado na criação; o extrato caminha a partir dele */
  openingBalance: Cents;
  archived: boolean;
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
}

export type EntrySource = 'manual' | 'ofx' | 'csv' | 'boleto' | 'pix' | 'recurring' | 'card';

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
}

/* ------------------------------------------------------------------ sync */

export type MutationOp = 'put' | 'delete';

/** tabelas que participam do sync incremental */
export type SyncTable =
  | 'categories'
  | 'accounts'
  | 'cards'
  | 'entries'
  | 'subscriptions'
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
