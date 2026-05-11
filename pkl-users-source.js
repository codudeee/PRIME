(function(){
  "use strict";
  if(window.PKLUsersSource && window.PKLUsersSource.__supabaseOnly20260512) return;

  var cache=[];
  var meta={limit:20,offset:0,count:0,q:"",loading:false,loadedAt:0};
  var searchTimer=null;

  function clean(v){return String(v==null?"":v).trim();}
  function low(v){return clean(v).toLowerCase();}
  function id(u){u=u||{};return low(u.discordId||u.discord_id||u.uid||u.id||u.userId||u.memberId||u.key).replace(/^discord-/i,"");}
  function nick(u){u=u||{};return clean(u.nickname||u.nick||u.name||u.displayName||u.discordUsername||u.discord_username||u.username||u.discordGlobalName);}
  function pubg(u){u=u||{};return clean(u.pubgId||u.pubg_id||u.pubgID||u.gameId||u.pubgName||u.ref||u.pubg);}
  function same(a,b){var ai=id(a),bi=id(b);if(ai&&bi)return ai===bi;var ap=low(pubg(a)),bp=low(pubg(b));if(ap&&bp)return ap===bp;var an=low(nick(a)),bn=low(nick(b));return !!(an&&bn&&an===bn);}
  function isTierValue(v){var s=low(v).replace(/[\s_-]+/g,"");return /^(tier[0-4](high|mid|low)?|[0-4]티어(상|중|하)?|beast|짐승)$/.test(s);}
  function normTier(v){
    if(window.PKLTierBadge&&typeof window.PKLTierBadge.normalize==="function")return window.PKLTierBadge.normalize(v);
    var raw=clean(v);if(!raw||raw==="없음"||low(raw)==="none")return "none";
    return raw;
  }
  function tierLabel(t){return (window.PKLTierBadge&&window.PKLTierBadge.label)?window.PKLTierBadge.label(t):(t&&t!=="none"?t:"없음");}
  function normRole(v){
    var raw=clean(v),l=raw.toLowerCase();
    if(!raw||raw==="없음"||l==="none"||isTierValue(raw))return "user";
    if(["admin","administrator","owner","master","superadmin","manager"].indexOf(l)>=0||["관리자","총관리자","마스터","총괄"].indexOf(raw)>=0)return "admin";
    if(["operator","staff","moderator","mod"].indexOf(l)>=0||["운영자","운영진","스태프"].indexOf(raw)>=0)return "operator";
    if(["prisoner","jail","banned","blocked"].indexOf(l)>=0||["수감자","차단","정지"].indexOf(raw)>=0)return "prisoner";
    if(["guest","temp","temporary"].indexOf(l)>=0||["임시","준회원"].indexOf(raw)>=0)return "guest";
    return "user";
  }
  function roleLabel(r){r=normRole(r);return r==="admin"?"관리자":r==="operator"?"운영자":r==="prisoner"?"수감자":r==="guest"?"임시":"일반";}
  function normalize(raw){
    var u=Object.assign({},raw&&raw.raw&&typeof raw.raw==="object"?raw.raw:{},raw||{});
    var did=id(u);if(did){u.discordId=did;u.uid="discord-"+did;u.id="discord-"+did;u.userId="discord-"+did;u.key="discord-"+did;}
    var n=nick(u);if(n){u.nickname=n;u.nick=n;u.name=n;u.displayName=n;}
    var p=pubg(u);if(p){u.pubgId=p;u.gameId=p;u.pubgName=p;u.ref=p;}
    var role=normRole(u.memberRole||u.role||u.userRole||u.authRole||u.adminRole);u.memberRole=role;u.userRole=role;u.authRole=role;u.role=role;u.adminRole=roleLabel(role);u.memberRoleName=roleLabel(role);
    var tier=normTier(u.memberTier||u.gradeRole||u.tierRole||u.baseRole||(isTierValue(u.role)?u.role:"")||u.tier||u.memberTierName||u.tierName||u.roleName);
    if(tier&&tier!=="none"){u.memberTier=tier;u.gradeRole=tier;u.tierRole=tier;u.baseRole=tier;u.originalRole=tier;u.memberTierName=tierLabel(tier);u.tier=tierLabel(tier);}else{u.memberTier="none";u.gradeRole="none";u.tierRole="none";u.baseRole="none";u.memberTierName="없음";u.tier="없음";}
    u.prime=Number(u.prime??u.points??u.dia??u.chicken??0)||0;u.points=u.prime;u.dia=u.prime;u.chicken=u.prime;
    u.status=u.status||"approved";u.approved=u.approved!==false;
    return u;
  }
  function mergeLists(){var out=[];function add(list){(Array.isArray(list)?list:[]).forEach(function(raw){if(!raw||typeof raw!=="object")return;var u=normalize(raw);var i=out.findIndex(function(x){return same(x,u);});if(i>=0)out[i]=normalize(Object.assign({},out[i],u));else out.push(u);});}for(var i=0;i<arguments.length;i++)add(arguments[i]);return out;}
  function applyUsers(users,options){
    options=options||{};
    cache=mergeLists(options.replace?[]:cache,users);
    if(window.state&&Array.isArray(window.state.users)){
      window.state.users=cache.slice();
      if(typeof window.normalizeState==="function")try{window.state=window.normalizeState(window.state);}catch(e){}
    }
    try{window.dispatchEvent(new CustomEvent("pkl-users-updated",{detail:{users:cache.slice(),meta:Object.assign({},meta)}}));window.dispatchEvent(new CustomEvent("pkl-role-data-updated",{detail:{users:cache.slice(),meta:Object.assign({},meta)}}));}catch(e){}
    try{if(typeof window.render==="function")window.render();}catch(e){}
    return cache.slice();
  }
  async function fetchPage(options){
    options=options||{};
    var limit=Number(options.limit||meta.limit||20); if(!isFinite(limit)||limit<1)limit=20; if(limit>100)limit=100;
    var offset=Number(options.offset||0); if(!isFinite(offset)||offset<0)offset=0;
    var q=clean(options.q!=null?options.q:meta.q);
    var url="/api/pkl-users?limit="+encodeURIComponent(limit)+"&offset="+encodeURIComponent(offset);
    if(q)url+="&q="+encodeURIComponent(q);
    var res=await fetch(url,{cache:"no-store",headers:{Accept:"application/json"}});
    if(!res.ok)throw new Error("users load failed "+res.status);
    var data=await res.json();
    meta.limit=limit;meta.offset=offset;meta.q=q;meta.count=Number(data.count||0);meta.loadedAt=Date.now();
    return Array.isArray(data.users)?data.users:[];
  }
  async function load(options){
    if(meta.loading)return cache.slice();
    meta.loading=true;
    try{var users=await fetchPage(options||{});return applyUsers(users,{replace:true});}
    catch(e){console.warn("PKL Supabase users load skipped",e);return cache.slice();}
    finally{meta.loading=false;}
  }
  async function saveUser(user){
    var local=applyUsers([Object.assign({},user,{updatedAt:new Date().toISOString(),pklProfileUpdatedAt:new Date().toISOString()})],{});
    try{
      var res=await fetch("/api/pkl-users",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({user:normalize(user)})});
      if(!res.ok)throw new Error("users save failed "+res.status);
      var data=await res.json().catch(function(){return {};});
      if(data.user)applyUsers([data.user],{});
    }catch(e){console.warn("PKL Supabase user save skipped",e);}
    return local;
  }
  function patchProfile(){
    if(!window.PKLUserProfile||window.PKLUserProfile.__supabaseOnly20260512)return;
    window.PKLUserProfile.users=function(){return cache.slice();};
    window.PKLUserProfile.findUser=function(u){return cache.find(function(x){return same(x,u);})||null;};
    window.PKLUserProfile.hydrate=function(u){var f=window.PKLUserProfile.findUser(u);return f?normalize(Object.assign({},u,f)):normalize(u||{});};
    window.PKLUserProfile.upsert=function(u){saveUser(u);return cache.slice();};
    window.PKLUserProfile.setUsers=function(list){return applyUsers(list,{replace:true});};
    window.PKLUserProfile.__supabaseOnly20260512=true;
  }
  function bindSearch(){
    var input=document.getElementById("search");
    if(!input||input.__pklSupabaseSearchBound)return;
    input.__pklSupabaseSearchBound=true;
    input.addEventListener("input",function(){
      clearTimeout(searchTimer);
      searchTimer=setTimeout(function(){load({limit:20,offset:0,q:input.value});},300);
    });
  }
  function boot(){patchProfile();bindSearch();load({limit:20,offset:0,q:""});window.addEventListener("focus",function(){load({limit:20,offset:0,q:meta.q});});}

  window.PKLUsersSource={__supabaseOnly20260512:true,load:load,loadPage:load,saveUser:saveUser,localUsers:function(){return cache.slice();},users:function(){return cache.slice();},normalize:normalize,same:same,meta:function(){return Object.assign({},meta);}};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
  window.addEventListener("pkl-role-data-updated",patchProfile);
})();
