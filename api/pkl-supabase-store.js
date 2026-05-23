const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.PKL_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.PKL_SUPABASE_ANON_KEY || '';

function configured(){ return !!(SUPABASE_URL && SUPABASE_KEY); }
function clean(v){ return String(v == null ? '' : v).trim(); }
function stripLeadingNicknameDecorations(v){
  return clean(v)
    .normalize('NFKC')
    .replace(/^[\s\u00a0\u200b\u200c\u200d\ufeff]+/g, '')
    .replace(/^(?:[^\p{L}\p{N}_-]|[\uFE0E\uFE0F\u200D])+/u, '')
    .trim();
}
function cleanNickname(v){ return stripLeadingNicknameDecorations(v); }
function discordServerNickname(v){
  const first = stripLeadingNicknameDecorations(String(v == null ? '' : v).split('/')[0] || '');
  if(!first) return '';
  const m = first.match(/[가-힣][가-힣0-9A-Za-z_\-\s]{0,18}/u);
  return cleanNickname(m ? m[0] : first);
}
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
  const compact = raw.normalize('NFKC').replace(/[\s_-]+/g, '').toLowerCase();
  const map = {
    tier0:'tier0_mid', tier0high:'tier0_high', tier0mid:'tier0_mid', tier0middle:'tier0_mid', tier0low:'tier0_low',
    tier1:'tier1_mid', tier1high:'tier1_high', tier1mid:'tier1_mid', tier1middle:'tier1_mid', tier1low:'tier1_low',
    tier2:'tier2_mid', tier2high:'tier2_high', tier2mid:'tier2_mid', tier2middle:'tier2_mid', tier2low:'tier2_low',
    tier3:'tier3_mid', tier3high:'tier3_high', tier3mid:'tier3_mid', tier3middle:'tier3_mid', tier3low:'tier3_low',
    tier4:'tier4_mid', tier4high:'tier4_high', tier4mid:'tier4_mid', tier4middle:'tier4_mid', tier4low:'tier4_low',
    tier5:'tier5_low', tier5high:'tier5_high', tier5mid:'tier5_mid', tier5middle:'tier5_mid', tier5low:'tier5_low',
    beast:'tier5_low', beasthigh:'tier5_high', beastmid:'tier5_mid', beastmiddle:'tier5_mid', beastlow:'tier5_low',
    '0티어':'tier0_mid','0티어상':'tier0_high','0상':'tier0_high','0티어중':'tier0_mid','0중':'tier0_mid','0티어하':'tier0_low','0하':'tier0_low',
    '1티어':'tier1_mid','1티어상':'tier1_high','1상':'tier1_high','1티어중':'tier1_mid','1중':'tier1_mid','1티어하':'tier1_low','1하':'tier1_low',
    '2티어':'tier2_mid','2티어상':'tier2_high','2상':'tier2_high','2티어중':'tier2_mid','2중':'tier2_mid','2티어하':'tier2_low','2하':'tier2_low',
    '3티어':'tier3_mid','3티어상':'tier3_high','3상':'tier3_high','3티어중':'tier3_mid','3중':'tier3_mid','3티어하':'tier3_low','3하':'tier3_low',
    '4티어':'tier4_mid','4티어상':'tier4_high','4상':'tier4_high','4티어중':'tier4_mid','4중':'tier4_mid','4티어하':'tier4_low','4하':'tier4_low',
    '5티어':'tier5_low','5티어상':'tier5_high','5상':'tier5_high','5티어중':'tier5_mid','5중':'tier5_mid','5티어하':'tier5_low','5하':'tier5_low',
    '짐승':'tier5_low','짐승상':'tier5_high','짐승중':'tier5_mid','짐승하':'tier5_low'
  };
  return map[compact] || raw;
}
function registeredNicknameFromRaw(raw){
  raw = raw && typeof raw === 'object' ? raw : {};
  return cleanNickname(raw.registeredNickname || raw.pklNickname || raw.pkl_nickname || raw.signupNickname || raw.signup_nickname || '');
}
function registeredPubgFromRaw(raw){
  raw = raw && typeof raw === 'object' ? raw : {};
  return clean(raw.registeredPubgId || raw.pklPubgId || raw.pkl_pubg_id || raw.signupPubgId || raw.signup_pubg_id || '');
}
function isKoreanNameText(v){
  const t = cleanNickname(v);
  return !!t && /[가-힣]/.test(t);
}
function discordDisplayFromRaw(raw){
  raw = raw && typeof raw === 'object' ? raw : {};
  // 사이트 표시 닉네임은 Discord 서버 프로필 닉네임만 사용한다.
  // username/global_name/discord_id는 여기서 절대 fallback으로 쓰지 않는다.
  return discordServerNickname(raw.discordGuildNick || raw.guildNick || raw.serverNick || raw.discordServerNickname || '');
}
function safeDisplayNickname(src){
  src = src && typeof src === 'object' ? src : {};
  const raw = src.raw && typeof src.raw === 'object' ? src.raw : {};
  // Supabase users.nickname(row.nickname)이 사이트/admin/tier의 단일 표시 기준이다.
  // raw.discordGuildNick 같은 과거 서버닉은 최신 nickname을 절대 덮어쓰지 않고, nickname이 없을 때만 fallback으로 사용한다.
  const current = cleanNickname(src.nickname || src.nick || src.name || raw.nickname || raw.nick || raw.name || '');
  if(current) return current;
  const registered = registeredNicknameFromRaw(raw);
  if(registered) return registered;
  const pkl = cleanNickname(src.pklNickname || src.pkl_nickname || src.signupNickname || src.signup_nickname || raw.pklNickname || raw.pkl_nickname || raw.signupNickname || raw.signup_nickname || '');
  if(pkl) return pkl;
  const guildNick = discordDisplayFromRaw(Object.assign({}, raw, src));
  if(guildNick) return guildNick;
  return '';
}

