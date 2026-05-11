(function(){
  'use strict';
  if(window.PKLFirebaseDataSync && window.PKLFirebaseDataSync.__pklSupabaseSharedOnly20260512) return;
  var KEY_LIST=["pklNoticeBoardItems","pklPatchNotes_v2","PKL_RULE_PAGE_CONTENT_V1","PKL_RESULT_MATCHES_V1","PKL_USER_MATCH_STATS_V1","pklSideListItems","PKL_SURRENDER_CONSENT_STORE_V1","pklTeamBuilderState.v1","pklTierScoreConfig","PKL_TIER_DATA_V1","pklUsers","PKL_USERS","pklAdminState_v3","pklAdminUsers","PKL_ADMIN_USERS","pklDiscordRecruitMessage","pklBannedUsers","pklMailboxMails","pklMailbox","pklMails"];
  var KEY_SET=KEY_LIST.reduce(function(a,k){a[k]=true;return a;},{});
  var USER_KEYS={pklUsers:true,PKL_USERS:true,pklAdminUsers:true,PKL_ADMIN_USERS:true};
  var originalSet=Storage.prototype.setItem, originalRemove=Storage.prototype.removeItem, applying=false, pending={}, timers={}, lastRemote={};
  function isKey(k){return !!KEY_SET[String(k||'')];}
  function parse(v,fb){try{return JSON.parse(String(v));}catch(e){return fb;}}
  function raw(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function silentSet(k,v){var text=typeof v==='string'?v:JSON.stringify(v); if(raw(k)===text)return; applying=true; try{originalSet.call(localStorage,k,text);}catch(e){} applying=false;}
  function clean(v){return String(v==null?'':v).trim();}
  function id(u){u=u||{};return clean(u.discordId||u.discord_id||u.uid||u.id||u.userId||u.key).toLowerCase().replace(/^discord-/,'');}
  function nick(u){u=u||{};return clean(u.nickname||u.nick||u.name||u.displayName||u.username||u.discordUsername);}
  function pubg(u){u=u||{};return clean(u.pubgId||u.pubg_id||u.gameId||u.ref||u.pubgName);}
  function normalize(u){u=Object.assign({},u||{});var n=nick(u),p=pubg(u),d=id(u);if(n){u.nickname=n;u.nick=n;u.name=n;u.displayName=n;}if(p){u.pubgId=p;u.gameId=p;u.ref=p;}if(d){u.discordId=d;u.uid=u.uid||('discord-'+d);u.id=u.id||('discord-'+d);u.userId=u.userId||('discord-'+d);}return u;}
  function same(a,b){var ai=id(a),bi=id(b); if(ai&&bi)return ai===bi; var ap=pubg(a).toLowerCase(),bp=pubg(b).toLowerCase(); if(ap&&bp)return ap===bp; var an=nick(a).toLowerCase(),bn=nick(b).toLowerCase(); return !!(an&&bn&&an===bn);}
  function mergeUsers(){var out=[];function add(list){(Array.isArray(list)?list:[]).forEach(function(x){if(!x||typeof x!=='object')return;var u=normalize(x);var i=out.findIndex(function(o){return same(o,u);}); if(i>=0)out[i]=normalize(Object.assign({},out[i],u)); else out.push(u);});} for(var i=0;i<arguments.length;i++)add(arguments[i]); return out;}
  async function apiSaveShared(key,value){
    await fetch('/api/pkl-shared',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:key,value:value})}).catch(function(){});
  }
  async function apiLoadShared(keys){
    var res=await fetch('/api/pkl-shared?keys='+encodeURIComponent(keys.join(',')),{cache:'no-store'}); if(!res.ok)throw new Error('shared load failed'); var data=await res.json(); return data.values||{};
  }
  async function apiSaveUsers(users){
    users=mergeUsers(users); if(!users.length)return users;
    for(var i=0;i<users.length;i++){
      await fetch('/api/pkl-users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:users[i]})}).catch(function(){});
    }
    return users;
  }
  async function apiLoadUsers(){
    var res=await fetch('/api/pkl-users?limit=100&offset=0',{cache:'no-store'}); if(!res.ok)throw new Error('users load failed'); var data=await res.json(); return Array.isArray(data.users)?data.users:[];
  }
  function dispatch(key){try{window.dispatchEvent(new CustomEvent('pkl-firebase-data-updated',{detail:{key:key}}));window.dispatchEvent(new CustomEvent('pkl-supabase-shared-updated',{detail:{key:key}}));}catch(e){}}
  function applyUsers(users){users=mergeUsers(users); if(users.length){silentSet('pklUsers',users);silentSet('PKL_USERS',users);} try{window.dispatchEvent(new CustomEvent('pkl-users-updated',{detail:{users:users}}));window.dispatchEvent(new CustomEvent('pkl-role-data-updated',{detail:{users:users}}));}catch(e){} return users;}
  function queueSave(key,value){
    key=String(key||''); if(!isKey(key)||applying)return;
    value=typeof value==='string'?value:JSON.stringify(value);
    clearTimeout(timers[key]); pending[key]=value;
    timers[key]=setTimeout(async function(){
      var latest=pending[key]; delete pending[key];
      if(USER_KEYS[key]){ var users=mergeUsers(parse(latest,[])); if(users.length){applyUsers(users); await apiSaveUsers(users);} return; }
      lastRemote[key]=latest; await apiSaveShared(key,latest); dispatch(key);
    }, USER_KEYS[key]?500:350);
  }
  async function refresh(force){
    try{
      var sharedKeys=KEY_LIST.filter(function(k){return !USER_KEYS[k];});
      var values=await apiLoadShared(sharedKeys);
      Object.keys(values).forEach(function(k){var v=values[k]; if(v==null)return; if(v!==lastRemote[k]){lastRemote[k]=v; silentSet(k,v); dispatch(k);}});
    }catch(e){}
    try{var users=await apiLoadUsers(); if(users.length)applyUsers(users);}catch(e){}
  }
  Storage.prototype.setItem=function(key,value){var ret=originalSet.apply(this,arguments); if(this===localStorage&&isKey(key)&&!applying)queueSave(key,value); return ret;};
  Storage.prototype.removeItem=function(key){var ret=originalRemove.apply(this,arguments); if(this===localStorage&&isKey(key)&&!applying&&!USER_KEYS[key]){fetch('/api/pkl-shared?key='+encodeURIComponent(key),{method:'DELETE'}).catch(function(){});} return ret;};
  window.PKLFirebaseDataSync={__pklSupabaseSharedOnly20260512:true,keys:KEY_LIST,refresh:function(){refresh(true);},save:function(key){if(isKey(key))queueSave(key,raw(key));},setShared:function(key,value){key=String(key||''); if(!isKey(key))return; var text=typeof value==='string'?value:JSON.stringify(value); silentSet(key,text); queueSave(key,text);},syncUsers:function(){var users=mergeUsers(parse(raw('pklUsers'),[]),parse(raw('PKL_USERS'),[])); applyUsers(users); apiSaveUsers(users); return users;},normalizeUser:normalize,mergeUsers:mergeUsers};
  window.saveSharedData=function(key,value){window.PKLFirebaseDataSync.setShared(key,value);};
  setTimeout(function(){refresh(true);},60);
  window.addEventListener('focus',function(){setTimeout(function(){refresh(false);},300);});
  try{window.dispatchEvent(new CustomEvent('pkl-firebase-sync-ready'));}catch(e){}
})();
