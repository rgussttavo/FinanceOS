# FinanceCS

Um PWA de finanças pessoais, local-first e sem conectar banco. Contas, cartões,
assinaturas, metas, dívidas, rateio, orçamento, comprovantes e patrimônio — o
mês inteiro numa tela.

Construído a partir do estudo do [CentavOS](https://centavos.app.br): mesma
estrutura e mesmas funcionalidades, código e identidade próprios.

## Como rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000`. **Não precisa de nada configurado** — o app é
local-first e funciona inteiro sem nuvem, guardando tudo no navegador.

Comandos:

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run lint` | ESLint, com zero tolerância a aviso |
| `npx tsc --noEmit` | checagem de tipos |

## Como está organizado

```
src/lib/        regras e cálculos, sem React
src/components/ peças de interface reutilizáveis
src/features/   uma tela por arquivo
src/app/        rotas e as chamadas externas em /api
supabase/       migração SQL do banco
```

O que vale saber antes de mexer:

- **Dinheiro é sempre centavo inteiro.** Nunca reais em ponto flutuante.
  `src/lib/money.ts` é o único lugar que formata valor.
- **Data civil é texto `AAAA-MM-DD`.** `new Date('2026-03-10')` é UTC e vira o
  dia 9 em São Paulo. `src/lib/dates.ts` trata tudo por ano, mês e dia locais.
- **A UI nunca fala com a rede.** Ela lê e escreve no IndexedDB, e cada escrita
  deixa uma mutação na fila. O sync drena a fila quando houver conexão.
- **Exclusão é `deletedAt`, não remoção.** É o que faz um item apagado
  continuar apagado quando um aparelho que estava offline volta.

## Ligar a nuvem

O app funciona sem isso. Ligar dá login, sincronização entre aparelhos e backup
dos comprovantes.

### 1. Criar o projeto no Supabase

Em [supabase.com](https://supabase.com), crie um projeto no plano gratuito.
Região sugerida: **South America (São Paulo)**, que é a mais perto.

### 2. Rodar a migração

No painel do projeto, abra **SQL Editor** e execute os dois arquivos, nesta
ordem:

1. `supabase/migrations/0001_init.sql` — tabelas, políticas de acesso e a
   função que cria o espaço. Pode rodar mais de uma vez sem quebrar nada.
2. `supabase/migrations/0002_storage.sql` — o balde dos comprovantes.

Se o segundo falhar com *"must be owner of table objects"*, não tem problema:
projetos novos do Supabase restringem mexer em `storage.objects` por SQL. O
próprio arquivo traz o passo a passo pelo painel, no fim. O app funciona sem
isso — só os comprovantes é que ficam sem cópia na nuvem.

### 3. Configurar o login

Em **Authentication → Providers**:

- **Email**: precisa estar **ligado** — em projetos novos ele vem desligado, e
  sem isso o login não funciona. Desligue também "Confirm email" para o código
  de 6 dígitos bastar, sem link de confirmação.
- **Google** (opcional): crie as credenciais OAuth no Google Cloud e cole o
  Client ID e o Secret. Em **URL Configuration**, adicione a URL do seu site em
  "Redirect URLs" — em desenvolvimento, `http://localhost:3000/app`.

### 4. Apontar o app para ele

Copie `.env.example` para `.env.local` e preencha com os valores de
**Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Use a chave **anon / public**. A `service_role` ignora todas as políticas de
acesso e nunca deve chegar ao navegador.

Reinicie o `npm run dev`. A tela de perfil passa a mostrar "Criar conta ou
entrar".

## Publicar na Vercel

1. Suba o repositório para o GitHub.
2. Em [vercel.com](https://vercel.com), **Add New → Project** e importe o
   repositório. A Vercel reconhece Next.js sozinha; não mexa nas configurações
   de build.
3. Em **Environment Variables**, adicione as duas variáveis do passo 4 acima —
   nos três ambientes (Production, Preview e Development).
4. Deploy.

Depois do primeiro deploy, volte ao Supabase e acrescente a URL de produção em
**Authentication → URL Configuration → Redirect URLs**, senão o login com
Google volta para o lugar errado.

Cada branch vira um preview com URL própria, o que é o jeito mais simples de
mandar uma versão para alguém testar sem mexer na de produção.

## Sobre o desenho do banco

Existe **uma** tabela de registros, com o conteúdo em `jsonb`, em vez de uma
tabela por entidade. O servidor nunca consulta por campo — ele só devolve "tudo
que mudou depois de tal instante", e quem filtra, soma e ordena é o cliente,
que já tem a base inteira em mãos.

A coluna `updated_at` guarda a hora do **servidor**, não a do aparelho, e é ela
que serve de marca d'água do sync. Relógio de celular erra; se a marca d'água
dependesse dele, um aparelho com a hora adiantada deixaria de receber mudanças
sem nenhum aviso. O `updatedAt` de dentro do `data` é outra coisa: é o do
cliente, e é ele que decide quem vence quando dois aparelhos mexem no mesmo
registro.

## O que ainda falta

- Índices, commodities e papéis da B3 na tela de News, que dependem de uma
  fonte de dados ainda não escolhida. As seções aparecem marcadas como "sem
  fonte" — o contrato da API já prevê os campos.
- Landing page definitiva.