function env(name){ return clean(process.env[name] || ''); }
function envList(name){ return env(name).split(/[,:\s]+/).map(cleanId).filter(Boolean); }
function parseJsonMap(value){ try{ const o = JSON.parse(value || '{}'); return o && typeof o === 'object' ? o : {}; }catch(e){ return {}; } }
const ACCESS_ROLE_ENV_KEYS = {
  admin: ['PKL_DISCORD_ADMIN_ROLE_IDS','DISCORD_ADMIN_ROLE_IDS','PKL_ADMIN_ROLE_IDS'],
  operator: ['PKL_DISCORD_OPERATOR_ROLE_IDS','DISCORD_OPERATOR_ROLE_IDS','PKL_OPERATOR_ROLE_IDS']
};
const TIER_ENV_KEYS = {
  tier0_high:['PKL_TIER0_HIGH_ROLE_ID','DISCORD_TIER0_HIGH_ROLE_ID'], tier0_mid:['PKL_TIER0_MID_ROLE_ID','DISCORD_TIER0_MID_ROLE_ID'], tier0_low:['PKL_TIER0_LOW_ROLE_ID','DISCORD_TIER0_LOW_ROLE_ID'],
  tier1_high:['PKL_TIER1_HIGH_ROLE_ID','DISCORD_TIER1_HIGH_ROLE_ID'], tier1_mid:['PKL_TIER1_MID_ROLE_ID','DISCORD_TIER1_MID_ROLE_ID'], tier1_low:['PKL_TIER1_LOW_ROLE_ID','DISCORD_TIER1_LOW_ROLE_ID'],
  tier2_high:['PKL_TIER2_HIGH_ROLE_ID','DISCORD_TIER2_HIGH_ROLE_ID'], tier2_mid:['PKL_TIER2_MID_ROLE_ID','DISCORD_TIER2_MID_ROLE_ID'], tier2_low:['PKL_TIER2_LOW_ROLE_ID','DISCORD_TIER2_LOW_ROLE_ID'],
  tier3_high:['PKL_TIER3_HIGH_ROLE_ID','DISCORD_TIER3_HIGH_ROLE_ID'], tier3_mid:['PKL_TIER3_MID_ROLE_ID','DISCORD_TIER3_MID_ROLE_ID'], tier3_low:['PKL_TIER3_LOW_ROLE_ID','DISCORD_TIER3_LOW_ROLE_ID'],
  tier4_high:['PKL_TIER4_HIGH_ROLE_ID','DISCORD_TIER4_HIGH_ROLE_ID'], tier4_mid:['PKL_TIER4_MID_ROLE_ID','DISCORD_TIER4_MID_ROLE_ID'], tier4_low:['PKL_TIER4_LOW_ROLE_ID','DISCORD_TIER4_LOW_ROLE_ID'],
  tier5_high:['PKL_TIER5_HIGH_ROLE_ID','DISCORD_TIER5_HIGH_ROLE_ID','PKL_BEAST_HIGH_ROLE_ID','DISCORD_BEAST_HIGH_ROLE_ID'],
  tier5_mid:['PKL_TIER5_MID_ROLE_ID','DISCORD_TIER5_MID_ROLE_ID','PKL_BEAST_MID_ROLE_ID','DISCORD_BEAST_MID_ROLE_ID'],
  tier5_low:['PKL_TIER5_LOW_ROLE_ID','DISCORD_TIER5_LOW_ROLE_ID','PKL_BEAST_LOW_ROLE_ID','DISCORD_BEAST_LOW_ROLE_ID'],
  beast:['PKL_BEAST_ROLE_ID','DISCORD_BEAST_ROLE_ID']
};
function configuredAdminDiscordIds(){ return envList('PKL_ADMIN_DISCORD_IDS').concat(envList('DISCORD_ADMIN_IDS')).concat(envList('ADMIN_DISCORD_IDS')); }
function highestAccessRoleFromDiscordRoleIds(roleIds=[]){
  const ids = new Set((Array.isArray(roleIds)?roleIds:[]).map(cleanId).filter(Boolean));
  for(const key of ACCESS_ROLE_ENV_KEYS.admin){ if(envList(key).some(id=>ids.has(id))) return 'admin'; }
  for(const key of ACCESS_ROLE_ENV_KEYS.operator){ if(envList(key).some(id=>ids.has(id))) return 'operator'; }
  return '';
}
function tierFromDiscordRoleIds(roleIds=[]){
  const ids = new Set((Array.isArray(roleIds)?roleIds:[]).map(cleanId).filter(Boolean));
  const jsonMap = Object.assign({}, parseJsonMap(env('PKL_DISCORD_TIER_ROLE_MAP')), parseJsonMap(env('DISCORD_TIER_ROLE_MAP')));
  for(const [roleId,tierName] of Object.entries(jsonMap)){ if(ids.has(cleanId(roleId))) return normalizeTier(tierName); }
  for(const [tierName, keys] of Object.entries(TIER_ENV_KEYS)){
    for(const key of keys){ if(envList(key).some(id=>ids.has(id))) return normalizeTier(tierName); }
  }
  return 'none';
}
async function fetchDiscordGuildMember(discordId){
  const did = cleanId(discordId);
  const guildId = env('PKL_DISCORD_GUILD_ID') || env('DISCORD_GUILD_ID') || env('GUILD_ID');
  const token = env('DISCORD_BOT_TOKEN') || env('PKL_DISCORD_BOT_TOKEN') || env('BOT_TOKEN');
  if(!did || !guildId || !token) return null;
  const auth = /^Bot\s+/i.test(token) ? token : `Bot ${token}`;
  let controller=null, timer=null;
  try{ controller=new AbortController(); timer=setTimeout(()=>{try{controller.abort();}catch(_e){}}, 1800); }catch(_e){}
  try{
    const res = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(did)}`, { headers:{ Authorization:auth, Accept:'application/json' }, signal:controller && controller.signal });
    if(!res.ok) return null;
    return await res.json().catch(()=>null);
  }catch(_e){
    return null;
  }finally{
    if(timer) clearTimeout(timer);
  }
}
async function discordRolePatchForUser(user){
  const did = explicitDiscordId(user || {});
  if(!did) return {};
  let member = null;
  try{ member = await fetchDiscordGuildMember(did); }catch(e){ member = null; }
  const roleIds = Array.isArray(member && member.roles) ? member.roles : [];
  const patch = {};
  const tier = tierFromDiscordRoleIds(roleIds);
  if(tier && tier !== 'none'){
    patch.tier = tier; patch.memberTier = tier; patch.gradeRole = tier; patch.tierRole = tier; patch.baseRole = tier; patch.originalRole = tier;
  }
  let accessRole = highestAccessRoleFromDiscordRoleIds(roleIds);
  if(configuredAdminDiscordIds().includes(did)) accessRole = 'admin';
  if(accessRole){ patch.role = accessRole; patch.memberRole = accessRole; patch.userRole = accessRole; patch.authRole = accessRole; }
  if(member){
    const guildNickRaw = clean(member.nick || '');
    const guildNick = discordServerNickname(guildNickRaw);
    patch.discordGuildRoleIds = roleIds;
    patch.discordGuildNick = guildNickRaw;
    patch.discordServerNickname = guildNick;
    if(guildNick){ patch.nickname = guildNick; patch.nick = guildNick; patch.name = guildNick; patch.displayName = guildNick; }
    patch.lastDiscordGuildSyncAt = new Date().toISOString();
  }
  return patch;
}
async function syncDiscordGuildRoles(user, options={}){
  const did = explicitDiscordId(user || {});
  if(!did) return null;
  const patch = await discordRolePatchForUser(user);
  if(!Object.keys(patch).length) return null;
  const rows = await findUserRowsByDiscordId(did);
  if(!rows.length) return normalizeUser({...user, ...patch});
  const row = rows[0];
  const raw = row.raw && typeof row.raw === 'object' ? {...row.raw} : {};
  const nextRole = patch.role ? normalizeRole(patch.role) : normalizeRole(row.role || raw.role || 'user');
  const nextTier = patch.memberTier ? normalizeTier(patch.memberTier) : normalizeTier(row.tier || raw.memberTier || raw.tier || 'none');
  const serverNick = discordServerNickname(patch.discordGuildNick || patch.discordServerNickname || raw.discordGuildNick || raw.discordServerNickname || '');
  const mergedRaw = {...raw, ...patch, role:nextRole, memberRole:nextRole, userRole:nextRole, authRole:nextRole, adminRole:nextRole==='admin'?'관리자':(nextRole==='operator'?'운영자':(nextRole==='prisoner'?'수감자':'일반')), memberRoleName:nextRole==='admin'?'관리자':(nextRole==='operator'?'운영자':(nextRole==='prisoner'?'수감자':'일반')), tier:nextTier==='none'?'없음':nextTier, memberTier:nextTier, gradeRole:nextTier, tierRole:nextTier};
  if(serverNick){ mergedRaw.nickname = serverNick; mergedRaw.nick = serverNick; mergedRaw.name = serverNick; mergedRaw.displayName = serverNick; mergedRaw.discordServerNickname = serverNick; }
  const body = { role: nextRole, tier: nextTier, raw: mergedRaw, updated_at: new Date().toISOString() };
  if(serverNick) body.nickname = serverNick;
  const { json } = await supabaseFetch(`users?id=eq.${encodeURIComponent(row.id)}`, { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(body) });
  return Array.isArray(json) && json[0] ? rowToUser(json[0]) : rowToUser({...row, ...body});
}

async function syncDiscordGuildNicknames(options={}){
  const limit = Math.max(1, Math.min(Number(options.limit || 2000) || 2000, 5000));
  const offset = Math.max(0, Number(options.offset || 0) || 0);
  const result = { ok:true, checked:0, updated:0, skipped:0, missingConfig:false, errors:[] };
  const guildId = env('PKL_DISCORD_GUILD_ID') || env('DISCORD_GUILD_ID') || env('GUILD_ID');
  const token = env('DISCORD_BOT_TOKEN') || env('PKL_DISCORD_BOT_TOKEN') || env('BOT_TOKEN');
  if(!guildId || !token){ result.missingConfig = true; return result; }
  const { json } = await supabaseFetch(`users?select=*&discord_id=not.is.null&discord_id=neq.&order=updated_at.desc.nullslast&offset=${offset}&limit=${limit}`);
  const rows = Array.isArray(json) ? json : [];
  for(const row of rows){
    const did = cleanId(row.discord_id || (row.raw && (row.raw.discordId || row.raw.discord_id)) || '');
    if(!did){ result.skipped++; continue; }
    result.checked++;
    try{
      const member = await fetchDiscordGuildMember(did);
      const serverNickRaw = clean(member && member.nick);
      const serverNick = discordServerNickname(serverNickRaw);
      if(!serverNick){ result.skipped++; continue; }
      const raw = row.raw && typeof row.raw === 'object' ? {...row.raw} : {};
      raw.discordGuildNick = serverNickRaw;
      raw.guildNick = serverNickRaw;
      raw.discordServerNickname = serverNick;
      raw.nickname = serverNick;
      raw.nick = serverNick;
      raw.name = serverNick;
      raw.displayName = serverNick;
      raw.lastDiscordGuildSyncAt = new Date().toISOString();
      await supabaseFetch(`users?id=eq.${encodeURIComponent(row.id)}`, {
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({ nickname:serverNick, raw, updated_at:raw.lastDiscordGuildSyncAt })
      });
      result.updated++;
    }catch(e){
      result.errors.push({discord_id:did, message:String(e && e.message || e).slice(0,180)});
    }
  }
  return result;
}


function normalizeUser(raw){
  const src = raw && raw.raw && typeof raw.raw === 'object' ? {...raw.raw, ...raw} : {...(raw || {})};
  const did = explicitDiscordId(src);
  const nick = safeDisplayNickname(src);
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
    discordDisplayName: clean(src.discordDisplayName || src.discordGlobalName || src.global_name || src.displayName || src.discord_username || src.discordUsername || ''),
    discordGlobalName: clean(src.discordGlobalName || src.global_name || src.discordDisplayName || ''),
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
function postgrestValue(v){ return clean(v).replace(/"/g, '\\"'); }
async function findUserRowsByDiscordId(discordId){
  const did = cleanId(discordId);
  if(!did) return [];
  const prefixed = `discord-${did}`;
  const filters = [
    `discord_id.eq.${postgrestValue(did)}`,
    `discord_id.eq.${postgrestValue(prefixed)}`,
    `raw->>discordId.eq.${postgrestValue(did)}`,
    `raw->>discord_id.eq.${postgrestValue(did)}`,
    `raw->>uid.eq.${postgrestValue(prefixed)}`,
    `raw->>id.eq.${postgrestValue(prefixed)}`,
    `raw->>userId.eq.${postgrestValue(prefixed)}`
  ];
  const path = `users?select=*&or=(${filters.map(encodeURIComponent).join(',')})&order=updated_at.desc.nullslast&limit=20`;
  try{
    const { json } = await supabaseFetch(path);
    return Array.isArray(json) ? json : [];
  }catch(e){
    try{
      const { json } = await supabaseFetch(`users?select=*&discord_id=eq.${encodeURIComponent(did)}&limit=20`);
      return Array.isArray(json) ? json : [];
    }catch(_){ return []; }
  }
}

function canonicalDiscordIdFromRow(row){
  row = row || {};
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return explicitDiscordId({
    discordId: row.discord_id || raw.discordId || raw.discord_id,
    discord_id: row.discord_id || raw.discord_id || raw.discordId,
    uid: raw.uid || row.uid,
    id: raw.id || row.id,
    userId: raw.userId || row.userId,
    key: raw.key || row.key
  });
}
function normalizeIdentityText(v){
  return clean(v).normalize('NFKC').toLowerCase().replace(/[\s\u00a0\u200b\u200c\u200d\ufeff]+/g, '');
}
function canonicalPubgIdFromRow(row){
  row = row || {};
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return normalizeIdentityText(row.pubg_id || raw.pubgId || raw.pubg_id || raw.gameId || raw.pubgName || raw.ref || raw.pubg);
}
function canonicalNicknameFromRow(row){
  row = row || {};
  const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
  return normalizeIdentityText(row.nickname || raw.nickname || raw.nick || raw.name || raw.displayName);
}
function accessRoleRank(v){
  const r = normalizeRole(v);
  if(r === 'admin') return 4;
  if(r === 'operator') return 3;
  if(r === 'prisoner') return 2;
  if(r === 'guest') return 1;
  return 0;
}
function highestRoleFromRows(rows){
  let best = 'user', rank = 0;
  (Array.isArray(rows)?rows:[]).forEach(row => {
    const raw = row && row.raw && typeof row.raw === 'object' ? row.raw : {};
    const candidates = [row && row.role, raw.memberRole, raw.role, raw.userRole, raw.authRole, raw.adminRole];
    candidates.forEach(v => { const r = normalizeRole(v); const n = accessRoleRank(r); if(n > rank){ rank = n; best = r; } });
  });
  return best;
}
function bestTierFromRows(rows, fallback){
  for(const row of (Array.isArray(rows)?rows:[])){
    const raw = row && row.raw && typeof row.raw === 'object' ? row.raw : {};
    const t = normalizeTier(row.tier || raw.memberTier || raw.gradeRole || raw.tierRole || raw.tier || raw.baseRole);
    if(t && t !== 'none') return t;
  }
  return normalizeTier(fallback || 'none');
}
function scoreUserRowForKeep(row){
  const r = row || {};
  let score = 0;
  if(clean(r.discord_id) && cleanId(r.discord_id) === canonicalDiscordIdFromRow(r)) score += 100;
  if(clean(r.nickname)) score += 20;
  if(clean(r.pubg_id)) score += 15;
  if(clean(r.role) && normalizeRole(r.role) !== 'user') score += 10;
  if(Number(r.prime || r.points || 0) > 0) score += 5;
  score += Math.min(4, Number(r.warnings || 0) || 0);
  return score;
}
async function cleanupDuplicateUsersByDiscordId(limit=2000){
  const { json } = await supabaseFetch(`users?select=*&order=updated_at.desc.nullslast&limit=${Math.max(100, Math.min(5000, Number(limit)||2000))}`);
  let rows = Array.isArray(json) ? json : [];
  let mergedCount = 0, normalizedCount = 0;

  async function mergeGroup(list, reason){
    list = (Array.isArray(list)?list:[]).filter(Boolean);
    if(list.length < 1) return null;
    const sorted = list.map((row, idx) => ({ row, idx, score: scoreUserRowForKeep(row), updated: Date.parse(row.updated_at || row.created_at || '') || 0 }))
      .sort((a,b)=> (b.score-a.score) || (b.updated-a.updated) || (a.idx-b.idx));
    const keep = sorted[0].row;
    const raws = list.map(r => (r.raw && typeof r.raw === 'object') ? r.raw : {});
    const latest = sorted[0].row;
    const mergedRaw = Object.assign({}, ...raws, latest.raw && typeof latest.raw === 'object' ? latest.raw : {});
    const did = canonicalDiscordIdFromRow(keep) || list.map(canonicalDiscordIdFromRow).find(Boolean) || '';
    const pubgOriginal = clean(registeredPubgFromRaw(mergedRaw) || keep.pubg_id || latest.pubg_id || mergedRaw.pubgId || mergedRaw.pubg_id || mergedRaw.gameId || '');
    const nicknameOriginal = cleanNickname(registeredNicknameFromRaw(mergedRaw) || keep.nickname || latest.nickname || mergedRaw.nickname || mergedRaw.nick || mergedRaw.name || '');
    if(did){
      mergedRaw.discordId = did;
      mergedRaw.discord_id = did;
      mergedRaw.uid = `discord-${did}`;
      mergedRaw.id = `discord-${did}`;
      mergedRaw.userId = `discord-${did}`;
    }
    const role = highestRoleFromRows(list);
    const tier = bestTierFromRows(sorted.map(x=>x.row), latest.tier || keep.tier || mergedRaw.memberTier || mergedRaw.gradeRole || mergedRaw.tier || 'none');
    Object.assign(mergedRaw, {
      nickname: nicknameOriginal || mergedRaw.nickname || mergedRaw.nick || mergedRaw.name || '',
      nick: nicknameOriginal || mergedRaw.nick || mergedRaw.nickname || mergedRaw.name || '',
      name: nicknameOriginal || mergedRaw.name || mergedRaw.nickname || mergedRaw.nick || '',
      pubgId: pubgOriginal || mergedRaw.pubgId || mergedRaw.pubg_id || mergedRaw.gameId || '',
      gameId: pubgOriginal || mergedRaw.gameId || mergedRaw.pubgId || mergedRaw.pubg_id || '',
      role,
      memberRole: role,
      userRole: role,
      authRole: role,
      adminRole: role === 'admin' ? '관리자' : (role === 'operator' ? '운영자' : (role === 'prisoner' ? '수감자' : '일반')),
      memberRoleName: role === 'admin' ? '관리자' : (role === 'operator' ? '운영자' : (role === 'prisoner' ? '수감자' : '일반')),
      tier: tier === 'none' ? '없음' : tier,
      memberTier: tier,
      gradeRole: tier,
      tierRole: tier,
      duplicateCleanupReason: reason || 'identity',
      duplicateCleanupAt: new Date().toISOString()
    });
    const body = {
      discord_id: did || cleanId(keep.discord_id || ''),
      discord_username: clean(latest.discord_username || keep.discord_username || mergedRaw.discordUsername || mergedRaw.discord_username || ''),
      nickname: nicknameOriginal,
      pubg_id: pubgOriginal,
      tier,
      role,
      prime: Math.max(...list.map(r => Number(r.prime ?? r.points ?? ((r.raw&&r.raw.prime) || 0)) || 0), 0),
      warnings: Math.max(...list.map(r => Number(r.warnings ?? ((r.raw&&r.raw.warnings) || 0)) || 0), 0),
      raw: mergedRaw,
      updated_at: new Date().toISOString()
    };
    const keepId = clean(keep.id);
    const deleteIds = list.map(r => clean(r.id)).filter(id => id && id !== keepId);
    if(deleteIds.length){
      await supabaseFetch(`users?id=in.(${deleteIds.map(encodeURIComponent).join(',')})`, { method:'DELETE', headers:{Prefer:'return=minimal'} }).catch(()=>{});
      mergedCount += deleteIds.length;
    }
    if(keepId){
      await supabaseFetch(`users?id=eq.${encodeURIComponent(keepId)}`, { method:'PATCH', headers:{Prefer:'return=minimal'}, body: JSON.stringify(body) }).catch(()=>{});
      normalizedCount += 1;
    }
    return keepId;
  }

  async function runPass(kind){
    const groups = new Map();
    rows.forEach(row => {
      let key = '';
      if(kind === 'discord'){
        const did = canonicalDiscordIdFromRow(row);
        if(!did) return;
        key = `discord:${did}`;
      } else if(kind === 'pubg'){
        const pubg = canonicalPubgIdFromRow(row);
        if(!pubg) return;
        key = `pubg:${pubg}`;
      } else if(kind === 'nicknamePubg'){
        const nick = canonicalNicknameFromRow(row);
        const pubg = canonicalPubgIdFromRow(row);
        if(!nick || !pubg) return;
        key = `nickpubg:${nick}|${pubg}`;
      }
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    for (const [key, list] of groups.entries()) {
      const needsNormalize = kind === 'discord' && list.some(r => {
        const did = canonicalDiscordIdFromRow(r);
        return did && (cleanId(r.discord_id) !== did || clean(r.discord_id) !== did);
      });
      if(list.length < 2 && !needsNormalize) continue;
      await mergeGroup(list, key);
    }
  }

  // 같은 Discord 계정 중복 row만 병합한다.
  // PUBG ID/닉네임은 여러 사람이 같거나 잘못 입력할 수 있어서 병합 기준으로 쓰면
  // 가람/주희처럼 서로 다른 Discord 계정이 한 row로 섞인다.
  await runPass('discord');

  return { mergedCount, normalizedCount };
}

async function canonicalizeDuplicateDiscordRows(discordId, keepBody){
  const did = cleanId(discordId);
  if(!did) return null;
  const rows = await findUserRowsByDiscordId(did);
  if(!rows.length) return null;
  const scored = rows.map((row, idx) => {
    const exact = cleanId(row.discord_id) === did ? 100 : 0;
    const hasDbId = clean(row.id) ? 10 : 0;
    const updated = Date.parse(row.updated_at || row.created_at || '') || 0;
    return { row, idx, score: exact + hasDbId, updated };
  }).sort((a,b)=> (b.score-a.score) || (b.updated-a.updated) || (a.idx-b.idx));
  const keep = scored[0].row;
  const mergedRaw = Object.assign({}, ...(rows.map(r => (r.raw && typeof r.raw === 'object') ? r.raw : {})), keep.raw && typeof keep.raw === 'object' ? keep.raw : {}, keepBody.raw || {});
  const merged = Object.assign({}, keepBody, {
    discord_id: did,
    discord_username: keepBody.discord_username || keep.discord_username || '',
    nickname: keepBody.nickname || keep.nickname || '',
    pubg_id: keepBody.pubg_id || keep.pubg_id || '',
    tier: keepBody.tier || keep.tier || 'none',
    role: keepBody.role || keep.role || 'user',
    prime: Number(keepBody.prime ?? keep.prime ?? keep.points ?? 0) || 0,
    warnings: Number(keepBody.warnings ?? keep.warnings ?? 0) || 0,
    raw: mergedRaw,
    updated_at: new Date().toISOString()
  });
  let saved = null;
  if(clean(keep.id)){
    const { json } = await supabaseFetch(`users?id=eq.${encodeURIComponent(clean(keep.id))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(merged)
    });
    saved = Array.isArray(json) && json[0] ? json[0] : Object.assign({}, keep, merged);
  }
  const deleteIds = rows.map(r => clean(r.id)).filter(id => id && id !== clean(keep.id));
  if(deleteIds.length){
    await supabaseFetch(`users?id=in.(${deleteIds.map(encodeURIComponent).join(',')})`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }).catch(()=>{});
  }
  return saved || Object.assign({}, keep, merged);
}
function rowToUser(r){
  r = r || {};
  const raw = r.raw && typeof r.raw === 'object' ? r.raw : {};
  // Supabase row columns are canonical. raw is kept for history only and must not override
  // current nickname/tier/role/banned values coming from the users table.
  const rowNick = cleanNickname(r.nickname || '');
  const rowPubg = clean(r.pubg_id || '');
  const rowTier = normalizeTier(r.tier);
  const rowRole = normalizeRole(r.role || r.member_role || (r.is_admin ? 'admin' : raw.role));
  const normalized = normalizeUser({
    ...raw,
    discordId: r.discord_id,
    discord_id: r.discord_id,
    discordUsername: r.discord_username,
    discord_username: r.discord_username,
    nickname: rowNick || raw.nickname,
    nick: rowNick || raw.nick,
    name: rowNick || raw.name,
    displayName: rowNick || raw.displayName,
    _supabaseNickname: rowNick,
    supabaseNickname: rowNick,
    pubgId: rowPubg || raw.pubgId,
    pubg_id: rowPubg || raw.pubg_id,
    memberTier: rowTier,
    gradeRole: rowTier,
    tierRole: rowTier,
    baseRole: rowTier,
    tier: rowTier,
    prime: r.prime ?? r.points,
    points: r.points ?? r.prime,
    warnings: r.warnings,
    jailed: r.jailed,
    banned: r.banned,
    role: rowRole,
    memberRole: rowRole,
    userRole: rowRole,
    authRole: rowRole,
    created_at: r.created_at,
    updated_at: r.updated_at,
    raw
  });
  if(rowNick){
    normalized.nickname = rowNick;
    normalized.nick = rowNick;
    normalized.name = rowNick;
    normalized.displayName = rowNick;
    normalized._supabaseNickname = rowNick;
    normalized.supabaseNickname = rowNick;
  }
  if(rowPubg){ normalized.pubgId = rowPubg; normalized.gameId = rowPubg; normalized.pubgName = rowPubg; normalized.ref = rowPubg; }
  normalized.role = rowRole; normalized.memberRole = rowRole; normalized.userRole = rowRole; normalized.authRole = rowRole;
  normalized.memberTier = rowTier; normalized.gradeRole = rowTier; normalized.tierRole = rowTier; normalized.baseRole = rowTier;
  normalized.tier = rowTier === 'none' ? '없음' : rowTier;
  normalized.banned = r.banned === true || r.banned === 'true' || raw.banned === true || raw.isBanned === true;
  return normalized;
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
  // Read APIs must be read-only and fast.
  // Duplicate cleanup / Discord re-sync must never run during admin/tier list loading,
  // because it can make admin slow and can re-merge old raw nickname/tier values.
  if(options.cleanup === true){
    try{ await cleanupDuplicateUsersByDiscordId(2000); }catch(e){}
  }
  const limit = Math.max(1, Math.min(100, Number(options.limit || 20)));
  const offset = Math.max(0, Number(options.offset || 0));
  const q = clean(options.q || '');
  const discordId = cleanId(options.discordId || options.discord_id || '');
  const tierOnly = !!options.tierOnly;

  if(discordId){
    const rows = await findUserRowsByDiscordId(discordId);
    const rawUsers = (Array.isArray(rows) ? rows : []).map(rowToUser).filter(u => !!u.discordId);
    const seenDiscord = new Set();
    const users = [];
    for (const u of rawUsers) {
      const did = cleanId(u.discordId || u.discord_id);
      if (!did || seenDiscord.has(did)) continue;
      seenDiscord.add(did);
      users.push(u);
    }
    return { users, count: users.length, limit, offset, q, discordId };
  }

  // 티어표 전용 요청은 화면에 필요한 컬럼만 가져오고 count=exact를 쓰지 않는다.
  // count=exact + select=* 는 유저가 늘수록 티어표 유저칸 표시를 늦춘다.
  const select = tierOnly
    ? 'discord_id,discord_username,nickname,pubg_id,tier,role,banned,raw,created_at,updated_at'
    : '*';
  let path = `users?select=${select}&discord_id=not.is.null&discord_id=neq.&order=nickname.asc.nullslast&offset=${offset}&limit=${limit}`;
  if(tierOnly){
    path += `&tier=not.is.null&tier=neq.%EC%97%86%EC%9D%8C&tier=neq.none`;
  }
  if(q){
    const term = encodeURIComponent(`*${escapeLike(q)}*`);
    path += `&or=(nickname.ilike.${term},pubg_id.ilike.${term},discord_id.ilike.${term},discord_username.ilike.${term},role.ilike.${term},tier.ilike.${term})`;
  }

  // Admin user list must paginate ACTIVE users, not raw Supabase rows.
  // After permanent-ban support was added, banned rows were filtered only AFTER offset/limit.
  // Example: API fetched 20 raw rows, 2 were banned, browser received 18 and decided there was no next page.
  // For normal admin requests, read a safe raw window, filter banned rows, then apply the requested visible offset/limit.
  let json = [];
  let headers = new Headers();
  let count = NaN;
  if(!tierOnly){
    let allPath = `users?select=${select}&discord_id=not.is.null&discord_id=neq.&order=nickname.asc.nullslast&limit=5000`;
    if(q){
      const term = encodeURIComponent(`*${escapeLike(q)}*`);
      allPath += `&or=(nickname.ilike.${term},pubg_id.ilike.${term},discord_id.ilike.${term},discord_username.ilike.${term},role.ilike.${term},tier.ilike.${term})`;
    }
    const result = await supabaseFetch(allPath);
    json = Array.isArray(result.json) ? result.json : [];
  }else{
    const result = await supabaseFetch(path);
    json = Array.isArray(result.json) ? result.json : [];
    headers = result.headers;
    const range = headers.get('content-range') || '';
    count = Number((range.split('/')[1] || '').replace('*',''));
    if(!Number.isFinite(count)){
      const pageLength = json.length;
      count = offset + pageLength + (pageLength >= limit ? 1 : 0);
    }
  }

  const rawUsers = json
    .map(rowToUser)
    .filter(u => !!u.discordId)
    .filter(u => !(u.banned === true || String(u.banned).toLowerCase() === 'true' || String(u.role || u.memberRole || '').toLowerCase() === 'banned' || String(u.raw && (u.raw.banned || u.raw.isBanned) || '').toLowerCase() === 'true'));
  // Supabase users is the only source, but the API also normalizes the page result once here.
  // This prevents the client pages from each doing their own cache/nickname merge and creating duplicate visible users.
  const seenDiscord = new Set();
  const normalized = [];
  for (const u of rawUsers) {
    const did = cleanId(u.discordId || u.discord_id);
    if (!did || seenDiscord.has(did)) continue;
    // 화면 노출/병합은 오직 discord_id 기준. 닉네임 이모지 정리 후에도 다른 유저와 섞이지 않게 nickname 기준 dedupe 금지.
    seenDiscord.add(did);
    normalized.push(u);
  }
  const users = tierOnly ? normalized : normalized.slice(offset, offset + limit);
  if(!tierOnly) count = normalized.length;
  return { users, count: Number.isFinite(count) ? count : normalized.length, limit, offset, q };
}
async function writeUserDoc(user, forceAdmin=false){
  let input = (user && typeof user === 'object') ? user : {};
  try{ input = {...input, ...(await discordRolePatchForUser(input))}; }catch(_e){}
  const u = normalizeUser(forceAdmin ? {...input, role:'admin', memberRole:'admin', is_admin:true} : input);
  const discordId = explicitDiscordId(u);
  if(!discordId) throw new Error('discord_id가 없어 저장할 수 없습니다.');

  // PKL 운영 필드 보호:
  // 로그인/회원가입/일반 동기화 저장은 기존 Supabase users 운영값(role/tier/prime/warnings)을 덮어쓰면 안 된다.
  // 기존 회원 권한 변경은 updateUserWithLog / 관리자 PATCH 흐름에서만 처리한다.
  let existingRow = null;
  try{
    const rows = await findUserRowsByDiscordId(discordId);
    existingRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
  }catch(e){ existingRow = null; }

  const existingRaw = existingRow && existingRow.raw && typeof existingRow.raw === 'object' ? existingRow.raw : {};
  const existingUser = existingRow ? rowToUser(existingRow) : null;
  const incomingTier = normalizeTier(u.memberTier != null ? u.memberTier : (u.gradeRole != null ? u.gradeRole : (u.tierRole != null ? u.tierRole : (u.tier != null ? u.tier : 'none'))));
  const existingTier = existingRow ? normalizeTier(existingRow.tier != null ? existingRow.tier : existingUser?.tier) : 'none';
  const keepExistingTier = !!(existingRow && existingTier !== 'none' && incomingTier === 'none');
  const tier = keepExistingTier ? existingTier : incomingTier;
  const envAdmin = configuredAdminDiscordIds().includes(discordId);
  const incomingRole = normalizeRole(u.memberRole || u.role || (u.is_admin ? 'admin' : 'user'));
  const existingRole = existingRow ? normalizeRole(existingRow.role || existingUser?.role || existingUser?.memberRole) : 'user';
  const role = forceAdmin || envAdmin ? 'admin' : (existingRow ? (incomingRole === 'admin' || incomingRole === 'operator' ? incomingRole : existingRole) : incomingRole);
  const prime = existingRow ? (Number(existingRow.prime ?? existingRow.points ?? existingUser?.prime ?? 0) || 0) : (Number(u.prime ?? u.points ?? u.dia ?? u.chicken ?? 0) || 0);
  const warnings = existingRow ? (Number(existingRow.warnings ?? existingUser?.warnings ?? 0) || 0) : (Number(u.warnings ?? 0) || 0);
  const raw = {
    ...existingRaw,
    ...u,
    role,
    memberRole: role,
    userRole: role,
    authRole: role,
    adminRole: role === 'admin' ? '관리자' : (role === 'operator' ? '운영자' : (role === 'prisoner' ? '수감자' : '일반')),
    memberRoleName: role === 'admin' ? '관리자' : (role === 'operator' ? '운영자' : (role === 'prisoner' ? '수감자' : '일반')),
    isAdmin: role === 'admin',
    admin: role === 'admin',
    manager: role === 'admin' || role === 'operator',
    operator: role === 'operator',
    tier: tier === 'none' ? '없음' : tier,
    memberTier: tier,
    gradeRole: tier,
    tierRole: tier,
    prime,
    points: prime,
    dia: prime,
    chicken: prime,
    warnings
  };
  const incomingServerNickname = discordServerNickname(u.discordGuildNick || u.guildNick || u.serverNick || u.discordServerNickname || raw.discordGuildNick || raw.guildNick || raw.serverNick || raw.discordServerNickname || '');
  const incomingPklNickname = cleanNickname(u.registeredNickname || u.pklNickname || u.pkl_nickname || u.signupNickname || u.signup_nickname || u.nickname || u.nick || u.name || '');
  const incomingPubg = clean(u.pubgId || u.gameId || u.ref);
  const savedNickname = cleanNickname(existingRow && (registeredNicknameFromRaw(existingRaw) || existingRow.nickname || existingUser?.nickname));
  const savedPubg = clean(existingRow && (registeredPubgFromRaw(existingRaw) || existingRow.pubg_id || existingUser?.pubgId));
  // 서버 프로필 닉네임이 실제로 확인되면 항상 최신 서버닉으로 갱신한다.
  // 서버닉이 없을 때만 기존 PKL 가입 닉네임/관리자가 저장한 닉네임을 보존한다.
  const finalNickname = incomingServerNickname || (existingRow ? (savedNickname || incomingPklNickname) : incomingPklNickname);
  const finalPubg = existingRow ? (savedPubg || incomingPubg) : incomingPubg;
  if(incomingServerNickname){
    raw.discordServerNickname = incomingServerNickname;
    raw.nickname = incomingServerNickname;
    raw.nick = incomingServerNickname;
    raw.name = incomingServerNickname;
    raw.displayName = incomingServerNickname;
  }
  raw.registeredNickname = raw.registeredNickname || (incomingPklNickname || finalNickname);
  raw.pklNickname = raw.pklNickname || (incomingPklNickname || finalNickname);
  raw.registeredPubgId = raw.registeredPubgId || finalPubg;
  raw.pklPubgId = raw.pklPubgId || finalPubg;

  const body = {
    discord_id: discordId,
    discord_username: clean(u.discordGlobalName || u.global_name || u.displayName || u.discordUsername || u.discord_username || u.username || u.nickname),
    nickname: finalNickname,
    pubg_id: finalPubg,
    tier,
    prime,
    warnings,
    role,
    raw,
    updated_at: new Date().toISOString()
  };

  async function upsert(obj){
    const canonicalRow = await canonicalizeDuplicateDiscordRows(discordId, obj);
    if(canonicalRow) return rowToUser(canonicalRow);
    const { json } = await supabaseFetch('users?on_conflict=discord_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(obj)
    });
    return Array.isArray(json) && json[0] ? rowToUser(json[0]) : normalizeUser({...u, role, tier, prime, warnings});
  }
  return await upsert(body);
}

