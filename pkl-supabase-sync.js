(function(){
  "use strict";
  if(window.PKLSupabaseDataSync && window.PKLSupabaseDataSync.__pklSupabaseSingleSource20260512) return;

  var KEY_LIST=[
    "pklNoticeBoardItems","pklPatchNotes_v2","PKL_RULE_PAGE_CONTENT_V1",
    "PKL_RESULT_MATCHES_V1","PKL_EFFICIENT_MATCH_SHEET_LIVE_SYNC_V1","PKL_USER_MATCH_STATS_V1","PKL_TIER_DATA_V1",
    "PKL_SURRENDER_CONSENT_STORE_V1","PKL_FIRE_CONSENT_STORE_V1","PKL_SHEET_RESET_LOCK_V2",
    "pklTeamBuilderState.v1","pklTierScoreConfig","pklTierScoreLastSync",
    "pklSideListItems","pklSideList","pklSideBets","pklItemHistoryCounts",
    "pklUsers","PKL_USERS","pklAdminState_v3","pklAdminUsers","PKL_ADMIN_USERS","pklUserList",
    "pklPendingUsers","pklBannedUsers","PKL_DELETED_USER_KEYS_V1",
    "pklJoinWaitList","pklJoinCancelList","pklJoinRecruitState","pklJoinFeeInfo","pklJoinDepositRequests","pklJoinWarningRequests","pklJoinPeopleLimit",
    "pklMails","pklMailbox","pklMailboxUnread",
    "pklDiscordRecruitMessage","PKL_DISCORD_RECRUIT_MESSAGE_V1","pklDiscordBotMessage","pklColdTeamModalShown.v1"
  ];
  var KEY_SET=KEY_LIST.reduce(function(a,k){a[k]=true;return a;},{});
  var USER_KEYS={pklUsers:true,PKL_USERS:true,pklAdminUsers:true,PKL_ADMIN_USERS:true};
  var BLOCKED_LOCAL_KEYS={
    pklUsers:true, PKL_USERS:true, pklAdminUsers:true, PKL_ADMIN_USERS:true, pklUserList:true,
    pklAdminState_v3:true, pklPendingUsers:true, pklBannedUsers:true, PKL_DELETED_USER_KEYS_V1:true
  };
  var RESULT_MATCH_KEY="PKL_RESULT_MATCHES_V1";
  var SHEET_LIVE_KEY="PKL_EFFICIENT_MATCH_SHEET_LIVE_SYNC_V1";
  var originalGet=Storage.prototype.getItem;
  var originalSet=Storage.prototype.setItem;
  var originalRemove=Storage.prototype.removeItem;
  var originalClear=Storage.prototype.clear;
  var applying=false;
  var saving={};
  var lastRefresh=0;
  var sharedCache={};
  var memoryStore={};
  var BLOCKED_DISK_KEYS=KEY_SET;
  var SESSION_ALLOWED=/^(pklLoginUser|pklCurrentUser|pklUser|PKL_CURRENT_USER|PKL_USER|pkl_discord_|pklJoinLoginRequired|pklNoticeSeenIds|pkl_active_tab|pkl_ui_)/;

  function now(){return new Date().toISOString();}
  function isKey(k){
    k=String(k||"");
    return !!KEY_SET[k] || /^pklJoinDepositRequested_/.test(k);
  }
  function clean(v){return String(v==null?"":v).trim();}
  function low(v){return clean(v).toLowerCase();}
  function parse(raw,fb){try{var v=JSON.parse(String(raw));return v==null?fb:v;}catch(e){return fb;}}
  function raw(k){
    k=String(k||"");
    if(BLOCKED_LOCAL_KEYS[k]) return null;
    if(Object.prototype.hasOwnProperty.call(memoryStore,k)) return memoryStore[k];
    try{return originalGet.call(localStorage,k);}catch(e){return null;}
  }
  function silentSet(key,val){
    key=String(key||"");
    var text=typeof val==="string"?val:JSON.stringify(val);
    if(raw(key)===text) return;
    memoryStore[key]=text;
  }
  function forgetDiskKey(key){try{originalRemove.call(localStorage,String(key||""));}catch(e){}}
  function emit(name,detail){try{window.dispatchEvent(new CustomEvent(name,{detail:detail||{}}));}catch(e){}}
  function emitKey(key){emit("pkl-supabase-data-updated",{key:key});}
  function rememberShared(key,value){
    key=String(key||""); if(!key) return;
    if(BLOCKED_LOCAL_KEYS[key]){ forgetDiskKey(key); delete memoryStore[key]; delete sharedCache[key]; return; }
    sharedCache[key]=value; silentSet(key, value); forgetDiskKey(key); emitKey(key);
  }

  function isTier(v){var c=clean(v).replace(/[\s_-]+/g,"").toLowerCase();return /^(tier[0-4](high|mid|low)?|[0-4]티어(상|중|하)?|beast|짐승|temp|임시|prisoner|수감자)$/.test(c);}
  function roleKey(v){
    var r=clean(v),l=r.toLowerCase();
    if(!r||r==="없음"||l==="none"||isTier(r)) return "user";
    if(["admin","administrator","owner","master","superadmin","manager"].indexOf(l)>=0||["관리자","총관리자","총괄"].indexOf(r)>=0) return "admin";
    if(["operator","staff","moderator","mod"].indexOf(l)>=0||["운영자","운영진","스태프"].indexOf(r)>=0) return "operator";
    if(["prisoner","jail","blocked"].indexOf(l)>=0||["수감자","수감","정지"].indexOf(r)>=0) return "prisoner";
    if(["guest","temp","temporary"].indexOf(l)>=0||["임시","준회원","비로그인"].indexOf(r)>=0) return "guest";
    return "user";
  }
  function tierKey(v){
    var r=clean(v); if(!r||r==="없음"||r.toLowerCase()==="none") return "none";
    var c=r.replace(/[\s_-]+/g,"").toLowerCase();
    var map={tier0:"tier0_mid",tier0high:"tier0_high",tier0mid:"tier0_mid",tier0low:"tier0_low",tier1:"tier1_mid",tier1high:"tier1_high",tier1mid:"tier1_mid",tier1low:"tier1_low",tier2:"tier2_mid",tier2high:"tier2_high",tier2mid:"tier2_mid",tier2low:"tier2_low",tier3:"tier3_mid",tier3high:"tier3_high",tier3mid:"tier3_mid",tier3low:"tier3_low",tier4:"tier4_mid",tier4high:"tier4_high",tier4mid:"tier4_mid",tier4low:"tier4_low","0티어":"tier0_mid","0티어상":"tier0_high","0티어중":"tier0_mid","0티어하":"tier0_low","1티어":"tier1_mid","1티어상":"tier1_high","1티어중":"tier1_mid","1티어하":"tier1_low","2티어":"tier2_mid","2티어상":"tier2_high","2티어중":"tier2_mid","2티어하":"tier2_low","3티어":"tier3_mid","3티어상":"tier3_high","3티어중":"tier3_mid","3티어하":"tier3_low","4티어":"tier4_mid","4티어상":"tier4_high","4티어중":"tier4_mid","4티어하":"tier4_low",beast:"beast",짐승:"beast",temp:"temp",임시:"temp",prisoner:"prisoner",수감자:"prisoner"};
    return map[c]||r;
  }
  function tierLabel(k){k=tierKey(k);var m={none:"없음",tier0_high:"0티어 상",tier0_mid:"0티어 중",tier0_low:"0티어 하",tier1_high:"1티어 상",tier1_mid:"1티어 중",tier1_low:"1티어 하",tier2_high:"2티어 상",tier2_mid:"2티어 중",tier2_low:"2티어 하",tier3_high:"3티어 상",tier3_mid:"3티어 중",tier3_low:"3티어 하",tier4_high:"4티어 상",tier4_mid:"4티어 중",tier4_low:"4티어 하",beast:"짐승",temp:"임시",prisoner:"수감자"};return m[k]||k||"없음";}
  function uid(u){u=u||{};return low(u.discordId||u.discord_id||u.uid||u.id||u.userId||u.memberId||u.key).replace(/^discord-/,"");}
  function nick(u){u=u||{};return clean(u.nickname||u.nick||u.name||u.displayName||u.discordGlobalName||u.discordUsername||u.username);}
  function pubg(u){u=u||{};return clean(u.pubgId||u.pubg_id||u.pubgID||u.gameId||u.pubgName||u.pubg||u.ref);}
  function same(a,b){var ai=uid(a),bi=uid(b); if(ai&&bi)return ai===bi; var ap=low(pubg(a)),bp=low(pubg(b)); if(ap&&bp)return ap===bp; var an=low(nick(a)),bn=low(nick(b)); return !!(an&&bn&&an===bn);}
  function normalize(u){
    u=Object.assign({},u||{});
    var id=uid(u); if(id){u.discordId=id;u.uid="discord-"+id;u.id="discord-"+id;u.userId="discord-"+id;u.key="discord-"+id;}
    var n=nick(u); if(n){u.nickname=n;u.nick=n;u.name=n;u.displayName=n;}
    var p=pubg(u); if(p){u.pubgId=p;u.gameId=p;u.pubgName=p;u.ref=p;}
    var role=roleKey(u.memberRole||u.adminRole||u.userRole||u.authRole||u.role);
    u.memberRole=role;u.userRole=role;u.authRole=role;u.role=role;
    var tier=tierKey(u.memberTier||u.gradeRole||u.tierRole||u.baseRole||u.tier||u.memberTierName||u.tierName);
    u.memberTier=tier;u.gradeRole=tier;u.tierRole=tier;u.baseRole=tier;u.originalRole=tier;u.memberTierName=tierLabel(tier);u.tier=tierLabel(tier);
    var prime=Number(u.prime ?? u.points ?? u.dia ?? u.chicken ?? 0)||0;
    u.prime=prime;u.points=Number(u.points ?? prime)||0;u.dia=prime;
    return u;
  }
  function mergeUsers(){
    var out=[];
    function add(list){(Array.isArray(list)?list:[]).forEach(function(item){if(!item||typeof item!=="object")return;var u=normalize(item);var i=out.findIndex(function(x){return same(x,u);});if(i>=0)out[i]=normalize(Object.assign({},out[i],u));else out.push(u);});}
    for(var i=0;i<arguments.length;i++) add(arguments[i]);
    return out;
  }
  function localUsers(){return [];}
  function writeUserAliases(users){
    /* Supabase 단일 원본: pklUsers/PKL_USERS 로컬 별칭을 만들거나 이벤트로 뿌리지 않는다.
       구버전 코드가 pklUsers를 setItem해도 디스크에서 제거만 하고 화면 데이터로 병합하지 않는다. */
    forgetDiskKey("pklUsers"); forgetDiskKey("PKL_USERS"); forgetDiskKey("pklAdminUsers"); forgetDiskKey("PKL_ADMIN_USERS");
    return [];
  }
  function hydrateFromBootstrap(data){
    if(!data||typeof data!=="object") return;
    if(Array.isArray(data.users) && data.users.length) writeUserAliases(data.users);
    if(Array.isArray(data.match_logs)){
      var matches=data.match_logs.map(function(r){return (r && (r.snapshot || r.raw)) || r;}).filter(Boolean);
      if(matches.length){silentSet(RESULT_MATCH_KEY,matches);emitKey(RESULT_MATCH_KEY);}
    }
    if(data.shared_data && typeof data.shared_data === "object"){
      Object.keys(data.shared_data).forEach(function(key){rememberShared(key,data.shared_data[key]);});
    }
  }
  async function getJSON(url,options){var res=await fetch(url,Object.assign({cache:"no-store"},options||{})); if(!res.ok) throw new Error(String(res.status)); return await res.json();}
  async function refresh(force){
    // 대량 bootstrap/자동 복원 금지. 필요한 키만 getShared(key)로 조회한다.
    lastRefresh=Date.now();
    emit("pkl-supabase-sync-ready");
  }
  function postJSON(url,body){
    return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(res){
      return res.json().catch(function(){return null;}).then(function(data){
        if(!res.ok || (data && data.ok===false)) throw new Error((data && data.message) || String(res.status));
        return data;
      });
    });
  }
  async function fetchShared(key){
    key=String(key||""); if(!isKey(key) || BLOCKED_LOCAL_KEYS[key]) return null;
    var data=await getJSON("/api/pkl-data-store?type=shared&key="+encodeURIComponent(key));
    if(data && data.item && Object.prototype.hasOwnProperty.call(data.item,"value") && data.item.value!==null){rememberShared(key,data.item.value); return data.item.value;}
    return null;
  }
  function saveShared(key,value){
    key=String(key||""); if(!isKey(key) || BLOCKED_LOCAL_KEYS[key]) return Promise.resolve({ok:true, skipped:true, reason:"blocked local restore key"});
    return postJSON("/api/pkl-data-store",{type:"shared",key:key,value:value}).then(function(result){
      rememberShared(key,value);
      return result;
    });
  }
  function saveUsers(users){writeUserAliases(users);return Promise.resolve({ok:true, skipped:true, reason:"Supabase users API is the only writable user source"});}
  function saveMatchList(list){
    list=Array.isArray(list)?list:parse(list,[]);
    if(!Array.isArray(list)) list=[];
    /* 결과표 회차 목록은 match_logs가 아니라 pkl_shared_data의
       PKL_RESULT_MATCHES_V1 하나만 단일 원본으로 저장한다.
       match_logs는 과거 백업/로그 성격이라 결과표 렌더 원본으로 쓰지 않는다. */
    return saveShared(RESULT_MATCH_KEY, list);
  }
  function queueSave(key,value){
    key=String(key||""); if(!isKey(key) || BLOCKED_LOCAL_KEYS[key]) return;
    clearTimeout(saving[key]);
    saving[key]=setTimeout(function(){
      if(USER_KEYS[key]) saveUsers(parse(value,[]));
      else if(key===RESULT_MATCH_KEY) saveMatchList(value);
      else saveShared(key, parse(value,value));
    }, key===RESULT_MATCH_KEY ? 250 : 500);
  }

  Storage.prototype.getItem=function(key){
    key=String(key||"");
    if(this===localStorage && BLOCKED_LOCAL_KEYS[key]) return null;
    if(this===localStorage && isKey(key)) return raw(key);
    return originalGet.apply(this,arguments);
  };
  Storage.prototype.setItem=function(key,value){
    key=String(key||"");
    if(this===localStorage && BLOCKED_LOCAL_KEYS[key]){
      delete memoryStore[key]; delete sharedCache[key]; forgetDiskKey(key);
      return undefined;
    }
    if(this===localStorage && isKey(key)){
      var text=typeof value==="string"?value:JSON.stringify(value);
      memoryStore[key]=text;
      forgetDiskKey(key);
      if(!applying){
        queueSave(key,text);
        emitKey(key);
      }
      return undefined;
    }
    return originalSet.apply(this,arguments);
  };
  Storage.prototype.removeItem=function(key){
    key=String(key||"");
    if(this===localStorage && isKey(key)){
      delete memoryStore[key]; delete sharedCache[key]; forgetDiskKey(key); emitKey(key); return undefined;
    }
    return originalRemove.apply(this,arguments);
  };
  Storage.prototype.clear=function(){
    /* 운영 데이터는 localStorage 복구 대상으로 삼지 않는다. 로그인 세션/UI 임시값은 브라우저 기본 동작 유지. */
    Object.keys(memoryStore).forEach(function(k){if(isKey(k)) delete memoryStore[k];});
    Object.keys(sharedCache).forEach(function(k){delete sharedCache[k];});
    return originalClear.apply(this,arguments);
  };

  window.PKLSupabaseDataSync={
    __pklSupabaseSingleSource20260512:true,
    keys:KEY_LIST,
    refresh:function(){return refresh(true);},
    save:function(key){key=String(key||""); if(isKey(key)) queueSave(key,raw(key));},
    getShared:fetchShared,
    setShared:function(key,value){
      key=String(key||""); if(!isKey(key)) return;
      if(BLOCKED_LOCAL_KEYS[key]){ forgetDiskKey(key); delete memoryStore[key]; delete sharedCache[key]; return Promise.resolve({ok:true, skipped:true, reason:"blocked local restore key"}); }
      var text=typeof value==="string"?value:JSON.stringify(value);
      if(key===RESULT_MATCH_KEY) return saveMatchList(text);
      return saveShared(key, parse(text,text));
    },
    syncUsers:function(){return Promise.resolve({ok:true, skipped:true, reason:"Supabase users API only"});},
    normalizeUser:normalize,
    mergeUsers:mergeUsers
  };
  window.saveSharedData=function(key,value){return window.PKLSupabaseDataSync.setShared(key,value);};

  /* 자동 bootstrap/focus 복원 금지: 각 페이지가 필요한 키만 Supabase에서 1회 조회한다. */
  window.addEventListener("pkl-request-supabase-refresh",function(){refresh(true);});
})();
