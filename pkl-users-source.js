(function(){
  'use strict';
  if (window.PKLUsersSource && window.PKLUsersSource.__supabasePagedUsers20260512Fix) return;

  var cache = [];
  var meta = { limit: 20, offset: 0, count: 0, q: '', loading: false, loadedAt: 0, source: '' };
  var debounceTimer = null;

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function low(v){ return clean(v).toLowerCase(); }
  function id(u){ u = u || {}; return low(u.discordId || u.discord_id || u.uid || u.id || u.userId || u.memberId || u.key).replace(/^discord-/, ''); }
  function nick(u){ u = u || {}; return clean(u.nickname || u.nick || u.name || u.displayName || u.discordUsername || u.discord_username || u.username || u.discordGlobalName); }
  function pubg(u){ u = u || {}; return clean(u.pubgId || u.pubg_id || u.pubgID || u.gameId || u.pubgName || u.ref || u.pubg); }
  function role(v){
    var raw = clean(v), l = raw.toLowerCase();
    if(['admin','administrator','owner','master','superadmin','manager'].indexOf(l) >= 0 || ['관리자','총관리자','마스터','총괄'].indexOf(raw) >= 0) return 'admin';
    if(['operator','staff','moderator','mod'].indexOf(l) >= 0 || ['운영자','운영진','스태프'].indexOf(raw) >= 0) return 'operator';
    if(['prisoner','jail','banned','blocked'].indexOf(l) >= 0 || ['수감자','차단','정지'].indexOf(raw) >= 0) return 'prisoner';
    if(['guest','temp','temporary'].indexOf(l) >= 0 || ['임시','준회원'].indexOf(raw) >= 0) return 'guest';
    return raw || 'user';
  }
  function tier(v){
    if(window.PKLTierBadge && typeof window.PKLTierBadge.normalize === 'function') return window.PKLTierBadge.normalize(v);
    var raw = clean(v);
    if(!raw || raw === '없음' || raw.toLowerCase() === 'none') return 'none';
    return raw;
  }
  function tierLabel(t){ return (window.PKLTierBadge && window.PKLTierBadge.label) ? window.PKLTierBadge.label(t) : (t && t !== 'none' ? t : '없음'); }
  function roleLabel(r){ r = role(r); return r === 'admin' ? '관리자' : (r === 'operator' ? '운영자' : (r === 'prisoner' ? '수감자' : (r === 'guest' ? '임시' : '일반'))); }
  function normalize(raw){
    var src = Object.assign({}, raw && raw.raw && typeof raw.raw === 'object' ? raw.raw : {}, raw || {});
    var did = id(src), n = nick(src), p = pubg(src);
    var r = role(src.memberRole || src.member_role || src.role || src.userRole || src.authRole || src.adminRole || (src.is_admin ? 'admin' : 'user'));
    var t = tier(src.memberTier || src.gradeRole || src.tierRole || src.baseRole || src.tier || src.memberTierName || src.tierName || src.roleName);
    if(did){ src.discordId = did; src.uid = 'discord-' + did; src.id = 'discord-' + did; src.userId = 'discord-' + did; src.key = 'discord-' + did; }
    if(n){ src.nickname = n; src.nick = n; src.name = n; src.displayName = n; }
    if(p){ src.pubgId = p; src.gameId = p; src.pubgName = p; src.ref = p; }
    src.memberRole = r; src.userRole = r; src.authRole = r; src.role = r; src.adminRole = roleLabel(r); src.memberRoleName = roleLabel(r);
    src.memberTier = t; src.gradeRole = t; src.tierRole = t; src.baseRole = t; src.originalRole = t; src.memberTierName = tierLabel(t); src.tier = tierLabel(t);
    src.prime = Number(src.prime ?? src.points ?? src.dia ?? src.chicken ?? 0) || 0; src.points = src.prime; src.dia = src.prime; src.chicken = src.prime;
    src.warnings = Number(src.warnings ?? src.warn ?? 0) || 0;
    src.status = src.status || 'approved'; src.approved = src.approved !== false;
    src.join = src.join || src.joinDate || src.created_at || src.createdAt || '';
    src.last = src.last || src.lastLogin || src.updated_at || src.updatedAt || '';
    return src;
  }
  function same(a,b){
    var ai = id(a), bi = id(b); if(ai && bi) return ai === bi;
    var ap = low(pubg(a)), bp = low(pubg(b)); if(ap && bp) return ap === bp;
    var an = low(nick(a)), bn = low(nick(b)); return !!(an && bn && an === bn);
  }
  function mergeLists(){
    var out = [];
    function add(list){
      (Array.isArray(list) ? list : []).forEach(function(raw){
        if(!raw || typeof raw !== 'object') return;
        var u = normalize(raw);
        var i = out.findIndex(function(x){ return same(x,u); });
        if(i >= 0) out[i] = normalize(Object.assign({}, out[i], u)); else out.push(u);
      });
    }
    for(var i=0;i<arguments.length;i++) add(arguments[i]);
    return out;
  }
  function setStatus(text){
    var uc = document.getElementById('userCount');
    if(uc && text) uc.textContent = text;
  }
  function escapeSupabaseLike(value){ return clean(value).replace(/[%_]/g, function(m){ return '\\' + m; }); }
  function rowToUser(r){
    r = r || {};
    var raw = r.raw && typeof r.raw === 'object' ? r.raw : {};
    return normalize(Object.assign({}, raw, {
      discordId: r.discord_id || raw.discordId,
      discordUsername: r.discord_username || raw.discordUsername,
      nickname: r.nickname || raw.nickname,
      pubgId: r.pubg_id || raw.pubgId,
      memberTier: r.tier || raw.memberTier,
      tier: r.tier || raw.tier,
      prime: r.prime != null ? r.prime : raw.prime,
      points: r.points != null ? r.points : raw.points,
      warnings: r.warnings != null ? r.warnings : raw.warnings,
      role: r.role || r.member_role || raw.role || (r.is_admin ? 'admin' : 'user'),
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
  }
  function cfgValue(name){ return clean(localStorage.getItem(name) || ''); }
  async function getSupabaseConfig(){
    try{
      if(typeof window.PKLGetSupabaseConfig === 'function'){
        var c = await window.PKLGetSupabaseConfig();
        if(c && (c.url || c.supabaseUrl)) return c;
      }
    }catch(e){}
    return window.PKL_SUPABASE_CONFIG || {
      url: cfgValue('PKL_SUPABASE_URL') || cfgValue('SUPABASE_URL'),
      anonKey: cfgValue('PKL_SUPABASE_ANON_KEY') || cfgValue('SUPABASE_ANON_KEY')
    };
  }
  async function fetchViaBrowserSupabase(options){
    options = options || {};
    var cfg = await getSupabaseConfig();
    var url = clean(cfg && (cfg.url || cfg.supabaseUrl || cfg.SUPABASE_URL)).replace(/\/+$/,'');
    var key = clean(cfg && (cfg.anonKey || cfg.supabaseAnonKey || cfg.SUPABASE_ANON_KEY));
    if(!url || !key) throw new Error('Supabase 브라우저 설정 없음');
    var limit = Number(options.limit || meta.limit || 20); if(!isFinite(limit) || limit < 1) limit = 20; if(limit > 100) limit = 100;
    var offset = Number(options.offset || 0); if(!isFinite(offset) || offset < 0) offset = 0;
    var q = clean(options.q != null ? options.q : meta.q);
    var path = url + '/rest/v1/users?select=*&order=nickname.asc.nullslast&offset=' + encodeURIComponent(offset) + '&limit=' + encodeURIComponent(limit);
    if(q){
      var term = encodeURIComponent('*' + escapeSupabaseLike(q) + '*');
      path += '&or=(nickname.ilike.' + term + ',pubg_id.ilike.' + term + ',discord_id.ilike.' + term + ',discord_username.ilike.' + term + ',role.ilike.' + term + ',tier.ilike.' + term + ')';
    }
    var res = await fetch(path, { cache: 'no-store', headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json', Prefer: 'count=exact' } });
    if(!res.ok){
      var detail = await res.text().catch(function(){ return ''; });
      throw new Error('Supabase users select failed ' + res.status + ' ' + detail);
    }
    var rows = await res.json();
    var range = res.headers.get('content-range') || '';
    var count = Number((range.split('/')[1] || '').replace('*',''));
    meta.source = 'browser'; meta.limit = limit; meta.offset = offset; meta.q = q; meta.count = Number.isFinite(count) ? count : (Array.isArray(rows) ? rows.length : 0); meta.loadedAt = Date.now();
    return Array.isArray(rows) ? rows.map(rowToUser) : [];
  }
  async function fetchViaApi(options){
    options = options || {};
    var limit = Number(options.limit || meta.limit || 20); if(!isFinite(limit) || limit < 1) limit = 20; if(limit > 100) limit = 100;
    var offset = Number(options.offset || 0); if(!isFinite(offset) || offset < 0) offset = 0;
    var q = clean(options.q != null ? options.q : meta.q);
    var url = '/api/pkl-users?limit=' + encodeURIComponent(limit) + '&offset=' + encodeURIComponent(offset);
    if(q) url += '&q=' + encodeURIComponent(q);
    var res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if(!res.ok){
      var detail = await res.text().catch(function(){ return ''; });
      throw new Error('API users load failed ' + res.status + ' ' + detail);
    }
    var data = await res.json();
    meta.source = 'api'; meta.limit = limit; meta.offset = offset; meta.q = q; meta.count = Number(data.count || 0); meta.loadedAt = Date.now();
    return Array.isArray(data.users) ? data.users : [];
  }
  async function fetchPage(options){
    try { return await fetchViaApi(options); }
    catch(apiError){
      console.warn('PKL users API fallback to browser Supabase', apiError);
      return await fetchViaBrowserSupabase(options);
    }
  }
  function sortUsers(list){
    return (Array.isArray(list)?list:[]).slice().sort(function(a,b){
      return nick(a).localeCompare(nick(b), 'ko-KR', { numeric:true, sensitivity:'base' });
    });
  }
  function applyUsers(users, options){
    options = options || {};
    cache = sortUsers(options.append ? mergeLists(cache, users) : mergeLists(users));
    if(!window.state || typeof window.state !== 'object') window.state = { users: [], pending: [], bans: [], warningRecords: [] };
    window.state.users = cache.slice();
    if(typeof window.current !== 'number' || window.current < 0 || window.current >= window.state.users.length) window.current = 0;
    if(!Array.isArray(window.state.pending)) window.state.pending = [];
    if(!Array.isArray(window.state.bans)) window.state.bans = [];
    if(!Array.isArray(window.state.warningRecords)) window.state.warningRecords = [];
    try { if(typeof normalizeState === 'function') window.state = normalizeState(window.state); } catch(e) {}
    try { if(typeof window.render === 'function') window.render(); } catch(e) { console.warn('PKL render skipped', e); }
    setStatus(meta.count ? (cache.length + ' / ' + meta.count + '명') : (cache.length + '명'));
    renderScrollStatus();
    return cache.slice();
  }
  async function load(options){
    if(meta.loading) return cache.slice();
    meta.loading = true; setStatus('불러오는 중...');
    try {
      var users = await fetchPage(options || {});
      return applyUsers(users, { append: !!(options && options.append) });
    } catch(e) {
      console.warn('PKL Supabase users load failed', e);
      setStatus('불러오기 실패');
      var wrap = document.getElementById('userList');
      if(wrap && !cache.length) wrap.innerHTML = '<div class="pending-empty">Supabase 유저를 불러오지 못했습니다.<br>users SELECT 정책 또는 환경변수를 확인해주세요.</div>';
      return cache.slice();
    } finally { meta.loading = false; renderScrollStatus(); }
  }
  async function loadMore(){
    if(meta.loading) return;
    return load({ limit: meta.limit, offset: cache.length, q: meta.q, append: true });
  }
  async function search(q){ return load({ limit: meta.limit, offset: 0, q: q || '', append: false }); }
  async function saveUser(user){
    var local = applyUsers([Object.assign({}, user, { updatedAt: new Date().toISOString(), pklProfileUpdatedAt: new Date().toISOString() })], { append: true });
    try {
      var res = await fetch('/api/pkl-users', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ user: normalize(user) }) });
      if(!res.ok) throw new Error('users save failed ' + res.status);
      var data = await res.json();
      if(data && data.user) applyUsers([data.user], { append: true });
    } catch(e) { console.warn('PKL Supabase user save skipped', e); }
    return local;
  }
  function renderScrollStatus(){
    var wrap = document.getElementById('userList');
    if(!wrap) return;
    Array.prototype.slice.call(wrap.querySelectorAll('.pkl-users-loading-row,.pkl-users-end-row')).forEach(function(el){ el.remove(); });
    var row = document.createElement('div');
    row.className = meta.loading ? 'pkl-users-loading-row' : 'pkl-users-end-row';
    if(meta.loading) row.textContent = 'Supabase에서 회원을 불러오는 중...';
    else if(meta.count && cache.length < meta.count) row.textContent = '아래로 스크롤하면 다음 회원을 불러옵니다.';
    else row.textContent = cache.length ? '전체 회원을 모두 불러왔습니다.' : '회원 데이터가 없습니다.';
    wrap.appendChild(row);
  }
  function bindInfiniteScroll(){
    var wrap = document.getElementById('userList');
    if(!wrap || wrap.__pklSupabaseInfiniteBound) return;
    wrap.__pklSupabaseInfiniteBound = true;
    wrap.addEventListener('scroll', function(){
      if(meta.loading) return;
      if(!(meta.count && cache.length < meta.count)) return;
      if(wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 90) loadMore();
    }, { passive:true });
  }
  function patchProfile(){
    if(!window.PKLUserProfile || window.PKLUserProfile.__supabasePagedUsers20260512Fix) return;
    var oldUpsert = window.PKLUserProfile.upsert;
    window.PKLUserProfile.users = function(){ return cache.slice(); };
    window.PKLUserProfile.findUser = function(u){ return cache.find(function(x){ return same(x,u); }) || null; };
    window.PKLUserProfile.hydrate = function(u){ var f = window.PKLUserProfile.findUser(u); return f ? normalize(Object.assign({}, u, f)) : normalize(u || {}); };
    window.PKLUserProfile.upsert = function(u){ try{ if(typeof oldUpsert === 'function') oldUpsert(u); }catch(e){} saveUser(u); return cache.slice(); };
    window.PKLUserProfile.__supabasePagedUsers20260512Fix = true;
  }
  function bindSearch(){
    var input = document.getElementById('search');
    if(!input || input.__pklSupabaseSearchBound) return;
    input.__pklSupabaseSearchBound = true;
    input.addEventListener('input', function(){ clearTimeout(debounceTimer); debounceTimer = setTimeout(function(){ search(input.value); }, 320); });
  }
  function boot(){
    patchProfile(); bindSearch(); bindInfiniteScroll();
    if(!window.state || typeof window.state !== 'object') window.state = { users: [], pending: [], bans: [], warningRecords: [] };
    if(Array.isArray(window.state.users)) window.state.users = [];
    var wrap = document.getElementById('userList');
    if(wrap) wrap.innerHTML = '<div class="pkl-users-loading-row">Supabase에서 회원을 불러오는 중...</div>';
    setStatus('불러오는 중...');
    setTimeout(function(){ load({ limit: 20, offset: 0, q: '', append: false }); }, 80);
  }
  window.PKLUsersSource = { __supabasePagedUsers20260512Fix: true, load: load, loadMore: loadMore, search: search, saveUser: saveUser, localUsers: function(){ return cache.slice(); }, normalize: normalize, same: same, meta: meta };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('pkl-role-data-updated', patchProfile);
})();
