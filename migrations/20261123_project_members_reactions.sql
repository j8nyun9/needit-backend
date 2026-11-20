begin;
create table if not exists public.project_members (
 project_id bigint not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member',
 created_at timestamptz not null default now(),
 primary key(project_id,user_id)
);
create table if not exists public.project_feedback_reactions (
 feedback_id bigint not null references public.project_feedback(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reaction text not null check(reaction in ('like','dislike')),
 primary key(feedback_id,user_id)
);
alter table public.project_members enable row level security;
alter table public.project_feedback_reactions enable row level security;
revoke all on public.project_members,public.project_feedback_reactions from anon,authenticated;
grant all on public.project_members,public.project_feedback_reactions to service_role;
commit;
