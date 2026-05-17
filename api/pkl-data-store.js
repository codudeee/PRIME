const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.PKL_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.PKL_SUPABASE_ANON_KEY || '';
let userStore;
try { userStore = require('./pkl-supabase-store'); } catch (e) { userStore = null; }

function configured(){ return !!(SUPABASE_URL && SUPABASE_KEY); }
function clean(v){ return String(v == null ? '' : v).trim(); }
function safeId(v){ return clean(v).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 160) || 'default'; }
function json(res, status, body){ res.status(status).setHeader('Cache-Control','no-store'); return res.json(body); }
function parseBody(req){ if(typeof req.body === 'string'){ try{return JSON.parse(req.body||'{}');}catch(e){return {};} } return req.body || {}; }
async function sb(path, options={}){
  if(!configured()) throw new Error('Supabase 설정 없음');
  const headers = Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation'
  }, options.headers || {});
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({}, options, { headers }));
  const text = await res.text().catch(()=> '');
  if(!res.ok) throw new Error(`Supabase ${options.method || 'GET'} ${path} failed ${res.status}: ${text}`);
  if(!text) return null;
  try { return JSON.parse(text); } catch(e) { return text; }
}
function tableFor(type){
  type = clean(type);
  if(type === 'live' || type === 'live_scores') return 'live_scores';
  if(type === 'match' || type === 'match_logs') return 'match_logs';
  if(type === 'point' || type === 'point_logs') return 'point_logs';
  if(type === 'join' || type === 'join_queue') return 'join_queue';
  return '';
}

function did(u){ return clean(u && (u.discord_id || u.discordId || u.discord || u.user_id || u.userId || u.id || '')).replace(/^discord-/i, '').toLowerCase(); }
function keyOfUser(u){ return did(u) || clean(u && (u.pubg_id || u.pubgId || u.gameId || u.ref || u.nickname || u.name)).toLowerCase(); }
function sameUser(a,b){ const ak=keyOfUser(a), bk=keyOfUser(b); return !!(ak && bk && ak === bk); }
function parseMs(v){ const n=Date.parse(v || ''); return Number.isFinite(n) ? n : 0; }
function waitActionMs(item){ return parseMs(item && (item.rejoinedAt || item.joinedAt || item.updatedAt || item.createdAt)); }
function cancelActionMs(item){ return parseMs(item && (item.canceledAt || item.cancelledAt || item.cancelAt || item.updatedAt || item.createdAt)); }
function actionMs(item){ return Math.max(waitActionMs(item), cancelActionMs(item), parseMs(item && item.updatedAt), parseMs(item && item.createdAt)); }
function newerUser(prev, next){
  if(!prev) return next;
  if(!next) return prev;
  const pm = actionMs(prev), nm = actionMs(next);
  if(nm && (!pm || nm >= pm)) return Object.assign({}, prev, next);
  return prev;
}
function uniqueUsers(list){
  const out=[];
  (Array.isArray(list)?list:[]).forEach(function(x){
    if(!x || typeof x !== 'object') return;
    const idx = out.findIndex(function(p){return sameUser(p,x);});
    if(idx < 0) out.push(x);
    else out[idx] = newerUser(out[idx], x);
  });
  return out;
}
function mergeUsersList(a,b){ return uniqueUsers([].concat(Array.isArray(a)?a:[], Array.isArray(b)?b:[])); }
function removeUsers(list, remove){ const rem=uniqueUsers(remove); return uniqueUsers(list).filter(function(x){ return !rem.some(function(r){return sameUser(r,x);}); }); }
function resolveJoinLists(waitList, cancelList){
  waitList = uniqueUsers(waitList);
  cancelList = uniqueUsers(cancelList);
  const finalWait = [];
  const finalCancel = [];

  waitList.forEach(function(waitItem){
    const cancelItem = cancelList.find(function(c){ return sameUser(waitItem, c); });
    if(!cancelItem){ finalWait.push(waitItem); return; }
    const wt = waitActionMs(waitItem);
    const ct = cancelActionMs(cancelItem);
    if(wt && ct){
      if(wt > ct) finalWait.push(waitItem);
      return;
    }
    // 시간값이 없으면 대기취소 기록을 더 명시적인 최종 액션으로 본다.
  });

  cancelList.forEach(function(cancelItem){
    const waitItem = waitList.find(function(w){ return sameUser(w, cancelItem); });
    if(!waitItem){ finalCancel.push(cancelItem); return; }
    const wt = waitActionMs(waitItem);
    const ct = cancelActionMs(cancelItem);
    if(wt && ct){
      if(ct >= wt) finalCancel.push(cancelItem);
      return;
    }
    finalCancel.push(cancelItem);
  });

  return { waitList: uniqueUsers(finalWait), cancelList: uniqueUsers(finalCancel) };
}
function normalizeJoinPayload(payload, updatedAt){
  payload = payload && typeof payload === 'object' ? payload : {};
  const resolved = resolveJoinLists(payload.waitList, payload.cancelList);
  return { version:2, waitList: resolved.waitList, cancelList: resolved.cancelList, recruitState: payload.recruitState || {state:'waiting'}, updatedAt: payload.updatedAt || updatedAt || new Date().toISOString() };
}
async function readCanonicalJoinState(){
  const liveRows = await sb('live_scores?id=eq.join_state&select=*&limit=1', { method:'GET' }).catch(()=>[]);
  const liveRow = Array.isArray(liveRows) ? liveRows[0] : null;
  const live = normalizeJoinPayload(liveRow && liveRow.payload, liveRow && liveRow.updated_at);
  const sharedWait = await readShared('pklJoinWaitList').catch(()=>({value:null,updated_at:null}));
  const sharedCancel = await readShared('pklJoinCancelList').catch(()=>({value:null,updated_at:null}));
  const sharedRecruit = await readShared('pklJoinRecruitState').catch(()=>({value:null,updated_at:null}));
  const sharedUpdated = Math.max(parseMs(sharedWait.updated_at), parseMs(sharedCancel.updated_at), parseMs(sharedRecruit.updated_at));
  let liveWait = uniqueUsers(live.waitList);
  let liveCancel = uniqueUsers(live.cancelList);
  let sharedWaitList = uniqueUsers(sharedWait.value);
  let sharedCancelList = uniqueUsers(sharedCancel.value);
  const resolvedLists = resolveJoinLists(mergeUsersList(liveWait, sharedWaitList), mergeUsersList(liveCancel, sharedCancelList));
  let waitList = resolvedLists.waitList;
  let cancelList = resolvedLists.cancelList;
  const recruitState = sharedUpdated > parseMs(live.updatedAt) && sharedRecruit.value && typeof sharedRecruit.value === 'object' ? sharedRecruit.value : live.recruitState;
  const updatedAt = new Date(Math.max(parseMs(live.updatedAt), sharedUpdated, Date.now())).toISOString();
  const payload = { version:2, waitList, cancelList, recruitState: recruitState || {state:'waiting'}, updatedAt };
  return { id:'join_state', payload, updated_at: updatedAt, source:'canonical_join_state' };
}

