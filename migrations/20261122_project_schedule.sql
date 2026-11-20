-- 프로젝트 진행률·완료 예정일 (이미 있으면 아무것도 안 함)
alter table public.projects
  add column if not exists progress_started_on date,
  add column if not exists expected_completion_date date;
