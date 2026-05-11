(function(){
  "use strict";
  if(window.PKLUsersSource && window.PKLUsersSource.__adminUsersSingleSource20260511) return;

  var USER_KEYS=["pklUsers","PKL_USERS"];
  var ADMIN_KEY="pklAdminState_v3";
  var loading=false;
  var loadedAt=0;
  var pollTimer=null;

  function esc(v){return String(v==null?"":v).replace(/[&<>\"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m];});}
  function clean(v){return String(v==null?"":v).trim();}
  function low(v){return clean(v).toLowerCase();}
  function parse(raw,fb){try{var v=JSON.parse(raw);return v==null?fb:v;}catch(e){return fb;}}
  function readJson(key,fb){return parse(localStorage.getItem(key),fb);}
  function isTierValue(v){
    if(window.PKLTierBadge && typeof window.PKLTierBadge.normalize==="function") return window.PKLTierBadge.normalize(v)!=="none";
    var s=low(v).replace(/[\s_-]+/g,"");
    return /^(tier[0-4](high|mid|low)?|[0-4]티어(상|중|하)?|beast|짐승)$/.test(s);
  }
  function normTier(v){
    if(window.PKLTierBadge && typeof window.PKLTierBadge.normalize==="function") return window.PKLTierBadge.normalize(v);
    var raw=clean(v); if(!raw || raw==="없음" || low(raw)==="none") return "none";
    var c=low(raw).replace(/[\s_-]+/g,"");
    var map={tier0:"tier0_mid",tier0high:"tier0_high",tier0mid:"tier0_mid",tier0low:"tier0_low",tier1:"tier1_mid",tier1high:"tier1_high",tier1mid:"tier1_mid",tier1low:"tier1_low",tier2:"tier2_mid",tier2high:"tier2_high",tier2mid:"tier2_mid",tier2low:"tier2_low",tier3:"tier3_mid",tier3high:"tier3_high",tier3mid:"tier3_mid",tier3low:"tier3_low",tier4:"tier4_mid",tier4high:"tier4_high",tier4mid:"tier4_mid",tier4low:"tier4_low",beast:"beast",짐승:"beast","0티어":"tier0_mid","0티어상":"tier0_high","0티어중":"tier0_mid","0티어하":"tier0_low","1티어":"tier1_mid","1티어상":"tier1_high","1티어중":"tier1_mid","1티어하":"tier1_low","2티어":"tier2_mid","2티어상":"tier2_high","2티어중":"tier2_mid","2티어하":"tier2_low","3티어":"tier3_mid","3티어상":"tier3_high","3티어중":"tier3_mid","3티어하":"tier3_low","4티어":"tier4_mid","4티어상":"tier4_high","4티어중":"tier4_mid","4티어하":"tier4_low"};
    return map[c]||raw;
  }
  function tierLabel(t){return (window.PKLTierBadge&&window.PKLTierBadge.label)?window.PKLTierBadge.label(t):(t&&t!=="none"?t:"없음");}
  function normRole(v){
    var raw=clean(v), l=raw.toLowerCase();
    if(!raw || raw==="없음" || l==="none") return "user";
    if(isTierValue(raw)) return "user";
    if(["admin","administrator","owner","master","superadmin","manager"].indexOf(l)>=0 || ["관리자","총관리자","마스터","총괄"].indexOf(raw)>=0) return "admin";
    if(["operator","staff","moderator","mod"].indexOf(l)>=0 || ["운영자","운영진","스태프"].indexOf(raw)>=0) return "operator";
    if(["prisoner","jail","banned","blocked"].indexOf(l)>=0 || ["수감자","차단","정지"].indexOf(raw)>=0) return "prisoner";
    if(["guest","temp","temporary"].indexOf(l)>=0 || ["임시","준회원"].indexOf(raw)>=0) return "guest";
    return "user";
  }
  function roleLabel(r){r=normRole(r);return r==="admin"?"관리자":r==="operator"?"운영자":r==="prisoner"?"수감자":r==="guest"?"임시":"일반";}
  function id(u){u=u||{};var v=clean(u.discordId||u.discord_id||u.uid||u.id||u.userId||u.memberId||u.key);return low(v).replace(/^discord-/i,"");}
  function nick(u){u=u||{};return clean(u.nickname||u.nick||u.name||u.displayName||u.discordUsername||u.discord_username||u.username||u.discordGlobalName);}
  function pubg(u){u=u||{};return clean(u.pubgId||u.pubg_id||u.pubgID||u.gameId||u.pubgName||u.ref||u.pubg);}
  function same(a,b){
    var ai=id(a),bi=id(b); if(ai&&bi) return ai===bi;
    var ap=low(pubg(a)),bp=low(pubg(b)); if(ap&&bp) return ap===bp;
    var an=low(nick(a)),bn=low(nick(b)); return !!(an&&bn&&an===bn);
  }
  function stamp(u){var t=Date.parse(clean((u||{}).pklProfileUpdatedAt||(u||{}).profileUpdatedAt||(u||{}).updatedAt||(u||{}).updated_at||(u||{}).modifiedAt));return isNaN(t)?0:t;}
  function normalize(raw){
    var u=Object.assign({},raw&&raw.raw&&typeof raw.raw==="object"?raw.raw:{},raw||{});
    var did=id(u); if(did){u.discordId=did;u.uid="discord-"+did;u.id="discord-"+did;u.userId="discord-"+did;u.key="discord-"+did;}
    var n=nick(u); if(n){u.nickname=n;u.nick=n;u.name=n;u.displayName=n;}
    var p=pubg(u); if(p){u.pubgId=p;u.gameId=p;u.pubgName=p;u.ref=p;}
    var role=normRole(u.memberRole||u.role||u.userRole||u.authRole||u.adminRole); u.memberRole=role;u.userRole=role;u.authRole=role;u.role=role;u.adminRole=roleLabel(role);u.memberRoleName=roleLabel(role);
    var tier=normTier(u.memberTier||u.gradeRole||u.tierRole||u.baseRole||(isTierValue(u.role)?u.role:"")||u.tier||u.memberTierName||u.tierName||u.roleName);
    if(tier&&tier!=="none"){u.memberTier=tier;u.gradeRole=tier;u.tierRole=tier;u.baseRole=tier;u.originalRole=tier;u.memberTierName=tierLabel(tier);u.tier=tierLabel(tier);}else{u.memberTier="none";u.gradeRole="none";u.tierRole="none";u.baseRole="none";u.memberTierName="없음";u.tier="없음";}
    u.prime=Number(u.prime??u.points??u.dia??u.chicken??0)||0;u.points=u.prime;u.dia=u.prime;u.chicken=u.prime;
    u.status=u.status||"approved";u.approved=u.approved!==false;
    return u;
  }
  function mergeOne(oldU,newU,force){
    var old=normalize(oldU||{}), neu=normalize(newU||{}), out=Object.assign({},old);
    force=!!force || !!neu.__pklRemote || !!neu.__pklProfileWrite || (stamp(neu)&&stamp(neu)>=stamp(old));
    Object.keys(neu).forEach(function(k){var nv=neu[k]; if(nv===undefined||nv===null||nv==="") return; if(!force && ["pubgId","gameId","pubgName","ref","memberTier","gradeRole","tierRole","baseRole","originalRole","memberTierName","tier","memberRole","userRole","authRole","adminRole","role"].indexOf(k)>=0 && clean(out[k])) return; out[k]=nv;});
    return normalize(out);
  }
  function mergeLists(){
    var out=[];
    function add(list,force){(Array.isArray(list)?list:[]).forEach(function(raw){if(!raw||typeof raw!=="object") return; var u=normalize(raw); var i=out.findIndex(function(x){return same(x,u);}); if(i>=0) out[i]=mergeOne(out[i],u,force); else out.push(u);});}
    for(var i=0;i<arguments.length;i++){var a=arguments[i]; if(a&&a.__force)add(a.list,true); else add(a,false);}
    return out;
  }
  function localUsers(){
    var st=readJson(ADMIN_KEY,{});
    return mergeLists(readJson("pklUsers",[]),readJson("PKL_USERS",[]),Array.isArray(st&&st.users)?st.users:[]);
  }
  function writeLocal(users,remoteForce){
    var merged=mergeLists(remoteForce?{__force:true,list:users}:users);
    localStorage.setItem("pklUsers",JSON.stringify(merged));
    localStorage.setItem("PKL_USERS",JSON.stringify(merged));
    var st=readJson(ADMIN_KEY,null);
    if(st&&typeof st==="object"){
      st.users=mergeLists(Array.isArray(st.users)?st.users:[], remoteForce?{__force:true,list:merged}:merged);
      localStorage.setItem(ADMIN_KEY,JSON.stringify(st));
      if(window.state&&Array.isArray(window.state.users)) window.state.users=st.users;
    }
    try{window.dispatchEvent(new CustomEvent("pkl-users-updated",{detail:{users:merged}}));window.dispatchEvent(new CustomEvent("pkl-role-data-updated",{detail:{users:merged}}));}catch(e){}
    refreshPageViews();
    return merged;
  }
  function refreshPageViews(){
    setTimeout(function(){
      ["render","renderUserList","renderProfile","renderStats","renderCurrentScreen","renderTierList","renderTeams","renderApplicants","renderJoinList","renderSearch","renderResults","renderSheet","updatePremiumDashboard"].forEach(function(name){
        try{if(typeof window[name]==="function") window[name]();}catch(e){}
      });
    },0);
  }
  async function fetchUsers(){
    var res=await fetch("/api/pkl-users",{cache:"no-store",headers:{"Accept":"application/json"}});
    if(!res.ok) throw new Error("users load failed "+res.status);
    var data=await res.json();
    return Array.isArray(data.users)?data.users:[];
  }
  async function postUsers(users){
    var res=await fetch("/api/pkl-users",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({users:mergeLists(users)})});
    if(!res.ok) throw new Error("users save failed "+res.status);
    var data=await res.json().catch(function(){return {};});
    return Array.isArray(data.users)?data.users:users;
  }
  async function load(force){
    if(loading) return null;
    if(!force && Date.now()-loadedAt<2500) return localUsers();
    loading=true;
    try{
      var remote=(await fetchUsers()).map(function(u){u.__pklRemote=true;return u;});
      loadedAt=Date.now();
      return writeLocal(mergeLists(localUsers(),{__force:true,list:remote}),true);
    }catch(e){
      console.warn("PKL users source load skipped",e);
      return localUsers();
    }finally{loading=false;}
  }
  async function saveUser(user){
    var local=mergeLists(localUsers(),{__force:true,list:[Object.assign({},user,{__pklProfileWrite:true,updatedAt:new Date().toISOString(),pklProfileUpdatedAt:new Date().toISOString()})]});
    writeLocal(local,true);
    try{var saved=await postUsers(local);return writeLocal(saved,true);}catch(e){console.warn("PKL users source save skipped",e);return local;}
  }
  function patchProfile(){
    if(!window.PKLUserProfile || window.PKLUserProfile.__adminUsersPatched20260511) return;
    var oldUpsert=window.PKLUserProfile.upsert;
    var oldSet=window.PKLUserProfile.setUsers;
    window.PKLUserProfile.users=function(){return localUsers();};
    window.PKLUserProfile.findUser=function(u){return localUsers().find(function(x){return same(x,u);})||null;};
    window.PKLUserProfile.hydrate=function(u){var f=window.PKLUserProfile.findUser(u);return f?mergeOne(u,f,true):normalize(u||{});};
    window.PKLUserProfile.upsert=function(u){
      try{if(typeof oldUpsert==="function") oldUpsert(u);}catch(e){}
      saveUser(u);
      return localUsers();
    };
    window.PKLUserProfile.setUsers=function(list,saveRemote){
      var arr=writeLocal(list,true);
      if(saveRemote) postUsers(arr).then(function(saved){writeLocal(saved,true);}).catch(function(e){console.warn("PKL users source set save skipped",e);});
      try{if(typeof oldSet==="function") oldSet(arr,false);}catch(e){}
      return arr;
    };
    window.PKLUserProfile.__adminUsersPatched20260511=true;
  }
  function startPoll(){
    clearInterval(pollTimer);
    pollTimer=},10000);
    window.addEventListener("focus",function(){load(true);});
    document.addEventListener("visibilitychange",function(){if(!document.hidden)load(true);});
  }
  function boot(){patchProfile();writeLocal(localUsers(),false);load(true);startPoll();}

  window.PKLUsersSource={__adminUsersSingleSource20260511:true,load:load,saveUser:saveUser,writeLocal:writeLocal,localUsers:localUsers,normalize:normalize,same:same};
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
  window.addEventListener("pkl-role-data-updated",patchProfile);
})();
