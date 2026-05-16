// PKL role change restriction

const PKL_LOGIN_STORAGE_KEYS = ["discordUser", "pklLoginUser", "pklCurrentUser", "pklUser", "pklLoggedInUser", "pkl_current_user"];
const PKL_MANUAL_LOGOUT_KEY = "pklManualLogout";

function pklNormalizeDiscordId(value){
  return String(value == null ? "" : value).trim().toLowerCase().replace(/^discord-/, "");
}
function pklStrongLoginId(user){
  if(!user || typeof user !== "object") return "";
  const direct=pklNormalizeDiscordId(user.discordId || user.discord_id);
  if(direct) return direct;
  for(const key of ["uid","id","userId","key"]){
    const raw=String(user[key] || "").trim();
    if(/^discord-/i.test(raw)) return pklNormalizeDiscordId(raw);
  }
  return pklNormalizeDiscordId(user.uid || user.id || user.userId || "");
}

function getCurrentUser() {
  try {
    if (localStorage.getItem(PKL_MANUAL_LOGOUT_KEY) === "1") return null;
  } catch (e) {}

  const candidates = [];
  for (const key of PKL_LOGIN_STORAGE_KEYS) {
    let raw = null;
    try { raw = localStorage.getItem(key) || sessionStorage.getItem(key); } catch (e) { raw = null; }
    if (!raw) continue;
    try {
      const user = JSON.parse(raw);
      if (user && typeof user === "object") candidates.push({ key, user, id: pklStrongLoginId(user) });
    } catch (e) {}
  }
  if (!candidates.length) return null;

  // 여러 계정 값이 섞여 있으면 첫 번째 값을 전부 덮어쓰지 않는다.
  // discordUser/pklLoginUser처럼 실제 로그인 흐름에서 갱신되는 키를 우선 사용한다.
  const preferred = candidates.find(c => c.key === "discordUser" && c.id) ||
                    candidates.find(c => c.key === "pklLoginUser" && c.id) ||
                    candidates.find(c => c.id) ||
                    candidates[0];
  return preferred.user;
}

function pklCanChangeRole() {
  const user = getCurrentUser();
  if (!user) return false;
  const role = String(user.memberRole || user.role || "").trim().toLowerCase();
  return role === "admin" || role === "manager" || role === "owner" || role === "총관리자" || role === "관리자";
}


