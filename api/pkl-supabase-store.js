const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.PKL_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.PKL_SUPABASE_ANON_KEY || '';

function configured(){ return !!(SUPABASE_URL && SUPABASE_KEY); }
function clean(v){ return String(v == null ? '' : v).trim(); }
function cleanId(v){ return clean(v).toLowerCase().replace(/^discord-/, ''); }
function explicitDiscordId(src={}){
  const direct = cleanId(src.discordId || src.discord_id);
  if(direct) return direct;
  for(const key of ['uid','id','userId','memberId','key']){
    const raw = clean(src[key]);
    if(/^discord-/i.test(raw)) return cleanId(raw);
  }
  return '';
}
function hasDiscordIdentity(u){ return !!explicitDiscordId(u || {}); }
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
  const did = explicitDiscordId(src);
  const nick = clean(src.nickname || src.nick || src.name || src.displayName || src.discord_username || src.discordUsername || src.username || src.discordGlobalName);
  const pubg = clean(src.pubgId || src.pubg_id || src.pubgID || src.gameId || src.pubgName || src.ref || src.pubg);
  const role = normalizeRole(src.memberRole || src.role || src.userRole || src.authRole || src.adminRole || (src.is_admin ? 'admin' : 'user'));
  const tierInput = (src.memberTier != null ? src.memberTier : (src.gradeRole != null ? src.gradeRole : (src.tierRole != null ? src.tierRole : (src.tier != null ? src.tier : (src.baseRole != null ? src.baseRole : (src.memberTierName || src.tierName))))));
  const tier = normalizeTier(tierInput);
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
function strongKeys(u){ const did = explicitDiscordId(u || {}); return did ? [did] : []; }
function sameUser(a,b){
  const ak = strongKeys(a), bk = strongKeys(b);
  return !!(ak.length && bk.length && ak.some(v => bk.includes(v)));
}
function mergeUsers(){
  const out=[];
  for(const list of arguments){
    (Array.isArray(list)?list:[]).forEach(raw=>{
      if(!raw || typeof raw !== 'object') return;
      const u = normalizeUser(raw);
      if(!u.discordId) return;
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
  let path = `users?select=*&discord_id=not.is.null&discord_id=neq.&order=nickname.asc.nullslast&offset=${offset}&limit=${limit}`;
  if(q){
    const term = encodeURIComponent(`*${escapeLike(q)}*`);
    path += `&or=(nickname.ilike.${term},pubg_id.ilike.${term},discord_id.ilike.${term},discord_username.ilike.${term},role.ilike.${term},tier.ilike.${term})`;
  }
  const { json, headers } = await supabaseFetch(path, { headers: { Prefer: 'count=exact' } });
  const range = headers.get('content-range') || '';
  const count = Number((range.split('/')[1] || '').replace('*',''));
  const rawUsers = (Array.isArray(json) ? json : []).map(rowToUser).filter(u => !!u.discordId);
  // Supabase users is the only source, but the API also normalizes the page result once here.
  // This prevents the client pages from each doing their own cache/nickname merge and creating duplicate visible users.
  const seenDiscord = new Set();
  const seenNickname = new Set();
  const users = [];
  for (const u of rawUsers) {
    const did = cleanId(u.discordId || u.discord_id);
    if (!did || seenDiscord.has(did)) continue;
    const nickKey = clean(u.nickname || u.name || u.nick).replace(/\s+/g, '').toLowerCase();
    // PKL policy: nickname duplicates are not allowed. If an old/legacy duplicate row is returned, do not expose it to UI.
    if (nickKey && seenNickname.has(nickKey)) continue;
    seenDiscord.add(did);
    if (nickKey) seenNickname.add(nickKey);
    users.push(u);
  }
  return { users, count: users.length, limit, offset, q };
}
async function writeUserDoc(user, forceAdmin=false){
  const u = normalizeUser(user);
  const discordId = explicitDiscordId(u);
  if(!discordId) throw new Error('discord_id가 없어 저장할 수 없습니다.');
  const role = forceAdmin ? 'admin' : normalizeRole(u.memberRole || u.role);
  const body = {
    discord_id: discordId,
    discord_username: clean(u.discordUsername || u.username || u.displayName || u.nickname),
    nickname: clean(u.nickname || u.displayName || u.nick || u.name),
    pubg_id: clean(u.pubgId || u.gameId || u.ref),
    tier: normalizeTier(u.memberTier != null ? u.memberTier : (u.gradeRole != null ? u.gradeRole : (u.tierRole != null ? u.tierRole : (u.tier != null ? u.tier : 'none')))),
    prime: Number(u.prime ?? u.points ?? u.dia ?? u.chicken ?? 0) || 0,
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
  return await upsert(body);
}

async function readUserRowByIdentity(identity={}){
  const discordId = explicitDiscordId(identity || {});
  if(!discordId) throw new Error('Discord ID가 없는 회원 데이터는 수정할 수 없습니다.');
  const { json } = await supabaseFetch(`users?select=*&discord_id=eq.${encodeURIComponent(discordId)}&limit=1`);
  if(Array.isArray(json) && json[0]) return json[0];
  throw new Error('대상 회원을 Supabase users에서 찾을 수 없습니다.');
}
async function hasActiveBanRecord(identity={}){
  const discordId = explicitDiscordId(identity || {});
  const nickname = clean(identity.nickname || identity.nick || identity.name);
  const pubg = clean(identity.pubgId || identity.pubg_id || identity.gameId || identity.ref);
  const filters = [];
  if(discordId) filters.push(`discord_id.eq.${encodeURIComponent(discordId)}`);
  if(pubg) filters.push(`pubg_id.eq.${encodeURIComponent(pubg)}`);
  if(nickname) filters.push(`nickname.eq.${encodeURIComponent(nickname)}`);
  if(!filters.length) return false;
  const path = `ban_records?select=*&or=(${filters.join(',')})&limit=1`;
  const { json } = await supabaseFetch(path);
  return Array.isArray(json) && json.length > 0;
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
  const body = { prime: next, raw, updated_at: now };
  async function patchUser(obj){
    const { json } = await supabaseFetch(`users?id=eq.${encodeURIComponent(row.id)}`, {
      method:'PATCH',
      headers:{ Prefer:'return=representation' },
      body:JSON.stringify(obj)
    });
    return json;
  }
  const json = await patchUser(body);
  await insertPointLogSafe({ user_id: row.id, discord_id: row.discord_id || null, amount: delta, reason: clean(reason), actor: clean(actor || 'SYSTEM') });
  await insertAdminLogSafe({ action, actor: clean(actor || 'SYSTEM'), target: row.nickname || row.pubg_id || row.discord_id || '', detail: { amount: delta, before: current, after: next, reason: clean(reason), mail: mailText, discord_id: row.discord_id || '', pubg_id: row.pubg_id || '' } });
  const savedRow = Array.isArray(json) && json[0] ? json[0] : {...row, prime: next, raw};
  return { user: rowToUser(savedRow), before: current, after: next, amount: delta, mail: mailText };
}


async function updateUserWithLog(identity={}, log={}, originalIdentity={}){
  const row = await readUserRowByIdentity(originalIdentity && explicitDiscordId(originalIdentity) ? originalIdentity : identity);
  const beforeUser = rowToUser(row);
  const nextInput = normalizeUser({...beforeUser, ...(identity || {})});
  const now = new Date().toISOString();
  const raw = row.raw && typeof row.raw === 'object' ? {...row.raw} : {};
  const before = normalizeUser({...raw, discordId: row.discord_id, nickname: row.nickname, pubgId: row.pubg_id, tier: row.tier, role: row.role, prime: row.prime, warnings: row.warnings});
  const changes = [];
  function chk(label, a, b){ if(clean(a) !== clean(b)) changes.push({field:label, before:clean(a), after:clean(b)}); }
  chk('닉네임', before.nickname, nextInput.nickname);
  chk('배그 ID', before.pubgId, nextInput.pubgId);
  chk('회원 티어', before.memberTier || before.tier, nextInput.memberTier || nextInput.tier);
  chk('회원 역할', before.memberRole || before.role, nextInput.memberRole || nextInput.role);
  if(Number(before.prime||0)!==Number(nextInput.prime||0)) changes.push({field:'보유 프라임', before:Number(before.prime||0), after:Number(nextInput.prime||0)});
  if(Number(before.warnings||0)!==Number(nextInput.warnings||0)) changes.push({field:'경고', before:Number(before.warnings||0), after:Number(nextInput.warnings||0)});
  const action = clean(log.type || log.action || (changes.some(c=>c.field==='회원 티어') ? 'tier_change' : 'profile_edit')) || 'profile_edit';
  const reason = clean(log.reason || (changes.length ? changes.map(c=>`${c.field}: ${c.before || '-'} → ${c.after || '-'}`).join(' / ') : '회원 정보 수정'));
  const actor = clean(log.actor || log.admin || 'ADMIN');
  const mergedRaw = {...raw, ...nextInput, history:Array.isArray(raw.history)?raw.history:[], memoList:Array.isArray(raw.memoList)?raw.memoList:[]};
  mergedRaw.history.unshift({type:action, reason, date:now, admin:actor, changes});
  const body = {
    discord_id: row.discord_id,
    discord_username: clean(nextInput.discordUsername || row.discord_username),
    nickname: clean(nextInput.nickname || row.nickname),
    pubg_id: clean(nextInput.pubgId || row.pubg_id),
    tier: normalizeTier(nextInput.memberTier != null ? nextInput.memberTier : (nextInput.gradeRole != null ? nextInput.gradeRole : (nextInput.tierRole != null ? nextInput.tierRole : (nextInput.tier != null ? nextInput.tier : (row.tier || 'none'))))),
    role: normalizeRole(nextInput.memberRole || nextInput.role || row.role || 'user'),
    prime: Number(nextInput.prime ?? nextInput.points ?? row.prime ?? 0) || 0,
    warnings: Number(nextInput.warnings ?? row.warnings ?? 0) || 0,
    raw: mergedRaw,
    updated_at: now
  };
  async function patch(obj){
    const { json } = await supabaseFetch(`users?id=eq.${encodeURIComponent(row.id)}`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(obj)});
    return Array.isArray(json) && json[0] ? json[0] : {...row, ...obj};
  }
  const saved = await patch(body);
  await insertAdminLogSafe({action, actor, target: body.nickname || body.pubg_id || row.discord_id || '', detail:{reason, changes, discord_id: row.discord_id, before: beforeUser, after: rowToUser(saved)}});
  return rowToUser(saved);
}

async function recordBan(ban={}, actor='ADMIN'){
  const now = new Date().toISOString();
  const discordId = explicitDiscordId(ban || {});
  const payload = {
    discord_id: discordId || null,
    nickname: clean(ban.nickname || ban.nick || ban.name),
    pubg_id: clean(ban.pubgId || ban.pubg_id || ban.gameId || ban.ref),
    reason: clean(ban.reason || '영구추방'),
    actor: clean(actor || ban.admin || 'ADMIN'),
    created_at: now,
    raw: ban
  };
  let saved = payload;
  try{
    const { json } = await supabaseFetch('ban_records', {method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    saved = Array.isArray(json) && json[0] ? json[0] : payload;
  }catch(e){
    await insertAdminLogSafe({action:'ban_record',actor:payload.actor,target:payload.nickname||payload.discord_id||'',detail:payload});
  }
  if(discordId){
    try{
      const row = await readUserRowByIdentity({discordId});
      const raw = row.raw && typeof row.raw==='object' ? {...row.raw} : {};
      raw.banned = true; raw.banReason = payload.reason; raw.banDate = now;
      await supabaseFetch(`users?id=eq.${encodeURIComponent(row.id)}`, {method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({banned:true, role:'banned', raw, updated_at:now})});
    }catch(_e){}
  }
  await insertAdminLogSafe({action:'ban', actor:payload.actor, target:payload.nickname||payload.pubg_id||payload.discord_id||'', detail:payload});
  return saved;
}

async function deleteBanRecord(ban={}, actor='ADMIN'){
  const discordId = explicitDiscordId(ban || {});
  const nickname = clean(ban.nickname || ban.nick || ban.name);
  const pubg = clean(ban.pubgId || ban.pubg_id || ban.gameId || ban.ref);
  let path = '';
  if(discordId) path = `ban_records?discord_id=eq.${encodeURIComponent(discordId)}`;
  else if(pubg) path = `ban_records?pubg_id=eq.${encodeURIComponent(pubg)}`;
  else if(nickname) path = `ban_records?nickname=eq.${encodeURIComponent(nickname)}`;
  if(path){
    try{ await supabaseFetch(path, {method:'DELETE',headers:{Prefer:'return=minimal'}}); }catch(e){ await insertAdminLogSafe({action:'ban_delete_failed',actor:clean(actor||'ADMIN'),target:nickname||pubg||discordId,detail:{message:String(e&&e.message||e)}}); }
  }
  if(discordId){
    try{
      const row = await readUserRowByIdentity({discordId});
      const raw = row.raw && typeof row.raw==='object' ? {...row.raw} : {};
      const releasedAt = new Date().toISOString();
      raw.banned = false;
      raw.banReleasedAt = releasedAt;
      raw.rejoinAllowed = true;
      raw.memberRole = 'user';
      raw.role = 'user';
      raw.userRole = 'user';
      raw.authRole = 'user';
      raw.adminRole = '일반';
      raw.memberRoleName = '일반';
      raw.memberTier = 'none';
      raw.gradeRole = 'none';
      raw.tierRole = 'none';
      raw.baseRole = 'none';
      raw.originalRole = 'none';
      raw.tier = '없음';
      raw.memberTierName = '없음';
      raw.warnings = 0;
      delete raw.banReason;
      delete raw.banDate;
      delete raw.prisonUntil;
      delete raw.prison_until;
      await supabaseFetch(`users?id=eq.${encodeURIComponent(row.id)}`, {method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({banned:false, role:'user', tier:'none', warnings:0, prison_until:null, raw, updated_at:releasedAt})});
    }catch(_e){}
  }
  await insertAdminLogSafe({action:'ban_delete',actor:clean(actor||'ADMIN'),target:nickname||pubg||discordId,detail:{discord_id:discordId,nickname,pubg_id:pubg}});
  return { deleted:true };
}

async function readLegacyUsers(options={}){
  const limit = Math.max(1, Math.min(500, Number(options.limit || 200)));
  const { json } = await supabaseFetch(`users?select=*&or=(discord_id.is.null,discord_id.eq.)&order=nickname.asc.nullslast&limit=${limit}`);
  return Array.isArray(json) ? json.map(rowToUser) : [];
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

module.exports = { readUserDocs, writeUserDoc, readUsers, writeUsers, readAdminState, mergeUsers, normalizeUser, adjustUserPrime, updateUserWithLog, recordBan, deleteBanRecord, hasActiveBanRecord, readLegacyUsers, explicitDiscordId, hasDiscordIdentity };
