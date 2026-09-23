-- =============================================================================
-- FinanceCS — esquema inicial
--
-- O app é local-first: o dono dos dados é o aparelho, e o servidor existe para
-- levar o que mudou de um aparelho para o outro. Isso muda o desenho do banco.
--
-- Em vez de uma tabela por entidade, existe UMA tabela de registros com o
-- conteúdo em jsonb. O motivo é prático: o servidor nunca consulta por campo —
-- ele só devolve "tudo que mudou depois de tal instante", e quem filtra,
-- soma e ordena é o cliente, que já tem a base inteira em mãos. Uma tabela por
-- entidade daria doze migrações a cada campo novo, sem nada em troca.
--
-- O que o servidor precisa saber de verdade são três coisas: de quem é o
-- registro, quando mudou, e se foi apagado. Essas três estão em colunas.
-- =============================================================================

-- ---------------------------------------------------------------- espaços --
-- Tudo pertence a um espaço. Hoje cada pessoa tem o seu; quando entrar o
-- espaço compartilhado (casal, família), nada aqui precisa mudar.

create table if not exists public.spaces (
  id          uuid primary key,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Meu dinheiro',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists spaces_owner_idx on public.spaces (owner_id);

create table if not exists public.space_members (
  space_id    uuid not null references public.spaces (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists space_members_user_idx on public.space_members (user_id);

-- --------------------------------------------------------------- registros --
-- `data` guarda o registro inteiro como o cliente o conhece, incluindo o
-- updated_at LOCAL dele. A coluna updated_at daqui é outra coisa: é a hora do
-- SERVIDOR, usada só como marca d'água do sync.
--
-- A separação importa. O relógio de um celular pode estar meia hora adiantado;
-- se a marca d'água dependesse dele, um aparelho com a hora errada deixaria de
-- receber mudanças ou receberia as mesmas para sempre. A hora do servidor é a
-- única que todos os aparelhos enxergam igual.

create table if not exists public.records (
  space_id    uuid not null references public.spaces (id) on delete cascade,
  collection  text not null,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (space_id, collection, id)
);

-- o índice que serve a única consulta de leitura que existe: o que mudou desde
create index if not exists records_sync_idx on public.records (space_id, updated_at);

-- ------------------------------------------------------------- carimbo ------
-- O cliente nunca escreve a hora do servidor; o gatilho escreve por ele.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.touch_updated_at();

drop trigger if exists spaces_touch on public.spaces;
create trigger spaces_touch
  before insert or update on public.spaces
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- acesso ----
-- Uma pessoa enxerga um espaço se for membro dele. A função é `security
-- definer` para poder ler space_members sem cair na política da própria
-- tabela, o que causaria recursão infinita.

create or replace function public.is_space_member(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.space_members
    where space_id = target and user_id = auth.uid()
  );
$$;

alter table public.spaces        enable row level security;
alter table public.space_members enable row level security;
alter table public.records       enable row level security;

-- espaços -------------------------------------------------------------------

drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces
  for select using (public.is_space_member(id));

drop policy if exists spaces_insert on public.spaces;
create policy spaces_insert on public.spaces
  for insert with check (owner_id = auth.uid());

drop policy if exists spaces_update on public.spaces;
create policy spaces_update on public.spaces
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists spaces_delete on public.spaces;
create policy spaces_delete on public.spaces
  for delete using (owner_id = auth.uid());

-- membros -------------------------------------------------------------------
-- Só o dono do espaço convida e remove. Sem isso, um convidado poderia se
-- promover a dono ou convidar terceiros para o dinheiro de outra pessoa.

drop policy if exists members_select on public.space_members;
create policy members_select on public.space_members
  for select using (user_id = auth.uid() or public.is_space_member(space_id));

drop policy if exists members_insert on public.space_members;
create policy members_insert on public.space_members
  for insert with check (
    exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  );

drop policy if exists members_delete on public.space_members;
create policy members_delete on public.space_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.spaces s where s.id = space_id and s.owner_id = auth.uid())
  );

-- registros -----------------------------------------------------------------

drop policy if exists records_select on public.records;
create policy records_select on public.records
  for select using (public.is_space_member(space_id));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records
  for insert with check (public.is_space_member(space_id));

drop policy if exists records_update on public.records;
create policy records_update on public.records
  for update using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

-- Não há política de DELETE de propósito: o app nunca remove uma linha, só
-- marca `deleted_at`. É isso que faz um item apagado continuar apagado quando
-- um aparelho que estava offline volta e reenvia a cópia velha.

-- ------------------------------------------------- criação do espaço -------
-- Criar espaço e virar membro dele precisa acontecer junto. Separado, uma
-- falha entre os dois passos deixaria a pessoa dona de um espaço que ela mesma
-- não enxerga — e sem enxergar, não consegue nem consertar.

create or replace function public.create_space(space_id uuid, space_name text default 'Meu dinheiro')
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.spaces;
begin
  if auth.uid() is null then
    raise exception 'Precisa estar autenticado.';
  end if;

  insert into public.spaces (id, owner_id, name)
  values (space_id, auth.uid(), coalesce(nullif(space_name, ''), 'Meu dinheiro'))
  on conflict (id) do update set name = excluded.name
  returning * into created;

  if created.owner_id <> auth.uid() then
    raise exception 'Este espaço é de outra pessoa.';
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (created.id, auth.uid(), 'owner')
  on conflict do nothing;

  return created;
end;
$$;

grant execute on function public.create_space(uuid, text) to authenticated;

-- ------------------------------------------------------------- anexos ------
-- Os comprovantes vão para o Storage, num balde privado. O caminho começa com
-- o id do espaço, e a política só deixa passar quem é membro daquele espaço.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects
  for select using (
    bucket_id = 'receipts'
    and public.is_space_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists receipts_write on storage.objects;
create policy receipts_write on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and public.is_space_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and public.is_space_member(((storage.foldername(name))[1])::uuid)
  );
