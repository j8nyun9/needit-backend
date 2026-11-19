begin;
alter table public.problems add column if not exists author_id uuid references auth.users(id) on delete set null;
create index if not exists problems_author_id_idx on public.problems(author_id);

-- Only the trusted backend may assign authors or delete posts.
revoke insert,update,delete on public.problems from anon,authenticated;

create or replace function public.delete_own_problem(p_problem_id bigint,p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_author uuid;
begin
  select author_id into stored_author from public.problems where id=p_problem_id for update;
  if not found then return 'not_found'; end if;
  if p_user_id is null or stored_author is distinct from p_user_id then return 'forbidden'; end if;

  -- Remove links and feedback for this issue; the projects themselves stay intact.
  delete from public.project_problems where problem_id=p_problem_id;
  delete from public.comments where problem_id=p_problem_id;
  delete from public.empathies where problem_id=p_problem_id;
  -- The personal-plan table may not yet be installed in an older environment.
  if pg_catalog.to_regclass('public.problem_ai_plans') is not null then
    execute 'delete from public.problem_ai_plans where problem_id=$1' using p_problem_id;
  end if;
  delete from public.problems where id=p_problem_id and author_id=p_user_id;
  return 'deleted';
end;
$$;
revoke all on function public.delete_own_problem(bigint,uuid) from public,anon,authenticated;
grant execute on function public.delete_own_problem(bigint,uuid) to service_role;
notify pgrst, 'reload schema';
commit;

-- Older posts have no trustworthy author data. Assign them only after verification:
-- update public.problems set author_id=(select id from auth.users where email='student01@example.com') where id=123 and author_id is null;
