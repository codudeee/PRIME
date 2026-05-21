(function(){
  if(window.__PKL_SINGLE_USER_TIER_SYNC__) return;
  window.__PKL_SINGLE_USER_TIER_SYNC__ = true;
  var KEY='PKL_USER_TIER_SYNC_V1';
  var seen='';
  var timer=0;
  function clean(v){return String(v==null?'':v).trim();}
  function normName(v){return clean(v).replace(/\s+/g,'').toLowerCase();}
  function normalizeTier(v){
    var s=clean(v); if(!s) return '';
    var l=s.toLowerCase().replace(/\s+/g,'');
    if(/^tier[0-4]$/.test(l)) return l;
    var m=s.match(/([0-4])\s*티어/); if(m) return 'tier'+m[1];
    m=l.match(/^([0-4])tier/); if(m) return 'tier'+m[1];
    if(/짐승상|beasthigh/.test(l)) return 'beast_high';
    if(/짐승하|beastlow|짐승|beast/.test(l)) return 'beast_low';
    return s;
  }
  function tierLabel(t){
    t=normalizeTier(t);
    if(t==='tier0') return '0티어'; if(t==='tier1') return '1티어'; if(t==='tier2') return '2티어'; if(t==='tier3') return '3티어'; if(t==='tier4') return '4티어'; if(t==='beast_high') return '짐승상'; if(t==='beast_low'||t==='beast') return '짐승하';
    return clean(t)||'중';
  }
  function renderBadge(sync, extra){
    var tier=normalizeTier(sync.memberTier||sync.gradeRole||sync.tierRole||sync.tier||sync.tierLabel);
    var user={nickname:sync.nickname||sync.name, discord_id:sync.discord_id||sync.discordId, memberTier:tier, gradeRole:tier, tierRole:tier, tier:tierLabel(tier)};
    if(window.PKLTierBadge && typeof window.PKLTierBadge.renderForUser==='function'){
      var html=window.PKLTierBadge.renderForUser(user,{extraClass:extra||'member-role-badge'}); if(html) return html;
    }
    if(window.PKLTierBadge && typeof window.PKLTierBadge.render==='function'){
      var html2=window.PKLTierBadge.render(tier,{extraClass:extra||'member-role-badge'}); if(html2) return html2;
    }
    return '<span class="pkl-tier-badge tier-mark '+(extra||'member-role-badge')+'" data-pkl-tier-badge="'+tier+'">'+tierLabel(tier)+'</span>';
  }
  function same(sync, el){
    if(!sync||!el) return false;
    var sid=clean(sync.discord_id||sync.discordId);
    if(sid){
      var did=clean(el.getAttribute('data-discord-id')||el.getAttribute('data-discord_id')||el.getAttribute('data-pkl-discord-id')||el.dataset.discordId||el.dataset.discord_id||el.dataset.pklDiscordId);
      if(did && did===sid) return true;
    }
    var sn=normName(sync.nickname||sync.name||sync.discord_username||sync.discordUsername);
    if(!sn) return false;
    var dn=normName(el.getAttribute('data-player-name')||el.getAttribute('data-nickname')||el.dataset.playerName||el.dataset.nickname||'');
    if(dn && dn===sn) return true;
    var nameEl=el.querySelector && el.querySelector('.player-name,.join-wait-name,.user-name,.member-name,.nickname');
    return !!(nameEl && normName(nameEl.textContent)===sn);
  }
  function replaceBadgeIn(container, sync, extra){
    if(!container) return;
    var html=renderBadge(sync, extra);
    var old=container.querySelector('.pkl-tier-badge,.tier-mark[data-pkl-tier-badge],.player-tier.member-role-badge,.member-role-badge.grade-role-tier0,.member-role-badge.grade-role-tier1,.member-role-badge.grade-role-tier2,.member-role-badge.grade-role-tier3,.member-role-badge.grade-role-tier4,.member-role-badge.grade-role-beast');
    if(old){ old.outerHTML=html; return; }
    var anchor=container.querySelector('.player-name,.join-wait-number,.user-name');
    if(anchor) anchor.insertAdjacentHTML(anchor.classList.contains('join-wait-number')?'afterend':'afterend', html);
  }
  function applyDom(sync){
    document.querySelectorAll('.join-wait-row,.player-card,.user-role-line,.surrender-member-name,.pkl-side-status-user,.pkl-side-host').forEach(function(el){
      if(same(sync,el)) replaceBadgeIn(el,sync, el.classList.contains('player-card')?'player-tier member-role-badge':'member-role-badge');
    });
  }
  function apply(sync){
    if(!sync||typeof sync!=='object') return;
    sync.tier=normalizeTier(sync.memberTier||sync.gradeRole||sync.tierRole||sync.tier||sync.tierLabel);
    sync.memberTier=sync.gradeRole=sync.tierRole=sync.tier;
    sync.tierLabel=tierLabel(sync.tier);
    try{ if(typeof window.PKLJoinApplySingleTierSync==='function') window.PKLJoinApplySingleTierSync(sync); }catch(e){console.warn(e);}
    try{ if(typeof window.PKLTeamApplySingleTierSync==='function') window.PKLTeamApplySingleTierSync(sync); }catch(e){console.warn(e);}
    try{ if(typeof window.PKLSheetApplySingleTierSync==='function') window.PKLSheetApplySingleTierSync(sync); }catch(e){console.warn(e);}
    applyDom(sync);
  }
  async function check(){
    if(document.hidden) return;
    try{
      var res=await fetch('/api/pkl-shared?key='+encodeURIComponent(KEY),{cache:'no-store',headers:{Accept:'application/json'}});
      if(!res.ok) return;
      var data=await res.json().catch(function(){return{};});
      var value=data && data.item && data.item.value;
      var stamp=clean((value&&value.version)||(data.item&&data.item.updated_at)||'');
      if(!value||!stamp||stamp===seen) return;
      seen=stamp;
      try{ sessionStorage.setItem('PKL_LAST_TIER_SYNC_VERSION',seen); }catch(e){}
      apply(value);
    }catch(e){}
  }
  function start(){
    try{seen=sessionStorage.getItem('PKL_LAST_TIER_SYNC_VERSION')||'';}catch(e){}
    check();
    timer=setInterval(check,7000);
  }
  window.PKLApplySingleUserTierSync=apply;
  document.addEventListener('visibilitychange',function(){ if(!document.hidden) check(); });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
