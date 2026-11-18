-- Run once in the same Supabase project's SQL Editor before deploying.
create table if not exists public.problem_ai_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id bigint not null references public.problems(id) on delete cascade,
  ai_plan jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, problem_id)
);
alter table public.problem_ai_plans enable row level security;
revoke all on public.problem_ai_plans from anon, authenticated;
grant select, insert, update, delete on public.problem_ai_plans to service_role;
-- Access is through the backend session only, using its secret/service role key.
-- Existing shared problems.ai_plan values are NOT assigned to any student.
