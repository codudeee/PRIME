(function(){
  "use strict";

  function system(){return window.PKLRoleSystem||null;}
  function esc(v){
    if(system()&&system().escape) return system().escape(v);
    return String(v==null?"":v).replace(/[&<>\"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m];});
  }
  function normalizeRole(role){return system()?system().memberRoleName(role):String(role||"일반");}
  function getClass(role){return system()?system().memberRoleClass(role):"member-role-member";}
  function render(role,options){
    options=options||{};
    if(system()&&system().memberBadge) return system().memberBadge(role,options.extraClass||"");
    return '<span class="member-role-badge '+esc(getClass(role))+(options.extraClass?' '+esc(options.extraClass):'')+'">'+esc(normalizeRole(role))+'</span>';
  }
  function renderForUser(user,options){
    options=options||{};
    if(system()&&system().memberBadgeForUser) return system().memberBadgeForUser(user,options.extraClass||"");
    return render(user&&(user.memberRole||user.role),options);
  }
  function getNickname(user){
    user=system()&&system().hydrateUser?system().hydrateUser(user||{}):(user||{});
    return user.nickname||user.nick||user.name||user.displayName||user.pubgId||"";
  }
  function renderUserLine(user,options){
    options=options||{};
    var nickClass=options.nickClass||"pkl-role-nickname";
    var lineClass=options.lineClass||"pkl-role-user-line";
    return '<span class="'+esc(lineClass)+'">'+renderForUser(user,options)+'<span class="'+esc(nickClass)+'">'+esc(getNickname(user))+'</span></span>';
  }
  function injectStyle(){if(system()&&system().injectStyle) system().injectStyle();}

  window.PKLRoleBadge={
    normalizeRole:normalizeRole,
    getClass:getClass,
    render:render,
    renderForUser:renderForUser,
    renderUserLine:renderUserLine,
    injectStyle:injectStyle
  };

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",injectStyle); else injectStyle();
})();
