const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

function json(res, status, payload){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
function key(){ return SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY; }
function normalizeUser(u){
  u = u || {};
  const nickname = u.nickname || u.nick || u.name || u.display_name || u.discord_username || "";
  const pubgId = u.pubg_id || u.pubgId || u.game_id || u.gameId || u.pubg_name || u.pubgName || "";
  const grade = u.grade || u.member_tier || u.memberTier || u.tier || u.tier_name || u.tierName || "";
  const memberRole = u.member_role || u.memberRole || (u.is_admin || u.admin ? "admin" : (u.role || "user"));
  const joined = u.joined_at || u.join_date || u.joinDate || u.created_at || u.createdAt || u.inserted_at || "";
  return {
    ...u,
    uid: u.uid || u.id || u.discord_id || u.discordId || u.user_id || u.userId || "",
    id: u.id || u.uid || u.discord_id || u.discordId || "",
    discordId: u.discord_id || u.discordId || u.id || "",
    nickname,
    name: nickname,
    pubgId,
    gameId: pubgId,
    tier: grade || "없음",
    gradeRole: u.grade_role || u.gradeRole || u.base_role || u.baseRole || grade || "none",
    baseRole: u.base_role || u.baseRole || u.grade_role || u.gradeRole || grade || "none",
    memberRole,
    role: u.role || memberRole,
    warnings: Number(u.warnings || u.warning_count || 0),
    dia: Number(u.money || u.point || u.points || u.dia || 0),
    chicken: Number(u.money || u.point || u.points || u.dia || 0),
    join: joined,
    createdAt: u.created_at || u.createdAt || joined,
    last: u.last_login || u.lastLogin || u.updated_at || "-",
    history: Array.isArray(u.history) ? u.history : [],
    memoList: Array.isArray(u.memoList) ? u.memoList : []
  };
}
async function supabaseFetch(path, init){
  if(!SUPABASE_URL || !key()) throw new Error("Supabase env missing");
  const url = SUPABASE_URL.replace(/\/$/, "") + path;
  const res = await fetch(url, {
    ...(init || {}),
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...((init && init.headers) || {})
    }
  });
  const text = await res.text();
  let data = null;
  try{ data = text ? JSON.parse(text) : null; }catch(e){ data = text; }
  if(!res.ok) throw new Error((data && (data.message || data.error_description || data.error)) || `Supabase ${res.status}`);
  return data;
}
module.exports = async function handler(req, res){
  try{
    if(req.method === "GET"){
      const q = req.query || {};
      const limit = Math.max(1, Math.min(Number(q.limit || 100), 500));
      const offset = Math.max(0, Number(q.offset || 0));
      const search = String(q.search || "").trim();
      let path = `/rest/v1/users?select=*`;
      if(search){
        const s = encodeURIComponent(`%${search.replace(/[%_]/g, "")} %`.replace(/ /g, ""));
        path += `&or=(nickname.ilike.${s},name.ilike.${s},pubg_id.ilike.${s},pubgId.ilike.${s},discord_username.ilike.${s})`;
      }
      path += `&order=nickname.asc.nullslast&limit=${limit}&offset=${offset}`;
      const rows = await supabaseFetch(path, { method:"GET", headers:{ Prefer:"count=exact" } });
      const users = (Array.isArray(rows) ? rows : []).map(normalizeUser).sort((a,b)=>String(a.nickname||a.name||"").localeCompare(String(b.nickname||b.name||""), "ko"));
      return json(res, 200, { ok:true, users, count: users.length, offset, limit });
    }
    res.setHeader("Allow", "GET");
    return json(res, 405, { ok:false, message:"Method not allowed" });
  }catch(error){
    return json(res, 500, { ok:false, message:error.message || String(error) });
  }
};
