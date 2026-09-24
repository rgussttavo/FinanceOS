-- =============================================================================
-- FinanceOS — um espaço por pessoa, decidido pelo servidor
--
-- O cliente perguntava "esta conta já tem espaço?" antes de criar um. A
-- pergunta funcionava, mas era uma corrida: logo depois do login existe um
-- intervalo em que a sessão já vale para saber quem é a pessoa e ainda não vale
-- para a consulta, e nesse intervalo a resposta volta vazia. O app concluía
-- "não tem" e criava um segundo espaço — a mesma pessoa com dois mundos
-- separados, que é o oposto de sincronizar.
--
-- Nenhum cuidado no cliente fecha isso de forma confiável, porque o cliente
-- pergunta e decide em dois momentos diferentes. Aqui pergunta e decisão
-- acontecem na mesma transação, no único lugar que enxerga a verdade inteira.
--
-- A função continua recebendo o id que o aparelho sugere. Se a pessoa ainda não
-- tem espaço, esse id é usado. Se já tem, o dela volta — e o aparelho se adapta
-- ao que recebeu em vez de insistir no que pediu.
-- =============================================================================

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

  -- o espaço mais antigo desta pessoa ganha: é onde a vida dela já está
  select s.* into created
  from public.spaces s
  join public.space_members m on m.space_id = s.id
  where m.user_id = auth.uid()
    and s.deleted_at is null
  order by s.created_at asc
  limit 1;

  if found then
    return created;
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
