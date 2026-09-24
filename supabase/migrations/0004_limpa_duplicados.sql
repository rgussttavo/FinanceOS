-- =============================================================================
-- FinanceOS — limpeza do que a corrida deixou para trás
--
-- Roda UMA vez, depois da 0003. Não muda regra nenhuma: só remove o lixo que o
-- bug do espaço duplicado produziu enquanto existiu.
--
-- Duas coisas, e as duas são conservadoras de propósito:
--
--   1. Espaços vazios que não são o mais antigo da pessoa. "Vazio" aqui é
--      literal: nenhum registro além de preferências. Qualquer espaço com um
--      lançamento, cartão ou meta dentro fica intocado, mesmo sendo duplicado —
--      apagar dado de alguém para arrumar bug meu seria pior que o bug.
--
--   2. Preferências repetidas dentro do mesmo espaço. Só pode haver uma; fica a
--      mais antiga, que é a que a pessoa vem usando.
--
-- O SELECT do fim mostra como ficou, para conferir antes de fechar a aba.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- 1. espaços
with primeiro as (
  select m.user_id, min(s.created_at) as nascimento
  from public.spaces s
  join public.space_members m on m.space_id = s.id
  where s.deleted_at is null
  group by m.user_id
),
sobrando as (
  select distinct s.id
  from public.spaces s
  join public.space_members m on m.space_id = s.id
  join primeiro p on p.user_id = m.user_id
  where s.created_at > p.nascimento
    and not exists (
      select 1 from public.records r
      where r.space_id = s.id and r.collection <> 'settings'
    )
)
delete from public.spaces where id in (select id from sobrando);

-- ----------------------------------------------------------- 2. preferências
with ranqueado as (
  select id, space_id,
         row_number() over (partition by space_id order by updated_at asc, id asc) as pos
  from public.records
  where collection = 'settings'
)
delete from public.records
where collection = 'settings'
  and id in (select id from ranqueado where pos > 1);

commit;

-- ------------------------------------------------------------------ conferir
select s.id,
       s.name,
       s.created_at,
       (select count(*) from public.records r where r.space_id = s.id) as registros,
       (select count(*) from public.records r where r.space_id = s.id and r.collection = 'settings') as preferencias
from public.spaces s
order by s.created_at;
