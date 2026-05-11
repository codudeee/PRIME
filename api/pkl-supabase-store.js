const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.PKL_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.PKL_SUPABASE_ANON_KEY || '';
const USERS_KEY = 'pklUsers';
const STATE_KEY = 'pklAdminState_v3';
function configured(){ return !!(SUPABASE_URL && SUPABASE_KEY); }
async function sb(path, options={}){
  if(!configured()) throw new Error('Supabase 설정 없음');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json',
      Prefer:'resolution=merge-duplicates,return=representation',
      ...(options.headers||{})
    }
  });
  if(!res.ok){
    const detail = await res.text().catch(()=> '');
    throw new Error(`Supabase ${options.method||'GET'} ${path} failed ${res.status}: ${detail}`);
  }
  return await res.json().catch(()=>null);
}
function clean(v){ return String(v == null ? '' : v).trim(); }
function cleanId(v){ return clean(v).toLowerCase().replace(/^discord-/, ''); }
function strongKeys(u){ u=u||{}; return [u.discordId,u.discord_id,u.uid,u.id,u.userId,u.memberId,u.key].map(cleanId).filter(Boolean); }
function sameUser(a,b){ const ak=strongKeys(a), bk=strongKeys(b); return ak.length&&bk.length&&ak.some(v=>bk.includes(v)); }
function normalizeRole(v){
  const raw=clean(v); const low=raw.toLowerCase();
  if(['admin','owner','master','superadmin','manager'].includes(low) || ['관리자','총관리자','마스터'].includes(raw)) return 'admin';
  if(['operator','staff','moderator'].includes(low) || ['운영자','운영진','스태프'].includes(raw)) return 'operator';
  return raw || 'user';
}
function normalizeUser(raw){
  const u={...(raw||{})};
  const nick=clean(u.nickname||u.nick||u.name||u.displayName||u.discord_username||u.discordUsername||u.username);
  const pubg=clean(u.pubgId||u.pubg_id||u.pubgID||u.gameId||u.pubgName||u.ref);
  if(nick){u.nickname=nick;u.nick=nick;u.name=nick;u.displayName=nick;}
  if(pubg){u.pubgId=pubg;u.gameId=pubg;u.pubgName=pubg;u.ref=pubg;}
  const did=cleanId(u.discordId||u.discord_id||u.uid||u.userId||u.memberId||u.key||u.id);
  if(did){u.discordId=did;u.uid=`discord-${did}`;u.id=`discord-${did}`;u.userId=`discord-${did}`;u.key=`discord-${did}`;}
  const role=normalizeRole(u.memberRole||u.role||u.roleName||u.adminRole);
  u.memberRole=role; u.role=role; u.memberRoleName=role==='admin'?'관리자':(role==='operator'?'운영진':'회원');
  u.memberTier=u.memberTier||u.tier||u.gradeRole||'none'; u.tier=u.memberTier;
  u.prime=Number(u.prime ?? u.points ?? u.dia ?? u.chicken ?? 0)||0; u.points=Number(u.points ?? u.prime ?? 0)||0; u.dia=u.prime; u.chicken=u.prime;
  u.approved = u.approved !== false; u.status = u.status || 'approved';
  return u;
}
function mergeUsers(){const out=[]; for(const list of arguments){(Array.isArray(list)?list:[]).forEach(raw=>{const u=normalizeUser(raw); const i=out.findIndex(x=>sameUser(x,u)); if(i>=0) out[i]=normalizeUser({...out[i],...u}); else out.push(u);});} return out;}
function rowToUser(r){
  r=r||{};
  const role = r.role || r.member_role || (r.is_admin ? 'admin' : 'user');
  return normalizeUser({
    discordId:r.discord_id,
    discordUsername:r.discord_username,
    nickname:r.nickname,
    pubgId:r.pubg_id,
    memberTier:r.tier,
    tier:r.tier,
    prime:r.prime ?? r.points,
    points:r.points ?? r.prime,
    role,
    memberRole:role,
    raw:r.raw
  });
}
async function readUserDocs(limit=20, offset=0){
  const rows = await sb(`users?select=*&limit=${limit}&offset=${offset}&order=created_at.desc`) || [];
  return rows.map(rowToUser);
}
async function getUserCount(){
  const rows = await sb('users?select=discord_id').catch(()=>[]);
  return Array.isArray(rows) ? rows.length : 0;
}
async function writeUserDoc(user, forceAdmin=false){
  const u=normalizeUser(user);
  const role = forceAdmin ? 'admin' : normalizeRole(u.memberRole||u.role);
  const body={
    discord_id: cleanId(u.discordId||u.uid||u.id),
    discord_username: clean(u.discordUsername||u.username||u.discordGlobalName||u.displayName||u.nickname),
    nickname: clean(u.nickname||u.displayName||u.nick||u.name),
    pubg_id: clean(u.pubgId||u.gameId||u.ref),
    tier: clean(u.memberTier||u.tier||'none'),
    prime: Number(u.prime??u.points??u.dia??u.chicken??0)||0,
    points: Number(u.points??u.prime??0)||0
  };
  // users 테이블에 role/points 컬럼이 없을 수 있어 실패 시 안전하게 제외하고 재시도한다.
  const withRole={...body, role};
  async function tryWrite(obj){ return await sb('users?on_conflict=discord_id',{method:'POST',body:JSON.stringify(obj)}); }
  try{
    await tryWrite(withRole);
  }catch(e){
    const msg=String(e&&e.message||e);
    if(/points|role|schema cache|column/i.test(msg)){
      const fallback={...body};
      if(/points/i.test(msg)) delete fallback.points;
      if(/role/i.test(msg)) delete fallback.role;
      await tryWrite(fallback);
    } else throw e;
  }
  return normalizeUser({...u, role, memberRole:role, memberRoleName:role==='admin'?'관리자':'회원'});
}
async function readJsonDoc(key, fallback){ const rows=await sb(`live_scores?id=eq.${encodeURIComponent(key)}&select=payload&limit=1`).catch(()=>null); return rows&&rows[0]?rows[0].payload:fallback; }
async function writeJsonDoc(key,value){ await sb('live_scores?on_conflict=id',{method:'POST',body:JSON.stringify({id:key,payload:value,updated_at:new Date().toISOString()})}).catch(()=>null); return true; }
async function readAdminState(){return await readJsonDoc(STATE_KEY,{users:[],pending:[],bans:[],warningRecords:[]});}
async function readUsers(){const docs=await readUserDocs().catch(()=>[]); const legacy=await readJsonDoc(USERS_KEY,[]).catch(()=>[]); const st=await readAdminState().catch(()=>({users:[]})); return mergeUsers(docs,Array.isArray(legacy)?legacy:[],Array.isArray(st&&st.users)?st.users:[]);}
async function writeUsers(users){
  const cleanUsers=mergeUsers(users);
  const existingDocs=await readUserDocs().catch(()=>[]);
  const dbWasEmpty=!existingDocs.length;
  const saved=[];
  for(let i=0;i<cleanUsers.length;i++) saved.push(await writeUserDoc(cleanUsers[i], dbWasEmpty && i===0));
  const st=await readAdminState().catch(()=>({}));
  await writeJsonDoc(STATE_KEY,{...(st||{}),users:[],__pklUserStorage:'supabase_users'}).catch(()=>null);
  return saved;
}
module.exports={readUsers,writeUsers,mergeUsers,readUserDocs,writeUserDoc,readAdminState,readJsonDoc,writeJsonDoc};


module.exports.readUserDocs = readUserDocs;
module.exports.getUserCount = getUserCount;
