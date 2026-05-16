-- PKL 관리자 권한/중복 유저 근본 정리용
-- 1) discord_id 앞의 discord- 접두어를 제거해서 같은 계정 기준을 통일
update public.users
set discord_id = regexp_replace(lower(trim(discord_id)), '^discord-', ''),
    updated_at = now()
where discord_id is not null
  and discord_id <> regexp_replace(lower(trim(discord_id)), '^discord-', '');

-- 2) raw 안에만 discordId가 있고 users.discord_id가 비어있는 구행 보정
update public.users
set discord_id = regexp_replace(lower(trim(coalesce(raw->>'discordId', raw->>'discord_id', raw->>'id', raw->>'uid'))), '^discord-', ''),
    updated_at = now()
where (discord_id is null or trim(discord_id) = '')
  and raw is not null
  and trim(coalesce(raw->>'discordId', raw->>'discord_id', raw->>'id', raw->>'uid', '')) <> '';

-- 3) 같은 discord_id 중복 행이 있으면 최신 updated_at 행 하나만 남김
with ranked as (
  select id, discord_id,
         row_number() over (partition by discord_id order by updated_at desc nulls last, created_at desc nulls last, id desc) as rn
  from public.users
  where discord_id is not null and trim(discord_id) <> ''
)
delete from public.users u
using ranked r
where u.id = r.id and r.rn > 1;

-- 4) 앞으로 같은 디스코드 계정이 중복 생성되지 않게 방지
create unique index if not exists users_discord_id_unique_idx
on public.users (discord_id)
where discord_id is not null and trim(discord_id) <> '';
