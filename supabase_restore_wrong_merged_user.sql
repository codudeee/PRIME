-- 잘못 병합되어 PKL 닉네임만 틀어진 유저를 수동 복구할 때 쓰는 SQL 템플릿입니다.
-- 먼저 아래 SELECT로 대상 row를 확인하세요.
-- 예: 디코 닉네임/길드닉에 가람이 보이는데 PKL nickname이 주희로 되어 있는 row 확인.

select id, discord_id, nickname, pubg_id, role, tier, discord_username, raw
from public.users
where raw::text ilike '%가람%'
   or discord_username ilike '%가람%'
   or nickname ilike '%가람%'
order by updated_at desc nulls last;

-- 대상 discord_id를 확인한 뒤, 아래 '__DISCORD_ID__'와 '가람'을 실제 값으로 바꿔 실행하세요.
-- update public.users
-- set nickname = '가람',
--     raw = jsonb_set(
--             jsonb_set(
--               jsonb_set(coalesce(raw, '{}'::jsonb), '{nickname}', to_jsonb('가람'::text), true),
--               '{nick}', to_jsonb('가람'::text), true
--             ),
--             '{pklNickname}', to_jsonb('가람'::text), true
--           ) || jsonb_build_object('registeredNickname', '가람'),
--     updated_at = now()
-- where discord_id = '__DISCORD_ID__';
