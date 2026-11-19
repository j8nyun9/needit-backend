-- Supabase SQL Editor에서 배포 전에 한 번 실행
alter table public.comments
  add column if not exists author_id uuid references auth.users(id) on delete set null;

create index if not exists comments_author_id_idx
  on public.comments(author_id);
