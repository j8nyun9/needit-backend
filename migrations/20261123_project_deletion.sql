-- Keep the source problem when removing a project; clean up only the links.
begin;
do $$
declare item record;
begin
 for item in select conname from pg_constraint
  where conrelid='public.project_problems'::regclass
    and confrelid='public.projects'::regclass and contype='f'
 loop
  execute format('alter table public.project_problems drop constraint %I',item.conname);
 end loop;
 alter table public.project_problems add constraint project_problems_project_id_fkey
  foreign key(project_id) references public.projects(id) on delete cascade;

 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='problems' and column_name='project_id') then
  for item in select conname from pg_constraint
   where conrelid='public.problems'::regclass and confrelid='public.projects'::regclass and contype='f'
  loop
   execute format('alter table public.problems drop constraint %I',item.conname);
  end loop;
  alter table public.problems alter column project_id drop not null;
  alter table public.problems add constraint problems_project_id_fkey
   foreign key(project_id) references public.projects(id) on delete set null;
 end if;
end;
$$;
grant delete on public.projects to service_role;
notify pgrst,'reload schema';
commit;
