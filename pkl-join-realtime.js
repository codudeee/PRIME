(function(){
  'use strict';
  if(window.PKLJoinRealtime && window.PKLJoinRealtime.__pklJoinSupabase20260511) return;
  var WAIT_KEY='pklJoinWaitList', CANCEL_KEY='pklJoinCancelList', RECRUIT_KEY='pklJoinRecruitState';
  var KEYS={pklJoinWaitList:true,pklJoinCancelList:true,pklJoinRecruitState:true};
  var originalSet=Storage.prototype.setItem, originalRemove=Storage.prototype.removeItem;
  var applying=false, saveTimer=null, pollTimer=null, lastText='', lastRemoteMs=0, lastLocalEditAt=0;
  var cfg=window.PKL_SUPABASE_CONFIG||{}; var URL=String(cfg.url||localStorage.getItem('PKL_SUPABASE_URL')||'').replace(/\/+$/,''); var KEY=String(cfg.anonKey||localStorage.getItem('PKL_SUPABASE_ANON_KEY')||'');
  function configured(){var c=window.PKL_SUPABASE_CONFIG||{};URL=String(c.url||localStorage.getItem('SUPABASE_URL')||localStorage.getItem('PKL_SUPABASE_URL')||URL||'').replace(/\/rest\/v1\/?$/i,'').replace(/\/+$/,'');KEY=String(c.anonKey||localStorage.getItem('SUPABASE_ANON_KEY')||localStorage.getItem('PKL_SUPABASE_ANON_KEY')||KEY||'');return !!(URL&&KEY);} function parse(v,fb){try{var x=JSON.parse(v);return x==null?fb:x;}catch(e){return fb;}}
  function read(k,fb){try{return parse(localStorage.getItem(k),fb);}catch(e){return fb;}}
  function now(){return new Date().toISOString();} function norm(v){return String(v==null?'':v).trim().replace(/\s+/g,'').toLowerCase();}
  function tokens(i){i=i&&typeof i==='object'?i:{};return [i.discordId,i.uid,i.id,i.userId,i.memberId,i.loginId,i.key,i.pubgId,i.gameId,i.ref,i.nickname,i.nick,i.name,i.displayName].map(norm).filter(Boolean);}
  function same(a,b){var aa=tokens(a),bb=tokens(b);return aa.length&&bb.length&&aa.some(function(x){return bb.indexOf(x)>=0;});}
  function arr(v){var out=[];(Array.isArray(v)?v:[]).forEach(function(i){if(i&&typeof i==='object'&&!out.some(function(p){return same(p,i);})){out.push(i);}});return out;}
  function stateFromLocal(){return {version:2,waitList:arr(read(WAIT_KEY,[])),cancelList:arr(read(CANCEL_KEY,[])),recruitState:read(RECRUIT_KEY,{state:'waiting'}),updatedAt:now()};}
  function textOf(st){return JSON.stringify({waitList:arr(st.waitList),cancelList:arr(st.cancelList),recruitState:st.recruitState||{state:'waiting'}});}
  function setLocal(k,v){applying=true;try{originalSet.call(localStorage,k,typeof v==='string'?v:JSON.stringify(v));}catch(e){}finally{applying=false;}}
  function emit(st){try{window.dispatchEvent(new CustomEvent('pkl-join-state-updated',{detail:st}));}catch(e){}}
  function applyState(st){if(!st||typeof st!=='object')return;var ms=Date.parse(st.updatedAt||'')||0;if(ms&&ms<lastRemoteMs)return;if(Date.now()-lastLocalEditAt<650&&ms&&ms<Date.now()-650)return;lastRemoteMs=ms||Date.now();setLocal(WAIT_KEY,arr(st.waitList));setLocal(CANCEL_KEY,arr(st.cancelList));setLocal(RECRUIT_KEY,st.recruitState||{state:'waiting'});lastText=textOf(st);emit(st);}
  function sb(path,opt){if(!configured())return Promise.resolve(null);opt=opt||{};opt.headers=Object.assign({apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},opt.headers||{});return fetch(URL+'/rest/v1/'+path,opt).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).catch(function(){return null;});}
  function apiSave(st){return fetch('/api/pkl-data-store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'live_scores',id:'join_state',payload:st})}).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).catch(function(){return null;});}
  function apiRead(){return fetch('/api/pkl-data-store?type=live_scores&id=join_state',{method:'GET',headers:{'Cache-Control':'no-store'}}).then(function(r){return r.ok?r.json().catch(function(){return null;}):null;}).then(function(data){var rows=data&&data.rows;var r=rows&&rows[0];return r&&r.payload?Object.assign({},r.payload,{updatedAt:r.payload.updatedAt||r.updated_at}):null;}).catch(function(){return null;});}
  function saveNow(){var st=stateFromLocal(), text=textOf(st); if(text===lastText)return; lastText=text; apiSave(st).then(function(ok){if(!ok){sb('live_scores?on_conflict=id',{method:'POST',body:JSON.stringify({id:'join_state',payload:st,updated_at:st.updatedAt})});}}); if(window.PKLSupabaseDataSync){window.PKLSupabaseDataSync.setShared(WAIT_KEY,st.waitList);window.PKLSupabaseDataSync.setShared(CANCEL_KEY,st.cancelList);window.PKLSupabaseDataSync.setShared(RECRUIT_KEY,st.recruitState);}}
  function queueSave(d){if(applying)return;clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,d==null?500:d);}
  function poll(){apiRead().then(function(st){if(st)applyState(st);else if(configured())sb('live_scores?id=eq.join_state&select=payload,updated_at&limit=1',{method:'GET'}).then(function(rows){var r=rows&&rows[0]; if(r&&r.payload)applyState(Object.assign({},r.payload,{updatedAt:r.payload.updatedAt||r.updated_at}));});});}
  function start(){emit(stateFromLocal()); poll();}
  if(!Storage.prototype.__pklJoinRealtimePatched){Storage.prototype.setItem=function(k,v){var ret=originalSet.apply(this,arguments);try{if(this===localStorage&&KEYS[String(k)]&&!applying){lastLocalEditAt=Date.now();queueSave(String(k)===RECRUIT_KEY?350:500);emit(stateFromLocal());}}catch(e){}return ret;};Storage.prototype.__pklJoinRealtimePatched=true;}
  try{Storage.prototype.removeItem=function(k){var ret=originalRemove.apply(this,arguments);try{if(this===localStorage&&KEYS[String(k)]&&!applying){lastLocalEditAt=Date.now();queueSave(500);emit(stateFromLocal());}}catch(e){}return ret;};}catch(e){}
  /* 2차 청소: storage 이벤트 기반 자동 join 재렌더 금지. 클릭/저장 흐름에서만 emit한다. */
  window.PKLJoinRealtime={__pklJoinSupabase20260511:true,start:start,save:saveNow,queueSave:queueSave,state:stateFromLocal,apply:applyState,fetchNow:poll}; start();
})();
