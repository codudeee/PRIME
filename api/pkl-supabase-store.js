const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.PKL_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.PKL_SUPABASE_ANON_KEY || '';

function configured(){ return !!(SUPABASE_URL && SUPABASE_KEY); }
function clean(v){ return String(v == null ? '' : v).trim(); }
function cleanId(v){ return clean(v).toLowerCase().replace(/^discord-/, ''); }
function normalizeRole(v){
  const raw = clean(v); const low = raw.toLowerCase();
  if(['admin','administrator','owner','master','superadmin','manager'].includes(low) || ['관리자','총관리자','마스터','총괄'].includes(raw)) return 'admin';
  if(['operator','staff','moderator','mod'].includes(low) || ['운영자','운영진','스태프'].includes(raw)) return 'operator';
  if(['prisoner','jail','banned','blocked'].includes(low) || ['수감자','차단','정지'].includes(raw)) return 'prisoner';
  if(['guest','temp','temporary'].includes(low) || ['임시','준회원'].includes(raw)) return 'guest';
  return raw || 'user';
}
function normalizeTier(v){
  const raw = clean(v);
  if(!raw || raw === '없음' || raw.toLowerCase() === 'none') return 'none';
  return raw;
}
function normalizeUser(raw){
  const src = raw && raw.raw && typeof raw.raw === 'object' ? {...raw.raw, ...raw} : {...(raw || {})};
  const did = cleanId(src.discordId || src.discord_id || src.uid || src.id || src.userId || src.memberId || src.key);
  const nick = clean(src.nickname || src.nick || src.name || src.displayName || src.discord_username || src.discordUsername || src.username || src.discordGlobalName);
  const pubg = clean(src.pubgId || src.pubg_id || src.pubgID || src.gameId || src.pubgName || src.ref || src.pubg);
  const role = normalizeRole(src.memberRole || src.role || src.userRole || src.authRole || src.adminRole || (src.is_admin ? 'admin' : 'user'));
  const tier = normalizeTier(src.memberTier || src.gradeRole || src.tierRole || src.baseRole || src.tier || src.memberTierName || src.tierName);
  const prime = Number(src.prime ?? src.points ?? src.dia ?? src.chicken ?? 0) || 0;
  const warnings = Number(src.warnings ?? src.warn ?? 0) || 0;
  const u = {
    ...src,
    discordId: did,
    uid: did ? `discord-${did}` : clean(src.uid || src.id || src.userId || ''),
    id: did ? `discord-${did}` : clean(src.id || src.uid || src.userId || ''),
    userId: did ? `discord-${did}` : clean(src.userId || src.uid || src.id || ''),
    key: did ? `discord-${did}` : clean(src.key || src.uid || src.id || ''),
    discordUsername: clean(src.discordUsername || src.discord_username || src.username || ''),
    nickname: nick || (did ? `회원-${did.slice(-4)}` : ''),
    nick: nick || (did ? `회원-${did.slice(-4)}` : ''),
    name: nick || (did ? `회원-${did.slice(-4)}` : ''),
    displayName: nick || (did ? `회원-${did.slice(-4)}` : ''),
    pubgId: pubg,
    gameId: pubg,
    pubgName: pubg,
    ref: pubg,
    role,
    memberRole: role,
    userRole: role,
    authRole: role,
    adminRole: role === 'admin' ? '관리자' : (role === 'operator' ? '운영자' : (role === 'prisoner' ? '수감자' : '일반')),
    memberRoleName: role === 'admin' ? '관리자' : (role === 'operator' ? '운영자' : (role === 'prisoner' ? '수감자' : '일반')),
    memberTier: tier,
    gradeRole: tier,
    tierRole: tier,
    baseRole: tier,
    originalRole: tier,
    tier: tier === 'none' ? '없음' : tier,
    memberTierName: tier === 'none' ? '없음' : tier,
    prime,
    points: Number(src.points ?? prime) || 0,
    dia: prime,
    chicken: prime,
    warnings,
    approved: src.approved !== false,
    status: src.status || 'approved',
    join: src.join || src.joinDate || src.created_at || src.createdAt || '',
    last: src.last || src.lastLogin || src.updated_at || src.updatedAt || ''
  };
  return u;
}
function strongKeys(u){ return [u && u.discordId, u && u.discord_id, u && u.uid, u && u.id, u && u.userId, u && u.memberId, u && u.key].map(cleanId).filter(Boolean); }
function sameUser(a,b){
  const ak = strongKeys(a), bk = strongKeys(b);
  if(ak.length && bk.length) return ak.some(v => bk.includes(v));
  const ap = clean((a||{}).pubgId || (a||{}).pubg_id || (a||{}).gameId).toLowerCase();
  const bp = clean((b||{}).pubgId || (b||{}).pubg_id || (b||{}).gameId).toLowerCase();
  return !!(ap && bp && ap === bp);
}
function mergeUsers(){
  const out=[];
  for(const list of arguments){
    (Array.isArray(list)?list:[]).forEach(raw=>{
      if(!raw || typeof raw !== 'object') return;
      const u = normalizeUser(raw);
      const i = out.findIndex(x => sameUser(x,u));
      if(i >= 0) out[i] = normalizeUser({...out[i], ...u});
      else out.push(u);
    });
  }
  return out;
}
function escapeLike(value){ return clean(value).replace(/[%_]/g, m => '\\' + m); }
function rowToUser(r){
  r = r || {};
  const raw = r.raw && typeof r.raw === 'object' ? r.raw : {};
  return normalizeUser({
    ...raw,
    discordId: r.discord_id,
    discordUsername: r.discord_username,
    nickname: r.nickname,
    pubgId: r.pubg_id,
    memberTier: r.tier,
    tier: r.tier,
    prime: r.prime ?? r.points,
    points: r.points ?? r.prime,
    warnings: r.warnings,
    jailed: r.jailed,
    banned: r.banned,
    role: r.role || r.member_role || (r.is_admin ? 'admin' : raw.role),
    created_at: r.created_at,
    updated_at: r.updated_at,
    raw
  });
}
async function supabaseFetch(path, options={}){
  if(!configured()) throw new Error('Supabase 설정 없음');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if(!res.ok){
    const detail = await res.text().catch(()=> '');
    throw new Error(`Supabase ${options.method || 'GET'} ${path} failed ${res.status}: ${detail}`);
  }
  const json = await res.json().catch(()=> null);
  return { json, headers: res.headers };
}
async function readUserDocs(options={}){
  const limit = Math.max(1, Math.min(100, Number(options.limit || 20)));
  const offset = Math.max(0, Number(options.offset || 0));
  const q = clean(options.q || '');
  let path = `users?select=*&order=nickname.asc.nullslast&offset=${offset}&limit=${limit}`;
  if(q){
    const term = encodeURIComponent(`*${escapeLike(q)}*`);
    path += `&or=(nickname.ilike.${term},pubg_id.ilike.${term},discord_id.ilike.${term},discord_username.ilike.${term},role.ilike.${term},tier.ilike.${term})`;
  }
  const { json, headers } = await supabaseFetch(path, { headers: { Prefer: 'count=exact' } });
  const range = headers.get('content-range') || '';
  const count = Number((range.split('/')[1] || '').replace('*',''));
  return { users: (Array.isArray(json) ? json : []).map(rowToUser), count: Number.isFinite(count) ? count : (Array.isArray(json) ? json.length : 0), limit, offset, q };
}
async function writeUserDoc(user, forceAdmin=false){
  const u = normalizeUser(user);
  const discordId = cleanId(u.discordId || u.uid || u.id);
  if(!discordId) throw new Error('discord_id가 없어 저장할 수 없습니다.');
  const role = forceAdmin ? 'admin' : normalizeRole(u.memberRole || u.role);
  const body = {
    discord_id: discordId,
    discord_username: clean(u.discordUsername || u.username || u.displayName || u.nickname),
    nickname: clean(u.nickname || u.displayName || u.nick || u.name),
    pubg_id: clean(u.pubgId || u.gameId || u.ref),
    tier: clean(u.memberTier || u.gradeRole || u.tierRole || u.tier || 'none'),
    prime: Number(u.prime ?? u.points ?? u.dia ?? u.chicken ?? 0) || 0,
    points: Number(u.points ?? u.prime ?? 0) || 0,
    warnings: Number(u.warnings ?? 0) || 0,
    role,
    raw: u,
    updated_at: new Date().toISOString()
  };
  async function upsert(obj){
    const { json } = await supabaseFetch('users?on_conflict=discord_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(obj)
    });
    return Array.isArray(json) && json[0] ? rowToUser(json[0]) : normalizeUser({...u, role});
  }
  try { return await upsert(body); }
  catch(e){
    const msg = String(e && e.message || e);
    const fallback = {...body};
    if(/points/i.test(msg)) delete fallback.points;
    if(/warnings/i.test(msg)) delete fallback.warnings;
    if(/role/i.test(msg)) delete fallback.role;
    if(/raw/i.test(msg)) delete fallback.raw;
    if(/updated_at/i.test(msg)) delete fallback.updated_at;
    if(JSON.stringify(fallback) === JSON.stringify(body)) throw e;
    return await upsert(fallback);
  }
}

