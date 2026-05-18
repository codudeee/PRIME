(function(){
  'use strict';
  if(window.PKLUsersRealtime && window.PKLUsersRealtime.__pklUsersRealtime20260518) return;

  var cache = [];
  var byDiscord = Object.create(null);
  var socket = null;
  var channelRef = null;
  var heartbeatTimer = 0;
  var reconnectTimer = 0;
  var joined = false;
  var lastFetchAt = 0;

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function low(v){ return clean(v).toLowerCase(); }
  function stripDiscord(v){ return low(v).replace(/^discord-/, ''); }
  function emit(name, detail){ try{ window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); }catch(e){} }
  function cfgValue(k){ try{ return clean(localStorage.getItem(k) || ''); }catch(e){ return ''; } }
  function getDiscordId(u){ u = u || {}; return stripDiscord(u.discord_id || u.discordId || u.discordID || u.uid || u.id || u.userId || u.key); }
  function getNick(u){ u = u || {}; return clean(u.nickname || u.nick || u.name || u.discordServerNickname || u.discordGuildNick || u.discord_username || u.discordUsername || u.displayName); }
  function getPubg(u){ u = u || {}; return clean(u.pubg_id || u.pubgId || u.pubgID || u.gameId || u.pubgName || u.pubg || u.ref); }
  function normalizeTier(v){
    if(window.PKLTierBadge && typeof window.PKLTierBadge.normalize === 'function') return window.PKLTierBadge.normalize(v);
    var raw = clean(v); if(!raw || raw === '없음' || low(raw) === 'none') return 'none';
    var key = raw.replace(/[\s_-]+/g,'').toLowerCase();
    var map = {tier0:'tier0_mid',tier0high:'tier0_high',tier0mid:'tier0_mid',tier0low:'tier0_low',tier1:'tier1_mid',tier1high:'tier1_high',tier1mid:'tier1_mid',tier1low:'tier1_low',tier2:'tier2_mid',tier2high:'tier2_high',tier2mid:'tier2_mid',tier2low:'tier2_low',tier3:'tier3_mid',tier3high:'tier3_high',tier3mid:'tier3_mid',tier3low:'tier3_low',tier4:'tier4_mid',tier4high:'tier4_high',tier4mid:'tier4_mid',tier4low:'tier4_low','0티어':'tier0_mid','0티어상':'tier0_high','0티어중':'tier0_mid','0티어하':'tier0_low','1티어':'tier1_mid','1티어상':'tier1_high','1티어중':'tier1_mid','1티어하':'tier1_low','2티어':'tier2_mid','2티어상':'tier2_high','2티어중':'tier2_mid','2티어하':'tier2_low','3티어':'tier3_mid','3티어상':'tier3_high','3티어중':'tier3_mid','3티어하':'tier3_low','4티어':'tier4_mid','4티어상':'tier4_high','4티어중':'tier4_mid','4티어하':'tier4_low',beast:'beast','짐승':'beast',temp:'temp','임시':'temp',prisoner:'prisoner','수감자':'prisoner'};
    return map[key] || raw;
  }
  function tierLabel(t){
    t = normalizeTier(t);
    if(window.PKLTierBadge && typeof window.PKLTierBadge.label === 'function') return window.PKLTierBadge.label(t);
    var m = {none:'없음',tier0_high:'0티어 상',tier0_mid:'0티어 중',tier0_low:'0티어 하',tier1_high:'1티어 상',tier1_mid:'1티어 중',tier1_low:'1티어 하',tier2_high:'2티어 상',tier2_mid:'2티어 중',tier2_low:'2티어 하',tier3_high:'3티어 상',tier3_mid:'3티어 중',tier3_low:'3티어 하',tier4_high:'4티어 상',tier4_mid:'4티어 중',tier4_low:'4티어 하',beast:'짐승',temp:'임시',prisoner:'수감자'};
    return m[t] || t || '없음';
  }
  function normalizeRole(v){
    var raw = clean(v), l = raw.toLowerCase();
    if(['admin','administrator','owner','master','superadmin','manager'].indexOf(l) >= 0 || ['관리자','총관리자','마스터','총괄'].indexOf(raw) >= 0) return 'admin';
    if(['operator','staff','moderator','mod'].indexOf(l) >= 0 || ['운영자','운영진','스태프'].indexOf(raw) >= 0) return 'operator';
    if(['prisoner','jail','banned','blocked'].indexOf(l) >= 0 || ['수감자','차단','정지'].indexOf(raw) >= 0) return 'prisoner';
    if(['guest','temp','temporary'].indexOf(l) >= 0 || ['임시','준회원'].indexOf(raw) >= 0) return 'guest';
    return raw || 'user';
  }
  function isBannedUser(u){
    u = u || {};
    var raw = u.raw && typeof u.raw === 'object' ? u.raw : {};
    var r = low(u.role || u.memberRole || raw.role || raw.memberRole);
    return u.banned === true || raw.banned === true || raw.isBanned === true || r === 'banned' || r === 'blocked';
  }
  function normalizeUser(row){
    row = row || {};
    var raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
    var u = Object.assign({}, raw, row);
    var did = getDiscordId(u);
    var nick = getNick(u);
    var pubg = getPubg(u);
    var tier = normalizeTier(u.memberTier || u.gradeRole || u.tierRole || u.tier || u.baseRole || u.originalRole || u.memberTierName || u.tierName);
    var role = normalizeRole(u.memberRole || u.member_role || u.role || u.userRole || u.authRole || (u.is_admin ? 'admin' : 'user'));
    if(did){ u.discord_id = did; u.discordId = did; u.uid = 'discord-' + did; u.id = 'discord-' + did; u.userId = 'discord-' + did; u.key = 'discord-' + did; }
    if(nick){ u.nickname = nick; u.nick = nick; u.name = nick; u.displayName = nick; }
    if(pubg){ u.pubg_id = pubg; u.pubgId = pubg; u.gameId = pubg; u.pubgName = pubg; u.ref = pubg; }
    u.memberRole = role; u.userRole = role; u.authRole = role; u.role = role;
    u.memberTier = tier; u.gradeRole = tier; u.tierRole = tier; u.baseRole = tier; u.originalRole = tier; u.tier = tierLabel(tier); u.memberTierName = tierLabel(tier);
    return u;
  }
  function sameUser(a,b){
    var ad = getDiscordId(a), bd = getDiscordId(b); if(ad && bd) return ad === bd;
    var ap = low(getPubg(a)), bp = low(getPubg(b)); if(ap && bp) return ap === bp;
    var an = low(getNick(a)), bn = low(getNick(b)); return !!(an && bn && an === bn);
  }
  function applyUsers(users, meta){
    users = (Array.isArray(users) ? users : []).map(normalizeUser).filter(function(u){ return !!getDiscordId(u); });
    if(!users.length) return cache.slice();
    var changed=[];
    users.forEach(function(u){
      var did = getDiscordId(u);
      var idx = cache.findIndex(function(x){ return sameUser(x,u); });
      if(isBannedUser(u)){
        if(idx >= 0) cache.splice(idx,1);
        if(did) delete byDiscord[did];
        changed.push(u);
        return;
      }
      if(idx >= 0) cache[idx] = Object.assign({}, cache[idx], u); else { cache.push(u); idx = cache.length - 1; }
      if(did) byDiscord[did] = cache[idx];
      changed.push(u);
      try{ if(window.PKLUserProfile && typeof window.PKLUserProfile.upsert === 'function') window.PKLUserProfile.upsert(u, true); }catch(e){}
      try{ if(typeof window.PKLApplySingleUserTierSync === 'function') window.PKLApplySingleUserTierSync(u); }catch(e){}
      try{ if(typeof window.PKLJoinApplySingleTierSync === 'function') window.PKLJoinApplySingleTierSync(u); }catch(e){}
      try{ if(typeof window.PKLTeamApplySingleTierSync === 'function') window.PKLTeamApplySingleTierSync(u); }catch(e){}
    });
    emit('pkl-users-updated', { users: cache.slice(), changedUsers: changed.slice(), meta: meta || {} });
    emit('pkl-role-data-updated', { users: cache.slice(), changedUsers: changed.slice(), meta: meta || {} });
    return cache.slice();
  }
  async function fetchUsers(options){
    options = options || {};
    var qs = new URLSearchParams();
    qs.set('limit', String(options.limit || 500));
    qs.set('offset', String(options.offset || 0));
    if(options.discordId) qs.set('discordId', stripDiscord(options.discordId));
    if(options.q) qs.set('q', clean(options.q));
    var res = await fetch('/api/pkl-users?' + qs.toString(), { cache:'no-store', headers:{ Accept:'application/json' } });
    if(!res.ok) throw new Error('pkl-users ' + res.status);
    var data = await res.json().catch(function(){ return {}; });
    return applyUsers(Array.isArray(data.users) ? data.users : [], { source:'api', reason:options.reason || 'fetch' });
  }
  function getConfig(){
    var cfg = window.PKL_SUPABASE_CONFIG || {};
    var url = clean(cfg.url || cfg.supabaseUrl || cfg.SUPABASE_URL || cfgValue('SUPABASE_URL') || cfgValue('PKL_SUPABASE_URL')).replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');
    var key = clean(cfg.anonKey || cfg.supabaseAnonKey || cfg.SUPABASE_ANON_KEY || cfgValue('SUPABASE_ANON_KEY') || cfgValue('PKL_SUPABASE_ANON_KEY'));
    return { url:url, key:key };
  }
  function send(obj){ if(socket && socket.readyState === 1) socket.send(JSON.stringify(obj)); }
  function joinChannel(){
    if(!socket || socket.readyState !== 1 || joined) return;
    channelRef = String(Date.now()) + Math.random().toString(16).slice(2);
    send({ topic:'realtime:public:users', event:'phx_join', payload:{ config:{ broadcast:{ self:false }, presence:{ key:'' }, postgres_changes:[{ event:'*', schema:'public', table:'users' }] } }, ref:channelRef });
    joined = true;
  }
  function scheduleReconnect(){
    clearInterval(heartbeatTimer); heartbeatTimer = 0; joined = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectRealtime, 1600);
  }
  function handleRealtimeMessage(msg){
    if(!msg || !msg.event) return;
    if(msg.event === 'phx_reply' && msg.ref === channelRef){ fetchUsers({ limit:500, reason:'realtime-joined' }).catch(function(){}); return; }
    if(msg.event !== 'postgres_changes') return;
    var payload = msg.payload || {};
    var row = payload.record || payload.new || payload.old || {};
    var did = getDiscordId(row);
    if(did){ fetchUsers({ discordId:did, limit:5, reason:'users-realtime' }).catch(function(){ applyUsers([row], { source:'realtime-record' }); }); }
    else applyUsers([row], { source:'realtime-record' });
  }
  async function connectRealtime(){
    var config = getConfig();
    if(!config.url || !config.key || !window.WebSocket) return;
    try{ if(socket) socket.close(); }catch(e){}
    var wsUrl = config.url.replace(/^http/i, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(config.key) + '&vsn=1.0.0';
    socket = new WebSocket(wsUrl);
    socket.onopen = function(){
      joinChannel();
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(function(){ send({ topic:'phoenix', event:'heartbeat', payload:{}, ref:String(Date.now()) }); }, 25000);
    };
    socket.onmessage = function(event){ try{ handleRealtimeMessage(JSON.parse(event.data)); }catch(e){} };
    socket.onclose = scheduleReconnect;
    socket.onerror = scheduleReconnect;
  }
  function start(){
    var now = Date.now();
    if(now - lastFetchAt > 5000){ lastFetchAt = now; fetchUsers({ limit:500, reason:'initial' }).catch(function(){}); }
    if(window.PKL_SUPABASE_READY && typeof window.PKL_SUPABASE_READY.then === 'function') window.PKL_SUPABASE_READY.then(connectRealtime).catch(connectRealtime);
    else connectRealtime();
  }

  window.PKLUsersRealtime = {
    __pklUsersRealtime20260518:true,
    normalizeUser:normalizeUser,
    applyUsers:applyUsers,
    fetchUsers:fetchUsers,
    getUsers:function(){ return cache.slice(); },
    findUser:function(seed){ return cache.find(function(u){ return sameUser(u, seed); }) || null; },
    start:start
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
  window.addEventListener('pkl-supabase-config-ready', connectRealtime);
})();
