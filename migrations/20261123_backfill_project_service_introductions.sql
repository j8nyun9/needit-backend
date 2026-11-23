-- Run once in Supabase SQL Editor. Only the project's owner's private plan is used.
-- Preserve custom descriptions; repair blank descriptions and legacy problem text.
begin;

with candidates as (
 select p.id, p.description as old_description,
        btrim(a.ai_plan #>> '{hackathonPlan,solution}') as service_introduction
 from public.projects p
 join public.project_problems l on l.project_id=p.id
 join public.problems problem on problem.id=l.problem_id
 join public.problem_ai_plans a on a.problem_id=l.problem_id and a.user_id=p.owner_id
 where jsonb_typeof(a.ai_plan #> '{hackathonPlan,solution}')='string'
   and length(btrim(a.ai_plan #>> '{hackathonPlan,solution}')) between 1 and 5000
   and (
    nullif(btrim(p.description),'') is null
    or btrim(p.description)=btrim(to_jsonb(problem)->>'content')
    or btrim(p.description)=btrim(to_jsonb(problem)->>'description')
    or btrim(p.description)=btrim(a.ai_plan->>'problem_definition')
    or btrim(p.description)=btrim(a.ai_plan #>> '{hackathonPlan,problem_definition}')
   )
), unambiguous as (
 select id, min(service_introduction) as service_introduction
 from candidates group by id having count(distinct service_introduction)=1
), updated as (
 update public.projects p set description=c.service_introduction
 from unambiguous c
 where p.id=c.id and p.description is distinct from c.service_introduction
 returning p.id, p.title
)
select * from updated order by id;

commit;
