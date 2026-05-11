-- PKL users 정리용: Discord OAuth 유저만 users 단일 원본으로 유지
-- 실행 위치: Supabase SQL Editor

-- 1) discord_id 유니크 보장
alter table public.users
  add constraint if not exists users_discord_id_unique unique (discord_id);

-- 2) discord_id가 없는 옛 local/test 유저는 운영 목록에서 제거
--    삭제가 부담되면 실행 전 아래 delete 대신 select로 먼저 확인하세요.
-- select id, nickname, pubg_id, discord_id, created_at from public.users where discord_id is null or trim(discord_id) = '';
delete from public.users
where discord_id is null or trim(discord_id) = '';

-- 3) discord_id 기준 조회 최적화
create index if not exists idx_users_discord_id on public.users(discord_id);
create index if not exists idx_users_nickname on public.users(nickname);
