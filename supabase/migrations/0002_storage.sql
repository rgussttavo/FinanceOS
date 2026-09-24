-- =============================================================================
-- FinanceCS — comprovantes no Storage
--
-- Roda DEPOIS de 0001_init.sql, e separado dele de propósito: projetos novos do
-- Supabase não deixam o SQL Editor criar política em `storage.objects`, e um
-- erro ali derrubaria a migração inteira se estivesse tudo no mesmo arquivo.
--
-- Se este arquivo falhar com "must be owner of table objects", não tem
-- problema: dá para fazer o mesmo pelo painel, em três cliques. O passo a passo
-- está no fim.
--
-- O caminho de cada arquivo é `<id do espaço>/<id do comprovante>`. A política
-- lê o espaço do próprio caminho e confere se quem pediu é membro dele — assim
-- autorizar um download não precisa de consulta extra ao banco.
-- =============================================================================

-- balde privado: nada aqui é público, nem por link
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- ler: só membro do espaço dono da pasta
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects
  for select using (
    bucket_id = 'receipts'
    and public.is_space_member(((storage.foldername(name))[1])::uuid)
  );

-- enviar: idem
drop policy if exists receipts_write on storage.objects;
create policy receipts_write on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and public.is_space_member(((storage.foldername(name))[1])::uuid)
  );

-- substituir um arquivo já enviado
drop policy if exists receipts_update on storage.objects;
create policy receipts_update on storage.objects
  for update using (
    bucket_id = 'receipts'
    and public.is_space_member(((storage.foldername(name))[1])::uuid)
  );

-- apagar: aqui a remoção é de verdade, porque o arquivo ocupa espaço e o
-- registro que o descrevia já guarda o `deleted_at` que conta a história
drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and public.is_space_member(((storage.foldername(name))[1])::uuid)
  );

-- -----------------------------------------------------------------------------
-- Se deu "must be owner of table objects", faça pelo painel:
--
--   1. Storage → New bucket → nome `receipts`, deixe "Public bucket" DESLIGADO
--   2. Storage → Policies → receipts → New policy → For full customization
--   3. Crie uma política para cada operação (SELECT, INSERT, UPDATE, DELETE)
--      usando esta expressão:
--
--        public.is_space_member(((storage.foldername(name))[1])::uuid)
--
-- O app funciona sem isso; só os comprovantes é que ficam sem cópia na nuvem,
-- e continuam salvos no aparelho.
-- =============================================================================
