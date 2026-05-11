(function(){
  "use strict";

  var ROLE_RANK={guest:0,user:1,operator:2,admin:3};
  var PAGE=(location.pathname.split('/').pop()||'index.html').toLowerCase();

  function role(){
    function norm(v){return String(v==null?'':v).trim().replace(/\s+/g,'').toLowerCase();}
    function parse(raw){try{return raw?JSON.parse(raw):null;}catch(e){return null;}}
    function roleText(obj){
      if(!obj || typeof obj!=='object') return '';
      var vals=[];
      ['memberRole','adminRole','userRole','authRole','permission','permissions','type','memberRoleName','roleName','role','position','grade','rank','level','accessRole','accessLevel'].forEach(function(k){
        var v=obj[k]; if(Array.isArray(v)) vals=vals.concat(v); else if(v!=null) vals.push(v);
      });
      if(obj.isAdmin||obj.admin||obj.manager||obj.owner||obj.superAdmin) vals.push('admin');
      if(obj.isOperator||obj.operator||obj.staff||obj.moderator) vals.push('operator');
      return vals.map(norm).join('|');
    }
    function mapRoleText(txt){
      if(/관리자|총관리자|admin|manager|owner|superadmin|master/.test(txt)) return 'admin';
      if(/운영자|운영진|operator|staff|moderator/.test(txt)) return 'operator';
      if(/일반|member|normal|general|user/.test(txt)) return 'user';
      return '';
    }
    try{
      if(window.PKLRoleSystem && typeof window.PKLRoleSystem.currentAccessRole==='function'){
        var rr=mapRoleText(norm(window.PKLRoleSystem.currentAccessRole()));
        if(rr) return rr;
      }
    }catch(e){}
    var currentKeys=['pklLoginUser','pklCurrentUser','pklUser','PKL_로그인_USER','PKL_CURRENT_USER','pklLoggedInUser','currentUser','PKL_USER','pklAuthUser'];
    var currents=[];
    currentKeys.forEach(function(k){var u=parse(localStorage.getItem(k))||parse(sessionStorage.getItem(k)); if(u&&typeof u==='object') currents.push(u);});
    try{ if(window.PKLRoleSystem && typeof window.PKLRoleSystem.currentUser==='function'){var u=window.PKLRoleSystem.currentUser(); if(u) currents.push(u);} }catch(e){}
    for(var i=0;i<currents.length;i++){var direct=mapRoleText(roleText(currents[i])); if(direct) return direct;}
    function names(u){return ['uid','id','userId','memberId','loginId','email','nickname','nick','name','displayName','userName','pubgId','pubgID','pubgName','gameId','username','discordId','key','ref'].map(function(k){return norm(u&&u[k]);}).filter(Boolean);}
    var tokens=[]; currents.forEach(function(u){tokens=tokens.concat(names(u));});
    var userKeys=['pklUsers','PKL_USERS','pklAdminUsers','PKL_ADMIN_USERS','pklUserList','pklAdminState_v3','pklAdminState','pkl_admin_state','PKL_USER_DB','pklMembers'];
    var users=[];
    function push(st){
      if(!st) return;
      if(Array.isArray(st)) st.forEach(function(u){if(u&&typeof u==='object')users.push(u);});
      else if(st.users&&Array.isArray(st.users)) st.users.forEach(function(u){if(u&&typeof u==='object')users.push(u);});
      else if(st.members&&Array.isArray(st.members)) st.members.forEach(function(u){if(u&&typeof u==='object')users.push(u);});
      else if(typeof st==='object') Object.keys(st).forEach(function(k){var u=st[k]; if(u&&typeof u==='object')users.push(u);});
    }
    userKeys.forEach(function(k){push(parse(localStorage.getItem(k))); push(parse(sessionStorage.getItem(k)));});
    for(var j=0;j<users.length;j++){
      var mr=mapRoleText(roleText(users[j]));
      if(!mr) continue;
      var ns=names(users[j]);
      for(var t=0;t<tokens.length;t++){if(ns.indexOf(tokens[t])>=0) return mr;}
    }
    return 'guest';
  }
  function rank(r){return ROLE_RANK[r]||0;}
  function isAdmin(){return role()==='admin';}
  function isOperatorUp(){return rank(role())>=ROLE_RANK.operator;}
  function can(min){return rank(role())>=rank(min||'user');}
  function alertAccess(msg){
    msg=msg||'접근 권한이 없습니다.';
    if(PAGE==='sheet.html'||PAGE==='pkl-sheet.html'){
      if(typeof window.pklSheetPermissionToast==='function') window.pklSheetPermissionToast(msg);
      return Promise.resolve(false);
    }
    if(window.PKLRoleSystem&&typeof window.PKLRoleSystem.showAccessModal==='function') return window.PKLRoleSystem.showAccessModal(msg,'권한 제한');
    if(typeof window.pklAlert==='function') return window.pklAlert(msg,'권한 제한');
    return Promise.resolve(window.alert(msg));
  }
  function hide(el){if(!el)return; el.hidden=true; el.setAttribute('aria-hidden','true'); el.style.setProperty('display','none','important');}
  function show(el,display){if(!el)return; el.hidden=false; el.removeAttribute('aria-hidden'); el.style.removeProperty('display'); if(display) el.style.display=display;}
  function disable(el){if(!el)return; el.disabled=true; el.setAttribute('aria-disabled','true'); el.classList.add('pkl-permission-disabled');}
  function enable(el){if(!el)return; el.disabled=false; el.removeAttribute('aria-disabled'); el.classList.remove('pkl-permission-disabled');}
  function qsa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function textOf(el){return String((el&&el.textContent)||'').replace(/\s+/g,' ').trim();}
  function currentUser(){
    if(window.PKLRoleSystem&&typeof window.PKLRoleSystem.currentUser==='function') return window.PKLRoleSystem.currentUser();
    try{return JSON.parse(localStorage.getItem('pklLoginUser')||sessionStorage.getItem('pklLoginUser')||'null');}catch(e){return null;}
  }
  function userTokens(u){
    u=u||{};
    return [u.uid,u.discordId,u.id,u.userId,u.key,u.memberId,u.nickname,u.nick,u.name,u.displayName,u.pubgId,u.gameId,u.ref]
      .map(function(v){return String(v==null?'':v).trim().toLowerCase();}).filter(Boolean);
  }
  function isOwnText(text){
    var tokens=userTokens(currentUser());
    var body=String(text||'').toLowerCase();
    return tokens.some(function(t){return t && t.length>1 && body.indexOf(t)>=0;});
  }
  function protectClick(selector,minRole,msg){
    document.addEventListener('click',function(e){
      var el=e.target.closest&&e.target.closest(selector);
      if(!el) return;
      if((PAGE==='sheet.html'||PAGE==='pkl-sheet.html') && el.closest && el.closest('#adminPanelBtn,#pklItemGearBtn,.pkl-admin-card,.pkl-gear-outside')) return;
      if(can(minRole)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      alertAccess(msg);
    },true);
  }

  function applyHeader(){
    var manager=document.getElementById('managerBtn');
    if(manager){ if(isOperatorUp()) show(manager,'flex'); else hide(manager); }
  }

  function applyIndex(){
    qsa('#pklNoticeWriteBtn,#pklNoticeEditBtn,#pklNoticeDeleteBtn,#pklNoticeDeleteYes,.pkl-notice-admin-control').forEach(function(el){isAdmin()?show(el):hide(el);});
    document.body.classList.toggle('pkl-notice-admin-lock',isAdmin());
  }

  function applyJoin(){
    qsa('.join-manager-card,.join-manager-setting-buttons,.join-manager-actions,#joinResetBtn,#joinTimeSettingBtn,#joinPeopleSettingBtn,#openRecruitBtn,#closeRecruitBtn').forEach(function(el){isOperatorUp()?show(el):hide(el);});
    var cancelCard=document.querySelector('.join-cancel-card');
    if(cancelCard){
      if(isOperatorUp()) show(cancelCard); else {
        var hasOwn=qsa('#joinCancelList .join-cancel-row',cancelCard).some(function(row){return isOwnText(textOf(row));});
        hasOwn?show(cancelCard):hide(cancelCard);
      }
    }
    qsa('#joinCancelList .join-cancel-row').forEach(function(row){ if(!isOperatorUp() && !isOwnText(textOf(row))) hide(row); });
    qsa('#joinReasonWarningBtn,.join-reason-warning-btn').forEach(function(btn){ if(isOperatorUp()) enable(btn); else disable(btn); });
  }

  function applyTeam(){
    qsa('.control-panel,#playerModal,#rerollModal').forEach(function(el){isOperatorUp()?show(el):hide(el);});
    qsa('button,input,select,textarea').forEach(function(el){
      if(el.closest('#pklCommonHeader')) return;
      if(!isOperatorUp()) disable(el);
    });
  }

  function applyTier(){
    qsa('.pkl-tier-member').forEach(function(el){
      if(!isOperatorUp()){el.setAttribute('draggable','false');el.dataset.canDrag='0';}
    });
    qsa('button,input,select,textarea').forEach(function(el){
      if(el.closest('#pklCommonHeader')||el.closest('.account-menu')) return;
      if(!isOperatorUp()) disable(el);
    });
  }

  function sheetCurrentTeamAllowed(el){
    var team=el && (el.closest('.sheet-team,.team-sheet,.pkl-sheet-team,.sheet-card,.sheet-panel,.sheet-column,.team-col,.board-team') || el.closest('[data-team],[data-team-name],[data-sheet-team]'));
    if(!team) return true;
    return isOwnText(textOf(team));
  }
  function applySheet(){
    /* 시트 권한은 sheet.html의 본인팀/운영자/관리자 전용 가드가 담당한다.
       여기서는 외부 전역 가드가 이용내역/톱니/저장 모달을 가로채지 않도록 최소 처리만 한다. */
    qsa('.pkl-side-delete,.pkl-side-remove,.side-delete,.recruit-delete,[data-side-delete],[data-recruit-delete]').forEach(function(el){
      var row=el.closest('.pkl-side-list-row,.pkl-side-item,.side-item,.feed-item,.pkl-side-row')||el.parentElement;
      if(isOperatorUp() || isOwnText(textOf(row))) show(el); else hide(el);
    });
  }

  function applyResult(){
    qsa('#adminPanelBtn,.admin-panel-btn,#resultAdminModal,#resultSheetEditDoneBtn').forEach(function(el){isOperatorUp()?show(el):hide(el);});
  }

  function applyPatch(){
    qsa('#patchAddBtnSide,#patchEditBtn,#patchDeleteBtn,#patchConfirmDelete,.patch-action-btn').forEach(function(el){
      if(el.id==='patchConfirmCancel'||el.id==='patchCancelBtn'||el.id==='patchModalClose') return;
      isAdmin()?show(el):hide(el);
    });
  }

  function applyRule(){
    qsa('#ruleAddCategoryBtn,#ruleEditBtn,.rule-admin-actions,.rule-add-block-btn,.rule-block-delete-btn').forEach(function(el){isAdmin()?show(el):hide(el);});
    document.body.classList.toggle('rule-admin',isAdmin());
  }

  function applyAll(){
    applyHeader();
    if(PAGE==='index.html'||PAGE==='') applyIndex();
    if(PAGE==='join.html') applyJoin();
    if(PAGE==='team.html') applyTeam();
    if(PAGE==='sheet.html'||PAGE==='pkl-sheet.html') applySheet();
    if(PAGE==='tier.html') applyTier();
    if(PAGE==='result.html') applyResult();
    if(PAGE==='patch.html') applyPatch();
    if(PAGE==='rule.html') applyRule();
  }

  protectClick('.join-manager-card button,#joinResetBtn,#joinTimeSettingBtn,#joinPeopleSettingBtn,#openRecruitBtn,#closeRecruitBtn','operator','관리자/운영자만 사용할 수 있습니다.');
  protectClick('#joinReasonWarningBtn,.join-reason-warning-btn','operator','관리자/운영자만 경고를 부여할 수 있습니다.');
  protectClick('.control-panel button','operator','관리자/운영자만 팀구성 기능을 사용할 수 있습니다.');
  protectClick('.pkl-gear-outside,.admin-panel-block,.pkl-admin-card','operator','관리자/운영자만 시트지 설정을 사용할 수 있습니다.');
  protectClick('#adminPanelBtn,.admin-panel-btn,#resultSheetEditDoneBtn','operator','관리자/운영자만 관리자패널을 사용할 수 있습니다.');
  protectClick('#patchAddBtnSide,#patchEditBtn,#patchDeleteBtn,#patchConfirmDelete','admin','관리자만 패치노트를 수정할 수 있습니다.');
  protectClick('#ruleAddCategoryBtn,#ruleEditBtn,.rule-add-block-btn,.rule-block-delete-btn','admin','관리자만 룰을 수정할 수 있습니다.');

  document.addEventListener('dragstart',function(e){
    if((PAGE==='tier.html'||PAGE==='team.html') && !isOperatorUp()){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('input',function(e){
    if(PAGE==='sheet.html' || PAGE==='pkl-sheet.html') return;
  },true);

  var mo=null;
  var applyQueued=false;
  function scheduleApply(){
    if(applyQueued) return;
    applyQueued=true;
    (window.requestAnimationFrame||function(fn){return setTimeout(fn,50);})(function(){
      applyQueued=false;
      applyAll();
    });
  }
  function start(){
    applyAll();
    if(mo) mo.disconnect();
    mo=new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        if(muts[i].addedNodes && muts[i].addedNodes.length){ scheduleApply(); break; }
        if(muts[i].removedNodes && muts[i].removedNodes.length){ scheduleApply(); break; }
      }
    });
    mo.observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:false});
    window.addEventListener('storage',function(e){ if(!e || !e.key || /pkl|PKL/i.test(e.key)) scheduleApply(); });
    window.PKLPagePermissions={apply:applyAll,schedule:scheduleApply,isAdmin:isAdmin,isOperatorUp:isOperatorUp,currentRole:role};
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
