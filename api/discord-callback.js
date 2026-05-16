let supabaseStore;
try {
  supabaseStore = require("./pkl-supabase-store");
} catch (error) {
  supabaseStore = {
    async readUsers(){ return []; },
    async writeUsers(users){ return true; }, async readAdminState(){ return {users:[],pending:[],bans:[],warningRecords:[]}; }
  };
}
function readCookie(cookieHeader, name) {
  return String(cookieHeader || "").split(";").map(v => v.trim()).reduce((acc, part) => {
    const i = part.indexOf("=");
    if (i > -1) acc[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
    return acc;
  }, {})[name] || "";
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

const DEFAULT_PUBLIC_HOST = "prime-theta-five.vercel.app";
const PRODUCTION_HOST = process.env.PUBLIC_SITE_HOST || process.env.SITE_HOST || DEFAULT_PUBLIC_HOST;
const PRODUCTION_REDIRECT_URI = `https://${PRODUCTION_HOST}/api/discord-callback`;

function env(name) { return String(process.env[name] || "").trim(); }
function currentSiteUrl(event) {
  const host = String(event.headers.host || event.headers.Host || PRODUCTION_HOST).trim();
  const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}
function sanitizeReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw) return "/index.html";
  try {
    const decoded = decodeURIComponent(raw);
    if (/^https?:\/\//i.test(decoded)) {
      const u = new URL(decoded);
      if (u.host !== PRODUCTION_HOST) return "/index.html";
      return (u.pathname || "/index.html") + (u.search || "");
    }
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded.slice(0, 180);
  } catch (e) {}
  return "/index.html";
}

