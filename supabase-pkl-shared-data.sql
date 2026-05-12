-- PRIME / PKL 공지사항, 킬내기 룰, 패치노트 등 사이트 공용 설정 저장용 테이블
-- Supabase SQL Editor에서 1회 실행하세요.

create table if not exists public.pkl_shared_data (
  key text primary key,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.pkl_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pkl_shared_data_set_updated_at on public.pkl_shared_data;
create trigger pkl_shared_data_set_updated_at
before update on public.pkl_shared_data
for each row
execute function public.pkl_set_updated_at();

alter table public.pkl_shared_data enable row level security;

drop policy if exists "pkl_shared_data_read_all" on public.pkl_shared_data;
create policy "pkl_shared_data_read_all"
on public.pkl_shared_data
for select
using (true);

-- 쓰기는 서버 API의 service role key로 처리하는 구조를 권장합니다.
-- service role key가 없고 anon key로 직접 저장해야 하는 배포 환경이면 아래 정책을 추가로 사용하세요.
-- 보안상 관리자 판별 없이 public write가 열리므로 가능하면 service role key를 Vercel 환경변수에 넣는 방식을 권장합니다.
-- create policy "pkl_shared_data_write_anon" on public.pkl_shared_data for insert with check (true);
-- create policy "pkl_shared_data_update_anon" on public.pkl_shared_data for update using (true) with check (true);
