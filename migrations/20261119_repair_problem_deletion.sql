begin;

-- Remove an older integer overload, if present, so PostgREST can select the RPC.
drop function if exists public.delete_own_problem(integer,uuid);

create or replace function public.delete_own_problem(
  p_problem_id bigint,
  p_user_id uuid
)
returns text
language plpgsql
security definer
-- Existing vote-count triggers may reference public tables without qualification.
set search_path = pg_catalog, public, pg_temp
as $$
declare
  stored_author uuid;
  child_table text;
begin
  select author_id into stored_author
  from public.problems where id=p_problem_id for update;
  if not found then return 'not_found'; end if;
  if p_user_id is null or stored_author is distinct from p_user_id then
    return 'forbidden';
  end if;

  -- An older installation may not have every optional feature's table yet.
  foreach child_table in array array['project_problems','comments','empathies','problem_ai_plans']
  loop
    if pg_catalog.to_regclass('public.' || child_table) is not null then
      execute pg_catalog.format('delete from public.%I where problem_id=$1',child_table)
      using p_problem_id;
    end if;
  end loop;
  delete from public.problems where id=p_problem_id and author_id=p_user_id;
  return 'deleted';
end;
$$;

revoke all on function public.delete_own_problem(bigint,uuid)
from public,anon,authenticated;
grant execute on function public.delete_own_problem(bigint,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