function getRedirectUri(event) {
  const configured = env("DISCORD_REDIRECT_URI") || env("PUBLIC_DISCORD_REDIRECT_URI");
  if (configured && /^https:\/\//i.test(configured) && !/localhost|127\.0\.0\.1/i.test(configured)) return configured.replace(/\/$/, "");
  const publicUrl = env("PUBLIC_SITE_URL") || env("SITE_URL");
  if (publicUrl && /^https:\/\//i.test(publicUrl) && !/localhost|127\.0\.0\.1/i.test(publicUrl)) return publicUrl.replace(/\/$/, "") + "/api/discord-callback";
  return PRODUCTION_REDIRECT_URI;
}
function mask(value) {
  const v = String(value || "");
  if (!v) return "EMPTY";
  if (v.length <= 8) return "****";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
function normalizeNickname(value){
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/[\s\u00a0\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/^(?:[^\p{L}\p{N}_-]|[\uFE0E\uFE0F\u200D])+/u, '')
    .trim();
}
function isKoreanNickname(value){ return /^[가-힣]{1,4}$/.test(normalizeNickname(value)); }
function normalizePubgId(value){ return String(value == null ? "" : value).normalize("NFKC").trim(); }
function cleanId(v){ return String(v == null ? "" : v).trim().toLowerCase().replace(/^discord-/, ""); }
function explicitDiscordId(u){
  u = u || {};
  const d = cleanId(u.discordId || u.discord_id);
  if(d) return d;
  for(const k of ['uid','id','userId','key']){
    const raw = String(u[k] || '').trim();
    if(/^discord-/i.test(raw)) return cleanId(raw);
  }
  return '';
}
function discordKey(u){ return explicitDiscordId(u); }
function sameDiscordUser(a,b){
  const ad = explicitDiscordId(a), bd = explicitDiscordId(b);
  return !!(ad && bd && ad === bd);
}
function identityValues(u){u=u||{};const did=explicitDiscordId(u);return [did,u.pubgId,u.gameId,u.ref,u.nickname,u.nick,u.name].map(cleanId).filter(Boolean);}
function sameAnyUser(a,b){const av=identityValues(a), bv=identityValues(b);return av.length&&bv.length&&av.some(v=>bv.includes(v));}
function parseBanDateMs(text){const m=String(text||"").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(!m)return 0;return new Date(`${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}T00:00:00+09:00`).getTime();}
function isActiveBanRecord(b){if(!b)return false;if(b.permanent===false||b.selfWithdraw||b.withdrawal||b.type==="withdraw"){const t=parseBanDateMs(b.date||b.withdrawnAt||b.createdAt);return !t || Date.now()-t < 30*86400000;}return true;}
async function isBlockedByBanRecords(user){try{if(supabaseStore&&typeof supabaseStore.hasActiveBanRecord==='function')return await supabaseStore.hasActiveBanRecord(user);}catch(e){}try{const st=await supabaseStore.readAdminState();const bans=(Array.isArray(st&&st.bans)?st.bans:[]).filter(isActiveBanRecord);return bans.some(b=>sameAnyUser(b,user));}catch(e){return false;}}
function shouldResetAfterBanRelease(saved){saved=saved||{};return !!(saved.banned||saved.isBanned||String(saved.role||'').toLowerCase()==='banned'||saved.rejoinAllowed||saved.banReleasedAt||(saved.raw&&(saved.raw.rejoinAllowed||saved.raw.banReleasedAt)));}
function resetReleasedUserBase(saved){const out=Object.assign({},saved||{});out.banned=false;out.isBanned=false;out.role='user';out.memberRole='user';out.userRole='user';out.authRole='user';out.adminRole='일반';out.memberRoleName='일반';out.memberTier='none';out.gradeRole='none';out.tierRole='none';out.baseRole='none';out.originalRole='none';out.tier='없음';out.memberTierName='없음';out.warnings=0;return out;}

function getUserNickname(u){ return normalizeNickname(u && (u.nickname || u.nick || u.name || u.displayName || u.pubgId)); }
function nicknameTaken(users, nickname, current){
  const target = normalizeNickname(nickname);
  return Array.isArray(users) && users.some(u => !sameDiscordUser(u, current) && getUserNickname(u) === target);
}
function normalizeRole(role){
  const raw = String(role || "").trim();
  const low = raw.toLowerCase();
  if (["admin","manager","owner","master","superadmin"].includes(low) || ["관리자","총관리자","총괄"].includes(raw)) return "admin";
  if (["operator","staff","moderator"].includes(low) || ["운영자","운영진","스태프"].includes(raw)) return "operator";
  if (["prisoner","jail","blocked"].includes(low) || ["수감자","수감","정지"].includes(raw)) return "prisoner";
  if (["guest","temp","temporary"].includes(low) || ["임시","비로그인"].includes(raw)) return "guest";
  return "user";
}
async function readServerUsers(searchUser){
  if (supabaseStore && typeof supabaseStore.readUserDocs === "function") {
    const q = searchUser && (searchUser.discordId || searchUser.discord_id || searchUser.uid || searchUser.id || searchUser.nickname);
    const result = await supabaseStore.readUserDocs({ limit: 100, offset: 0, q: q || "" });
    return (Array.isArray(result && result.users) ? result.users : []).filter(u => !!explicitDiscordId(u));
  }
  if (supabaseStore && typeof supabaseStore.readUsers === "function") return (await supabaseStore.readUsers()).filter(u => !!explicitDiscordId(u));
  return [];
}
async function writeServerUser(user){
  if (supabaseStore && typeof supabaseStore.writeUserDoc === "function") return await supabaseStore.writeUserDoc(user);
  if (supabaseStore && typeof supabaseStore.writeUsers === "function") return await supabaseStore.writeUsers([user]);
  return user;
}
function createUser(discordUser, nickname, saved){
  saved = shouldResetAfterBanRelease(saved) ? resetReleasedUserBase(saved) : saved;
  const finalNickname = normalizeNickname(nickname || saved?.nickname || discordUser.nickname);
  const memberRole = normalizeRole(saved?.memberRole || saved?.role || "user");
  return Object.assign({}, saved || {}, discordUser, {
    uid: saved?.uid || discordUser.uid,
    id: saved?.id || discordUser.id,
    discordId: discordUser.discordId,
    nickname: finalNickname,
    nick: finalNickname,
    name: finalNickname,
    displayName: finalNickname,
    pubgId: normalizePubgId(saved?.pubgId || saved?.gameId || saved?.ref || discordUser.pubgId || finalNickname),
    gameId: normalizePubgId(saved?.pubgId || saved?.gameId || saved?.ref || discordUser.pubgId || finalNickname),
    ref: normalizePubgId(saved?.pubgId || saved?.gameId || saved?.ref || discordUser.pubgId || finalNickname),
    role: memberRole,
    memberRole: memberRole,
    gradeRole: saved?.gradeRole || "none",
    tier: saved?.tier || "없음",
    status: "approved",
    approved: true,
    warnings: Number(saved?.warnings || 0),
    join: saved?.join || discordUser.join,
    last: discordUser.last,
    logs: Number(saved?.logs || 0) + 1,
    memoList: Array.isArray(saved?.memoList) ? saved.memoList : [],
    history: Array.isArray(saved?.history) ? saved.history : []
  });
}
async function registerServerUser(discordUser, nickname){
  const users = await readServerUsers(discordUser);
  const existingIndex = users.findIndex(u => sameDiscordUser(u, discordUser));
  const saved = existingIndex >= 0 ? users[existingIndex] : null;
  const finalNickname = normalizeNickname(nickname || saved?.nickname || discordUser.nickname);
  if (!saved && !isKoreanNickname(finalNickname)) return { ok:false, statusCode:400, message:"닉네임은 한글만 사용해서 1~4글자로 입력해주세요." };
  const merged = createUser(discordUser, finalNickname, saved || {});
  if (!saved){
    merged.role = "user";
    merged.memberRole = "user";
    merged.userRole = "user";
    merged.authRole = "user";
    merged.adminRole = "일반";
    merged.memberRoleName = "일반";
    merged.isAdmin = false;
    merged.admin = false;
    merged.manager = false;
    merged.operator = false;
  }
  if (!saved && nicknameTaken(users, finalNickname, merged)) return { ok:false, statusCode:409, message:"이미 사용 중인 닉네임입니다." };
  if (existingIndex >= 0) users[existingIndex] = merged; else users.push(merged);
  await writeServerUser(merged);
  return { ok:true, user: merged, users };
}
function oauthErrorHtml(title, message, data) {
  const rows = Object.entries(data || {}).map(([k, v]) => `<div class="row"><b>${escapeHtml(k)}</b><span>${escapeHtml(v)}</span></div>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PKL Discord OAuth</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% 0%,rgba(126,34,206,.24),transparent 42%),linear-gradient(180deg,#07070d,#030306);color:#fff;font-family:Malgun Gothic,Arial,sans-serif;padding:24px}.card{width:min(560px,calc(100vw - 32px));border:1px solid rgba(168,85,247,.48);border-radius:20px;background:linear-gradient(180deg,rgba(16,11,28,.96),rgba(5,5,10,.98));box-shadow:0 28px 80px rgba(0,0,0,.62),0 0 34px rgba(168,85,247,.22);padding:28px}.k{font-size:12px;font-weight:1000;letter-spacing:2.4px;color:#c084fc;margin-bottom:10px}h1{font-size:22px;margin:0 0 10px}p{color:#d8b4fe;line-height:1.65;font-weight:800;font-size:13px}.box{margin-top:16px;border:1px solid rgba(255,255,255,.12);border-radius:14px;overflow:hidden;background:rgba(0,0,0,.28)}.row{display:grid;grid-template-columns:160px 1fr;gap:12px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08);font-size:12px}.row:first-child{border-top:0}.row b{color:#fff}.row span{color:#c4b5fd;word-break:break-all}.btn{display:inline-flex;margin-top:18px;color:#fff;text-decoration:none;border:1px solid rgba(216,180,254,.52);border-radius:12px;padding:12px 16px;background:linear-gradient(180deg,rgba(168,85,247,.32),rgba(88,28,135,.74));font-weight:1000}</style></head><body><div class="card"><div class="k">PKL DISCORD AUTH</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><div class="box">${rows}</div><a class="btn" href="/login.html">로그인으로 돌아가기</a></div></body></html>`;
}
function callbackHtml(payload) {
  const safePayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PKL Discord 로그인</title><style>*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0%,rgba(126,34,206,.24),transparent 42%),linear-gradient(180deg,#07070d,#030306);color:#fff;font-family:Malgun Gothic,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}.pkl-auth-card{width:min(430px,calc(100vw - 32px));text-align:center;border:1px solid rgba(168,85,247,.46);border-radius:20px;padding:30px 28px;background:linear-gradient(180deg,rgba(16,11,28,.94),rgba(5,5,10,.98));box-shadow:0 28px 80px rgba(0,0,0,.62),0 0 34px rgba(168,85,247,.23),inset 0 1px 0 rgba(255,255,255,.08)}.pkl-auth-kicker{font-size:12px;font-weight:1000;letter-spacing:2.6px;color:#c084fc;margin-bottom:10px}.pkl-auth-card h1{margin:0 0 10px;font-size:25px;letter-spacing:-.6px}.pkl-auth-card p{margin:0;color:#c4b5fd;font-weight:800;line-height:1.55;font-size:13px}.pkl-nick-form{display:none;margin-top:22px;text-align:left}.pkl-nick-form.show{display:block}.pkl-nick-label{display:block;margin:0 0 8px;color:#e9d5ff;font-size:13px;font-weight:1000}.pkl-nick-input{width:100%;height:46px;border-radius:12px;border:1px solid rgba(168,85,247,.38);background:rgba(0,0,0,.36);color:#fff;padding:0 14px;font-size:16px;font-weight:900;outline:none}.pkl-nick-help{margin:9px 0 0;color:rgba(255,255,255,.55);font-size:12px;font-weight:800}.pkl-nick-error{min-height:18px;margin:10px 0 0;color:#ff9a9a;font-size:12px;font-weight:1000}.pkl-nick-btn{width:100%;height:46px;margin-top:14px;border:1px solid rgba(216,180,254,.52);border-radius:12px;background:linear-gradient(180deg,rgba(168,85,247,.32),rgba(88,28,135,.74));color:#fff;font-weight:1000;letter-spacing:.4px;cursor:pointer;box-shadow:0 0 18px rgba(168,85,247,.18),inset 0 1px 0 rgba(255,255,255,.10)}.pkl-loading{display:block}.pkl-loading.hide{display:none}</style></head><body><div class="pkl-auth-card"><div class="pkl-auth-kicker">PKL DISCORD AUTH</div><div id="pklLoading" class="pkl-loading"><h1>Discord 로그인 완료</h1><p>PKL로 이동합니다.</p></div><form id="pklNickForm" class="pkl-nick-form" autocomplete="off"><h1>닉네임 설정</h1><p>처음 가입하는 계정은 PKL 닉네임을 먼저 설정해야 합니다.</p><label class="pkl-nick-label" for="pklNickname">PKL 닉네임</label><input id="pklNickname" class="pkl-nick-input" type="text" maxlength="4" inputmode="text" placeholder="한글 1~4자" autocomplete="off"><div class="pkl-nick-help">한글만 사용 가능 · 최대 4글자 · 중복 닉네임 불가</div><label class="pkl-nick-label" for="pklPubgId" style="margin-top:14px">배그 ID</label><input id="pklPubgId" class="pkl-nick-input" type="text" maxlength="32" inputmode="latin" placeholder="PUBG ID" autocomplete="off"><div class="pkl-nick-help">영문, 숫자, -, _ 만 입력할 수 있습니다.</div><div id="pklNickError" class="pkl-nick-error"></div><button class="pkl-nick-btn" type="submit">PKL 입장하기</button></form></div><script>(function(){
var payload=${safePayload};
var LOGIN_KEYS=["pklLoginUser","pklCurrentUser","pklUser","pklLoggedInUser","pkl_current_user"];
function readJson(k,f){try{var r=localStorage.getItem(k);return r?JSON.parse(r):f;}catch(e){return f;}}
function writeJson(k,v){localStorage.setItem(k,JSON.stringify(v));}
function cleanId(v){return String(v==null?"":v).trim().toLowerCase().replace(/^discord-/,"");}
function explicitDiscordId(u){u=u||{};var d=cleanId(u.discordId||u.discord_id);if(d)return d;['uid','id','userId','key'].some(function(k){var raw=String(u[k]||'').trim();if(/^discord-/i.test(raw)){d=cleanId(raw);return true;}return false;});return d;}
function sameDiscordUser(a,b){var ad=explicitDiscordId(a),bd=explicitDiscordId(b);return !!(ad&&bd&&ad===bd);}
function normalizeNickname(v){return String(v==null?"":v).normalize("NFKC").replace(/[\s\u00a0\u200b\u200c\u200d\ufeff]/g,"").replace(/^[^A-Za-z0-9가-힣_-]+/g,"").trim();}
function isKoreanNickname(v){return /^[가-힣]{1,4}$/.test(normalizeNickname(v));}
function normalizePubgId(v){return String(v==null?"":v).normalize("NFKC").trim();}
function isValidPubgId(v){return /^[A-Za-z0-9_-]{1,32}$/.test(normalizePubgId(v));}
function syncLocal(user){try{localStorage.removeItem("pklManualLogout");localStorage.removeItem("pklUsers");localStorage.removeItem("PKL_USERS");localStorage.removeItem("pklAdminState_v3");}catch(e){}LOGIN_KEYS.forEach(function(k){writeJson(k,user);try{sessionStorage.removeItem(k);}catch(e){}});}
function goHome(){var to=payload.returnTo||"/index.html";location.replace(to);}
if(payload.existingUser){syncLocal(payload.existingUser);goHome();return;}
var loading=document.getElementById("pklLoading"),form=document.getElementById("pklNickForm"),input=document.getElementById("pklNickname"),pubgInput=document.getElementById("pklPubgId"),error=document.getElementById("pklNickError");
if(loading)loading.className+=" hide";if(form)form.className+=" show";if(input){input.value="";setTimeout(function(){input.focus();},50);}
form.addEventListener("submit",async function(e){e.preventDefault();var nickname=normalizeNickname(input.value);var pubgId=normalizePubgId(pubgInput&&pubgInput.value);if(!isKoreanNickname(nickname)){error.textContent="닉네임은 한글만 사용해서 1~4글자로 입력해주세요.";input.focus();return;}if(!isValidPubgId(pubgId)){error.textContent="배그 ID는 영문, 숫자, -, _ 만 사용할 수 있습니다.";(pubgInput||input).focus();return;}error.textContent="";try{var res=await fetch("/api/pkl-register-user",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({discordUser:payload.discordUser,nickname:nickname,nick:nickname,name:nickname,pubgId:pubgId,gameId:pubgId,ref:pubgId})});var data=await res.json();if(!res.ok||!data.ok){error.textContent=data.message||"닉네임 설정에 실패했습니다.";input.focus();return;}syncLocal(data.user);goHome();}catch(err){error.textContent="가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.";input.focus();}});
})();</script></body></html>`;
}

exports.handler = async function(event) {
  const params = event.queryStringParameters || {};
  const code = params.code || "";
  const returnedState = params.state || "";
  const cookieHeader = event.headers.cookie || event.headers.Cookie || "";
  const savedState = readCookie(cookieHeader, "pkl_discord_oauth_state");
  const returnTo = sanitizeReturnTo(readCookie(cookieHeader, "pkl_login_return_to") || "/index.html");
  const redirectUri = getRedirectUri(event);
  const clientId = env("DISCORD_CLIENT_ID") || env("DISCORD_APPLICATION_ID") || env("CLIENT_ID");
  const clientSecret = env("DISCORD_CLIENT_SECRET") || env("DISCORD_SECRET") || env("CLIENT_SECRET");

  if (!code || !returnedState || !savedState || returnedState !== savedState) return { statusCode: 302, headers: { "Cache-Control":"no-store", "Location":"/api/discord-login", "Set-Cookie": ["pkl_discord_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0", "pkl_login_return_to=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"] }, body: "" };
  if (!/^\d{16,22}$/.test(clientId)) return { statusCode: 500, headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store" }, body: oauthErrorHtml("Discord Client ID 오류", "Vercel Environment Variables의 DISCORD_CLIENT_ID에는 Discord Developer Portal의 Application ID 숫자만 넣어야 합니다.", { DISCORD_CLIENT_ID: mask(clientId), Redirect: redirectUri }) };
  if (!clientSecret) return { statusCode: 500, headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store" }, body: oauthErrorHtml("Discord Secret 누락", "Vercel Environment Variables의 DISCORD_CLIENT_SECRET 값이 비어 있습니다.", { DISCORD_CLIENT_ID: mask(clientId), DISCORD_CLIENT_SECRET: "EMPTY", Redirect: redirectUri }) };

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri })
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    let hint = "Discord 토큰 요청에 실패했습니다.";
    if (detail.includes("invalid_client")) hint = "DISCORD_CLIENT_ID와 DISCORD_CLIENT_SECRET이 서로 다른 Discord 앱 값이거나 Secret 값이 재발급되어 맞지 않습니다.";
    if (detail.includes("invalid_grant")) hint = "Discord Redirect URI가 로그인 요청과 토큰 요청에서 다릅니다.";
    return { statusCode: 502, headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store" }, body: oauthErrorHtml("Discord 토큰 요청 실패", hint, { DiscordError: detail, DISCORD_CLIENT_ID: mask(clientId), DISCORD_CLIENT_SECRET: mask(clientSecret), Redirect: redirectUri }) };
  }
  const token = await tokenRes.json();
  const meRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `${token.token_type} ${token.access_token}` } });
  if (!meRes.ok) return { statusCode: 502, headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store" }, body: `Discord 사용자 정보 요청 실패: ${escapeHtml(await meRes.text())}` };
  const me = await meRes.json();
  const displayName = me.global_name || me.username || `discord_${me.id}`;
  const discordUser = { uid:`discord-${me.id}`, id:`discord-${me.id}`, discordId:me.id, discordUsername:me.username||"", discord_username:me.username||"", username:me.username||"", discordGlobalName:me.global_name||"", global_name:me.global_name||"", displayName:displayName, email:me.email||"", avatar:me.avatar?`https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`:"", nickname:displayName, nick:displayName, name:displayName, displayName, pubgId:displayName, provider:"discord", authType:"discord", join:new Date().toLocaleString("ko-KR"), last:new Date().toLocaleString("ko-KR") };

  if (await isBlockedByBanRecords(discordUser)) {
    return { statusCode: 403, headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store", "Set-Cookie": ["pkl_discord_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0", "pkl_login_return_to=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"] }, body: oauthErrorHtml("가입 제한", "추방 기록이 있는 계정은 회원가입할 수 없습니다. 운영진에게 문의해주세요.", { Discord: displayName, Reason: "banRecords" }) };
  }

  const serverUsers = await readServerUsers(discordUser);
  const existing = serverUsers.find(u => sameDiscordUser(u, discordUser));
  const payload = {
  existingUser: existing || null,
  discordUser,
  returnTo
};
  if (existing) {
    await registerServerUser(discordUser, existing.nickname || existing.nick || existing.name);
    try{ if(supabaseStore && typeof supabaseStore.syncDiscordProfile === "function") await supabaseStore.syncDiscordProfile(discordUser); }catch(_e){}
  }

  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control":"no-store", "Set-Cookie": ["pkl_discord_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0", "pkl_login_return_to=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"] }, body: callbackHtml(payload) };
};


async function vercelAdapter(req, res) {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || PRODUCTION_HOST;
    const url = new URL(req.url || "/api/discord-callback", `${proto}://${host}`);
    const event = {
      headers: req.headers || {},
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: req.body
    };
    const result = await exports.handler(event);
    Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.status(result.statusCode || 200).send(result.body || "");
  } catch (error) {
    console.error("discord-callback failed", error);
    res.status(500).send("Discord callback function error: " + (error && error.message ? error.message : String(error)));
  }
}

module.exports = vercelAdapter;