async function readUserRowByIdentity(identity={}){
  const cleanVal = v => clean(v).replace(/^discord-/, '');
  const candidates = [];
  const discordId = cleanVal(identity.discordId || identity.discord_id || identity.uid || identity.id || identity.userId || identity.key);
  const pubgId = clean(identity.pubgId || identity.pubg_id || identity.gameId || identity.ref);
  const nickname = clean(identity.nickname || identity.nick || identity.name);
  if(discordId) candidates.push(`discord_id=eq.${encodeURIComponent(discordId)}`);
  if(pubgId) candidates.push(`pubg_id=eq.${encodeURIComponent(pubgId)}`);
  if(nickname) candidates.push(`nickname=eq.${encodeURIComponent(nickname)}`);
  for(const filter of candidates){
    const { json } = await supabaseFetch(`users?select=*&${filter}&limit=1`);
    if(Array.isArray(json) && json[0]) return json[0];
  }
  throw new Error('대상 회원을 Supabase users에서 찾을 수 없습니다.');
}
async function insertAdminLogSafe(payload){
  try{
    await supabaseFetch('admin_logs', {
      method:'POST',
      headers:{ Prefer:'return=minimal' },
      body:JSON.stringify(payload)
    });
  }catch(e){ console.warn && console.warn('admin_logs insert failed', e && e.message ? e.message : e); }
}
async function insertPointLogSafe(payload){
  try{
    await supabaseFetch('point_logs', {
      method:'POST',
      headers:{ Prefer:'return=minimal' },
      body:JSON.stringify(payload)
    });
  }catch(e){ console.warn && console.warn('point_logs insert failed', e && e.message ? e.message : e); }
}
async function adjustUserPrime(identity={}, amount=0, reason='', actor=''){
  const delta = Number(amount) || 0;
  if(!delta) throw new Error('프라임 수량이 없습니다.');
  const row = await readUserRowByIdentity(identity);
  const current = Number(row.prime ?? row.points ?? (row.raw && (row.raw.prime ?? row.raw.points ?? row.raw.dia ?? row.raw.chicken)) ?? 0) || 0;
  const next = Math.max(0, current + delta);
  const raw = row.raw && typeof row.raw === 'object' ? {...row.raw} : {};
  const now = new Date().toISOString();
  const action = delta > 0 ? 'prime_grant' : 'prime_seize';
  const title = delta > 0 ? '프라임 지급' : '프라임 압수';
  const abs = Math.abs(delta);
  const mailText = `${abs} 프라임이 ${delta > 0 ? '지급' : '압수'}되었습니다.${reason ? ' 사유: ' + reason : ''}`;
  raw.prime = next;
  raw.points = next;
  raw.dia = next;
  raw.chicken = next;
  raw.history = Array.isArray(raw.history) ? raw.history : [];
  raw.memoList = Array.isArray(raw.memoList) ? raw.memoList : [];
  raw.mailbox = Array.isArray(raw.mailbox) ? raw.mailbox : [];
  const log = { type: action, reason: `${title}: ${abs} 프라임${reason ? ' · ' + reason : ''}`, date: now, admin: clean(actor || 'SYSTEM'), amount: delta, before: current, after: next };
  raw.history.unshift(log);
  raw.memoList.unshift({ date: now, admin: clean(actor || 'SYSTEM'), text: `[${title}] ${abs} · ${reason || '사유 없음'}` });
  raw.mailbox.unshift({ type:'prime', title, message: mailText, amount: delta, before: current, after: next, reason: clean(reason), actor: clean(actor || 'SYSTEM'), created_at: now, read:false });
  const body = { prime: next, points: next, raw, updated_at: now };
  async function patchUser(obj){
    const { json } = await supabaseFetch(`users?id=eq.${encodeURIComponent(row.id)}`, {
      method:'PATCH',
      headers:{ Prefer:'return=representation' },
      body:JSON.stringify(obj)
    });
    return json;
  }
  let json;
  try{
    json = await patchUser(body);
  }catch(e){
    const msg = String(e && e.message || e);
    const fallback = {...body};
    if(/points/i.test(msg)) delete fallback.points;
    if(/raw/i.test(msg)) delete fallback.raw;
    if(/updated_at/i.test(msg)) delete fallback.updated_at;
    if(JSON.stringify(fallback) === JSON.stringify(body)) throw e;
    json = await patchUser(fallback);
  }
  await insertPointLogSafe({ user_id: row.id, discord_id: row.discord_id || null, amount: delta, reason: clean(reason), actor: clean(actor || 'SYSTEM') });
  await insertAdminLogSafe({ action, actor: clean(actor || 'SYSTEM'), target: row.nickname || row.pubg_id || row.discord_id || '', detail: { amount: delta, before: current, after: next, reason: clean(reason), mail: mailText, discord_id: row.discord_id || '', pubg_id: row.pubg_id || '' } });
  const savedRow = Array.isArray(json) && json[0] ? json[0] : {...row, prime: next, points: next, raw};
  return { user: rowToUser(savedRow), before: current, after: next, amount: delta, mail: mailText };
}

