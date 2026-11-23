-- 한 불편함에서 여러 사용자가 각자 프로젝트를 시작할 수 있도록 변경합니다.
-- 20261120_project_adoption.sql의 "불편함 1개 = 프로젝트 1개" 규칙을 대체합니다.
-- 선행 마이그레이션: 20261118_personal_ai_plans.sql, 20261119_project_release.sql
-- 기존 연결 데이터는 변경하지 않습니다.

begin;

-- 1) 불편함당 프로젝트 1개 제약 제거 (없으면 아무것도 하지 않음)
alter table public.project_problems drop constraint if exists project_problems_problem_id_key;

-- 2) 기획안 확인, 프로젝트 생성, 연결 생성을 한 트랜잭션에서 처리합니다.
--    이미 다른 프로젝트에 연결된 불편함이어도 새 프로젝트를 만들 수 있습니다.
create or replace function public.create_project_from_problem(
  p_user_id uuid,
  p_problem_id bigint,
  p_title text,
  p_description text,
  p_features text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_project public.projects;
begin
  if p_user_id is null then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if not exists (select 1 from public.problems where id = p_problem_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- Serialize adoption on this problem so concurrent requests cannot create duplicates.
  perform 1 from public.problems where id=p_problem_id for update;
  if not found then
    return jsonb_build_object('status','not_found');
  end if;
  select p.* into new_project from public.projects p
    join public.project_problems l on l.project_id=p.id
    where l.problem_id=p_problem_id and p.owner_id=p_user_id
    order by p.created_at,p.id limit 1;
  if found then
    return jsonb_build_object('status','already_exists','project',to_jsonb(new_project));
  end if;
  if not exists (
    select 1 from public.problem_ai_plans
    where user_id = p_user_id and problem_id = p_problem_id
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  insert into public.projects
    (title, description, features, tech_stack, owner_id, release_status)
  values
    (p_title, p_description, coalesce(p_features, '{}'::text[]), '{}'::text[], p_user_id, '기획 중')
  returning * into new_project;

  insert into public.project_problems (project_id, problem_id)
  values (new_project.id, p_problem_id);

  return jsonb_build_object('status', 'created', 'project', to_jsonb(new_project));
end;
$$;

revoke all on function public.create_project_from_problem(uuid, bigint, text, text, text[]) from public, anon, authenticated;
grant execute on function public.create_project_from_problem(uuid, bigint, text, text, text[]) to service_role;

notify pgrst, 'reload schema';
commit;
