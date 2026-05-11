(function(){
  "use strict";

  var TIER_LABELS={
    none:"없음",
    tier0_high:"0티어 상",tier0_mid:"0티어 중",tier0_low:"0티어 하",
    tier1_high:"1티어 상",tier1_mid:"1티어 중",tier1_low:"1티어 하",
    tier2_high:"2티어 상",tier2_mid:"2티어 중",tier2_low:"2티어 하",
    tier3_high:"3티어 상",tier3_mid:"3티어 중",tier3_low:"3티어 하",
    tier4_high:"4티어 상",tier4_mid:"4티어 중",tier4_low:"4티어 하",
    beast:"짐승"
  };
  var TIER_KEYS=Object.keys(TIER_LABELS);

  function esc(value){
    return String(value==null?"":value).replace(/[&<>\"']/g,function(mark){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[mark];
    });
  }
  function compact(value){
    return String(value==null?"":value).trim().replace(/[\s_-]+/g,"").toLowerCase();
  }
  function normalize(value){
    if(value===null||value===undefined) return "none";
    var raw=String(value).trim();
    if(!raw||raw==="none"||raw==="없음") return "none";
    if(TIER_KEYS.indexOf(raw)>=0) return raw;

    var key=compact(raw);
    var map={
      tier0:"tier0_mid",tier0high:"tier0_high",tier0mid:"tier0_mid",tier0low:"tier0_low",
      tier1:"tier1_mid",tier1high:"tier1_high",tier1mid:"tier1_mid",tier1low:"tier1_low",
      tier2:"tier2_mid",tier2high:"tier2_high",tier2mid:"tier2_mid",tier2low:"tier2_low",
      tier3:"tier3_mid",tier3high:"tier3_high",tier3mid:"tier3_mid",tier3low:"tier3_low",
      tier4:"tier4_mid",tier4high:"tier4_high",tier4mid:"tier4_mid",tier4low:"tier4_low",
      "0티어":"tier0_mid","0티어상":"tier0_high","0티어중":"tier0_mid","0티어하":"tier0_low",
      "1티어":"tier1_mid","1티어상":"tier1_high","1티어중":"tier1_mid","1티어하":"tier1_low",
      "2티어":"tier2_mid","2티어상":"tier2_high","2티어중":"tier2_mid","2티어하":"tier2_low",
      "3티어":"tier3_mid","3티어상":"tier3_high","3티어중":"tier3_mid","3티어하":"tier3_low",
      "4티어":"tier4_mid","4티어상":"tier4_high","4티어중":"tier4_mid","4티어하":"tier4_low",
      beast:"beast","짐승":"beast"
    };
    return map[key]||"none";
  }
  function label(value){
    return TIER_LABELS[normalize(value)]||TIER_LABELS.none;
  }
  function roleClass(value){
    var key=normalize(value);
    if(key.indexOf("tier0")===0) return "role-tier0";
    if(key.indexOf("tier1")===0) return "role-tier1";
    if(key.indexOf("tier2")===0) return "role-tier2";
    if(key.indexOf("tier3")===0) return "role-tier3";
    if(key.indexOf("tier4")===0) return "role-tier4";
    if(key==="beast") return "role-beast";
    return "role-none";
  }
  function group(value){
    var key=normalize(value);
    if(key.indexOf("tier0")===0) return "tier0";
    if(key.indexOf("tier1")===0) return "tier1";
    if(key.indexOf("tier2")===0) return "tier2";
    if(key.indexOf("tier3")===0) return "tier3";
    if(key.indexOf("tier4")===0) return "tier4";
    return key||"none";
  }
  function tierFromUser(user){
    user=user||{};
    if(window.PKLRoleSystem&&typeof window.PKLRoleSystem.hydrateUser==="function"){
      user=window.PKLRoleSystem.hydrateUser(user);
    }
    var fields=[
      user.memberTier,
      user.gradeRole,
      user.tierRole,
      user.baseRole,
      user.role,
      user.tier,
      user.memberTierName,
      user.tierName,
      user.roleName
    ];
    for(var i=0;i<fields.length;i++){
      var key=normalize(fields[i]);
      if(key&&key!=="none") return key;
    }
    return "none";
  }
  function snapshot(value){
    var key=normalize(value);
    var has=key&&key!=="none";
    var name=has?label(key):"없음";
    var cls=has?roleClass(key):"role-none";
    var grp=has?group(key):"none";
    var className=has?("pkl-tier-badge tier-mark "+cls):"pkl-tier-badge tier-mark role-none";
    var html=has?('<span class="'+esc(className)+'" data-pkl-tier-badge="'+esc(key)+'" data-pkl-tier-name="'+esc(name)+'" data-pkl-tier-group="'+esc(grp)+'">'+esc(name)+'</span>'):"";
    return {role:key,key:key,name:name,label:name,group:grp,className:className,roleClass:cls,html:html};
  }
  function snapshotForUser(user){return snapshot(tierFromUser(user));}
  function render(value,options){
    options=options||{};
    var snap=snapshot(value);
    if(!snap.html) return "";
    var extra=String(options.extraClass||"").trim();
    if(!extra) return snap.html;
    return snap.html.replace('class="','class="'+esc(extra)+' ');
  }
  function renderForUser(user,options){return render(tierFromUser(user),options);}
  function applySnapshotToUser(user){
    if(!user||typeof user!=="object") return user;
    var key=tierFromUser(user);
    user.memberTier=key;
    user.memberTierName=label(key);
    delete user.tierBadge;
    delete user.memberTierBadge;
    delete user.tierBadgeRole;
    delete user.tierBadgeName;
    delete user.tierBadgeClass;
    delete user.tierBadgeHtml;
    return user;
  }
  function syncStorage(){
    try{
      var raw=localStorage.getItem("pklUsers");
      if(!raw) return;
      var users=JSON.parse(raw);
      if(!Array.isArray(users)) return;
      var changed=false;
      users.forEach(function(user){
        if(!user||typeof user!=="object") return;
        var before=JSON.stringify({memberTier:user.memberTier,memberTierName:user.memberTierName,tierBadge:user.tierBadge,memberTierBadge:user.memberTierBadge,tierBadgeRole:user.tierBadgeRole,tierBadgeName:user.tierBadgeName,tierBadgeClass:user.tierBadgeClass,tierBadgeHtml:user.tierBadgeHtml});
        applySnapshotToUser(user);
        var after=JSON.stringify({memberTier:user.memberTier,memberTierName:user.memberTierName,tierBadge:user.tierBadge,memberTierBadge:user.memberTierBadge,tierBadgeRole:user.tierBadgeRole,tierBadgeName:user.tierBadgeName,tierBadgeClass:user.tierBadgeClass,tierBadgeHtml:user.tierBadgeHtml});
        if(before!==after) changed=true;
      });
      if(changed) localStorage.setItem("pklUsers",JSON.stringify(users));
    }catch(error){}
  }
  function injectStyle(){
    var old=document.getElementById("pklCommonTierBadgeStyle");
    if(old) old.remove();
    var style=document.createElement("style");
    style.id="pklCommonTierBadgeStyle";
    style.textContent='\
.pkl-tier-badge,.tier-mark[data-pkl-tier-badge],.pkl-tier-badge.tier-mark{flex:0 0 auto !important;box-sizing:border-box !important;min-width:74px !important;min-height:26px !important;height:26px !important;padding:0 12px !important;border-radius:999px !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;font-size:12px !important;font-weight:1000 !important;letter-spacing:-.15px !important;line-height:26px !important;white-space:nowrap !important;text-shadow:0 0 10px rgba(255,255,255,.18) !important;clip-path:none !important;transform:none !important;filter:none !important;margin:0 !important;position:relative !important;z-index:50 !important;overflow:hidden !important;backdrop-filter:blur(8px) saturate(1.16) !important;-webkit-backdrop-filter:blur(8px) saturate(1.16) !important;border:1px solid rgba(216,180,254,.36) !important;background:radial-gradient(circle at 50% 0%,rgba(168,85,247,.32),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.034)),linear-gradient(135deg,rgba(42,28,82,.94),rgba(10,8,24,.96)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(0,0,0,.38),0 0 14px rgba(168,85,247,.22) !important;}\
.pkl-tier-badge.role-tier0,.tier-mark.role-tier0[data-pkl-tier-badge]{color:#ffe8e8 !important;border-color:rgba(255,95,118,.62) !important;background:radial-gradient(circle at 50% 0%,rgba(255,115,130,.42),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.035)),linear-gradient(135deg,rgba(155,36,54,.92),rgba(38,10,18,.96)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.24),inset 0 -1px 0 rgba(0,0,0,.38),0 0 14px rgba(255,82,100,.34) !important;}\
.pkl-tier-badge.role-tier1,.tier-mark.role-tier1[data-pkl-tier-badge]{color:#fff7c2 !important;border-color:rgba(255,220,90,.64) !important;background:radial-gradient(circle at 50% 0%,rgba(255,220,90,.42),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.035)),linear-gradient(135deg,rgba(135,100,18,.92),rgba(38,28,8,.96)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.24),inset 0 -1px 0 rgba(0,0,0,.38),0 0 14px rgba(255,216,80,.30) !important;}\
.pkl-tier-badge.role-tier2,.tier-mark.role-tier2[data-pkl-tier-badge]{color:#ddffe7 !important;border-color:rgba(90,230,130,.60) !important;background:radial-gradient(circle at 50% 0%,rgba(90,230,130,.40),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.035)),linear-gradient(135deg,rgba(28,116,58,.92),rgba(8,30,18,.96)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.24),inset 0 -1px 0 rgba(0,0,0,.38),0 0 14px rgba(90,230,130,.28) !important;}\
.pkl-tier-badge.role-tier3,.tier-mark.role-tier3[data-pkl-tier-badge]{color:#e5f5ff !important;border-color:rgba(110,190,255,.62) !important;background:radial-gradient(circle at 50% 0%,rgba(110,190,255,.42),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.035)),linear-gradient(135deg,rgba(32,82,150,.92),rgba(8,18,42,.96)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.24),inset 0 -1px 0 rgba(0,0,0,.38),0 0 14px rgba(110,190,255,.30) !important;}\
.pkl-tier-badge.role-tier4,.tier-mark.role-tier4[data-pkl-tier-badge]{color:#f2e7ff !important;border-color:rgba(200,150,255,.66) !important;background:radial-gradient(circle at 50% 0%,rgba(190,120,255,.48),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.035)),linear-gradient(135deg,rgba(92,42,160,.94),rgba(20,10,44,.96)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.24),inset 0 -1px 0 rgba(0,0,0,.38),0 0 16px rgba(190,120,255,.36) !important;}\
.pkl-tier-badge.role-beast,.tier-mark.role-beast[data-pkl-tier-badge]{color:#ffe2bd !important;border-color:rgba(210,150,95,.58) !important;background:radial-gradient(circle at 50% 0%,rgba(210,150,95,.38),transparent 68%),linear-gradient(180deg,rgba(255,255,255,.15),rgba(255,255,255,.035)),linear-gradient(135deg,rgba(102,62,30,.92),rgba(30,16,8,.96)) !important;box-shadow:inset 0 1px 0 rgba(255,255,255,.24),inset 0 -1px 0 rgba(0,0,0,.38),0 0 14px rgba(210,150,95,.26) !important;}\
.pkl-tier-badge.role-none{display:none !important;}\
.pkl-tier-badge:hover,.tier-mark[data-pkl-tier-badge]:hover{filter:brightness(1.08) !important;transform:translateY(-1px) !important;transition:filter .15s ease,transform .15s ease,box-shadow .15s ease !important;}\
';
    document.head.appendChild(style);
  }

  window.PKLTierBadge={
    labels:TIER_LABELS,
    normalize:normalize,
    label:label,
    roleClass:roleClass,
    group:group,
    tierFromUser:tierFromUser,
    snapshot:snapshot,
    snapshotForUser:snapshotForUser,
    render:render,
    renderForUser:renderForUser,
    applySnapshotToUser:applySnapshotToUser,
    syncStorage:syncStorage,
    injectStyle:injectStyle
  };

  function boot(){injectStyle();syncStorage();}
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
  window.addEventListener("pkl-role-data-updated",syncStorage);
})();
