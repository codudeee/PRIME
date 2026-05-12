-- PKL Supabase schema / run in SQL Editor
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  discord_id text unique,
  discord_username text,
  nickname text not null default '',
  pubg_id text not null default '',
  tier text not null default 'none',
  prime integer not null default 0,
  warnings integer not null default 0,
  jailed boolean not null default false,
  banned boolean not null default false,
  role text not null default 'user',
  stats jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_scores (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.match_logs (
  id text primary key,
  title text not null default '',
  kind text not null default 'league',
  snapshot jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.join_queue (
  id uuid primary key default gen_random_uuid(),
  discord_id text,
  nickname text not null default '',
  pubg_id text not null default '',
  status text not null default 'waiting',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor text,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.point_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  discord_id text,
  amount integer not null default 0,
  reason text,
  actor text,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;$$;

do $$ begin
  create trigger touch_users_updated_at before update on public.users for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger touch_live_scores_updated_at before update on public.live_scores for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger touch_match_logs_updated_at before update on public.match_logs for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger touch_join_queue_updated_at before update on public.join_queue for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

alter table public.users enable row level security;
alter table public.live_scores enable row level security;
alter table public.match_logs enable row level security;
alter table public.join_queue enable row level security;
alter table public.admin_logs enable row level security;
alter table public.point_logs enable row level security;

-- Public anon policy for static PKL hosting. Tighten later when Discord auth is fully server-side.
do $$ begin create policy "pkl public read users" on public.users for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public upsert users" on public.users for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public read live_scores" on public.live_scores for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public upsert live_scores" on public.live_scores for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public read match_logs" on public.match_logs for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public upsert match_logs" on public.match_logs for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public read join_queue" on public.join_queue for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public upsert join_queue" on public.join_queue for all using (true) with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public read admin_logs" on public.admin_logs for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public insert admin_logs" on public.admin_logs for insert with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public read point_logs" on public.point_logs for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public insert point_logs" on public.point_logs for insert with check (true); exception when duplicate_object then null; end $$;

alter publication supabase_realtime add table public.live_scores;
alter publication supabase_realtime add table public.join_queue;

-- PKL 추가 연결용 컬럼/Realtime 보강
alter table public.users add column if not exists role text not null default 'user';
alter table public.users add column if not exists points integer not null default 0;
alter table public.users add column if not exists prime integer not null default 0;

-- 이미 추가되어 있으면 오류 없이 무시
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.match_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.point_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 영구추방/재가입 차단 기록: 이 테이블에 active=true 기록이 있으면 Discord 재가입 차단
create table if not exists public.ban_records (
  id uuid primary key default gen_random_uuid(),
  discord_id text,
  nickname text not null default '',
  pubg_id text not null default '',
  reason text not null default '',
  actor text,
  permanent boolean not null default true,
  active boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ban_records_active_discord on public.ban_records(active, discord_id);
create index if not exists idx_ban_records_active_pubg on public.ban_records(active, pubg_id);
create index if not exists idx_ban_records_active_nickname on public.ban_records(active, nickname);
create index if not exists idx_admin_logs_action_created_at on public.admin_logs(action, created_at desc);
create index if not exists idx_point_logs_discord_created_at on public.point_logs(discord_id, created_at desc);

do $$ begin
  create trigger touch_ban_records_updated_at before update on public.ban_records for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

alter table public.ban_records enable row level security;
do $$ begin create policy "pkl public read ban_records" on public.ban_records for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public upsert ban_records" on public.ban_records for all using (true) with check (true); exception when duplicate_object then null; end $$;


-- 공지/킬내기 룰/운영 공용 문서 저장소: localStorage 초기화 방지용 Supabase 단일 원본
create table if not exists public.pkl_shared_data (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $$ begin
  create trigger touch_pkl_shared_data_updated_at before update on public.pkl_shared_data for each row execute function public.touch_updated_at();
exception when duplicate_object then null; end $$;

alter table public.pkl_shared_data enable row level security;
do $$ begin create policy "pkl public read shared data" on public.pkl_shared_data for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "pkl public upsert shared data" on public.pkl_shared_data for all using (true) with check (true); exception when duplicate_object then null; end $$;
