(function(){
  "use strict";
  if(window.PKLFirebaseDataSync && window.PKLFirebaseDataSync.__pklSingleSourceFinal20260509) return;

  var PROJECT_ID="primekillleague";
  var API_KEY="AIzaSyAeoucXoL2DKzbeMdEOTr1BXtStUWXhnvU";
  var COLLECTION="pklSharedData";
  var BASE="https://firestore.googleapis.com/v1/projects/"+PROJECT_ID+"/databases/(default)/documents/"+COLLECTION;
  var KEY_LIST=["pklNoticeBoardItems","pklPatchNotes_v2","PKL_RULE_PAGE_CONTENT_V1","PKL_RESULT_MATCHES_V1","PKL_USER_MATCH_STATS_V1","pklSideListItems","PKL_SURRENDER_CONSENT_STORE_V1","pklTeamBuilderState.v1","pklTierScoreConfig","PKL_TIER_DATA_V1","pklUsers","PKL_USERS","pklAdminState_v3","pklAdminUsers","PKL_ADMIN_USERS","pklDiscordRecruitMessage","pklBannedUsers"];
  var KEY_SET=KEY_LIST.reduce(function(a,k){a[k]=true;return a;},{});
  /* PKL 2026-05-10: sheet.html 전체 상태는 더 이상 Firebase 공유문서로 복원/저장하지 않는다.
     시트 실시간은 pkl-scoreboard-realtime.js의 pklLiveScoreboard/current 값만 사용한다. */
  var SHEET_REALTIME_KEY="PKL_EFFICIENT_MATCH_SHEET_LIVE_SYNC_V1";
  delete KEY_SET[SHEET_REALTIME_KEY];
  var USER_KEYS={pklUsers:true,PKL_USERS:true};
  var EMPTY_PROTECTED={pklNoticeBoardItems:true,PKL_RULE_PAGE_CONTENT_V1:true,PKL_USER_MATCH_STATS_V1:true,"pklTeamBuilderState.v1":true,PKL_TIER_DATA_V1:true,pklTierScoreConfig:true,pklUsers:true,PKL_USERS:true,pklAdminState_v3:true};
  var originalSet=Storage.prototype.setItem, originalRemove=Storage.prototype.removeItem, originalClear=Storage.prototype.clear;
  var applying=false,lastRemote={},pending={},timers={},backoffUntil=0,lastRefresh=0;

  function now(){return new Date().toISOString();}
  function docUrl(key){return BASE+"/"+encodeURIComponent(key)+"?key="+encodeURIComponent(API_KEY);}
  function listUrl(){return BASE+"?key="+encodeURIComponent(API_KEY);}
  function oneUrl(key){return BASE+"/"+encodeURIComponent(key)+"?key="+encodeURIComponent(API_KEY);}
  function isKey(k){return !!KEY_SET[String(k||"")];}
  function readField(fields,name){var f=fields&&fields[name]; if(!f)return""; if("stringValue" in f)return f.stringValue; if("booleanValue" in f)return f.booleanValue?"true":"false"; if("integerValue" in f)return String(f.integerValue); return"";}
  function docKey(name){return decodeURIComponent(String(name||"").split("/").pop()||"");}
  function parse(raw,fb){try{var v=JSON.parse(String(raw));return v==null?fb:v;}catch(e){return fb;}}
  function raw(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function read(k,fb){return parse(raw(k),fb);}
  function clean(v){return String(v==null?"":v).trim();}
  function low(v){return clean(v).toLowerCase();}
  function useful(v){var s=clean(v);return !!s&&s!=="undefined"&&s!=="null"&&s!=="없음"&&s!=="none";}
  function compact(v){return clean(v).replace(/[\s_-]+/g,"").toLowerCase();}
  function isTier(v){var c=compact(v);return /^(tier[0-4](high|mid|low)?|[0-4]티어(상|중|하)?|beast|짐승|temp|임시)$/.test(c);}
  function tierKey(v){
    var rawv=clean(v); if(!rawv||rawv==="없음"||low(rawv)==="none")return "none"; var c=compact(rawv);
    var m={tier0:"tier0_mid",tier0high:"tier0_high",tier0mid:"tier0_mid",tier0low:"tier0_low",tier1:"tier1_mid",tier1high:"tier1_high",tier1mid:"tier1_mid",tier1low:"tier1_low",tier2:"tier2_mid",tier2high:"tier2_high",tier2mid:"tier2_mid",tier2low:"tier2_low",tier3:"tier3_mid",tier3high:"tier3_high",tier3mid:"tier3_mid",tier3low:"tier3_low",tier4:"tier4_mid",tier4high:"tier4_high",tier4mid:"tier4_mid",tier4low:"tier4_low","0티어":"tier0_mid","0티어상":"tier0_high","0티어중":"tier0_mid","0티어하":"tier0_low","1티어":"tier1_mid","1티어상":"tier1_high","1티어중":"tier1_mid","1티어하":"tier1_low","2티어":"tier2_mid","2티어상":"tier2_high","2티어중":"tier2_mid","2티어하":"tier2_low","3티어":"tier3_mid","3티어상":"tier3_high","3티어중":"tier3_mid","3티어하":"tier3_low","4티어":"tier4_mid","4티어상":"tier4_high","4티어중":"tier4_mid","4티어하":"tier4_low",beast:"beast",짐승:"beast",temp:"temp",임시:"temp",prisoner:"prisoner",수감자:"prisoner"};
    return m[c]||rawv;
  }
  function tierLabel(k){k=tierKey(k);var m={none:"없음",tier0_high:"0티어 상",tier0_mid:"0티어 중",tier0_low:"0티어 하",tier1_high:"1티어 상",tier1_mid:"1티어 중",tier1_low:"1티어 하",tier2_high:"2티어 상",tier2_mid:"2티어 중",tier2_low:"2티어 하",tier3_high:"3티어 상",tier3_mid:"3티어 중",tier3_low:"3티어 하",tier4_high:"4티어 상",tier4_mid:"4티어 중",tier4_low:"4티어 하",beast:"짐승",temp:"임시",prisoner:"수감자"};return m[k]||k||"없음";}
  function roleKey(v){var r=clean(v),l=r.toLowerCase(); if(!r||r==="없음"||l==="none")return "user"; if(isTier(r))return "user"; if(["admin","administrator","owner","master","superadmin","manager"].indexOf(l)>=0||["관리자","총관리자","총괄"].indexOf(r)>=0)return "admin"; if(["operator","staff","moderator","mod"].indexOf(l)>=0||["운영자","운영진","스태프"].indexOf(r)>=0)return "operator"; if(["prisoner","jail","blocked"].indexOf(l)>=0||["수감자","수감","정지"].indexOf(r)>=0)return "prisoner"; if(["guest","temp","temporary"].indexOf(l)>=0||["임시","준회원","비로그인"].indexOf(r)>=0)return "guest"; return "user";}
  function id(u){u=u||{};return low(u.discordId||u.uid||u.id||u.userId||u.memberId||u.key);}
  function nick(u){u=u||{};return clean(u.nickname||u.nick||u.name||u.displayName||u.discordGlobalName||u.discordUsername||u.username);}
  function pubg(u){u=u||{};return clean(u.pubgId||u.pubgID||u.gameId||u.pubgName||u.pubg||u.ref);}
  function same(a,b){var ai=id(a),bi=id(b); if(ai&&bi)return ai===bi; var ap=low(pubg(a)),bp=low(pubg(b)); if(ap&&bp)return ap===bp; var an=low(nick(a)),bn=low(nick(b)); return !!(an&&bn&&an===bn);}
  function stamp(u){u=u||{};var s=clean(u.pklProfileUpdatedAt||u.profileUpdatedAt||u.updatedAt||u.modifiedAt||u.savedAt);var t=Date.parse(s);return isNaN(t)?0:t;}
  function normalize(u){
    u=Object.assign({},u||{});
    var n=nick(u); if(n){u.nickname=n;u.nick=n;u.name=n;u.displayName=n;}
    var p=pubg(u); if(p){u.pubgId=p;u.gameId=p;u.pubgName=p;u.ref=p;}
    var rid=id(u); if(rid){u.discordId=u.discordId||rid;u.uid=u.uid||rid;u.id=u.id||rid;u.userId=u.userId||rid;u.key=u.key||rid;}
    var originalRole=u.role;
    var role=roleKey(u.memberRole||u.adminRole||u.userRole||u.authRole||(!isTier(originalRole)?originalRole:""));
    u.memberRole=role;u.userRole=role;u.authRole=role;
    if(!isTier(originalRole)) u.role=role;
    var tier=tierKey(u.memberTier||u.gradeRole||u.tierRole||u.baseRole||(isTier(originalRole)?originalRole:"")||u.tier||u.memberTierName||u.tierName);
    if(tier&&tier!=="none"){u.memberTier=tier;u.gradeRole=tier;u.tierRole=tier;u.baseRole=tier;u.originalRole=tier;u.memberTierName=tierLabel(tier);u.tier=tierLabel(tier);}else{u.memberTier="none";u.gradeRole="none";u.tierRole="none";u.memberTierName="없음";u.tier="없음";}
    return u;
  }
  function mergeUser(a,b){
    var old=normalize(a||{}), neu=normalize(b||{}), out=Object.assign({},old);
    var ns=stamp(neu), os=stamp(old), force=!!neu.__pklProfileWrite || (ns && ns>=os);
    Object.keys(neu).forEach(function(k){var nv=neu[k]; if(nv===undefined||nv===null||nv==="")return; if(!force && ["pubgId","gameId","pubgName","ref","memberTier","gradeRole","tierRole","baseRole","originalRole","memberTierName","tier","memberRole","userRole","authRole","role"].indexOf(k)>=0 && useful(out[k]))return; out[k]=nv;});
    if(force){["pubgId","gameId","pubgName","ref","memberTier","gradeRole","tierRole","baseRole","originalRole","memberTierName","tier","memberRole","userRole","authRole","role"].forEach(function(k){if(neu[k]!==undefined&&neu[k]!==null&&neu[k]!=="")out[k]=neu[k];});}
    return normalize(out);
  }
  function mergeLists(){var out=[]; function add(list){(Array.isArray(list)?list:[]).forEach(function(u){if(!u||typeof u!=="object")return; var i=out.findIndex(function(x){return same(x,u);}); if(i>=0)out[i]=mergeUser(out[i],u); else out.push(normalize(u));});} for(var i=0;i<arguments.length;i++)add(arguments[i]); return out;}
  function adminUsers(v){return v&&typeof v==="object"&&Array.isArray(v.users)?v.users:[];}
  function markForce(list){return (Array.isArray(list)?list:[]).map(function(u){return Object.assign({},u||{}, {__pklProfileWrite:true, pklProfileUpdatedAt:(u&&u.pklProfileUpdatedAt)||now()});});}
  function canonicalLocal(){var st=read("pklAdminState_v3",{}); return mergeLists(read("pklUsers",[]),read("PKL_USERS",[]),read("pklAdminUsers",[]),read("PKL_ADMIN_USERS",[]),markForce(adminUsers(st)));}
  function silentSet(key,val){var text=typeof val==="string"?val:JSON.stringify(val); if(raw(key)===text)return; applying=true; try{originalSet.call(localStorage,key,text);}catch(e){} applying=false;}
  function writeUserAliases(users,saveAdmin){users=mergeLists(users); silentSet("pklUsers",users); silentSet("PKL_USERS",users); hydrateCurrent(users); try{window.dispatchEvent(new CustomEvent("pkl-users-updated",{detail:{users:users}}));window.dispatchEvent(new CustomEvent("pkl-role-data-updated",{detail:{users:users}}));}catch(e){} if(saveAdmin){queueSave("pklUsers",JSON.stringify(users));queueSave("PKL_USERS",JSON.stringify(users));} return users;}
  function hydrateCurrent(users){["discordUser","pklLoginUser","pklCurrentUser","pklUser","pklLoggedInUser","pkl_current_user"].forEach(function(k){var cur=read(k,null); if(!cur||typeof cur!=="object")return; var f=users.find(function(u){return same(cur,u);}); if(f)silentSet(k,mergeUser(cur,f));});}
  function isEmpty(key,value){if(value==null||value===""||value==="null")return true;var v=parse(value,"__bad__");if(v==="__bad__")return false;if(Array.isArray(v)&&v.length===0)return true;if(v&&typeof v==="object"&&!Array.isArray(v)){if(Object.keys(v).length===0)return true;if(key==="pklAdminState_v3"&&Array.isArray(v.users)&&v.users.length===0)return true;}return false;}
  function userPayload(key,value){var v=parse(value,null); return JSON.stringify(mergeLists(v));}
  function applyRemote(key,json){
    if(!isKey(key)||typeof json!=="string")return;
    if(key===SHEET_REALTIME_KEY && shouldRejectOldSheetRemote(json)){lastRemote[key]=raw(key)||json; queueSave(key, raw(key)||"null"); return;}
    if(key==="pklAdminState_v3"){
      if(EMPTY_PROTECTED[key]&&isEmpty(key,json)&&raw(key)&&!isEmpty(key,raw(key))){lastRemote[key]=raw(key);queueSave(key,raw(key));return;}
      lastRemote[key]=json; silentSet(key,json);
      writeUserAliases(canonicalLocal(),false);
      try{window.dispatchEvent(new CustomEvent("pkl-firebase-data-updated",{detail:{key:key}}));window.dispatchEvent(new CustomEvent("pkl-role-data-updated"));}catch(e){}
      return;
    }
    if(USER_KEYS[key]){var remote=parse(json,[]); var local=canonicalLocal(); var merged=mergeLists(local,remote); json=JSON.stringify(merged); lastRemote[key]=json; writeUserAliases(merged,false); return;}
    if(EMPTY_PROTECTED[key]&&isEmpty(key,json)&&raw(key)&&!isEmpty(key,raw(key))){lastRemote[key]=raw(key);queueSave(key,raw(key));return;} lastRemote[key]=json; silentSet(key,json); try{window.dispatchEvent(new CustomEvent("pkl-firebase-data-updated",{detail:{key:key}}));}catch(e){} }
  function queueSave(key,value){key=String(key||""); if(!isKey(key)||applying)return; value=String(value==null?"":value); if(key==="pklAdminState_v3"){try{writeUserAliases(canonicalLocal(),true);}catch(e){}} if(USER_KEYS[key])value=userPayload(key,value); if(USER_KEYS[key]&&isEmpty(key,value))return; if(EMPTY_PROTECTED[key]&&lastRemote[key]&&!isEmpty(key,lastRemote[key])&&isEmpty(key,value))return; if(lastRemote[key]===value)return; pending[key]=value; clearTimeout(timers[key]); timers[key]=setTimeout(function(){if(Date.now()<backoffUntil){queueSave(key,pending[key]);return;} var latest=pending[key]; delete pending[key]; if(USER_KEYS[key])latest=userPayload(key,latest); if(USER_KEYS[key]&&isEmpty(key,latest))return; lastRemote[key]=latest; try{fetch(docUrl(key),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fields:{key:{stringValue:key},json:{stringValue:latest},updatedAt:{stringValue:now()}}})}).then(function(res){if(res.status===429)backoffUntil=Date.now()+300000;}).catch(function(){});}catch(e){}}, key==='PKL_RESULT_MATCHES_V1'||key==='PKL_USER_MATCH_STATS_V1'?250:900);}

  var RESULT_REALTIME_KEY="PKL_RESULT_MATCHES_V1";
  function timeOfStateText(text){
    var v=parse(text,null);
    if(!v||typeof v!=="object")return 0;
    var t=Date.parse(v.savedAt||v.updatedAt||v.createdAt||v.resetAt||v.generatedAt||"");
    return isNaN(t)?0:t;
  }
  function shouldRejectOldSheetRemote(json){
    if(typeof json!=="string")return false;
    var local=raw(SHEET_REALTIME_KEY);
    var lt=timeOfStateText(local), rt=timeOfStateText(json);
    if(local && !isEmpty(SHEET_REALTIME_KEY,local) && lt && rt && lt>rt+800)return true;
    var resetAt=0;
    try{resetAt=Number(localStorage.getItem("PKL_SHEET_HARD_RESET_AT")||0)||0;}catch(e){}
    if(resetAt && rt && resetAt>rt+800)return true;
    return false;
  }
  var sheetPollBusy=false;
  function refreshSheetRealtime(){
    /* sheet full-state polling disabled intentionally. Only match result refresh remains. */
    if(Date.now()<backoffUntil || sheetPollBusy) return;
    sheetPollBusy=true;
    try{
      fetch(oneUrl(RESULT_REALTIME_KEY),{cache:"no-store"}).then(function(res){
        if(res.status===429){backoffUntil=Date.now()+120000;return null;}
        if(res.status===404)return null;
        return res.ok?res.json():null;
      }).then(function(doc){
        if(!doc || !doc.fields)return;
        var key=readField(doc.fields,"key")||docKey(doc.name)||RESULT_REALTIME_KEY;
        var json=readField(doc.fields,"json");
        if(key===RESULT_REALTIME_KEY && json!=="" && json!==lastRemote[RESULT_REALTIME_KEY]) applyRemote(key,json);
      }).catch(function(){}).finally(function(){sheetPollBusy=false;});
    }catch(e){sheetPollBusy=false;}
  }

  function loadRemoteBlocking(){try{var xhr=new XMLHttpRequest();xhr.open("GET",listUrl(),false);xhr.send(null);if(xhr.status===429){backoffUntil=Date.now()+120000;return;}if(xhr.status<200||xhr.status>=300)return;var data=JSON.parse(xhr.responseText||"{}");(data.documents||[]).forEach(function(doc){var key=readField(doc.fields,"key")||docKey(doc.name);var json=readField(doc.fields,"json");if(isKey(key)&&json!=="")applyRemote(key,json);});}catch(e){} writeUserAliases(canonicalLocal(),false);}
  function refresh(force){if(Date.now()<backoffUntil)return;if(!force&&Date.now()-lastRefresh<60000)return;lastRefresh=Date.now();try{fetch(listUrl(),{cache:"no-store"}).then(function(res){if(res.status===429){backoffUntil=Date.now()+120000;return null;}return res.ok?res.json():null;}).then(function(data){if(!data)return;(data.documents||[]).forEach(function(doc){var key=readField(doc.fields,"key")||docKey(doc.name);var json=readField(doc.fields,"json");if(isKey(key)&&json!=="")applyRemote(key,json);});writeUserAliases(canonicalLocal(),false);}).catch(function(){});}catch(e){}}
  Storage.prototype.setItem=function(key,value){var ret=originalSet.apply(this,arguments); if(this===localStorage&&isKey(key)&&!applying){if(USER_KEYS[key]){var users=mergeLists(parse(value,[])); if(users.length)writeUserAliases(users,true);}else queueSave(key,value);} return ret;};
  Storage.prototype.removeItem=function(key){var old=null;try{old=this.getItem(key);}catch(e){}var ret=originalRemove.apply(this,arguments);if(this===localStorage&&isKey(key)&&old!=null&&!EMPTY_PROTECTED[key]&&!USER_KEYS[key])queueSave(key,"null");return ret;};
  Storage.prototype.clear=function(){var snap={};try{KEY_LIST.forEach(function(k){snap[k]=localStorage.getItem(k);});}catch(e){}var ret=originalClear.apply(this,arguments);if(this===localStorage){applying=true;try{KEY_LIST.forEach(function(k){if(snap[k]!=null)originalSet.call(localStorage,k,snap[k]);});}catch(e){}applying=false;}return ret;};
  /* no blocking XHR: prevents admin infinite loading when Firebase quota is exceeded */
  try{writeUserAliases(canonicalLocal(),false);}catch(e){}
  setTimeout(function(){refresh(true);},50);
  window.PKLFirebaseDataSync={__pklSingleSourceFinal20260509:true,keys:KEY_LIST,refresh:function(){refresh(true);},save:function(key){key=String(key||""); if(key===SHEET_REALTIME_KEY)return; if(isKey(key))queueSave(key,localStorage.getItem(key));},setShared:function(key,value){key=String(key||""); if(key===SHEET_REALTIME_KEY)return; if(!isKey(key))return; if(USER_KEYS[key]){var users=mergeLists(value); writeUserAliases(users,false); queueSave("pklUsers",JSON.stringify(users)); queueSave("PKL_USERS",JSON.stringify(users)); return;} localStorage.setItem(key,typeof value==="string"?value:JSON.stringify(value)); queueSave(key,localStorage.getItem(key));},syncUsers:function(){return writeUserAliases(canonicalLocal(),true);},normalizeUser:normalize,mergeUsers:mergeLists};
  window.saveSharedData=function(key,value){if(window.PKLFirebaseDataSync)window.PKLFirebaseDataSync.setShared(key,value);};
  try{window.dispatchEvent(new CustomEvent("pkl-firebase-sync-ready"));}catch(e){}
  window.addEventListener("focus",function(){setTimeout(function(){refresh(false);},500);});
  window.addEventListener("pkl-auth-updated",function(){writeUserAliases(canonicalLocal(),false);setTimeout(function(){refresh(false);},500);});
  setInterval(function(){refresh(false);},120000);
  setInterval(refreshSheetRealtime,30000);
  setTimeout(refreshSheetRealtime,2500);
})();
