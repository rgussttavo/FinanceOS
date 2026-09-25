-- =============================================================================
-- FinanceOS — no servidor, vale a edição mais nova
--
-- Cada registro viaja com o `updatedAt` de quando foi editado no aparelho. O
-- upsert, porém, gravava qualquer versão que chegasse: um aparelho que passou
-- horas offline subia a versão dele por cima da que outro aparelho tinha
-- gravado depois, e os dois passavam a discordar para sempre.
--
-- O app agora desce antes de subir, e isso resolve quase sempre. Este gatilho
-- fecha o resto: entre o aparelho descer e subir, outro pode gravar. Quando a
-- versão que chega é mais velha que a que está aqui, a linha fica como está —
-- o gatilho devolve NULL e o Postgres pula aquela linha sem erro. O aparelho
-- que mandou a versão velha recebe a nova no próximo sync.
--
-- O nome começa com "records_a" de propósito: gatilhos BEFORE rodam em ordem
-- alfabética, e este precisa decidir antes de `records_touch` carimbar a hora.
-- =============================================================================

create or replace function public.keep_newest_record()
returns trigger
language plpgsql
as $$
declare
  old_at timestamptz;
  new_at timestamptz;
begin
  begin
    old_at := (old.data->>'updatedAt')::timestamptz;
    new_at := (new.data->>'updatedAt')::timestamptz;
  exception when others then
    -- carimbo ilegível de um lado ou de outro: não há como comparar, grava
    return new;
  end;

  if old_at is not null and new_at is not null and new_at < old_at then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists records_a_keep_newest on public.records;
create trigger records_a_keep_newest
  before update on public.records
  for each row execute function public.keep_newest_record();
