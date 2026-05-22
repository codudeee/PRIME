(function(){
  "use strict";

  var MEMBER_LABELS={none:"없음",admin:"관리자",operator:"운영자",user:"일반",guest:"임시",prisoner:"수감자"};
  var GRADE_LABELS={
    none:"없음",
    tier0_high:"0티어 상",tier0_mid:"0티어 중",tier0_low:"0티어 하",
    tier1_high:"1티어 상",tier1_mid:"1티어 중",tier1_low:"1티어 하",
    tier2_high:"2티어 상",tier2_mid:"2티어 중",tier2_low:"2티어 하",
    tier3_high:"3티어 상",tier3_mid:"3티어 중",tier3_low:"3티어 하",
    tier4_high:"4티어 상",tier4_mid:"4티어 중",tier4_low:"4티어 하",
    beast:"5티어 하",beast_high:"5티어 상",beast_mid:"5티어 중",beast_low:"5티어 하",tier5_high:"5티어 상",tier5_mid:"5티어 중",tier5_low:"5티어 하",temp:"임시"
  };
  var GRADE_KEYS=Object.keys(GRADE_LABELS);

  function esc(v){return String(v==null?"":v).replace(/[&<>\"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m];});}
  function compact(v){return String(v==null?"":v).trim().replace(/\s+/g,"");}
  function lower(v){return String(v==null?"":v).trim().toLowerCase();}

  function normalizeMemberRole(role){
    var raw=String(role==null?"":role).trim();
    var low=raw.toLowerCase();
    if(!raw||raw==="none"||raw==="없음") return "none";
    if(["admin","manager","owner","master","superadmin"].indexOf(low)>=0||["총관리자","관리자","총괄"].indexOf(raw)>=0) return "admin";
    if(["operator","staff","moderator"].indexOf(low)>=0||["운영자","운영진","스태프"].indexOf(raw)>=0) return "operator";
    if(["prisoner","jail","banned","blocked"].indexOf(low)>=0||["수감자","차단","정지"].indexOf(raw)>=0) return "prisoner";
    if(["user","member","normal","general"].indexOf(low)>=0||["일반","일반회원","일반유저"].indexOf(raw)>=0) return "user";
    if(["guest","temp","temporary"].indexOf(low)>=0||["임시","준회원","비로그인"].indexOf(raw)>=0) return "guest";
    return "guest";
  }

  function normalizeGradeRole(role){
    var raw=String(role==null?"":role).trim();
    if(!raw||raw==="none"||raw==="없음") return "none";
    if(GRADE_KEYS.indexOf(raw)>=0) return raw;
    var c=compact(raw);
    var map={
      "0티어":"tier0_mid","0티어상":"tier0_high","0티어중":"tier0_mid","0티어하":"tier0_low",
      "1티어":"tier1_mid","1티어상":"tier1_high","1티어중":"tier1_mid","1티어하":"tier1_low",
      "2티어":"tier2_mid","2티어상":"tier2_high","2티어중":"tier2_mid","2티어하":"tier2_low",
      "3티어":"tier3_mid","3티어상":"tier3_high","3티어중":"tier3_mid","3티어하":"tier3_low",
      "4티어":"tier4_mid","4티어상":"tier4_high","4티어중":"tier4_mid","4티어하":"tier4_low",
      "짐승":"tier5_low","짐승상":"tier5_high","짐승중":"tier5_mid","짐승하":"tier5_low","5상":"tier5_high","5중":"tier5_mid","5하":"tier5_low","5티어상":"tier5_high","5티어중":"tier5_mid","5티어하":"tier5_low","5티어 상":"tier5_high","5티어 중":"tier5_mid","5티어 하":"tier5_low","임시":"temp"
    };
    var l=lower(raw).replace(/[\s_-]+/g,"");
    var aliases={
      tier0:"tier0_mid",tier0high:"tier0_high",tier0mid:"tier0_mid",tier0low:"tier0_low",
      tier1:"tier1_mid",tier1high:"tier1_high",tier1mid:"tier1_mid",tier1low:"tier1_low",
      tier2:"tier2_mid",tier2high:"tier2_high",tier2mid:"tier2_mid",tier2low:"tier2_low",
      tier3:"tier3_mid",tier3high:"tier3_high",tier3mid:"tier3_mid",tier3low:"tier3_low",
      tier4:"tier4_mid",tier4high:"tier4_high",tier4mid:"tier4_mid",tier4low:"tier4_low",
      tier5:"tier5_mid",tier5high:"tier5_high",tier5mid:"tier5_mid",tier5low:"tier5_low",beast:"tier5_low",beasthigh:"tier5_high",beastmid:"tier5_mid",beastlow:"tier5_low",temp:"temp"
    };
    return map[c]||aliases[l]||"none";
  }

  function memberRoleName(role){return MEMBER_LABELS[normalizeMemberRole(role)]||MEMBER_LABELS.temp;}
  function memberRoleClass(role){return "member-role-"+normalizeMemberRole(role);}
  function gradeRoleName(role){return GRADE_LABELS[normalizeGradeRole(role)]||GRADE_LABELS.none;}
  function gradeRoleClass(role){var r=normalizeGradeRole(role);if(r.indexOf("tier0")===0)return"role-tier0";if(r.indexOf("tier1")===0)return"role-tier1";if(r.indexOf("tier2")===0)return"role-tier2";if(r.indexOf("tier3")===0)return"role-tier3";if(r.indexOf("tier4")===0)return"role-tier4";if(r.indexOf("tier5")===0)return"role-beast";return"role-"+r;}

  function readJson(key,fallback){try{var raw=localStorage.getItem(key);if(!raw)return fallback;var parsed=JSON.parse(raw);return parsed==null?fallback:parsed;}catch(e){return fallback;}}
  function cleanKey(v){return String(v==null?"":v).trim().toLowerCase();}
  function strongUserKeys(u){
    u=u||{};
    var direct=cleanKey(u.discord_id||u.discordId||u.discordID||u.userDiscordId||u.discord).replace(/^discord-/,"");
    var arr=direct?[direct]:[];
    [u.uid,u.id,u.userId].forEach(function(raw){raw=cleanKey(raw);if(/^discord-/.test(raw))arr.push(raw.replace(/^discord-/,""));});
    return arr.filter(function(v,i){return !!v && arr.indexOf(v)===i && !/^approved-\d+$/.test(v) && !/^account-\d+-\d+$/.test(v) && !/^pending-/.test(v) && !/^uid-/.test(v);});
  }
  function legacyUserKeys(u){
    u=u||{};
    return [u.loginId,u.username,u.pubgId,u.gameId,u.ref]
      .map(cleanKey)
      .filter(Boolean);
  }
  function sameUser(a,b){
    if(!a||!b)return false;
    var ak=strongUserKeys(a),bk=strongUserKeys(b);
    if(ak.length&&bk.length)return ak.some(function(v){return bk.indexOf(v)>=0;});
    if(ak.length||bk.length)return false;
    var al=legacyUserKeys(a),bl=legacyUserKeys(b);
    return al.length&&bl.length&&al.some(function(v){return bl.indexOf(v)>=0;});
  }
  function mergeUserLists(){
    /* Supabase 단일 원본: role/tier 시스템은 더 이상 localStorage의
       pklUsers / pklAdminState_v3를 읽어서 배지를 되살리지 않는다. */
    return [];
  }
  function readUsers(){
    if(window.PKLUserProfile&&typeof window.PKLUserProfile.users==="function")return window.PKLUserProfile.users();
    return [];
  }
  function hydrateUser(user){
    user=user||{};
    if(window.PKLUserProfile&&typeof window.PKLUserProfile.hydrate==="function")return window.PKLUserProfile.hydrate(user);
    var users=readUsers();
    var found=users.find(function(u){return sameUser(user,u);});
    return found?Object.assign({},user,found):Object.assign({},user);
  }
  function roleSnapshotForUser(user){
    var u=hydrateUser(user);
    var grade=gradeRoleFromUser(u);
    var member=memberRoleFromUser(u);
    var finalRole=member==="prisoner"?"prisoner":(grade&&grade!=="none"?grade:(member&&member!=="none"?member:"guest"));
    return {
      role:finalRole,
      memberRole:member,
      gradeRole:grade,
      roleName:member==="prisoner"?memberRoleName(member):(grade&&grade!=="none"?gradeRoleName(grade):memberRoleName(member)),
      tier:grade&&grade!=="none"?gradeRoleName(grade):"없음"
    };
  }
  function hasTierValue(v){return v!==null&&v!==undefined&&String(v).trim()!=="";}
  function gradeRoleFromUser(u){
    u=hydrateUser(u);
    var primary=[u&&u.memberTier,u&&u.gradeRole,u&&u.tierRole,u&&u.tier];
    for(var p=0;p<primary.length;p++){
      if(hasTierValue(primary[p])) return normalizeGradeRole(primary[p]);
    }
    var legacy=[u&&u.baseRole,u&&u.originalRole,u&&u.memberTierName,u&&u.tierName,u&&u.roleName];
    for(var i=0;i<legacy.length;i++){
      if(!hasTierValue(legacy[i])) continue;
      var r=normalizeGradeRole(legacy[i]);
      if(r&&r!=="none") return r;
    }
    return "none";
  }
  function memberRoleFromUser(u){
    u=hydrateUser(u);
    var grade=gradeRoleFromUser(u);
    var fields=[u.memberRole,u.userRole,u.authRole,u.adminRole,u.role];
    for(var i=0;i<fields.length;i++){
      if(normalizeGradeRole(fields[i])!=="none") continue;
      var r=normalizeMemberRole(fields[i]);
      if(!r||r==="none") continue;
      if(grade!=="none" && (r==="temp" || r==="member")) return "none";
      return r;
    }
    return grade!=="none" ? "none" : "guest";
  }

  function memberBadge(role,extraClass){var r=normalizeMemberRole(role);if(r==="none")return"";return '<span class="member-role-badge '+memberRoleClass(r)+(extraClass?' '+esc(extraClass):'')+'" data-pkl-member-role="'+esc(r)+'">'+esc(memberRoleName(r))+'</span>';}
  function gradeBadge(role,extraClass){if(window.PKLTierBadge&&typeof window.PKLTierBadge.render==="function"){return window.PKLTierBadge.render(role,{extraClass:extraClass||""});}var r=normalizeGradeRole(role);if(!r||r==="none")return"";return '<span class="pkl-tier-badge tier-mark '+gradeRoleClass(r)+(extraClass?' '+esc(extraClass):'')+'" data-pkl-tier-badge="'+esc(r)+'" data-pkl-grade="'+esc(gradeRoleName(r))+'">'+esc(gradeRoleName(r))+'</span>';}
  function memberBadgeForUser(user,extraClass){return memberBadge(memberRoleFromUser(user),extraClass);}
  function gradeBadgeForUser(user,extraClass){if(window.PKLTierBadge&&typeof window.PKLTierBadge.renderForUser==="function"){return window.PKLTierBadge.renderForUser(user,{extraClass:extraClass||""});}return gradeBadge(gradeRoleFromUser(user),extraClass);}
  function nameFromUser(user){user=hydrateUser(user);return user.nickname||user.nick||user.name||user.displayName||user.pubgId||"";}
  function userLine(user,opt){opt=opt||{};var badge=opt.grade?gradeBadgeForUser(user,opt.badgeClass):memberBadgeForUser(user,opt.badgeClass);return '<span class="user-role-line '+esc(opt.lineClass||'')+'">'+badge+'<span class="user-name '+esc(opt.nameClass||'')+'">'+esc(nameFromUser(user))+'</span></span>';}

  function injectStyle(){
    var old=document.getElementById("pklRoleSystemStyle");
    if(old) old.remove();
    var style=document.createElement("style");
    style.id="pklRoleSystemStyle";
    style.textContent='\
/* PKL role/grade badge single final style - admin standard */\
.user-role-line,.name-role-line,.pkl-role-user-line{display:flex !important;align-items:center !important;justify-content:flex-start !important;gap:7px !important;min-width:0 !important;max-width:100% !important;min-height:24px !important;height:auto !important;line-height:1 !important;padding:0 !important;white-space:nowrap !important;overflow:visible !important;contain:none !important;}\
.user-role-line .user-name,.name-role-line .user-name,.pkl-role-user-line .pkl-role-nickname{display:inline-block !important;flex:0 1 auto !important;min-width:0 !important;min-height:0 !important;height:auto !important;max-width:130px !important;padding:0 !important;margin:0 !important;overflow:hidden !important;text-overflow:ellipsis !important;white-space:nowrap !important;line-height:1.15 !important;color:#fff !important;font-weight:1000 !important;text-align:left !important;}\
.name-role-line .user-name{max-width:190px !important;font-size:21px !important;letter-spacing:-.4px !important;}\
.user-card.named-role-layout{grid-template-columns:38px minmax(0,1fr) !important;min-height:68px !important;padding:12px 14px !important;overflow:visible !important;contain:none !important;}\
.user-card.named-role-layout .user-main{display:flex !important;flex-direction:column !important;align-items:flex-start !important;justify-content:center !important;gap:6px !important;min-width:0 !important;overflow:visible !important;contain:none !important;}\
.user-card.named-role-layout .user-sub{width:100% !important;margin-top:0 !important;color:#aeb7d8 !important;font-size:11px !important;font-weight:850 !important;line-height:1.15 !important;overflow:hidden !important;text-overflow:ellipsis !important;white-space:nowrap !important;text-align:left !important;}\
.member-role-badge,.user-card .member-role-badge,.profile-head .member-role-badge,.badges .member-role-badge,.name-role-line .member-role-badge,.user-role-line .member-role-badge,.top .pkl-welcome-role-badge{flex:0 0 auto !important;box-sizing:border-box !important;min-width:46px !important;height:24px !important;padding:0 10px !important;border-radius:999px !important;font-size:11px !important;font-weight:1000 !important;letter-spacing:.35px !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;white-space:nowrap !important;line-height:22px !important;vertical-align:middle !important;backdrop-filter:blur(8px) !important;text-shadow:none !important;filter:none !important;clip-path:none !important;transform:none !important;margin:0 !important;position:relative !important;z-index:3 !important;overflow:visible !important;outline:none !important;}\
.member-role-admin,.user-card .member-role-admin,.profile-head .member-role-admin,.badges .member-role-admin,.name-role-line .member-role-admin,.user-role-line .member-role-admin,.top .pkl-welcome-role-badge.member-role-admin,[data-pkl-member-role="admin"],.member-role-manager,.user-card .member-role-manager,.profile-head .member-role-manager,.badges .member-role-manager,.name-role-line .member-role-manager,.user-role-line .member-role-manager,.top .pkl-welcome-role-badge.member-role-manager,[data-pkl-member-role="manager"]{background:rgba(20,0,0,.96) !important;background-image:none !important;color:#ff4d4d !important;border:2px solid #ff4d4d !important;box-shadow:0 0 6px rgba(255,0,0,.55),0 0 15px rgba(255,0,0,.34),inset 0 0 6px rgba(255,0,0,.26) !important;text-shadow:none !important;filter:none !important;}\
.member-role-operator,.user-card .member-role-operator,.profile-head .member-role-operator,.badges .member-role-operator,.name-role-line .member-role-operator,.user-role-line .member-role-operator,.top .pkl-welcome-role-badge.member-role-operator,[data-pkl-member-role="operator"]{background:rgba(10,10,10,.96) !important;background-image:none !important;color:#ffffff !important;border:2px solid #ffffff !important;box-shadow:0 0 6px rgba(255,255,255,.55),0 0 15px rgba(255,255,255,.34),inset 0 0 6px rgba(255,255,255,.24) !important;text-shadow:none !important;filter:none !important;}\
.member-role-temp,.user-card .member-role-temp,.profile-head .member-role-temp,.badges .member-role-temp,.name-role-line .member-role-temp,.user-role-line .member-role-temp,.top .pkl-welcome-role-badge.member-role-temp,[data-pkl-member-role="temp"]{background:rgba(20,12,38,.92) !important;background-image:none !important;color:#d8b4fe !important;border:1px solid rgba(168,85,247,.50) !important;box-shadow:0 0 8px rgba(168,85,247,.24),inset 0 1px 0 rgba(255,255,255,.06) !important;text-shadow:none !important;filter:none !important;}\
.member-role-member,.user-card .member-role-member,.profile-head .member-role-member,.badges .member-role-member,.name-role-line .member-role-member,.user-role-line .member-role-member,.top .pkl-welcome-role-badge.member-role-member,[data-pkl-member-role="member"]{background:rgba(15,23,42,.52) !important;background-image:none !important;color:#e5e7eb !important;border:1px solid rgba(148,163,184,.34) !important;box-shadow:0 0 5px rgba(148,163,184,.12),inset 0 1px 0 rgba(255,255,255,.05) !important;text-shadow:none !important;filter:none !important;}\
.member-role-prisoner,.user-card .member-role-prisoner,.profile-head .member-role-prisoner,.badges .member-role-prisoner,.name-role-line .member-role-prisoner,.user-role-line .member-role-prisoner,.top .pkl-welcome-role-badge.member-role-prisoner,[data-pkl-member-role="prisoner"]{background:rgba(10,10,10,.96) !important;background-image:none !important;color:#ff4d4d !important;border:1px solid rgba(255,77,77,.62) !important;box-shadow:0 0 7px rgba(255,77,77,.28),inset 0 0 6px rgba(255,77,77,.16) !important;text-shadow:none !important;filter:none !important;}\
.member-role-none{display:none !important;}\
.tier-mark,.user-card .tier-mark,.profile-head .tier-mark,.badges .tier-mark,.name-role-line .tier-mark,.user-role-line .tier-mark{flex:0 0 auto !important;box-sizing:border-box !important;min-width:62px !important;min-height:24px !important;height:24px !important;padding:0 10px !important;border-radius:999px !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;font-size:11px !important;font-weight:1000 !important;letter-spacing:.25px !important;line-height:24px !important;white-space:nowrap !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),rgba(10,10,18,.82) !important;border:1px solid rgba(255,255,255,.14) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 0 7px rgba(0,0,0,.34) !important;text-shadow:none !important;filter:none !important;clip-path:none !important;transform:none !important;margin:0 !important;position:relative !important;z-index:2 !important;overflow:visible !important;backdrop-filter:blur(8px) !important;-webkit-backdrop-filter:blur(8px) !important;}\
.tier-mark.role-tier0{color:#ff8a8a !important;border-color:rgba(255,95,95,.42) !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),linear-gradient(135deg,rgba(95,15,20,.78),rgba(18,8,12,.92)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 0 8px rgba(255,70,70,.18) !important;}\
.tier-mark.role-tier1{color:#ffe680 !important;border-color:rgba(255,220,90,.42) !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),linear-gradient(135deg,rgba(90,70,12,.78),rgba(22,17,7,.92)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 0 8px rgba(255,216,80,.16) !important;}\
.tier-mark.role-tier2{color:#8df7a8 !important;border-color:rgba(90,230,130,.40) !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),linear-gradient(135deg,rgba(16,78,42,.78),rgba(7,20,13,.92)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 0 8px rgba(90,230,130,.15) !important;}\
.tier-mark.role-tier3{color:#8fd3ff !important;border-color:rgba(110,190,255,.40) !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),linear-gradient(135deg,rgba(18,52,105,.78),rgba(7,13,28,.92)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 0 8px rgba(110,190,255,.15) !important;}\
.tier-mark.role-tier4{color:#d8b4fe !important;border-color:rgba(200,150,255,.40) !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),linear-gradient(135deg,rgba(64,30,110,.78),rgba(16,9,28,.92)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 0 8px rgba(200,150,255,.15) !important;}\
.tier-mark.role-beast{color:#d9a36c !important;border-color:rgba(210,150,95,.38) !important;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.018)),linear-gradient(135deg,rgba(78,47,24,.78),rgba(20,12,7,.92)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.11),0 0 8px rgba(210,150,95,.14) !important;}\
.tier-mark.role-none{display:none !important;}\
#badges{display:none !important;}\
';
    document.head.appendChild(style);
  }


  var ROLE_RANK={guest:0,user:1,operator:2,admin:3};
  function roleRank(role){return ROLE_RANK[normalizeMemberRole(role)]||0;}
  function loginStrongId(user){
    return cleanKey(user && (user.discordId || user.discord_id || user.uid || user.id || user.userId)).replace(/^discord-/i,"");
  }
  function currentUser(){
    try{if(localStorage.getItem("pklManualLogout")==="1")return null;}catch(e){}
    var fresh=window.__PKL_CURRENT_SUPABASE_USER;
    if(fresh&&typeof fresh==="object"&&loginStrongId(fresh)) return hydrateUser(fresh);
    var keys=["pklLoginUser","pklCurrentUser","pklLoggedInUser","pkl_current_user","pklUser","discordUser"];
    var candidates=[];
    for(var i=0;i<keys.length;i++){
      try{
        var raw=localStorage.getItem(keys[i]) || sessionStorage.getItem(keys[i]);
        if(!raw)continue;
        var u=JSON.parse(raw);
        if(u&&typeof u==="object")candidates.push({key:keys[i],user:u,id:loginStrongId(u)});
      }catch(e){}
    }
    if(!candidates.length)return null;
    var picked=candidates.find(function(c){return c.key==="pklLoginUser"&&c.id;})
      || candidates.find(function(c){return c.key==="pklCurrentUser"&&c.id;})
      || candidates.find(function(c){return c.key==="pklLoggedInUser"&&c.id;})
      || candidates.find(function(c){return c.id;})
      || candidates[0];
    return hydrateUser(picked.user);
  }
  function isProtectedOwnerUser(u){
    // DB role only. No nickname/email/handle-based owner bypass.
    return false;
  }
  function accessRoleFromUser(user){
    if(!user) return "guest";
    var u=hydrateUser(user);
    var fields=[u.memberRole,u.adminRole,u.userRole,u.authRole,u.permission,u.type,u.memberRoleName,u.roleName,u.role];
    for(var i=0;i<fields.length;i++){
      if(normalizeGradeRole(fields[i])!=="none") continue;
      var r=normalizeMemberRole(fields[i]);
      if(r&&r!=="none"&&r!=="guest") return r;
    }
    return "user";
  }
  function currentAccessRole(){return accessRoleFromUser(currentUser());}
  function hasRole(user,minRole){return roleRank(accessRoleFromUser(user))>=roleRank(minRole||"user");}
  function currentHasRole(minRole){return roleRank(currentAccessRole())>=roleRank(minRole||"user");}
  function roleLabel(role){return memberRoleName(normalizeMemberRole(role||"guest"));}
  function showAccessModal(message,title){
    if(typeof window.pklAlert==="function") return window.pklAlert(message,title||"권한 제한");
    return new Promise(function(resolve){
      var modal=document.getElementById("pklAccessModal");
      if(!modal){
        var style=document.createElement("style");
        style.id="pklAccessModalStyle";
        style.textContent='#pklAccessModal{position:fixed;inset:0;z-index:999999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);backdrop-filter:blur(14px)}#pklAccessModal.open{display:flex}.pkl-access-card{width:min(420px,calc(100vw - 40px));border-radius:24px;border:1px solid rgba(216,180,254,.34);background:radial-gradient(circle at 50% 0%,rgba(168,85,247,.26),transparent 48%),linear-gradient(180deg,rgba(24,12,46,.96),rgba(7,7,17,.98));box-shadow:0 34px 110px rgba(0,0,0,.82),0 0 44px rgba(168,85,247,.20);padding:28px 24px;text-align:center;color:#fff}.pkl-access-card h2{margin:0 0 12px;font-size:20px}.pkl-access-card p{margin:0;color:rgba(248,244,255,.82);font-weight:850;line-height:1.6;white-space:pre-line}.pkl-access-card button{margin-top:22px;height:42px;min-width:110px;border-radius:13px;border:1px solid rgba(168,85,247,.62);background:linear-gradient(135deg,rgba(124,58,237,.72),rgba(28,12,54,.96));color:#fff;font-weight:1000}';
        document.head.appendChild(style);
        modal=document.createElement("div");
        modal.id="pklAccessModal";
        modal.innerHTML='<div class="pkl-access-card" role="dialog" aria-modal="true"><h2></h2><p></p><button type="button">확인</button></div>';
        document.body.appendChild(modal);
      }
      modal.querySelector("h2").textContent=title||"권한 제한";
      modal.querySelector("p").textContent=message||"접근 권한이 없습니다.";
      modal.classList.add("open");
      modal.querySelector("button").onclick=function(){modal.classList.remove("open");resolve(true);};
    });
  }
  function enforceVisibility(root){
    root=root||document;
    var current=currentAccessRole();
    if(document.body){
      document.body.dataset.pklAccessRole=current;
      Object.keys(ROLE_RANK).forEach(function(r){document.body.classList.toggle("pkl-role-"+r,current===r);});
      document.body.classList.toggle("pkl-role-admin-or-operator",currentHasRole("operator"));
    }
    Array.prototype.slice.call(root.querySelectorAll("[data-min-role]")).forEach(function(el){
      var ok=currentHasRole(el.getAttribute("data-min-role")||"user");
      el.hidden=!ok;
      el.classList.toggle("pkl-access-hidden",!ok);
      if(!ok && /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.disabled=true;
      if(ok && el.hasAttribute("data-pkl-was-disabled-by-access")){el.disabled=false;el.removeAttribute("data-pkl-was-disabled-by-access");}
      if(!ok && /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute("data-pkl-was-disabled-by-access","1");
    });
  }
  function bindAccessClickGuard(){
    if(window.__pklAccessClickGuardBound) return;
    window.__pklAccessClickGuardBound=true;
    document.addEventListener("click",function(e){
      var el=e.target&&e.target.closest?e.target.closest("[data-min-role]"):null;
      if(!el) return;
      var min=el.getAttribute("data-min-role")||"user";
      if(currentHasRole(min)) return;
      e.preventDefault();
      e.stopPropagation();
      showAccessModal(roleLabel(min)+" 이상 권한이 필요합니다.","권한 제한");
    },true);
  }


  function writeLoginSnapshot(user){
    if(!user || !loginStrongId(user)) return;
    var keys=["pklLoginUser","pklCurrentUser","pklLoggedInUser","pkl_current_user"];
    keys.forEach(function(k){try{localStorage.setItem(k,JSON.stringify(user));sessionStorage.removeItem(k);}catch(e){}});
    try{localStorage.removeItem("discordUser");sessionStorage.removeItem("discordUser");}catch(e){}
  }
  async function refreshCurrentUserFromServer(){
    var local=currentUser();
    var did=loginStrongId(local).replace(/^discord-/,'');
    if(!did || refreshCurrentUserFromServer._loading) return null;
    refreshCurrentUserFromServer._loading=true;
    try{
      var res=await fetch('/api/pkl-users?limit=20&offset=0&discordId='+encodeURIComponent(did),{cache:'no-store',headers:{Accept:'application/json'}});
      if(!res.ok) return null;
      var data=await res.json();
      var users=Array.isArray(data&&data.users)?data.users:[];
      var found=users.find(function(u){return loginStrongId(u).replace(/^discord-/,'')===did;});
      if(found){ writeLoginSnapshot(found); try{window.dispatchEvent(new CustomEvent('pkl-current-user-refreshed',{detail:{user:found}}));}catch(e){} enforceVisibility(document); return found; }
    }catch(e){}
    finally{refreshCurrentUserFromServer._loading=false;}
    return null;
  }

  window.PKLRoleSystem={
    escape:esc,
    normalize:normalizeMemberRole,
    normalizeMemberRole:normalizeMemberRole,
    memberRoleName:memberRoleName,
    memberRoleClass:memberRoleClass,
    memberRoleFromUser:memberRoleFromUser,
    memberBadge:memberBadge,
    memberBadgeForUser:memberBadgeForUser,
    normalizeGradeRole:normalizeGradeRole,
    gradeRoleName:gradeRoleName,
    gradeRoleClass:gradeRoleClass,
    gradeRoleFromUser:gradeRoleFromUser,
    gradeBadge:gradeBadge,
    gradeBadgeForUser:gradeBadgeForUser,
    hydrateUser:hydrateUser,
    userLine:userLine,
    injectStyle:injectStyle,
    roleRank:roleRank,
    accessRoleFromUser:accessRoleFromUser,
    currentUser:currentUser,
    currentAccessRole:currentAccessRole,
    hasRole:hasRole,
    currentHasRole:currentHasRole,
    showAccessModal:showAccessModal,
    enforceVisibility:enforceVisibility,
    bindAccessClickGuard:bindAccessClickGuard,
    refreshCurrentUserFromServer:refreshCurrentUserFromServer
  };

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){injectStyle();enforceVisibility(document);bindAccessClickGuard();refreshCurrentUserFromServer();}); else {injectStyle();enforceVisibility(document);bindAccessClickGuard();refreshCurrentUserFromServer();}
})();


// PKL_ROLE_KOREAN_MAPPING_FINAL
(function(){
  if(window.__PKL_ROLE_KOREAN_MAPPING_FINAL__) return;
  window.__PKL_ROLE_KOREAN_MAPPING_FINAL__ = true;
  function clean(v){return String(v == null ? "" : v).trim();}
  window.PKLNormalizeRole = function(v){
    const raw = clean(v).toLowerCase();
    if(["관리자","총관리자","admin","administrator","owner","master","superadmin"].includes(raw)) return "admin";
    if(["운영자","operator","staff","moderator","mod"].includes(raw)) return "operator";
    if(["일반","회원","user","member"].includes(raw)) return "user";
    if(["임시","손님","guest","pending"].includes(raw)) return "guest";
    return raw || "guest";
  };
  window.PKLCanOperate = function(user){
    const r = window.PKLNormalizeRole(user && (user.role || user.authRole || user.userRole || user.memberRole || user.adminRole));
    return r === "admin" || r === "operator";
  };
  window.PKLIsAdminOnly = function(user){
    return window.PKLNormalizeRole(user && (user.role || user.authRole || user.userRole || user.memberRole || user.adminRole)) === "admin";
  };
})();
