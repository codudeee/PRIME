-- 이번 수정은 서버 API가 users 테이블을 읽을 때 자동으로 실행됩니다.
-- 수동 확인용 쿼리입니다. 같은 PUBG ID로 중복된 유저가 있는지 확인합니다.
select lower(regexp_replace(coalesce(pubg_id, raw->>'pubgId', raw->>'gameId', ''), '\s+', '', 'g')) as pubg_key,
       count(*) as duplicate_count,
       array_agg(id) as row_ids,
       array_agg(nickname) as nicknames,
       array_agg(discord_id) as discord_ids,
       array_agg(role) as roles
from public.users
where coalesce(pubg_id, raw->>'pubgId', raw->>'gameId', '') <> ''
group by 1
having count(*) > 1
order by duplicate_count desc;