function hasExplicitAccessRoleInput(src={}){
  if(!src || typeof src !== 'object') return false;
  return ['memberRole','role','userRole','authRole','adminRole','member_role'].some(k => Object.prototype.hasOwnProperty.call(src,k) && clean(src[k]) !== '');
}
function clientRowFromUser(src={}){
  const did = explicitDiscordId(src || {});
  if(!did) return null;
  const raw = src.raw && typeof src.raw === 'object' ? {...src.raw, ...src} : {...src};
  return {
    id: clean(src.supabase_id || src.row_id || src.db_id || ''),
    discord_id: did,
    discord_username: clean(src.discordGlobalName || src.global_name || src.displayName || src.discordUsername || src.discord_username || raw.discordGlobalName || raw.global_name || raw.displayName || raw.discordUsername || raw.discord_username || src.username || ''),
    nickname: clean(src.nickname || src.nick || src.name || raw.nickname || raw.nick || raw.name),
    pubg_id: clean(src.pubgId || src.pubg_id || src.gameId || src.ref || raw.pubgId || raw.pubg_id || raw.gameId || raw.ref),
    tier: normalizeTier(src.memberTier != null ? src.memberTier : (src.gradeRole != null ? src.gradeRole : (src.tierRole != null ? src.tierRole : (src.tier != null ? src.tier : raw.tier)))),
    role: normalizeRole(src.memberRole || src.role || src.userRole || raw.memberRole || raw.role || (src.is_admin ? 'admin' : 'user')),
    prime: Number(src.prime ?? src.points ?? src.dia ?? src.chicken ?? raw.prime ?? raw.points ?? raw.dia ?? raw.chicken ?? 0) || 0,
    points: Number(src.points ?? src.prime ?? src.dia ?? src.chicken ?? raw.points ?? raw.prime ?? 0) || 0,
    warnings: Number(src.warnings ?? raw.warnings ?? 0) || 0,
    raw
  };
}
function hasClientSnapshot(src={}){
  if(!explicitDiscordId(src || {})) return false;
  return !!(src.nickname || src.nick || src.name || src.pubgId || src.pubg_id || src.gameId || src.raw || src.prime != null || src.points != null || src.warnings != null);
}
function patchPathForRow(row){
  if(row && clean(row.id) && !/^discord-/i.test(clean(row.id))) return `users?id=eq.${encodeURIComponent(clean(row.id))}`;
  const did = cleanId(row && row.discord_id);
  if(!did) throw new Error('discord_id가 없어 수정할 수 없습니다.');
  return `users?discord_id=eq.${encodeURIComponent(did)}`;
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
async function readBanRecords(options={}){
  const limit = Math.max(1, Math.min(500, Number(options.limit || 200)));
  const seen = new Set();
  const out = [];
  function pushRecord(r, fallback={}){
    r = r || {};
    const raw = r.raw && typeof r.raw === 'object' ? r.raw : (fallback.raw && typeof fallback.raw === 'object' ? fallback.raw : {});
    const did = clean(r.discord_id || fallback.discord_id || fallback.discordId || '');
    const pubg = clean(r.pubg_id || fallback.pubg_id || fallback.pubgId || raw.pubg_id || raw.pubgId || '');
    const nick = cleanNickname(r.nickname || fallback.nickname || raw.nickname || raw.nick || raw.name || '');
    const key = did ? `did:${cleanId(did)}` : (pubg ? `pubg:${pubg.toLowerCase()}` : `nick:${nick.toLowerCase()}`);
    if(!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      id: clean(r.id || fallback.id || ''),
      discordId: did,
      discord_id: did,
      nickname: nick,
      pubgId: pubg,
      pubg_id: pubg,
      reason: clean(r.reason || raw.banReason || raw.reason || '영구추방'),
      admin: clean(r.actor || raw.admin || raw.banActor || 'ADMIN'),
      actor: clean(r.actor || raw.admin || raw.banActor || 'ADMIN'),
      date: r.created_at || raw.banDate || raw.date || fallback.updated_at || fallback.created_at || '',
      created_at: r.created_at || raw.banDate || fallback.updated_at || fallback.created_at || '',
      permanent: true,
      raw: raw && Object.keys(raw).length ? raw : (r.raw || r)
    });
  }

  try{
    const { json } = await supabaseFetch(`ban_records?select=*&order=created_at.desc.nullslast&limit=${limit}`);
    (Array.isArray(json) ? json : []).forEach(r => pushRecord(r));
  }catch(e){}

  // Safety net: if a past ban failed to keep ban_records but users.banned=true / role=banned remains,
  // admin's ban tab should still show that banned user instead of losing the record.
  try{
    const { json: bannedRows } = await supabaseFetch(`users?select=*&or=(banned.eq.true,role.eq.banned)&order=updated_at.desc.nullslast&limit=${limit}`);
    (Array.isArray(bannedRows) ? bannedRows : []).forEach(row => {
      const u = rowToUser(row);
      pushRecord({
        id: row.id || '',
        discord_id: row.discord_id || u.discordId || '',
        nickname: row.nickname || u.nickname || '',
        pubg_id: row.pubg_id || u.pubgId || '',
        reason: (row.raw && (row.raw.banReason || row.raw.reason)) || '영구추방',
        actor: (row.raw && (row.raw.banActor || row.raw.admin)) || 'ADMIN',
        created_at: (row.raw && row.raw.banDate) || row.updated_at || row.created_at || '',
        raw: row.raw || {}
      }, row);
    });
  }catch(e){}
  return out.slice(0, limit);
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
  const row = hasClientSnapshot(identity) ? clientRowFromUser(identity) : await readUserRowByIdentity(identity);
  const current = Number(row.prime ?? row.points ?? (row.raw && (row.raw.prime ?? row.raw.points ?? row.raw.dia ?? row.raw.chicken)) ?? 0) || 0;
  const next = Math.max(0, current + delta);
  const raw = row.raw && typeof row.raw === 'object' ? {...row.raw} : {};
  const now = new Date().toISOString();
  const action = delta > 0 ? 'prime_grant' : 'prime_seize';
  const title = delta > 0 ? '프라임 지급' : '프라임 압수';
  const abs = Math.abs(delta);
  const mailText = `PKL 운영진으로부터 ${abs} 프라임이 ${delta > 0 ? '지급' : '압수'}되었습니다.${reason ? '\n\n사유: ' + reason : ''}`;
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
  raw.mailbox.unshift({ id:'prime-mail-'+Date.now()+'-'+Math.random().toString(16).slice(2), type:'prime', title, message: mailText, body: mailText, amount: delta, before: current, after: next, reason: clean(reason), actor: clean(actor || 'SYSTEM'), admin: clean(actor || 'PKL 운영진'), created_at: now, date: now, read:false, isRead:false });
  const body = { prime: next, raw, updated_at: now };
  async function patchUser(obj){
    // 운영 버튼 체감속도 개선: 저장 본문은 이미 확정되어 있으므로 Supabase representation 반환을 기다리지 않는다.
    await supabaseFetch(patchPathForRow(row), {
      method:'PATCH',
      headers:{ Prefer:'return=minimal' },
      body:JSON.stringify(obj)
    });
    return {...row, ...obj};
  }
  const savedRow = await patchUser(body);
  // 로그/포인트 기록은 화면 응답을 막지 않도록 비동기로 남긴다. 실패해도 users 저장은 유지된다.
  Promise.resolve().then(()=>insertPointLogSafe({ user_id: row.id, discord_id: row.discord_id || null, amount: delta, reason: clean(reason), actor: clean(actor || 'SYSTEM') })).catch(()=>{});
  Promise.resolve().then(()=>insertAdminLogSafe({ action, actor: clean(actor || 'SYSTEM'), target: row.nickname || row.pubg_id || row.discord_id || '', detail: { amount: delta, before: current, after: next, reason: clean(reason), mail: mailText, discord_id: row.discord_id || '', pubg_id: row.pubg_id || '' } })).catch(()=>{});
  return { user: rowToUser(savedRow), before: current, after: next, amount: delta, mail: mailText };
}


