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
async function readShared(key){
  const rows = await sb(`pkl_shared_data?select=*&key=eq.${encodeURIComponent(key)}&limit=1`, {method:'GET'}).catch(()=>[]);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? {value: row.value, updated_at: row.updated_at || row.created_at || null} : {value:null, updated_at:null};
}
function ms(v){ const n=Date.parse(v || ''); return Number.isFinite(n) ? n : 0; }
function mergeLists(a,b){ return unique([].concat(Array.isArray(a)?a:[], Array.isArray(b)?b:[])); }
function removeList(list, removals){ const r=unique(removals); return unique(list).filter(x=>!r.some(y=>same(x,y))); }
function normalizeStatePayload(payload, updatedAt){
  payload = payload && typeof payload === 'object' ? payload : {};
  return {
    version: 2,
    waitList: unique(payload.waitList),
    cancelList: unique(payload.cancelList),
    recruitState: payload.recruitState || {state:'waiting'},
    updatedAt: payload.updatedAt || updatedAt || new Date().toISOString()
  };
}
async function readJoinState(){
  const rows = await sb('live_scores?id=eq.join_state&select=payload,updated_at&limit=1', {method:'GET'}).catch(()=>[]);
  const row = Array.isArray(rows) ? rows[0] : null;
  const live = normalizeStatePayload(row && row.payload, row && row.updated_at);
  const sharedWait = await readShared('pklJoinWaitList');
  const sharedCancel = await readShared('pklJoinCancelList');
  const sharedRecruit = await readShared('pklJoinRecruitState');
  const sharedUpdated = Math.max(ms(sharedWait.updated_at), ms(sharedCancel.updated_at), ms(sharedRecruit.updated_at));

  // 근본 원인: 사이트 일부 화면은 pkl_shared_data 값을 보고, 디스코드 봇 API는 live_scores/join_state만 봐서
  // 한쪽이 8명, 한쪽이 5명처럼 갈라졌다. 읽는 순간 두 저장 위치를 단일 join_state로 재합성한다.
  let waitList = mergeLists(live.waitList, sharedWait.value);
  let cancelList = mergeLists(live.cancelList, sharedCancel.value);
  waitList = removeList(waitList, cancelList);
  cancelList = removeList(cancelList, waitList);
  const recruitState = sharedUpdated > ms(live.updatedAt) && sharedRecruit.value && typeof sharedRecruit.value === 'object'
    ? sharedRecruit.value
    : live.recruitState;
  return {version:2, waitList, cancelList, recruitState:recruitState || {state:'waiting'}, updatedAt:new Date(Math.max(ms(live.updatedAt), sharedUpdated, Date.now())).toISOString()};
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
    if(req.method !== 'POST' && req.method !== 'GET') return json(res,405,{ok:false,message:'POST/GET only'});
    if(TOKEN){
      const auth = clean(req.headers.authorization || req.headers.Authorization || '');
      const supplied = auth.replace(/^Bearer\s+/i,'') || clean(req.headers['x-pkl-bot-token']);
      if(supplied !== TOKEN) return json(res,401,{ok:false,message:'invalid token'});
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const rawAction = clean(body.action || body.type || body.command || body.event || '').toLowerCase();
    const action = rawAction.replace(/[\s_-]+/g, '');
    const userSource = body.user || body.member || body.author || body.host || body.requester || null;
    const user = normalizeUser(userSource || body);
    const st = await readJoinState();

    // /모집, /모집마감, /모집체크 같은 디스코드 명령은 참가자 user 없이 상태만 변경/조회한다.
    // 이전 로직은 모든 POST에서 user를 먼저 요구해서 /모집 명령 자체가 400으로 막혔다.
    if(req.method === 'GET' || /^(count|status|check|state|info|조회|체크)$/.test(action)){
      return json(res,200,{ok:true,state:st,waitCount:(st.waitList||[]).length,cancelCount:(st.cancelList||[]).length});
    }

    if(/^(open|start|recruit|recruitopen|openrecruit|joinopen|모집|모집열기|모집시작)$/.test(action)){
      const now = new Date().toISOString();
      st.recruitState = Object.assign({}, st.recruitState || {}, {
        state:'open',
        openedAt: now,
        updatedAt: now,
        source:'discord'
      });
      if(keyOf(user)) st.recruitState.host = {
        key:user.key, uid:user.uid, userId:user.userId, id:user.id,
        discord_id:user.discord_id, discordId:user.discordId,
        name:user.name, nickname:user.nickname, pubgId:user.pubgId
      };
      if(body.deadline || body.deadlineText) st.recruitState.deadlineText = clean(body.deadlineText || body.deadline);
      if(body.max || body.limit || body.maxCount) st.recruitState.maxCount = Number(body.max || body.limit || body.maxCount) || undefined;
      const saved = await writeJoinState(st);
      return json(res,200,{ok:true,action:'open',state:saved,waitCount:(saved.waitList||[]).length,cancelCount:(saved.cancelList||[]).length});
    }

    if(/^(close|end|stop|closed|recruitclose|closerecruit|joinclose|모집마감|마감|모집종료)$/.test(action)){
      const now = new Date().toISOString();
      st.recruitState = Object.assign({}, st.recruitState || {}, {state:'closed', closedAt:now, updatedAt:now, source:'discord'});
      const saved = await writeJoinState(st);
      return json(res,200,{ok:true,action:'close',state:saved,waitCount:(saved.waitList||[]).length,cancelCount:(saved.cancelList||[]).length});
    }

    if(/^(waiting|standby|resetstate|ready|대기|모집대기|모집대기중)$/.test(action)){
      const now = new Date().toISOString();
      st.recruitState = Object.assign({}, st.recruitState || {}, {state:'waiting', updatedAt:now, source:'discord'});
      const saved = await writeJoinState(st);
      return json(res,200,{ok:true,action:'waiting',state:saved,waitCount:(saved.waitList||[]).length,cancelCount:(saved.cancelList||[]).length});
    }

    if(/^(reset|clear|init|초기화|전체초기화)$/.test(action)){
      const now = new Date().toISOString();
      st.waitList = [];
      st.cancelList = [];
      st.recruitState = {state:'waiting', reset:true, resetAt:now, resetNonce:clean(body.resetNonce || now), source:'discord'};
      const saved = await writeJoinState(st);
      return json(res,200,{ok:true,action:'reset',state:saved,waitCount:0,cancelCount:0});
    }

    // 아래부터는 이모지 참가/취소 처리라 실제 Discord user가 반드시 필요하다.
    if(!keyOf(user)) return json(res,400,{ok:false,message:'discord user required'});
    st.waitList = unique(st.waitList);
    st.cancelList = unique(st.cancelList);
    if(/^(cancel|remove|leave|reactionremove|참가취소|취소|나가기)$/.test(action)){
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
