-- AI 기획안 기반 프로젝트 등록 (POST /api/projects)
-- 선행 마이그레이션: 20261118_personal_ai_plans.sql, 20261119_project_release.sql
--
-- 1) 실행 전 읽기 전용 확인: 한 불편함이 여러 프로젝트에 연결된 행 조회
--    결과가 있으면 팀에서 유지할 연결을 정해 직접 정리한 뒤 이 파일을 실행합니다.
--
-- select pp.problem_id, array_agg(pp.project_id order by pp.project_id) as project_ids
-- from public.project_problems pp
-- group by pp.problem_id
-- having count(*) > 1
-- order by pp.problem_id;

begin;

-- 2) 중복 연결이 남아 있으면 아무 데이터도 바꾸지 않고 전체를 중단합니다.
do $$
declare
  dupes text;
begin
  select string_agg(format('problem %s -> projects %s', problem_id, project_ids), '; ')
    into dupes
  from (
    select problem_id, array_agg(project_id order by project_id)::text as project_ids
    from public.project_problems
    group by problem_id
    having count(*) > 1
  ) d;
  if dupes is not null then
    raise exception '중복 채택된 불편함이 있어 마이그레이션을 중단합니다: %', dupes
      using hint = '유지할 연결을 팀에서 결정해 project_problems를 정리한 뒤 다시 실행하세요.';
  end if;
end;
$$;

-- 3) 한 불편함은 한 프로젝트에만 채택됩니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_problems'::regclass
      and conname = 'project_problems_problem_id_key'
  ) then
    alter table public.project_problems
      add constraint project_problems_problem_id_key unique (problem_id);
  end if;
end;
$$;

-- 4) 기획안 확인, 프로젝트 생성, 연결 생성을 한 트랜잭션에서 처리합니다.
--    동시에 같은 불편함을 등록하면 UNIQUE 위반으로 한 요청만 성공하고,
--    실패한 요청의 프로젝트 행은 서브트랜잭션 롤백으로 남지 않습니다.
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
  linked bigint;
begin
  if p_user_id is null then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if not exists (select 1 from public.problems where id = p_problem_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not exists (
    select 1 from public.problem_ai_plans
    where user_id = p_user_id and problem_id = p_problem_id
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select project_id into linked from public.project_problems where problem_id = p_problem_id;
  if found then
    return jsonb_build_object('status', 'conflict', 'project_id', linked);
  end if;

  begin
    insert into public.projects
      (title, description, features, tech_stack, owner_id, release_status)
    values
      (p_title, p_description, coalesce(p_features, '{}'::text[]), '{}'::text[], p_user_id, '기획 중')
    returning * into new_project;

    insert into public.project_problems (project_id, problem_id)
    values (new_project.id, p_problem_id);
  exception when unique_violation then
    select project_id into linked from public.project_problems where problem_id = p_problem_id;
    return jsonb_build_object('status', 'conflict', 'project_id', linked);
  end;

  return jsonb_build_object('status', 'created', 'project', to_jsonb(new_project));
end;
$$;

revoke all on function public.create_project_from_problem(uuid, bigint, text, text, text[]) from public, anon, authenticated;
grant execute on function public.create_project_from_problem(uuid, bigint, text, text, text[]) to service_role;

notify pgrst, 'reload schema';
commit;