async function readRows(type, id){
  const table = tableFor(type);
  if(!table) throw new Error('Unknown table type');
  if(table === 'live_scores' && safeId(id || '') === 'join_state'){
    return [await readCanonicalJoinState()];
  }
  const q = id ? `?id=eq.${encodeURIComponent(id)}&select=*` : '?select=*';
  return await sb(`${table}${q}`, { method:'GET' }) || [];
}
function isJoinReset(body){
  const rs = body && body.recruitState || {};
  const empty = Array.isArray(body && body.waitList) && body.waitList.length === 0 && Array.isArray(body && body.cancelList) && body.cancelList.length === 0;
  return !!(empty && (rs.resetNonce || rs.resetAt || rs.reset === true || rs.state === 'waiting' || rs.state === 'closed'));
}
async function writeLive(id, payload){
  const rowId = safeId(id);
  let body = payload == null ? {} : payload;
  if(rowId === 'join_state' && body && typeof body === 'object' && !isJoinReset(body)){
    const current = await readCanonicalJoinState().catch(()=>null);
    if(current && current.payload){
      body = Object.assign({}, body, {
        version:2,
        // body는 버튼 클릭 후 브라우저/봇이 보낸 '최종 의도'다.
        // body.waitList에 있으면 과거 cancelList에서 반드시 제거하고,
        // body.cancelList에 있으면 과거 waitList에서 반드시 제거한다.
        waitList: resolveJoinLists(mergeUsersList(current.payload.waitList, body.waitList), mergeUsersList(current.payload.cancelList, body.cancelList)).waitList,
        cancelList: resolveJoinLists(mergeUsersList(current.payload.waitList, body.waitList), mergeUsersList(current.payload.cancelList, body.cancelList)).cancelList,
        recruitState: body.recruitState && body.recruitState.state ? body.recruitState : current.payload.recruitState,
        updatedAt: new Date().toISOString()
      });
    }
  }
  const saved = await sb('live_scores?on_conflict=id', { method:'POST', body: JSON.stringify({ id: rowId, payload: body, updated_at: new Date().toISOString() }) });
  if(rowId === 'join_state' && body && typeof body === 'object'){
    await Promise.all([
      writeShared('pklJoinWaitList', Array.isArray(body.waitList) ? body.waitList : []),
      writeShared('pklJoinCancelList', Array.isArray(body.cancelList) ? body.cancelList : []),
      writeShared('pklJoinRecruitState', body.recruitState || {state:'waiting'})
    ]).catch(()=>null);
  }
  return saved;
}
async function writeMatch(id, payload){
  const obj = payload && typeof payload === 'object' ? payload : { value: payload };
  return await sb('match_logs', { method:'POST', body: JSON.stringify({
    id: safeId(id),
    title: clean(obj.title || obj.name || obj.round || id),
    kind: clean(obj.kind || 'league'),
    snapshot: obj.snapshot && typeof obj.snapshot === 'object' ? obj.snapshot : obj,
    raw: obj,
    saved_at: obj.saved_at || obj.savedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  }) });
}
async function writePointLog(log){
  log = log || {};
  return await sb('point_logs', { method:'POST', body: JSON.stringify({
    discord_id: clean(log.discord_id || log.discordId),
    amount: Number(log.amount || log.points || log.delta || 0) || 0,
    reason: clean(log.reason || log.memo || log.type),
    actor: clean(log.actor || log.admin || log.by),
    created_at: log.created_at || log.createdAt || new Date().toISOString()
  }) });
}

