const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.PKL_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.PKL_SUPABASE_ANON_KEY || '';
const TOKEN = String(process.env.PKL_DISCORD_REACTION_TOKEN || process.env.PKL_BOT_API_TOKEN || '').trim();
function json(res, status, body){ res.status(status).setHeader('Cache-Control','no-store'); return res.json(body); }
function clean(v){ return String(v == null ? '' : v).trim(); }
function did(u){ return clean(u.discord_id || u.discordId || u.discord || u.user_id || u.userId || u.id || '').replace(/^discord-/i, ''); }
function keyOf(u){ return did(u) || clean(u.pubg_id || u.pubgId || u.pubg || u.gameId || u.ref || u.nickname || u.name).toLowerCase(); }
function normalizeUser(u){
  u = u || {};
  const discordId = did(u);
  const nickname = clean(u.nickname || u.nick || u.name || u.displayName || u.global_name || u.username || '참가자').replace(/^(?:[^\p{L}\p{N}_-]|[\uFE0E\uFE0F\u200D])+/u, '');
  const pubgId = clean(u.pubg_id || u.pubgId || u.pubg || u.gameId || u.ref || nickname);
  const key = discordId || clean(u.key || u.uid || u.userId || nickname || pubgId);
  return { key, uid:key, userId:key, id: discordId ? `discord-${discordId}` : key, discord_id:discordId, discordId, name:nickname, nickname, pubgId, joinedAt:new Date().toISOString() };
}
function same(a,b){ const ak=keyOf(a), bk=keyOf(b); return !!(ak && bk && ak === bk); }
function unique(arr){ const out=[]; (Array.isArray(arr)?arr:[]).forEach(x=>{ if(x && typeof x==='object' && !out.some(p=>same(p,x))) out.push(x); }); return out; }
async function sb(path, options={}){
  if(!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase 설정 없음');
  const headers = Object.assign({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates,return=representation' }, options.headers || {});
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({}, options, {headers}));
  const t = await r.text().catch(()=> '');
  if(!r.ok) throw new Error(`Supabase ${options.method || 'GET'} ${path} failed ${r.status}: ${t}`);
  if(!t) return null;
  try{return JSON.parse(t);}catch(e){return t;}
}
async function readJoinState(){
  const rows = await sb('live_scores?id=eq.join_state&select=payload,updated_at&limit=1', {method:'GET'}).catch(()=>[]);
  const row = Array.isArray(rows) ? rows[0] : null;
  const payload = row && row.payload && typeof row.payload === 'object' ? row.payload : {};
  return Object.assign({version:2, waitList:[], cancelList:[], recruitState:{state:'waiting'}}, payload, {updatedAt: payload.updatedAt || (row && row.updated_at) || new Date().toISOString()});
}
async function writeShared(key, value){
  return await sb('pkl_shared_data?on_conflict=key', {method:'POST', body:JSON.stringify({key, value:value == null ? null : value, updated_at:new Date().toISOString()})}).catch(()=>null);
}
async function writeJoinState(st){
  st.updatedAt = new Date().toISOString();
  st.version = 2;
  await sb('live_scores?on_conflict=id', {method:'POST', body:JSON.stringify({id:'join_state', payload:st, updated_at:st.updatedAt})});
  await Promise.all([
    writeShared('pklJoinWaitList', st.waitList || []),
    writeShared('pklJoinCancelList', st.cancelList || []),
    writeShared('pklJoinRecruitState', st.recruitState || {state:'waiting'})
  ]);
  return st;
}
async function handler(req,res){
  try{
    if(req.method !== 'POST') return json(res,405,{ok:false,message:'POST only'});
    if(TOKEN){
      const auth = clean(req.headers.authorization || req.headers.Authorization || '');
      const supplied = auth.replace(/^Bearer\s+/i,'') || clean(req.headers['x-pkl-bot-token']);
      if(supplied !== TOKEN) return json(res,401,{ok:false,message:'invalid token'});
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = clean(body.action || body.type || '').toLowerCase();
    const user = normalizeUser(body.user || body.member || body);
    if(!keyOf(user)) return json(res,400,{ok:false,message:'discord user required'});
    const st = await readJoinState();
    st.waitList = unique(st.waitList);
    st.cancelList = unique(st.cancelList);
    if(action === 'cancel' || action === 'remove' || action === 'leave'){
      st.waitList = st.waitList.filter(x=>!same(x,user));
      if(!st.cancelList.some(x=>same(x,user))) st.cancelList.push(Object.assign({}, user, {canceledAt:new Date().toISOString(), reason:clean(body.reason || 'Discord reaction')}));
    }else{
      st.cancelList = st.cancelList.filter(x=>!same(x,user));
      if(!st.waitList.some(x=>same(x,user))) st.waitList.push(user);
    }
    const saved = await writeJoinState(st);
    return json(res,200,{ok:true,state:saved,waitCount:(saved.waitList||[]).length,cancelCount:(saved.cancelList||[]).length});
  }catch(error){ return json(res,500,{ok:false,message:error && error.message ? error.message : String(error)}); }
}
module.exports = handler;