async function updateUserWithLog(identity={}, log={}, originalIdentity={}, beforeSnapshot={}){
  const sourceBefore = hasClientSnapshot(beforeSnapshot) ? beforeSnapshot : (hasClientSnapshot(originalIdentity) ? originalIdentity : null);
  const row = sourceBefore ? clientRowFromUser(sourceBefore) : await readUserRowByIdentity(originalIdentity && explicitDiscordId(originalIdentity) ? originalIdentity : identity);
  const beforeUser = rowToUser(row);
  const explicitAccessRoleChange = hasExplicitAccessRoleInput(identity || {}) && !/^tier_change$/i.test(clean(log.type || log.action));
  const nextInput = normalizeUser({...beforeUser, ...(identity || {})});
  const manualNickname = cleanNickname(identity && (identity.nickname || identity.nick || identity.name));
  const manualPubgId = clean(identity && (identity.pubgId || identity.pubg_id || identity.gameId || identity.ref));
  // 관리홈에서 직접 수정한 닉네임/PUBG ID는 raw.registeredNickname 우선순위 때문에
  // normalizeUser() 안에서 예전 값으로 되돌아가지 않게 여기서 다시 고정한다.
  if(manualNickname){ nextInput.nickname = manualNickname; nextInput.nick = manualNickname; nextInput.name = manualNickname; nextInput.displayName = manualNickname; }
  if(manualPubgId){ nextInput.pubgId = manualPubgId; nextInput.gameId = manualPubgId; nextInput.pubgName = manualPubgId; nextInput.ref = manualPubgId; }
  if(!explicitAccessRoleChange){
    const keepRole = normalizeRole(row.role || beforeUser.role || beforeUser.memberRole);
    nextInput.role = keepRole;
    nextInput.memberRole = keepRole;
    nextInput.userRole = keepRole;
    nextInput.authRole = keepRole;
    nextInput.adminRole = keepRole === 'admin' ? '관리자' : (keepRole === 'operator' ? '운영자' : (keepRole === 'prisoner' ? '수감자' : '일반'));
    nextInput.memberRoleName = nextInput.adminRole;
  }
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
  const mergedRaw = {
    ...raw,
    ...nextInput,
    history:Array.isArray(nextInput.history)?nextInput.history:(Array.isArray(raw.history)?raw.history:[]),
    memoList:Array.isArray(nextInput.memoList)?nextInput.memoList:(Array.isArray(raw.memoList)?raw.memoList:[]),
    mailbox:Array.isArray(nextInput.mailbox)?nextInput.mailbox:(Array.isArray(raw.mailbox)?raw.mailbox:[])
  };
  if(manualNickname){
    mergedRaw.nickname = manualNickname;
    mergedRaw.nick = manualNickname;
    mergedRaw.name = manualNickname;
    mergedRaw.displayName = manualNickname;
    mergedRaw.registeredNickname = manualNickname;
    mergedRaw.pklNickname = manualNickname;
  }
  if(manualPubgId){
    mergedRaw.pubgId = manualPubgId;
    mergedRaw.gameId = manualPubgId;
    mergedRaw.pubgName = manualPubgId;
    mergedRaw.ref = manualPubgId;
    mergedRaw.registeredPubgId = manualPubgId;
    mergedRaw.pklPubgId = manualPubgId;
  }
  if(!explicitAccessRoleChange){
    const keepRole = normalizeRole(row.role || beforeUser.role || beforeUser.memberRole);
    mergedRaw.role = keepRole;
    mergedRaw.memberRole = keepRole;
    mergedRaw.userRole = keepRole;
    mergedRaw.authRole = keepRole;
    mergedRaw.adminRole = keepRole === 'admin' ? '관리자' : (keepRole === 'operator' ? '운영자' : (keepRole === 'prisoner' ? '수감자' : '일반'));
    mergedRaw.memberRoleName = mergedRaw.adminRole;
  }
  mergedRaw.history.unshift({type:action, reason, date:now, admin:actor, changes});
  const body = {
    discord_id: row.discord_id,
    discord_username: clean(nextInput.discordUsername || row.discord_username),
    nickname: clean(nextInput.nickname || row.nickname),
    pubg_id: clean(nextInput.pubgId || row.pubg_id),
    tier: normalizeTier(nextInput.memberTier != null ? nextInput.memberTier : (nextInput.gradeRole != null ? nextInput.gradeRole : (nextInput.tierRole != null ? nextInput.tierRole : (nextInput.tier != null ? nextInput.tier : (row.tier || 'none'))))),
    role: explicitAccessRoleChange ? normalizeRole(nextInput.memberRole || nextInput.role || row.role || 'user') : normalizeRole(row.role || beforeUser.role || beforeUser.memberRole),
    prime: Number(nextInput.prime ?? nextInput.points ?? row.prime ?? 0) || 0,
    warnings: Number(nextInput.warnings ?? row.warnings ?? 0) || 0,
    raw: mergedRaw,
    updated_at: now
  };
  async function patch(obj){
    // 회원 수정/티어 변경 체감속도 개선: 변경값을 기준으로 즉시 응답하고 representation 재수신을 생략한다.
    await supabaseFetch(patchPathForRow(row), {method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(obj)});
    return {...row, ...obj};
  }
  const saved = await patch(body);
  Promise.resolve().then(()=>insertAdminLogSafe({action, actor, target: body.nickname || body.pubg_id || row.discord_id || '', detail:{reason, changes, discord_id: row.discord_id, before: beforeUser, after: rowToUser(saved)}})).catch(()=>{});
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


async function syncDiscordProfile(user){
  const did = explicitDiscordId(user || {});
  if(!did) return null;
  const display = clean(user.discordGlobalName || user.global_name || user.displayName || user.globalName || user.nick || user.name || user.nickname || user.discordUsername || user.discord_username || user.username || '');
  const username = clean(user.discordUsername || user.discord_username || user.username || '');
  if(!display && !username) return null;
  const rows = await findUserRowsByDiscordId(did);
  if(!rows.length) return null;
  const keep = rows[0];
  const raw = keep.raw && typeof keep.raw === 'object' ? {...keep.raw} : {};
  raw.discordId = did;
  raw.discord_id = did;
  raw.discordUsername = username || raw.discordUsername || raw.discord_username || '';
  raw.discord_username = username || raw.discord_username || raw.discordUsername || '';
  raw.discordGlobalName = display || raw.discordGlobalName || raw.global_name || '';
  raw.global_name = display || raw.global_name || raw.discordGlobalName || '';
  raw.discordDisplayName = display || raw.discordDisplayName || '';
  raw.lastDiscordProfileSyncAt = new Date().toISOString();
  const body = {
    discord_username: display || username || keep.discord_username || '',
    raw,
    updated_at: raw.lastDiscordProfileSyncAt
  };
  const { json } = await supabaseFetch(`users?id=eq.${encodeURIComponent(keep.id)}`, {method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(body)});
  return Array.isArray(json) && json[0] ? rowToUser(json[0]) : rowToUser(Object.assign({}, keep, body));
}

async function updateUserTier(identity={}, tierValue='', actor='TIER'){
  const discordId = explicitDiscordId(identity || {});
  if(!discordId) throw new Error('Discord ID가 없는 회원은 티어를 변경할 수 없습니다.');
  const row = await readUserRowByIdentity({ discordId });
  const nextTier = normalizeTier(tierValue || identity.memberTier || identity.gradeRole || identity.tierRole || identity.tier);
  if(!nextTier || nextTier === 'none') throw new Error('변경할 티어 값이 없습니다.');
  const raw = row.raw && typeof row.raw === 'object' ? {...row.raw} : {};
  const beforeTier = normalizeTier(row.tier || raw.memberTier || raw.gradeRole || raw.tierRole || raw.tier || 'none');
  raw.tier = nextTier === 'none' ? '없음' : nextTier;
  raw.memberTier = nextTier;
  raw.gradeRole = nextTier;
  raw.tierRole = nextTier;
  raw.baseRole = nextTier;
  raw.memberTierName = nextTier;
  const body = { tier: nextTier, raw, updated_at: new Date().toISOString() };
  const { json } = await supabaseFetch(`users?discord_id=eq.${encodeURIComponent(discordId)}`, {
    method:'PATCH',
    headers:{ Prefer:'return=representation' },
    body:JSON.stringify(body)
  });
  const saved = Array.isArray(json) && json[0] ? json[0] : {...row, ...body};
  Promise.resolve().then(()=>insertAdminLogSafe({
    action:'tier_change',
    actor:clean(actor || 'TIER'),
    target:row.nickname || row.pubg_id || row.discord_id || '',
    detail:{ discord_id:row.discord_id, before:beforeTier, after:nextTier, source:'tier_board' }
  })).catch(()=>{});
  return rowToUser(saved);
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
async function cleanupDiscordUser(user){
  const did = explicitDiscordId(user || {});
  if(!did) throw new Error('discord_id가 없어 정리할 수 없습니다.');
  const rows = await findUserRowsByDiscordId(did);
  if(!rows.length) return null;
  const base = rowToUser(rows[0]);
  const body = {
    discord_id: did,
    discord_username: clean(base.discordUsername || base.discord_username),
    nickname: cleanNickname(registeredNicknameFromRaw(base.raw || base) || base.nickname || base.name),
    pubg_id: clean(registeredPubgFromRaw(base.raw || base) || base.pubgId || base.gameId || base.ref),
    tier: normalizeTier(base.memberTier || base.gradeRole || base.tierRole || base.tier),
    prime: Number(base.prime || base.points || base.dia || 0) || 0,
    warnings: Number(base.warnings || 0) || 0,
    role: normalizeRole(base.memberRole || base.role),
    raw: base,
    updated_at: new Date().toISOString()
  };
  const row = await canonicalizeDuplicateDiscordRows(did, body);
  return row ? rowToUser(row) : base;
}
async function writeUsers(users){
  const list = Array.isArray(users) ? users : [];
  const saved = [];
  for (const user of list) saved.push(await writeUserDoc(user));
  return mergeUsers(saved);
}
async function readAdminState(){
  return { users: await readUsers({ limit: 100 }), pending: [], bans: await readBanRecords({ limit: 500 }), warningRecords: [] };
}

module.exports = { readBanRecords, readUserDocs, writeUserDoc, readUsers, writeUsers, readAdminState, mergeUsers, normalizeUser, adjustUserPrime, updateUserWithLog, updateUserTier, recordBan, deleteBanRecord, hasActiveBanRecord, readLegacyUsers, cleanupDiscordUser, cleanupDuplicateUsersByDiscordId, findUserRowsByDiscordId, syncDiscordProfile, syncDiscordGuildRoles, syncDiscordGuildNicknames, discordRolePatchForUser, explicitDiscordId, hasDiscordIdentity };
