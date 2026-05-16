const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.PKL_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.PKL_SUPABASE_ANON_KEY || '';
function configured(){ return !!(SUPABASE_URL && SUPABASE_KEY); }
function clean(v){ return String(v == null ? '' : v).trim(); }
function safeKey(v){ return clean(v).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 180); }
function legacyRowId(key){ return 'shared:' + safeKey(key); }
function parseBody(req){ if(typeof req.body === 'string'){ try{return JSON.parse(req.body || '{}');}catch(e){return {};} } return req.body || {}; }
function json(res, status, body){ res.status(status).setHeader('Cache-Control','no-store'); return res.json(body); }
async function sb(path, options={}){
  if(!configured()) throw new Error('Supabase 설정 없음');
  const headers = Object.assign({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json' }, options.headers || {});
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({}, options, { headers }));
  const text = await r.text().catch(()=> '');
  if(!r.ok) throw new Error(`Supabase ${options.method || 'GET'} ${path} failed ${r.status}: ${text}`);
  if(!text) return null;
  try{return JSON.parse(text);}catch(e){return text;}
}

async function readCanonical(key){
  const k = safeKey(key);
  const rows = await sb(`pkl_shared_data?select=key,value,updated_at,created_at&key=eq.${encodeURIComponent(k)}&limit=1`, {method:'GET'}).catch(()=>[]);
  const row = Array.isArray(rows) ? rows[0] : null;
  if(!row) return null;
  return { key:k, value:row.value, updated_at:row.updated_at || row.created_at || null, table:'pkl_shared_data' };
}
async function readLegacy(key){
  const k = safeKey(key);
  const rows = await sb(`live_scores?id=eq.${encodeURIComponent(legacyRowId(k))}&select=id,payload,updated_at&limit=1`, { method:'GET' }).catch(()=>[]);
  const row = Array.isArray(rows) ? rows[0] : null;
  if(!row) return null;
  return { key:k, value: row.payload && Object.prototype.hasOwnProperty.call(row.payload,'value') ? row.payload.value : null, updated_at: row.updated_at || null, table:'live_scores_legacy' };
}
async function writeCanonical(key, value){
  const k = safeKey(key);
  const now = new Date().toISOString();
  const rows = await sb('pkl_shared_data?on_conflict=key', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=representation' }, body:JSON.stringify({key:k, value:value == null ? null : value, updated_at:now}) });
  const row = Array.isArray(rows) ? rows[0] : null;
  return { key:k, value, updated_at:(row && (row.updated_at || row.created_at)) || now, table:'pkl_shared_data' };
}
async function writeLegacy(key, value){
  const k = safeKey(key);
  const now = new Date().toISOString();
  return await sb('live_scores?on_conflict=id', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body:JSON.stringify({ id:legacyRowId(k), payload:{ key:k, value }, updated_at:now }) }).catch(()=>null);
}
async function readOne(key){
  const k = safeKey(key);
  if(!k) return null;
  const canonical = await readCanonical(k);
  if(canonical) return canonical;
  const legacy = await readLegacy(k);
  if(legacy){
    // 예전 /api/pkl-shared가 live_scores(shared:*)에 저장하던 값을 현재 단일 원본 pkl_shared_data로 즉시 승격한다.
    await writeCanonical(k, legacy.value).catch(()=>null);
    return legacy;
  }
  return null;
}
async function readMany(keys){
  const out = {};
  for(const k of keys){ const one = await readOne(k).catch(()=>null); if(one) out[k] = one.value; }
  return out;
}
async function writeOne(key, value){
  const saved = await writeCanonical(key, value);
  // 구버전 화면/캐시가 남아 있어도 같은 값을 보도록 레거시 shared:*도 같이 덮는다. 원본은 pkl_shared_data다.
  await writeLegacy(key, value).catch(()=>null);
  return saved;
}
async function removeOne(key){
  const k = safeKey(key);
  await sb(`pkl_shared_data?key=eq.${encodeURIComponent(k)}`, { method:'DELETE', headers:{ Prefer:'return=minimal' } }).catch(()=>null);
  await sb(`live_scores?id=eq.${encodeURIComponent(legacyRowId(k))}`, { method:'DELETE', headers:{ Prefer:'return=minimal' } }).catch(()=>null);
  return { key:k, deleted:true };
}
module.exports = async function handler(req,res){
  try{
    if(req.method === 'GET'){
      const q=req.query||{};
      if(q.keys){ const keys=String(q.keys).split(',').map(clean).filter(Boolean); return json(res,200,{ok:true, values: await readMany(keys)}); }
      const key=clean(q.key); if(!key) return json(res,400,{ok:false,message:'key가 없습니다.'});
      return json(res,200,{ok:true, item: await readOne(key)});
    }
    if(req.method === 'POST'){
      const b=parseBody(req); const key=clean(b.key); if(!key) return json(res,400,{ok:false,message:'key가 없습니다.'});
      return json(res,200,{ok:true,item: await writeOne(key, b.value)});
    }
    if(req.method === 'DELETE'){
      const key=clean((req.query||{}).key || parseBody(req).key); if(!key) return json(res,400,{ok:false,message:'key가 없습니다.'});
      return json(res,200,{ok:true,item: await removeOne(key)});
    }
    res.setHeader('Allow','GET, POST, DELETE'); return json(res,405,{ok:false,message:'Method not allowed'});
  }catch(e){ return json(res,500,{ok:false,message:e && e.message ? e.message : String(e)}); }
};
