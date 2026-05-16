-- PKL Discord identity cleanup / run once in Supabase SQL Editor
-- 목적: 예전 데이터에 남은 discord-숫자 / raw 내부 discordId / null discord_id 행을 하나의 canonical discord_id(숫자만)로 정리합니다.

begin;

-- 1) raw 안에만 Discord ID가 있는 행은 users.discord_id로 끌어올림
update public.users
set discord_id = lower(regexp_replace(coalesce(nullif(discord_id,''), raw->>'discordId', raw->>'discord_id', raw->>'uid', raw->>'id', raw->>'userId'), '^discord-', '', 'i')),
    updated_at = now()
where coalesce(discord_id,'') = ''
  and coalesce(raw->>'discordId', raw->>'discord_id', raw->>'uid', raw->>'id', raw->>'userId', '') <> '';

-- 2) discord_id 값은 항상 숫자만 저장
update public.users
set discord_id = lower(regexp_replace(discord_id, '^discord-', '', 'i')),
    updated_at = now()
where discord_id ilike 'discord-%';

-- 3) 같은 Discord 계정이 여러 행으로 꼬인 경우 최신/정보 많은 행 하나만 남김
with ranked as (
  select
    id,
    discord_id,
    row_number() over (
      partition by discord_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.users
  where coalesce(discord_id,'') <> ''
), keepers as (
  select id, discord_id from ranked where rn = 1
), dupes as (
  select u.* from public.users u
  join ranked r on r.id = u.id
  where r.rn > 1
), merged_raw as (
  select
    k.id,
    jsonb_strip_nulls(coalesce(krow.raw,'{}'::jsonb) || coalesce(jsonb_object_agg(d.id::text, d.raw) filter (where d.id is not null), '{}'::jsonb)) as raw_backup
  from keepers k
  join public.users krow on krow.id = k.id
  left join dupes d on d.discord_id = k.discord_id
  group by k.id, krow.raw
)
update public.users u
set raw = coalesce(u.raw,'{}'::jsonb) || jsonb_build_object('_merged_duplicate_rows', m.raw_backup),
    updated_at = now()
from merged_raw m
where u.id = m.id;

delete from public.users u
using ranked r
where u.id = r.id
  and r.rn > 1;

-- 4) 앞으로 같은 Discord 계정으로 중복 insert 방지
alter table public.users
  alter column discord_id set not null;

create unique index if not exists users_discord_id_unique_idx
  on public.users (discord_id)
  where discord_id is not null and discord_id <> '';

commit;


-- 2026-05 추가 보강: raw에 남은 Discord 식별자와 discord_id가 서로 달라서
-- admin 목록에 같은 계정이 2명처럼 보이는 경우를 정리합니다.
-- 이 SQL은 숨김 처리가 아니라 중복 row를 실제로 병합/삭제합니다.
with normalized as (
  select
    id,
    lower(regexp_replace(coalesce(nullif(discord_id,''), raw->>'discordId', raw->>'discord_id', raw->>'uid', raw->>'id', raw->>'userId'), '^discord-', '', 'i')) as did
  from public.users
  where coalesce(nullif(discord_id,''), raw->>'discordId', raw->>'discord_id', raw->>'uid', raw->>'id', raw->>'userId') is not null
), ranked as (
  select
    u.*,
    n.did,
    row_number() over (
      partition by n.did
      order by
        case when lower(regexp_replace(coalesce(u.discord_id,''), '^discord-', '', 'i')) = n.did then 0 else 1 end,
        u.updated_at desc nulls last,
        u.created_at desc nulls last,
        u.id
    ) as rn
  from public.users u
  join normalized n on n.id = u.id
  where coalesce(n.did,'') <> ''
), keep_rows as (
  select * from ranked where rn = 1
), dup_rows as (
  select * from ranked where rn > 1
)
update public.users u
set
  discord_id = k.did,
  raw = coalesce(u.raw,'{}'::jsonb)
    || jsonb_build_object('discordId', k.did, 'discord_id', k.did, 'uid', 'discord-' || k.did, 'id', 'discord-' || k.did, 'userId', 'discord-' || k.did),
  updated_at = now()
from keep_rows k
where u.id = k.id;

delete from public.users u
using dup_rows d
where u.id = d.id;

create unique index if not exists users_discord_id_unique_idx
  on public.users (discord_id)
  where discord_id is not null and discord_id <> '';