async function readShared(key){
  const id = safeId(key);
  const rows = await sb(`pkl_shared_data?select=*&key=eq.${encodeURIComponent(id)}&limit=1`, { method:'GET' }) || [];
  const row = Array.isArray(rows) ? rows[0] : null;
  if(row) return { key:id, value: row.value, updated_at: row.updated_at || row.created_at || null, table:'pkl_shared_data' };
  return { key:id, value:null, updated_at:null, table:'pkl_shared_data' };
}
async function writeShared(key, value){
  const id = safeId(key);
  const now = new Date().toISOString();
  return await sb('pkl_shared_data?on_conflict=key', { method:'POST', body: JSON.stringify({ key:id, value:value == null ? null : value, updated_at:now }) });
}

async function bootstrap(){
  // 자동 복원/대량 bootstrap 금지. 필요한 데이터는 각 페이지에서 type=shared&key=... 로 1회 조회한다.
  return { ok:true, source:'supabase', shared_data:{} };
}
module.exports = async function handler(req, res){
  try{
    if(req.method === 'GET'){
      const q = req.query || {};
      if(q.bootstrap === '1') return json(res, 200, await bootstrap());
      if(q.type === 'users') return json(res, 200, { ok:true, users: userStore ? await userStore.readUsers() : [] });
      if(q.type === 'shared') return json(res, 200, { ok:true, item: await readShared(q.key || q.id || '') });
      const rows = await readRows(q.type, q.id);
      return json(res, 200, { ok:true, rows });
    }
    if(req.method === 'POST'){
      const body = parseBody(req);
      const type = clean(body.type);
      if(type === 'users'){
        if(!userStore) throw new Error('Supabase user store 없음');
        const incoming = Array.isArray(body.users) ? body.users : (body.user ? [body.user] : []);
        const current = await userStore.readUsers().catch(()=>[]);
        const merged = userStore.mergeUsers ? userStore.mergeUsers(current, incoming) : current.concat(incoming);
        const users = await userStore.writeUsers(merged);
        return json(res, 200, { ok:true, users });
      }
      if(type === 'live_scores' || type === 'live') return json(res, 200, { ok:true, rows: await writeLive(body.id, body.payload) });
      if(type === 'match_logs' || type === 'match') return json(res, 200, { ok:true, rows: await writeMatch(body.id, body.payload) });
      if(type === 'point_logs' || type === 'point') return json(res, 200, { ok:true, rows: await writePointLog(body.log || body.payload || body) });
      if(type === 'shared') return json(res, 200, { ok:true, rows: await writeShared(body.key || body.id || '', body.value != null ? body.value : body.payload) });
      return json(res, 400, { ok:false, message:'Unknown type' });
    }
    res.setHeader('Allow','GET, POST');
    return json(res, 405, { ok:false, message:'Method not allowed' });
  }catch(error){
    return json(res, 500, { ok:false, message:error && error.message ? error.message : String(error) });
  }
};
