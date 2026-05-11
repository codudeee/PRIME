(function(){
  "use strict";
  if(window.PKLUserProfile && window.PKLUserProfile.__singleSourceFinal20260509) return;
  var USER_KEYS={pklUsers:true,PKL_USERS:true};
  var ADMIN_KEY="pklAdminState_v3";
  var applying=false;
  var originalSet=localStorage.setItem.bind(localStorage);
  function esc(v){return String(v==null?"":v).replace(/[&<>\"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m];});}
  function parse(raw,fb){try{var v=JSON.parse(raw);return v==null?fb:v;}catch(e){return fb;}}
  function read(k,fb){return parse(localStorage.getItem(k),fb);}
  function clean(v){return String(v==null?"":v).trim();}
  function low(v){return clean(v).toLowerCase();}
  function useful(v){var s=clean(v);return !!s&&s!=="undefined"&&s!=="null"&&s!=="없음"&&s!=="none";}
  function compact(v){return clean(v).replace(/[\s_-]+/g,"").toLowerCase();}
  function normTier(v){if(window.PKLTierBadge&&window.PKLTierBadge.normalize)return window.PKLTierBadge.normalize(v);var c=compact(v);var m={tier0:"tier0_mid",tier0high:"tier0_high",tier0mid:"tier0_mid",tier0low:"tier0_low",tier1:"tier1_mid",tier1high:"tier1_high",tier1mid:"tier1_mid",tier1low:"tier1_low",tier2:"tier2_mid",tier2high:"tier2_high",tier2mid:"tier2_mid",tier2low:"tier2_low",tier3:"tier3_mid",tier3high:"tier3_high",tier3mid:"tier3_mid",tier3low:"tier3_low",tier4:"tier4_mid",tier4high:"tier4_high",tier4mid:"tier4_mid",tier4low:"tier4_low","0티어":"tier0_mid","0티어상":"tier0_high","0티어중":"tier0_mid","0티어하":"tier0_low","1티어":"tier1_mid","1티어상":"tier1_high","1티어중":"tier1_mid","1티어하":"tier1_low","2티어":"tier2_mid","2티어상":"tier2_high","2티어중":"tier2_mid","2티어하":"tier2_low","3티어":"tier3_mid","3티어상":"tier3_high","3티어중":"tier3_mid","3티어하":"tier3_low","4티어":"tier4_mid","4티어상":"tier4_high","4티어중":"tier4_mid","4티어하":"tier4_low",beast:"beast",짐승:"beast",temp:"temp",임시:"temp",prisoner:"prisoner",수감자:"prisoner"}; if(!c||c==="none"||c==="없음")return "none"; return m[c]||clean(v)||"none";}
  function tierLabel(t){if(window.PKLTierBadge&&window.PKLTierBadge.label)return window.PKLTierBadge.label(t);t=normTier(t);var m={none:"없음",tier0_high:"0티어 상",tier0_mid:"0티어 중",tier0_low:"0티어 하",tier1_high:"1티어 상",tier1_mid:"1티어 중",tier1_low:"1티어 하",tier2_high:"2티어 상",tier2_mid:"2티어 중",tier2_low:"2티어 하",tier3_high:"3티어 상",tier3_mid:"3티어 중",tier3_low:"3티어 하",tier4_high:"4티어 상",tier4_mid:"4티어 중",tier4_low:"4티어 하",beast:"짐승",temp:"임시",prisoner:"수감자"};return m[t]||t||"없음";}
  function isTier(v){var t=normTier(v);return !!t&&t!=="none";}
  function normRole(v){var raw=clean(v),l=raw.toLowerCase(); if(!raw||raw==="없음"||l==="none")return "user"; if(isTier(raw))return "user"; if(["admin","administrator","owner","master","superadmin","manager"].indexOf(l)>=0||["관리자","총관리자","총괄"].indexOf(raw)>=0)return "admin"; if(["operator","staff","moderator","mod"].indexOf(l)>=0||["운영자","운영진","스태프"].indexOf(raw)>=0)return "operator"; if(["guest","temp","temporary"].indexOf(l)>=0||["임시","준회원","비로그인"].indexOf(raw)>=0)return "guest"; return "user";}
  function roleLabel(r){r=normRole(r);return r==="admin"?"관리자":r==="operator"?"운영자":r==="guest"?"임시":"일반";}
  function id(u){u=u||{};return low(u.discordId||u.uid||u.id||u.userId||u.memberId||u.key);}
  function nick(u){u=u||{};return clean(u.nickname||u.nick||u.name||u.displayName||u.discordGlobalName||u.discordUsername||u.username);}
  function pubg(u){u=u||{};return clean(u.pubgId||u.pubgID||u.gameId||u.pubgName||u.pubg||u.ref);}
  function same(a,b){var ai=id(a),bi=id(b); if(ai&&bi)return ai===bi; var ap=low(pubg(a)),bp=low(pubg(b)); if(ap&&bp)return ap===bp; var an=low(nick(a)),bn=low(nick(b)); return !!(an&&bn&&an===bn);}
  function stamp(u){u=u||{};var s=clean(u.pklProfileUpdatedAt||u.profileUpdatedAt||u.updatedAt||u.modifiedAt||u.savedAt);var t=Date.parse(s);return isNaN(t)?0:t;}
  function normalize(u){
    u=Object.assign({},u||{});
    var n=nick(u); if(n){u.nickname=n;u.nick=n;u.name=n;u.displayName=n;}
    var p=pubg(u); if(p){u.pubgId=p;u.gameId=p;u.pubgName=p;u.ref=p;}
    var ident=id(u); if(ident){u.discordId=u.discordId||ident;u.uid=u.uid||ident;u.id=u.id||ident;u.userId=u.userId||ident;u.key=u.key||ident;}
    var role=normRole(u.memberRole||u.adminRole||u.userRole||u.authRole||u.role); u.memberRole=role;u.userRole=role;u.authRole=role;u.adminRole=roleLabel(role);u.role=role;
    var tier=normTier(u.memberTier||u.gradeRole||u.tierRole||u.baseRole||(isTier(u.role)?u.role:"")||u.tier||u.memberTierName||u.tierName||u.roleName); if(tier&&tier!=="none"){u.memberTier=tier;u.gradeRole=tier;u.tierRole=tier;u.baseRole=tier;u.originalRole=tier;u.memberTierName=tierLabel(tier);u.tier=tierLabel(tier);}else{u.memberTier="none";u.gradeRole="none";u.tierRole="none";u.memberTierName="없음";u.tier="없음";}
    return u;
  }
  function mergeOne(oldU,newU,force){var old=normalize(oldU||{}),neu=normalize(newU||{}),out=Object.assign({},old); var ns=stamp(neu),os=stamp(old); force=!!force||!!neu.__pklProfileWrite||(ns&&ns>=os); Object.keys(neu).forEach(function(k){var nv=neu[k]; if(nv===undefined||nv===null||nv==="")return; if(!force&&["pubgId","gameId","pubgName","ref","memberTier","gradeRole","tierRole","baseRole","originalRole","memberTierName","tier","memberRole","userRole","authRole","adminRole","role"].indexOf(k)>=0&&useful(out[k]))return; out[k]=nv;}); if(force){["pubgId","gameId","pubgName","ref","memberTier","gradeRole","tierRole","baseRole","originalRole","memberTierName","tier","memberRole","userRole","authRole","adminRole","role"].forEach(function(k){if(neu[k]!==undefined&&neu[k]!==null&&neu[k]!=="")out[k]=neu[k];});} return normalize(out);}
  function mergeLists(){var out=[]; function add(list,force){(Array.isArray(list)?list:[]).forEach(function(u){if(!u||typeof u!=="object")return; var i=out.findIndex(function(x){return same(x,u);}); if(i>=0)out[i]=mergeOne(out[i],u,force); else out.push(normalize(u));});} for(var i=0;i<arguments.length;i++){var a=arguments[i]; if(a&&a.__force)add(a.list,true); else add(a,false);} return out;}
  function stateUsers(){var st=read(ADMIN_KEY,{});return st&&Array.isArray(st.users)?st.users:[];}
  function users(){
    /* save-only 정책: pklAdminState_v3 / pklAdminUsers / PKL_ADMIN_USERS의 오래된 값이 pklUsers를 다시 덮어쓰지 못하게 한다. */
    var p=read("pklUsers",[]); if(Array.isArray(p)&&p.length)return mergeLists(p);
    var a=read("PKL_USERS",[]); if(Array.isArray(a)&&a.length)return mergeLists(a);
    return [];
  }
  function findUser(u){var list=users(); return list.find(function(x){return same(x,u);})||null;}
  function hydrate(u){var found=findUser(u); return found?mergeOne(u,found,true):normalize(u||{});}
  function setUsers(list,saveRemote){var arr=mergeLists(list); applying=true; try{originalSet("pklUsers",JSON.stringify(arr));originalSet("PKL_USERS",JSON.stringify(arr));}finally{applying=false;} try{window.dispatchEvent(new CustomEvent("pkl-users-updated",{detail:{users:arr}}));window.dispatchEvent(new CustomEvent("pkl-role-data-updated",{detail:{users:arr}}));}catch(e){} /* Firebase sync removed */} return arr;}
  function upsert(u){var list=users(); var nu=normalize(Object.assign({},u,{pklProfileUpdatedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),__pklProfileWrite:true})); var i=list.findIndex(function(x){return same(x,nu);}); if(i>=0)list[i]=mergeOne(list[i],nu,true); else list.push(nu); return setUsers(list,true);}
  localStorage.setItem=function(key,value){
    if(applying)return originalSet(key,value);
    try{
      if(USER_KEYS[key]){
        var arr=parse(value,[]);
        value=JSON.stringify(mergeLists(arr));
      }else if(key===ADMIN_KEY){
        var st=parse(value,{});
        if(st&&Array.isArray(st.users)){
          /* pklAdminState_v3는 관리화면 로컬 상태로만 보존하고, 유저 단일 원본(pklUsers)을 역으로 덮어쓰지 않는다. */
          value=JSON.stringify(st);
        }
      }
    }catch(e){}
    return originalSet(key,value);
  };
  function renderTierForUser(u,extra){u=hydrate(u); if(window.PKLTierBadge&&window.PKLTierBadge.renderForUser)return window.PKLTierBadge.renderForUser(u,{extraClass:extra||""}); var t=normTier(u.memberTier||u.gradeRole||u.tierRole||u.tier); return t&&t!=="none"?'<span class="pkl-tier-badge tier-mark '+esc(extra||'')+'">'+esc(tierLabel(t))+'</span>':"";}
  function renderRoleForUser(u,extra){u=hydrate(u); if(window.PKLRoleBadge&&window.PKLRoleBadge.renderForUser)return window.PKLRoleBadge.renderForUser(u,{extraClass:extra||""}); return '<span class="member-role-badge '+esc(extra||'')+'">'+esc(roleLabel(u.memberRole||u.role))+'</span>';}
  function renderNameTier(u,opt){opt=opt||{};u=hydrate(u);var name=nick(u)||pubg(u)||"";return '<span class="pkl-userline '+esc(opt.lineClass||'')+'">'+renderTierForUser(u,opt.badgeClass||'')+'<span class="pkl-userline-name '+esc(opt.nameClass||'')+'">'+esc(name)+'</span></span>';}
  window.PKLUserProfile={__singleSourceFinal20260509:true,normalize:normalize,users:users,findUser:findUser,hydrate:hydrate,sameUser:same,upsert:upsert,setUsers:setUsers,renderTierForUser:renderTierForUser,renderRoleForUser:renderRoleForUser,renderNameTier:renderNameTier,escape:esc,normTier:normTier,tierLabel:tierLabel,normRole:normRole,roleLabel:roleLabel};
  function boot(){try{var u=users(); if(u&&u.length)setUsers(u,false);}catch(e){}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