(function(){
  const MAIL_KEY = "pklMailboxMails";
  let pklSupabaseMailboxCache = [];
  let pklMailboxFetchAt = 0;
  const HEADER_HTML = `<header class="topbar">
<div class="topbar-inner">
<a aria-label="PKL 메인" class="brand" href="index.html"><img class="brand-logo-img" src="pkl_logo_final.webp" alt="PKL"><div class="brand-name">PRIME KILL LEAGUE</div></a>
<nav aria-label="주요 메뉴" class="main-nav"><a href="index.html">메인</a><a href="join.html">참가</a><a href="team.html">팀구성</a><a href="sheet.html">시트지</a><a href="tier.html">티어표</a><a href="result.html">결과표</a><a href="search.html">전적검색</a><a href="patch.html">패치노트</a></nav>
<div class="user-box"><button class="top-btn manager-btn" id="managerBtn" type="button" onclick="location.href='admin.html'">관리홈</button><div class="account-wrap">
<button class="top-btn account-trigger" id="loginBtn" type="button">LOGIN<span class="mail-badge" id="mailBadge" style="display:none"></span></button>
<div class="account-menu" id="accountMenu">
  <button onclick="location.href='myinfo.html'">내정보</button>
<button class="mailbox-btn" id="mailboxBtn" type="button" onclick="openMailboxModal()"><span>우편함</span><span class="mailbox-menu-count" id="mailboxMenuCount">NEW</span></button>
  <button onclick="logout()">로그아웃</button>
</div>
</div></div>
</div>
</header>`;

  const MAILBOX_HTML = `
<div class="mailbox-modal" id="mailboxModal" onclick="if(event.target===this) closeMailboxModal()">
  <div class="mailbox-card">
    <div class="mailbox-head">
      <h2>PKL 우편함</h2>
      <button class="mailbox-close" type="button" onclick="closeMailboxModal()">×</button>
    </div>
    <div class="mailbox-body">
      <div class="mailbox-list" id="mailboxList"></div>
      <div class="mail-detail" id="mailboxDetail"></div>
    </div>
    <div class="mailbox-actions">
      <button class="primary" type="button" onclick="askMarkAllRead()">모두읽음처리</button>
      <button class="danger" type="button" onclick="askDeleteAllMails()">모두삭제</button>
    </div>
  </div>
</div>

<div class="mail-confirm" id="mailConfirm">
  <div class="mail-confirm-card">
    <h3>모두읽음처리</h3>
    <p>모든 우편을 모두 읽음 처리 하시겠습니까?</p>
    <div class="mail-confirm-actions">
      <button class="yes purple" type="button" onclick="markMailboxRead()">예</button>
      <button class="no" type="button" onclick="closeMailConfirm()">아니오</button>
    </div>
  </div>
</div>

<div class="mail-confirm" id="mailDeleteConfirm">
  <div class="mail-confirm-card">
    <h3>우편 삭제</h3>
    <p>해당 우편을 삭제하시겠습니까?</p>
    <div class="mail-confirm-actions">
      <button class="yes purple" type="button" onclick="deleteSelectedMail()">예</button>
      <button class="no" type="button" onclick="closeMailDeleteConfirm()">아니오</button>
    </div>
  </div>
</div>

<div class="mail-confirm" id="mailDeleteAllConfirm">
  <div class="mail-confirm-card">
    <h3>우편함 정리</h3>
    <p>우편함을 정리하시겠습니까?</p>
    <div class="mail-confirm-actions">
      <button class="yes purple" type="button" onclick="deleteAllMails()">예</button>
      <button class="no" type="button" onclick="closeDeleteAllConfirm()">아니오</button>
    </div>
  </div>
</div>`;

  let selectedMailIndex = null;

  function injectStyle(){
    if(document.getElementById("pklCommonHeaderStyle")) return;
    const style=document.createElement("style");
    style.id="pklCommonHeaderStyle";
    style.textContent=`
#pklCommonHeader .mail-badge:not(.show){display:none !important}
#pklCommonHeader .mail-badge{
  position:absolute !important;
  left:auto !important;
  top:-10px !important;
  right:-10px !important;
  min-width:20px !important;
  height:20px !important;
  padding:0 6px !important;
  border-radius:999px !important;
  display:none !important;
  align-items:center !important;
  justify-content:center !important;
  line-height:20px !important;
  transform:none !important;
  margin:0 !important;
  z-index:40 !important;
  pointer-events:none !important;
}
#pklCommonHeader .mail-badge.show{display:inline-flex !important}
#pklCommonHeader .account-trigger{position:relative !important; overflow:visible !important;}
#pklCommonHeader .mailbox-menu-count{display:none}
html,body,body *:not(input):not(textarea):not([contenteditable="true"]):not([contenteditable="true"] *){
  -webkit-user-select:none !important;
  -moz-user-select:none !important;
  -ms-user-select:none !important;
  user-select:none !important;
  -webkit-touch-callout:none !important;
  caret-color:transparent !important;
}
html,body{
  cursor:default;
}
a,button,summary,select,label,[role="button"],[onclick],.top-btn,.account-trigger,.account-menu button,.mail-row,.mailbox-close,.mail-detail-actions button,.mailbox-actions button,.mail-confirm-actions button,.feature-card,.card-btn,.quickbar a,.more,.discord-btn,.close,.join-close,.pkl-x-close,.auth-x{
  cursor:pointer !important;
}
button *,a *,[role="button"] *,[onclick] *,.top-btn *,.account-trigger *,.mail-row *,.feature-card *,.card-btn *,.quickbar a *,.discord-btn *{
  cursor:pointer !important;
}
input,textarea,[contenteditable="true"],[contenteditable="true"] *{
  -webkit-user-select:text !important;
  -moz-user-select:text !important;
  -ms-user-select:text !important;
  user-select:text !important;
  caret-color:auto !important;
  cursor:text !important;
}
.mailbox-list{
  max-height:390px !important;
  overflow-y:auto !important;
  overflow-x:hidden !important;
  padding-right:4px !important;
  align-content:start !important;
}
.mailbox-list::-webkit-scrollbar{width:8px}
.mailbox-list::-webkit-scrollbar-track{background:rgba(255,255,255,.035);border-radius:999px}
.mailbox-list::-webkit-scrollbar-thumb{
  background:linear-gradient(180deg,rgba(168,85,247,.55),rgba(124,58,237,.30));
  border-radius:999px;
  border:1px solid rgba(216,180,254,.12);
}
.mailbox-actions{
  display:flex !important;
  justify-content:flex-end !important;
  gap:10px !important;
  padding:0 18px 18px !important;
}
.mailbox-actions .danger{
  border-color:rgba(248,113,113,.6) !important;
  background:linear-gradient(135deg,rgba(127,29,29,.7),rgba(45,10,10,.95)) !important;
  color:#fee2e2 !important;
  box-shadow:0 0 12px rgba(248,113,113,.25) !important;
}
.mailbox-actions .danger:hover{
  border-color:rgba(248,113,113,.9) !important;
  background:linear-gradient(135deg,rgba(153,27,27,.9),rgba(45,10,10,.98)) !important;
  box-shadow:0 0 18px rgba(248,113,113,.35) !important;
}
.mail-confirm-actions .purple{
  border-color:rgba(168,85,247,.6) !important;
  background:linear-gradient(135deg,rgba(124,58,237,.7),rgba(30,10,60,.95)) !important;
  color:#ede9fe !important;
  box-shadow:0 0 14px rgba(168,85,247,.25) !important;
}
.mail-confirm-actions .purple:hover{
  border-color:rgba(168,85,247,.9) !important;
  background:linear-gradient(135deg,rgba(124,58,237,.9),rgba(30,10,60,.98)) !important;
  box-shadow:0 0 18px rgba(168,85,247,.35) !important;
}
.mail-confirm-actions .no{
  border-color:rgba(248,113,113,.5) !important;
  background:linear-gradient(135deg,rgba(127,29,29,.7),rgba(45,10,10,.95)) !important;
  color:#fee2e2 !important;
  box-shadow:0 0 12px rgba(248,113,113,.25) !important;
}
.mail-confirm-actions .no:hover{
  border-color:rgba(248,113,113,.85) !important;
  background:linear-gradient(135deg,rgba(153,27,27,.9),rgba(45,10,10,.98)) !important;
  box-shadow:0 0 18px rgba(248,113,113,.35) !important;
}
#pklCommonHeader .account-trigger{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  gap:8px !important;
  min-width:fit-content !important;
}
#pklCommonHeader .pkl-header-user-name{
  display:inline-block !important;
  max-width:96px !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
  white-space:nowrap !important;
  color:#fff !important;
  font-weight:1000 !important;
}
#pklCommonHeader .pkl-header-badge-stack{
  position:relative !important;
  display:inline-flex !important;
  align-items:center !important;
  gap:5px !important;
  flex:0 0 auto !important;
}
#pklCommonHeader .pkl-header-role-badge.member-role-badge,
#pklCommonHeader .pkl-header-tier-badge.pkl-tier-badge{
  min-width:auto !important;
  height:22px !important;
  min-height:22px !important;
  padding:0 9px !important;
  font-size:10.5px !important;
  line-height:22px !important;
}
#pklCommonHeader .main-nav a{
  position:relative !important;
}
#pklCommonHeader .main-nav a.active{
  color:#fff !important;
  text-shadow:0 0 10px rgba(233,213,255,.90),0 0 22px rgba(168,85,247,.70) !important;
}
#pklCommonHeader .main-nav a.active::before{
  content:"";
  position:absolute;
  left:50%;
  top:-18px;
  width:54px;
  height:2px;
  transform:translateX(-50%);
  border-radius:999px;
  background:linear-gradient(90deg,transparent,rgba(233,213,255,.98),transparent);
  box-shadow:0 0 14px rgba(168,85,247,.88),0 0 28px rgba(168,85,247,.52);
  pointer-events:none;
}
#pklCommonHeader .main-nav a.active::after{
  content:"";
  position:absolute;
  left:50%;
  bottom:-20px;
  width:46px;
  height:2px;
  transform:translateX(-50%);
  border-radius:999px;
  background:linear-gradient(90deg,transparent,rgba(216,180,254,.95),transparent);
  box-shadow:0 0 12px rgba(168,85,247,.70);
  pointer-events:none;
}`;
    document.head.appendChild(style);
  }


  function getLoginUser(){
    return getCurrentUser();
  }



  function isAdminUser(user){
    if(!user) return false;
    /* Supabase에서 방금 받아온 user.role/memberRole을 최우선으로 본다.
       PKLRoleSystem.hasRole()은 일부 페이지에서 예전 localStorage 권한을 섞어
       Supabase admin을 다시 user처럼 판단하는 경로가 있어서 fallback으로만 사용한다. */
    const role=String(user.memberRole || user.role || user.userRole || user.authRole || user.roleName || user.adminRole || user.permission || user.type || "").trim();
    const roleLower=role.toLowerCase();
    const isManager=role==="admin" || role==="manager" || role==="관리자" || role==="총관리자" || roleLower==="admin" || roleLower==="manager" || roleLower==="superadmin" || roleLower==="owner";
    const isOperator=role==="operator" || role==="운영자" || role==="운영진" || roleLower==="operator" || roleLower==="staff" || roleLower==="moderator";
    if(isManager || isOperator || user.isAdmin === true || user.admin === true || user.isOperator === true || user.operator === true) return true;
    try{
      if(window.PKLRoleSystem && typeof window.PKLRoleSystem.hasRole === "function") return window.PKLRoleSystem.hasRole(user,"operator");
    }catch(e){}
    return false;
  }

  function setButtonText(button,text){
    if(!button) return;
    let changed=false;
    for(const node of Array.from(button.childNodes)){
if(node.nodeType===Node.TEXT_NODE){
        node.nodeValue=text;
        changed=true;
        break;
      }
    }
    if(!changed) button.insertBefore(document.createTextNode(text),button.firstChild);
  }


  function getUserIdentityKeys(user){
    if(!user) return [];
    return [user.uid,user.discordId,user.id,user.userId]
      .map(v=>String(v || "").trim())
      .filter(function(v){ return !!v && !/^temp-/i.test(v) && !/^approved-/i.test(v) && !/^pending-/i.test(v); });
  }

  function findStoredPklUser(user){
    // Supabase users 테이블이 단일 기준이다.
    // 예전 localStorage(pklUsers / pklAdminState_v3)에 남은 일반 권한값이
    // 현재 Supabase admin/operator 값을 덮어써서 관리자 버튼이 사라지는 문제가 있어
    // 헤더 권한/배지는 더 이상 로컬 유저목록으로 보정하지 않는다.
    return user;
  }


  function getHeaderUserName(user){
    const stored=findStoredPklUser(user);
    return String(
      (stored && (stored.nickname || stored.nick || stored.displayName || stored.name || stored.username || stored.loginId || stored.id)) ||
      (user && (user.nickname || user.nick || user.displayName || user.name || user.username || user.loginId || user.id)) ||
      "MY"
    ).trim();
  }

  function getHeaderHydratedUser(user){
    const stored=findStoredPklUser(user);
    /* 헤더/권한은 Supabase user 객체 그대로 사용한다.
       여기서 PKLRoleSystem.hydrateUser()를 호출하면 오래된 pklUsers/localStorage가
       role=admin 값을 role=user로 되돌리는 문제가 생긴다. */
    return Object.assign({}, user || {}, stored || {});
  }

  function getHeaderAccessRole(user){
    const target=getHeaderHydratedUser(user);
    const role=String((target && (target.memberRole || target.role || target.userRole || target.authRole || target.roleName || target.adminRole || target.permission || target.type)) || "").trim();
    const roleLower=role.toLowerCase();
    if(role==="관리자" || role==="총관리자" || roleLower==="admin" || roleLower==="manager" || roleLower==="superadmin" || roleLower==="owner" || target.isAdmin===true || target.admin===true) return "admin";
    if(role==="운영자" || role==="운영진" || roleLower==="operator" || roleLower==="staff" || roleLower==="moderator" || target.isOperator===true || target.operator===true) return "operator";
    try{
      if(window.PKLRoleSystem && typeof window.PKLRoleSystem.accessRoleFromUser === "function"){
        const fallback=String(window.PKLRoleSystem.accessRoleFromUser(target)||"").trim().toLowerCase();
        if(fallback) return fallback;
      }
    }catch(e){}
    return roleLower || "user";
  }

  function isHeaderRoleBadgeUser(user){
    const role=getHeaderAccessRole(user);
    return role==="admin" || role==="operator";
  }

  function getHeaderUserBadgeHtml(user){
    const target=getHeaderHydratedUser(user);
    const role=getHeaderAccessRole(target);
    if(role==="admin" || role==="operator"){
      const roleSource=role==="admin" ? "admin" : "operator";
      const roleBadge=(window.PKLRoleBadge && typeof window.PKLRoleBadge.render === "function")
        ? window.PKLRoleBadge.render(roleSource,{extraClass:"pkl-header-role-badge"})
        : (window.PKLRoleSystem && typeof window.PKLRoleSystem.memberBadge === "function" ? window.PKLRoleSystem.memberBadge(roleSource,"pkl-header-role-badge") : "");
      return roleBadge ? '<span class="pkl-header-badge-stack">'+roleBadge+'</span>' : "";
    }
    const tierBadge=(window.PKLTierBadge && window.PKLTierBadge.renderForUser)
      ? window.PKLTierBadge.renderForUser(target,{extraClass:"pkl-header-tier-badge"})
      : (window.PKLRoleSystem && typeof window.PKLRoleSystem.gradeBadgeForUser === "function" ? window.PKLRoleSystem.gradeBadgeForUser(target,"pkl-header-tier-badge") : "");
    return tierBadge ? '<span class="pkl-header-badge-stack">'+tierBadge+'</span>' : "";
  }

  function setHeaderMyButton(button,user){
    if(!button) return;
    const target=getHeaderHydratedUser(user);
    const name=escapeHtml(getHeaderUserName(target));
    const badgeHtml=getHeaderUserBadgeHtml(target);
    const mailBadge=button.querySelector("#mailBadge");
    button.innerHTML='<span class="pkl-header-user-name">'+name+'</span>'+badgeHtml;
    const badgeStack=button.querySelector(".pkl-header-badge-stack");
    if(mailBadge){
      if(badgeStack) badgeStack.appendChild(mailBadge);
      else button.appendChild(mailBadge);
    }else if(badgeStack){
      badgeStack.insertAdjacentHTML("beforeend",'<span class="mail-badge" id="mailBadge" style="display:none"></span>');
    }else{
      button.insertAdjacentHTML("beforeend",'<span class="mail-badge" id="mailBadge" style="display:none"></span>');
    }
  }

  function pklHeaderDiscordId(user){ return pklStrongLoginId(user); }

  function pklHeaderIdentityQuery(user){
    if(!user) return "";
    return pklHeaderDiscordId(user) || String(user.pubgId || user.pubg_id || user.nickname || user.name || "").trim();
  }

  function pklHeaderSameUser(a,b){
    if(!a || !b) return false;
    const ad=pklHeaderDiscordId(a), bd=pklHeaderDiscordId(b);
    if(ad && bd) return ad===bd;
    const norm=function(v){ return String(v || "").trim().toLowerCase(); };
    const av=[a.pubgId,a.pubg_id,a.nickname,a.name,a.username].map(norm).filter(Boolean);
    const bv=[b.pubgId,b.pubg_id,b.nickname,b.name,b.username].map(norm).filter(Boolean);
    return av.length && bv.length && av.some(function(v){ return bv.includes(v); });
  }

  let pklHeaderUserHydrateAt=0;
  let pklHeaderUserHydratePromise=null;
  async function hydrateHeaderUserFromSupabase(force){
    const local=getLoginUser();
    const q=pklHeaderIdentityQuery(local);
    if(!local || !q) return local;
    const now=Date.now();
    if(!force && pklHeaderUserHydratePromise) return pklHeaderUserHydratePromise;
    if(!force && now-pklHeaderUserHydrateAt<15000) return local;
    pklHeaderUserHydrateAt=now;
    pklHeaderUserHydratePromise=(async function(){
      try{
        const did=pklHeaderDiscordId(local);
        const url=did ? ('/api/pkl-users?limit=5&discordId='+encodeURIComponent(did)) : ('/api/pkl-users?limit=20&q='+encodeURIComponent(q));
        const res=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
        const data=await res.json().catch(function(){return null;});
        const users=Array.isArray(data && data.users)?data.users:[];
        const matched=users.find(function(u){ return pklHeaderSameUser(local,u); }) || users[0];
        if(!matched) return local;
        const merged=Object.assign({}, local, matched, {
          discordId: matched.discordId || matched.discord_id || local.discordId || local.discord_id,
          discord_id: matched.discord_id || matched.discordId || local.discord_id || local.discordId
        });
        window.__PKL_CURRENT_SUPABASE_USER = merged;
        PKL_LOGIN_STORAGE_KEYS.forEach(function(key){
          try{ if(localStorage.getItem(key) || key==='pklLoginUser') localStorage.setItem(key, JSON.stringify(merged)); }catch(e){}
          try{ if(sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(merged)); }catch(e){}
        });
        setHeaderMyButton(document.getElementById('loginBtn'), merged);
        const managerBtn=document.getElementById('managerBtn');
        if(managerBtn) managerBtn.style.display=isAdminUser(merged) ? 'flex' : 'none';
        try{ window.dispatchEvent(new CustomEvent('pkl-current-user-updated',{detail:{user:merged}})); }catch(e){}
        try{ window.dispatchEvent(new CustomEvent('pkl-role-data-updated',{detail:{user:merged}})); }catch(e){}
        return merged;
      }catch(e){
        return local;
      }finally{
        pklHeaderUserHydratePromise=null;
      }
    })();
    return pklHeaderUserHydratePromise;
  }

  function escapeHtml(v){
    return String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  }

  function mailLineBreak(v){
    return escapeHtml(v).replace(/\n/g,"<br>");
  }

  const MAIL_READ_STATE_KEY = "pklMailboxReadState_v2";

  function mailStableKey(mail,index){
    if(!mail || typeof mail!=="object") return "mail-"+index;
    const raw=mail.raw && typeof mail.raw==="object" ? mail.raw : mail;
    return String(
      raw.id || raw.mailId || raw.created_at || raw.createdAt || raw.date || raw.time ||
      [raw.title || raw.subject || "", raw.message || raw.body || raw.reason || raw.content || "", raw.amount || "", raw.type || "", index].join("|")
    );
  }

  function readMailState(){
    try{
      const data=JSON.parse(localStorage.getItem(MAIL_READ_STATE_KEY)||"{}");
      return data && typeof data==="object" ? data : {};
    }catch(e){return {};}
  }

  function writeMailState(state){
    try{ localStorage.setItem(MAIL_READ_STATE_KEY,JSON.stringify(state||{})); }catch(e){}
  }

  function isRead(mail,index){
    const key=mailStableKey(mail,index);
    const st=readMailState()[key];
    return !!(mail && (mail.read || mail.isRead || mail.readAt || (st && st.read)));
  }

  function applyPersistedMailState(mail,index){
    if(!mail || typeof mail!=="object") return mail;
    const key=mailStableKey(mail,index);
    const st=readMailState()[key];
    if(st && st.read){
      mail.read=true;
      mail.isRead=true;
      mail.readAt=mail.readAt || st.readAt || new Date().toISOString();
    }
    if(st && st.deleted){
      mail.deleted=true;
    }
    return mail;
  }

  function rememberMailState(mail,index,patch){
    const key=mailStableKey(mail,index);
    const state=readMailState();
    state[key]=Object.assign({},state[key]||{},patch||{});
    writeMailState(state);
  }

  function mailboxIdentityQuery(){
    const user=getLoginUser() || {};
    return String(user.discordId || user.discord_id || user.pubgId || user.pubg_id || user.nickname || user.name || "").trim();
  }
  function sameMailIdentity(a,b,ai,bi){
    if(!a || !b) return false;
    const ar=a.raw && typeof a.raw==="object" ? a.raw : a;
    const br=b.raw && typeof b.raw==="object" ? b.raw : b;
    const idsA=[ar.id,ar.mailId,ar.created_at,ar.createdAt,ar.date,ar.time,ar.title,ar.subject].map(v=>String(v||"").trim()).filter(Boolean);
    const idsB=[br.id,br.mailId,br.created_at,br.createdAt,br.date,br.time,br.title,br.subject].map(v=>String(v||"").trim()).filter(Boolean);
    if(idsA.some(v=>idsB.includes(v))) return true;
    return mailStableKey(a,ai)===mailStableKey(b,bi);
  }
  async function persistMailboxPatchToSupabase(mail,index,patch){
    const q=mailboxIdentityQuery();
    if(!q || !mail) return;
    try{
      const res=await fetch('/api/pkl-users?limit=20&q='+encodeURIComponent(q),{cache:'no-store'});
      const data=await res.json().catch(function(){return null;});
      const users=Array.isArray(data && data.users)?data.users:[];
      const current=getLoginUser();
      const matched=users.find(function(u){return pklSameMailboxUser(current,u);}) || users[0];
      if(!matched) return;
      const mailbox=Array.isArray(matched.mailbox)?matched.mailbox.slice():[];
      let changed=false;
      const next=mailbox.map(function(m,i){
        if(!sameMailIdentity(m,mail,i,index)) return m;
        changed=true;
        return Object.assign({},m,patch||{});
      });
      if(!changed) return;
      matched.mailbox=next;
      await fetch('/api/pkl-users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:matched})});
      pklSupabaseMailboxCache=next.slice();
      pklMailboxFetchAt=0;
    }catch(e){}
  }

  function readMails(){
    let local=[];
    try{
      const data=JSON.parse(localStorage.getItem(MAIL_KEY) || "[]");
      local=Array.isArray(data) ? data : [];
    }catch(e){ local=[]; }
    const merged=[];
    const seen=new Set();
    (Array.isArray(pklSupabaseMailboxCache)?pklSupabaseMailboxCache:[]).concat(local).forEach(function(mail,index){
      if(!mail || typeof mail!=="object") return;
      const key=String(mail.id || mail.mailId || mail.created_at || mail.date || mail.title || index);
      if(seen.has(key)) return;
      seen.add(key);
      merged.push(applyPersistedMailState(mail,index));
    });
    return merged;
  }

  function saveMails(mails){
    const safe=Array.isArray(mails) ? mails : [];
    safe.forEach(function(mail,index){
      if(!mail || typeof mail!=="object") return;
      if(mail.read || mail.isRead || mail.readAt || mail.deleted){
        rememberMailState(mail,index,{read:!!(mail.read || mail.isRead || mail.readAt),readAt:mail.readAt||"",deleted:!!mail.deleted});
      }
    });
    localStorage.setItem(MAIL_KEY,JSON.stringify(safe));
    localStorage.setItem("pklMailbox",JSON.stringify(safe));
    localStorage.setItem("pklMails",JSON.stringify(safe));
    localStorage.setItem("pklMailboxUnread",String(safe.filter(m=>!m.deleted && !isRead(m)).length));
    updateMailboxBadge();
    window.dispatchEvent(new CustomEvent("pkl-mailbox-updated"));
  }

  function cleanMailIdentity(v){
    return String(v ?? "").trim().toLowerCase();
  }

  function currentMailIdentities(){
    const user=getLoginUser();
    if(!user) return [];
    return [
      user.uid,
      user.id,
      user.userId,
      user.discordId,
      user.discord_id,
      user.discordUsername,
      user.discord_username,
      user.username,
      user.loginId,
      user.pubgId,
      user.ref,
      user.nickname,
      user.nick,
      user.name,
      user.displayName
    ].map(cleanMailIdentity).filter(Boolean);
  }

  function isMailForCurrentUser(mail){
    if(!mail || mail.deleted) return false;
    const targets=[
      mail.uid,
      mail.toUid,
      mail.targetUid,
      mail.userUid,
      mail.toUserId,
      mail.targetUserId,
      mail.toPubgId,
      mail.targetPubgId,
      mail.pubgId,
      mail.toNickname,
      mail.targetNickname,
      mail.nickname,
      mail.to,
      mail.receiver
    ].map(cleanMailIdentity).filter(Boolean);

    if(!targets.length) return true;

    const identities=currentMailIdentities();
    if(!identities.length) return false;
    return targets.some(target=>identities.includes(target));
  }

  function pklSameMailboxUser(a,b){
    const av=currentMailIdentities();
    const keys=[b && b.uid,b && b.id,b && b.userId,b && b.discordId,b && b.discord_id,b && b.pubgId,b && b.pubg_id,b && b.nickname,b && b.name].map(cleanMailIdentity).filter(Boolean);
    return !!(av.length && keys.length && keys.some(function(k){return av.includes(k);}));
  }

  async function loadMailboxFromSupabase(force){
    const user=getLoginUser();
    if(!user) return [];
    const now=Date.now();
    if(!force && now-pklMailboxFetchAt<20000) return pklSupabaseMailboxCache;
    pklMailboxFetchAt=now;
    const q=encodeURIComponent(user.discordId || user.discord_id || user.pubgId || user.pubg_id || user.nickname || user.name || "");
    if(!q) return pklSupabaseMailboxCache;
    try{
      const res=await fetch('/api/pkl-users?limit=20&q='+q,{cache:'no-store'});
      const data=await res.json().catch(function(){return null;});
      const users=Array.isArray(data && data.users)?data.users:[];
      const matched=users.find(function(u){return pklSameMailboxUser(user,u);}) || users[0];
      const mails=matched && Array.isArray(matched.mailbox)?matched.mailbox:[];
      pklSupabaseMailboxCache=mails.slice().map(function(mail,index){ return applyPersistedMailState(mail,index); });
      return pklSupabaseMailboxCache;
    }catch(e){
      return pklSupabaseMailboxCache;
    }
  }

  function visibleMails(){
    return readMails().filter(isMailForCurrentUser);
  }

  function unreadCount(){
    return visibleMails().filter(m=>!isRead(m)).length;
  }

  function formatMailDate(v){
    const raw=String(v||"").trim();
    if(!raw) return "";
    if(/^\d{4}\.\d{2}\.\d{2}/.test(raw)) return raw;
    const d=new Date(raw);
    if(Number.isNaN(d.getTime())) return raw;
    try{
      const parts=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d);
      const map={}; parts.forEach(p=>{map[p.type]=p.value});
      return `${map.year}.${map.month}.${map.day} ${map.hour}:${map.minute}`;
    }catch(e){ return raw; }
  }

  function mailTimeValue(mail){
    const rawMail = mail && mail.raw && typeof mail.raw === "object" ? mail.raw : (mail || {});
    const candidates = [
      rawMail.created_at, rawMail.createdAt, rawMail.created, rawMail.sent_at, rawMail.sentAt,
      rawMail.date, rawMail.time, rawMail.updated_at, rawMail.updatedAt, rawMail.readAt, rawMail.id
    ];
    for(const value of candidates){
      const raw = String(value || "").trim();
      if(!raw) continue;
      const normalized = raw.replace(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}).*$/, "$1-$2-$3T$4:$5:00+09:00");
      const t = Date.parse(normalized);
      if(Number.isFinite(t)) return t;
    }
    return 0;
  }

  function normalizeMail(mail,index){
    mail=applyPersistedMailState(mail,index);
    return {
      id:mail.id || mail.mailId || ("mail-"+index),
      title:mail.title || mail.subject || (mail.type==="warning" ? "경고 1회 부여 안내" : "PKL 우편"),
      body:mail.body || mail.reason || mail.content || mail.message || mail.text || "내용이 없습니다.",
      date:formatMailDate(mail.date || mail.created_at || mail.createdAt || mail.time || mail.updated_at || ""),
      admin:mail.admin || mail.actor || mail.from || mail.sender || "PKL 운영진",
      read:isRead(mail,index),
      raw:mail
    };
  }

  function updateMailboxBadge(){
    const count=unreadCount();
    const badge=document.getElementById("mailBadge");
    const menuCount=document.getElementById("mailboxMenuCount");
    if(badge){
      badge.textContent=count>0 ? String(count) : "";
      badge.classList.toggle("show",count>0);
      badge.style.display=count>0 ? "inline-flex" : "none";
    }
    if(menuCount){
      menuCount.textContent=count>0 ? "NEW" : "";
      menuCount.style.display=count>0 ? "inline-flex" : "none";
    }
  }

  function syncLoginState(){

    try {
      var current = getCurrentUser && getCurrentUser();
      if (current) {
        /* localStorage 보정 시 PKLRoleSystem.hydrateUser()를 타지 않는다.
           Supabase admin 값을 받기 전/후에 구버전 로컬 권한이 섞이는 문제 차단. */
        if(window.__PKL_CURRENT_SUPABASE_USER){
          current = Object.assign({}, current, window.__PKL_CURRENT_SUPABASE_USER);
        }
        PKL_LOGIN_STORAGE_KEYS.forEach(function(key){
          try{ if(localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(current)); }catch(e){}
        });
        localStorage.setItem("pklLoginUser", JSON.stringify(current));
      }
    } catch (e) {}

    hydrateHeaderUserFromSupabase(false).then(function(fresh){
      if(fresh){
        setHeaderMyButton(document.getElementById("loginBtn"), fresh);
        const managerBtn=document.getElementById("managerBtn");
        if(managerBtn) managerBtn.style.display=isAdminUser(fresh) ? "flex" : "none";
        updateMailboxBadge();
      }
    }).catch(function(){});

    const user=getLoginUser();
    const loginBtn=document.getElementById("loginBtn");
    const managerBtn=document.getElementById("managerBtn");
    const accountWrap=document.querySelector(".account-wrap");
    const accountMenu=document.getElementById("accountMenu");

    if(document.body){
      document.body.classList.toggle("pkl-logged-in", !!user);
      document.body.classList.toggle("pkl-logged-out", !user);
      if(window.PKLRoleSystem && typeof window.PKLRoleSystem.enforceVisibility === "function") window.PKLRoleSystem.enforceVisibility(document);
    }

    if(user){
      setHeaderMyButton(loginBtn,user);
      if(accountWrap){
        accountWrap.classList.add("is-logged-in");
        accountWrap.classList.remove("is-logged-out");
      }
      if(accountMenu){
        accountMenu.classList.remove("logged-out");
        accountMenu.style.removeProperty("display");
        accountMenu.style.removeProperty("opacity");
        accountMenu.style.removeProperty("visibility");
        accountMenu.style.removeProperty("pointer-events");
      }
      if(managerBtn) managerBtn.style.display=isAdminUser(user) ? "flex" : "none";
      updateMailboxBadge();
      loadMailboxFromSupabase(false).then(updateMailboxBadge).catch(function(){});
    }else{
      setButtonText(loginBtn,"LOGIN");
      if(accountWrap){
        accountWrap.classList.remove("is-logged-in");
        accountWrap.classList.add("is-logged-out");
      }
      if(accountMenu){
        accountMenu.classList.remove("open");
        accountMenu.classList.add("logged-out");
        accountMenu.style.setProperty("display","none","important");
        accountMenu.style.setProperty("opacity","0","important");
        accountMenu.style.setProperty("visibility","hidden","important");
        accountMenu.style.setProperty("pointer-events","none","important");
      }
      if(managerBtn) managerBtn.style.display="none";
      const badge=document.getElementById("mailBadge");
      const menuCount=document.getElementById("mailboxMenuCount");
      if(badge){
        badge.textContent="";
        badge.classList.remove("show");
        badge.style.display="none";
      }
      if(menuCount){
        menuCount.textContent="";
        menuCount.style.display="none";
      }
    }
  }

  function activeHeader(){
    const page=(location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll("#pklCommonHeader .main-nav a").forEach(a=>{
      const href=(a.getAttribute("href")||"").toLowerCase();
      a.classList.toggle("active",href===page);
    });
  }



  function isLoginButtonTarget(target){
    return !!(target && target.closest && target.closest('#loginBtn'));
  }

  function isMainGuestBlockedTarget(target){
    if(!target || !target.closest) return false;
    if(isLoginButtonTarget(target)) return false;
    const clickable=target.closest('a,button,[role="button"],.feature-card,.card-btn,.quickbar a,.more,.discord-btn');
    if(!clickable) return false;
    if(clickable.closest('#mailboxModal,#mailConfirm,#mailDeleteConfirm,#mailDeleteAllConfirm')) return false;
    return !!clickable.closest('#pklCommonHeader,.site,main,footer');
  }

  function bindGlobalInteractionGuard(){
    if(window.PKLRoleSystem && typeof window.PKLRoleSystem.bindAccessClickGuard === "function") window.PKLRoleSystem.bindAccessClickGuard();
  }

  function bindGuestAccessGuard(){
    if(window.PKLRoleSystem && typeof window.PKLRoleSystem.enforceVisibility === "function") window.PKLRoleSystem.enforceVisibility(document);
  }

  function guardGuestPageAccess(){
    const page=(location.pathname.split("/").pop() || "index.html").toLowerCase();
    const guestBlocked={"myinfo.html":"user","join.html":"user","team.html":"user","admin.html":"operator"};
    const min=guestBlocked[page];
    if(!min || !(window.PKLRoleSystem && typeof window.PKLRoleSystem.currentHasRole === "function")) return;
    if(window.PKLRoleSystem.currentHasRole(min)) return;
    const msg=min==="operator" ? "관리홈은 운영자 이상만 접근할 수 있습니다." : "로그인 후 이용할 수 있습니다.";
    if(typeof window.PKLRoleSystem.showAccessModal === "function") window.PKLRoleSystem.showAccessModal(msg,"접근 제한").then(function(){location.href=min==="operator"?"index.html":"login.html";});
    else location.href=min==="operator"?"index.html":"login.html";
  }


  function bindLoginButton(){
    const loginBtn=document.getElementById("loginBtn");
    const accountMenu=document.getElementById("accountMenu");
    const accountWrap=document.querySelector(".account-wrap");
    if(!loginBtn) return;

    loginBtn.disabled=false;
    loginBtn.removeAttribute("disabled");
    loginBtn.style.pointerEvents="auto";

    loginBtn.onclick=function(ev){
      if(ev){
        ev.preventDefault();
        ev.stopPropagation();
      }
      const user=getLoginUser();
      if(!user){
        location.href="login.html";
        return false;
      }
      if(accountMenu){
        accountMenu.classList.toggle("open");
        accountMenu.style.removeProperty("display");
        accountMenu.style.removeProperty("opacity");
        accountMenu.style.removeProperty("visibility");
        accountMenu.style.removeProperty("pointer-events");
      }
      if(accountWrap){
        accountWrap.classList.add("is-logged-in");
        accountWrap.classList.remove("is-logged-out");
      }
      return false;
    };
  }

  function bindAccountMenuOutsideClose(){
    document.addEventListener("click",function(ev){
      const accountWrap=document.querySelector(".account-wrap");
      const accountMenu=document.getElementById("accountMenu");
      if(!accountWrap || !accountMenu) return;
      if(accountWrap.contains(ev.target)) return;
      accountMenu.classList.remove("open");
    });
  }

  function renderMailboxList(){
    const list=document.getElementById("mailboxList");
    const detail=document.getElementById("mailboxDetail");
    const actions=document.querySelector("#mailboxModal .mailbox-actions");
    if(!list || !detail) return;

    selectedMailIndex=null;
    detail.classList.remove("open");
    detail.innerHTML="";
    list.style.display="grid";
    if(actions) actions.style.display="flex";

    const mails=visibleMails().slice().sort(function(a,b){ return mailTimeValue(b)-mailTimeValue(a); });
    if(!mails.length){
      list.innerHTML='<div class="mail-empty">우편함이 비어있습니다.</div>';
      return;
    }

    const all=readMails();
    list.innerHTML=mails.map(raw=>{
      const originalIndex=all.findIndex(m=>String(m.id||"")===String(raw.id||""));
      const index=originalIndex>=0 ? originalIndex : all.indexOf(raw);
      const mail=normalizeMail(raw,index);
      return `<button class="mail-row ${mail.read ? "read" : ""}" onclick="openMailDetail(${index})">
        <span>
          <span class="mail-row-date">${escapeHtml(mail.date)}</span>
          <span class="mail-row-title" style="display:block;margin-top:6px">${escapeHtml(mail.title)}</span>
        </span>
        <span class="mail-row-badge">${mail.read ? "읽음" : "NEW"}</span>
      </button>`;
    }).join("");
  }

  function openMailDetail(index){
    const mails=readMails();
    if(!mails[index]) return;
    selectedMailIndex=index;
    mails[index].read=true;
    mails[index].isRead=true;
    mails[index].readAt=mails[index].readAt || new Date().toISOString();
    rememberMailState(mails[index],index,{read:true,readAt:mails[index].readAt,deleted:!!mails[index].deleted});
    persistMailboxPatchToSupabase(mails[index],index,{read:true,isRead:true,readAt:mails[index].readAt});
    saveMails(mails);

    const mail=normalizeMail(mails[index],index);
    const list=document.getElementById("mailboxList");
    const detail=document.getElementById("mailboxDetail");
    const actions=document.querySelector("#mailboxModal .mailbox-actions");
    if(list) list.style.display="none";
    if(actions) actions.style.display="none";
    if(detail){
      detail.classList.add("open");
      detail.innerHTML=`<div class="mail-detail-top">
        <h3>${escapeHtml(mail.title)}</h3>
        <span class="mail-detail-date">${escapeHtml(mail.date)}</span>
      </div>
      <p>${mailLineBreak(mail.body)}</p>
      <div class="mail-detail-meta">보낸 운영자: ${escapeHtml(mail.admin)}</div>
      <div class="mail-detail-actions">
        <button class="mail-back" onclick="renderMailboxList()">목록으로</button>
        <button class="mail-delete" onclick="askDeleteMail(${index})">삭제</button>
      </div>`;
    }
  }

  async function openMailboxModal(){
    if(!getLoginUser()){ location.href="login.html"; return; }
    const modal=document.getElementById("mailboxModal");
    if(modal) modal.classList.add("open");

    // 우편함은 먼저 즉시 열고, Supabase 최신 우편은 뒤에서 갱신한다.
    // 기존처럼 fetch를 기다린 뒤 렌더하면 모달 자체가 늦게 뜨는 체감 렉이 생긴다.
    renderMailboxList();
    updateMailboxBadge();

    loadMailboxFromSupabase(true).then(function(){
      updateMailboxBadge();
      renderMailboxList();
    }).catch(function(){
      updateMailboxBadge();
    });
  }

  function closeMailboxModal(){ document.getElementById("mailboxModal")?.classList.remove("open"); }
  function askMarkAllRead(){ document.getElementById("mailConfirm")?.classList.add("open"); }
  function closeMailConfirm(){ document.getElementById("mailConfirm")?.classList.remove("open"); }
  function markMailboxRead(){
    const mails=readMails();
    mails.forEach(m=>{
      if(isMailForCurrentUser(m)){
        m.read=true;
        m.isRead=true;
        m.readAt=m.readAt||new Date().toISOString();
        var mi=readMails().indexOf(m);
        rememberMailState(m,mi,{read:true,readAt:m.readAt,deleted:!!m.deleted});
        persistMailboxPatchToSupabase(m,mi,{read:true,isRead:true,readAt:m.readAt});
      }
    });
    saveMails(mails);
    closeMailConfirm();
    renderMailboxList();
  }
  function askDeleteMail(index){ selectedMailIndex=index; document.getElementById("mailDeleteConfirm")?.classList.add("open"); }
  function closeMailDeleteConfirm(){ document.getElementById("mailDeleteConfirm")?.classList.remove("open"); }
  function deleteSelectedMail(){
    const mails=readMails();
    if(selectedMailIndex!==null && mails[selectedMailIndex]){
      mails[selectedMailIndex].deleted=true;
      mails[selectedMailIndex].read=true;
      mails[selectedMailIndex].isRead=true;
      rememberMailState(mails[selectedMailIndex],selectedMailIndex,{read:true,readAt:mails[selectedMailIndex].readAt||new Date().toISOString(),deleted:true});
      persistMailboxPatchToSupabase(mails[selectedMailIndex],selectedMailIndex,{read:true,isRead:true,readAt:mails[selectedMailIndex].readAt||new Date().toISOString(),deleted:true});
    }
    saveMails(mails);
    closeMailDeleteConfirm();
    renderMailboxList();
  }
  function askDeleteAllMails(){ document.getElementById("mailDeleteAllConfirm")?.classList.add("open"); }
  function closeDeleteAllConfirm(){ document.getElementById("mailDeleteAllConfirm")?.classList.remove("open"); }
  function deleteAllMails(){
    const mails=readMails();
    mails.forEach(m=>{
      if(isMailForCurrentUser(m)){
        m.deleted=true;
        m.read=true;
        m.isRead=true;
        var mi=readMails().indexOf(m);
        rememberMailState(m,mi,{read:true,readAt:m.readAt||new Date().toISOString(),deleted:true});
        persistMailboxPatchToSupabase(m,mi,{read:true,isRead:true,readAt:m.readAt||new Date().toISOString(),deleted:true});
      }
    });
    saveMails(mails);
    closeDeleteAllConfirm();
    renderMailboxList();
  }
  function logout(){
    try {
      PKL_LOGIN_STORAGE_KEYS.forEach(function(key){
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
      localStorage.setItem(PKL_MANUAL_LOGOUT_KEY, "1");
    } catch (e) {}
    location.href="login.html";
  }

  function mount(){
    injectStyle();
    bindGlobalInteractionGuard();
    bindGuestAccessGuard();
    guardGuestPageAccess();

    let mountEl=document.getElementById("pklCommonHeader");
    if(!mountEl){
      mountEl=document.createElement("div");
      mountEl.id="pklCommonHeader";
      document.body.insertBefore(mountEl,document.body.firstChild);
    }

    document.querySelectorAll("header.topbar").forEach(function(existing){
      if(!mountEl.contains(existing)) existing.remove();
    });

    if(!mountEl.querySelector("header.topbar")){
      mountEl.innerHTML=HEADER_HTML;
    }

    document.getElementById("mailboxModal")?.remove();
    document.querySelectorAll("#mailConfirm,#mailDeleteConfirm,#mailDeleteAllConfirm").forEach(el=>el.remove());
    document.body.insertAdjacentHTML("beforeend",MAILBOX_HTML);

    activeHeader();
    syncLoginState();
    bindLoginButton();
  }

  function bootHeaderOnce(){
    if(window.__PKL_COMMON_HEADER_MOUNTED__) return;
    window.__PKL_COMMON_HEADER_MOUNTED__=true;
    if(!window.__pklAccountMenuOutsideCloseBound){
      window.__pklAccountMenuOutsideCloseBound=true;
      bindAccountMenuOutsideClose();
    }
    mount();
    setTimeout(syncLoginState,0);
    setTimeout(updateMailboxBadge,0);
  }

  // 스크립트가 body 하단에서 실행되는 페이지(index 포함)는 DOMContentLoaded까지 기다리지 않고 즉시 헤더를 붙인다.
  // body가 아직 없는 예외 페이지만 DOMContentLoaded로 fallback.
  if(document.body) bootHeaderOnce();
  else document.addEventListener("DOMContentLoaded",bootHeaderOnce,{once:true});
  window.addEventListener("storage",()=>{ syncLoginState(); updateMailboxBadge(); });
  window.addEventListener("pkl-mailbox-updated",()=>{ syncLoginState(); updateMailboxBadge(); });
  window.addEventListener("pkl-role-data-updated",()=>{ syncLoginState(); updateMailboxBadge(); });

  window.openMailboxModal=openMailboxModal;
  window.closeMailboxModal=closeMailboxModal;
  window.renderMailboxList=renderMailboxList;
  window.openMailDetail=openMailDetail;
  window.askMarkAllRead=askMarkAllRead;
  window.closeMailConfirm=closeMailConfirm;
  window.markMailboxRead=markMailboxRead;
  window.askDeleteMail=askDeleteMail;
  window.closeMailDeleteConfirm=closeMailDeleteConfirm;
  window.deleteSelectedMail=deleteSelectedMail;
  window.askDeleteAllMails=askDeleteAllMails;
  window.closeDeleteAllConfirm=closeDeleteAllConfirm;
  window.deleteAllMails=deleteAllMails;
  window.updateMailboxBadge=updateMailboxBadge;
  window.syncLoginState=syncLoginState;
  window.logout=logout;
})();
// PKL_SHEET_BACK_FIX
(function(){
  const page=(location.pathname.split("/").pop()||"").toLowerCase();
  if(page==="sheet.html"){
    document.addEventListener("DOMContentLoaded",function(){
      const header=document.querySelector(".topbar-inner");
      if(!header) return;

      // hide logo
      const brand=header.querySelector(".brand");
      if(brand) brand.style.display="none";

      // create back button
      const btn=document.createElement("button");
      btn.className="top-btn";
      btn.innerText="← 뒤로가기";
      btn.onclick=function(){history.back();};

      header.insertBefore(btn, header.firstChild);
    });
  }
})();