async function deleteUserDoc(identity={}){
  const row = await readUserRowByIdentity(identity);
  await insertAdminLogSafe({ action:'user_delete', actor: clean(identity.actor || 'ADMIN'), target: row.nickname || row.pubg_id || row.discord_id || '', detail:{ discord_id: row.discord_id || '', pubg_id: row.pubg_id || '', nickname: row.nickname || '' } });
  await supabaseFetch(`users?id=eq.${encodeURIComponent(row.id)}`, { method:'DELETE', headers:{ Prefer:'return=minimal' } });
  return { ok:true, deleted:true, user: rowToUser(row) };
}

async function readUsers(options={}){
  const result = await readUserDocs({ limit: options.limit || 100, offset: options.offset || 0, q: options.q || "" });
  return result.users;
}
async function writeUsers(users){
  const list = Array.isArray(users) ? users : [];
  const saved = [];
  for (const user of list) saved.push(await writeUserDoc(user));
  return mergeUsers(saved);
}
async function readAdminState(){
  return { users: await readUsers({ limit: 100 }), pending: [], bans: [], warningRecords: [] };
}

module.exports = { readUserDocs, writeUserDoc, deleteUserDoc, readUsers, writeUsers, readAdminState, mergeUsers, normalizeUser, adjustUserPrime };
