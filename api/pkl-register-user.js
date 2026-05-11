
let firebaseStore;
try{ firebaseStore = require("./pkl-supabase-store"); }catch(e){ firebaseStore = { async readUsers(){ return []; }, async writeUsers(users){ return users; } }; }
function normalizeNickname(value){return String(value==null?"":value).normalize("NFKC").replace(/[\s\u00a0\u200b\u200c\u200d\ufeff]/g,"").trim();}
function normalizePubgId(value){return String(value==null?"":value).normalize("NFKC").trim();}
function isKoreanNickname(value){return /^[가-힣]{1,4}$/.test(normalizeNickname(value));}
function isValidPubgId(value){return /^[A-Za-z0-9_-]{2,32}$/.test(normalizePubgId(value));}
function cleanId(v){return String(v==null?"":v).trim().toLowerCase();}
function sameDiscord(a,b){return cleanId(a&&a.discordId)&&cleanId(a&&a.discordId)===cleanId(b&&b.discordId);}
function identityValue(u){u=u||{};return [u.discordId,u.uid,u.id,u.userId,u.key,u.pubgId,u.gameId,u.ref,u.nickname,u.nick,u.name].map(cleanId).filter(Boolean);}
function sameAnyUser(a,b){const av=identityValue(a), bv=identityValue(b);return av.length&&bv.length&&av.some(v=>bv.includes(v));}
function parseKoreanDateMs(text){const m=String(text||"").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(!m)return 0;return new Date(`${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}T00:00:00+09:00`).getTime();}
function isActiveBanRecord(b){if(!b)return false;if(b.permanent===false||b.selfWithdraw||b.withdrawal||b.type==="withdraw"){const t=parseKoreanDateMs(b.date||b.withdrawnAt||b.createdAt);return !t || Date.now()-t < 30*86400000;}return true;}
async function readActiveBans(){try{const st=await firebaseStore.readAdminState();return (Array.isArray(st&&st.bans)?st.bans:[]).filter(isActiveBanRecord);}catch(e){return []}}


function buildApprovedUser(discordUser,nickname,pubgId,old){
  const nick=normalizeNickname(nickname||old?.nickname||discordUser?.discordGlobalName||discordUser?.discordUsername||"유저");
  const game=normalizePubgId(pubgId||old?.pubgId||old?.gameId||old?.ref||nick);
  const now=new Date().toLocaleString("ko-KR");

  return Object.assign({}, old||{}, discordUser||{}, {
    uid: old?.uid || discordUser?.uid || (discordUser?.discordId ? `discord-${discordUser.discordId}` : `discord-${Date.now()}`),
    id: old?.id || discordUser?.id || (discordUser?.discordId ? `discord-${discordUser.discordId}` : `discord-${Date.now()}`),
    discordId: discordUser?.discordId || old?.discordId || "",
    nickname:nick,
    nick:nick,
    name:nick,
    displayName:nick,

    pubgId:game,
    gameId:game,
    ref:game,

    provider:"discord",
    authType:"discord",

    role: old?.role || "user",
    memberRole: old?.memberRole || old?.role || "user",
    memberRoleName: old?.memberRoleName || "회원",

    status:"approved",
    approved:true,

    warnings:Number(old?.warnings||0),

    join:old?.join||now,
    last:now,
    updatedAt:new Date().toISOString(),

    memoList:Array.isArray(old?.memoList)?old.memoList:[],
    history:Array.isArray(old?.history)?old.history:[]
  });
}

async function handler(req,res){
  try{

    if(req.method!=="POST"){
      return res.status(405).json({
        ok:false,
        message:"Method not allowed"
      });
    }

    const body=typeof req.body==="string"
      ? JSON.parse(req.body||"{}")
      : (req.body||{});

    const discordUser=body.discordUser||{};
    const nickname=normalizeNickname(body.nickname);
    const pubgId=normalizePubgId(body.pubgId);

    const localUsers=Array.isArray(body.localUsers) ? body.localUsers : [];
    let serverUsers=[];
    try{ serverUsers = await firebaseStore.readUsers(); }catch(e){ serverUsers = []; }
    const allUsers = firebaseStore.mergeUsers ? firebaseStore.mergeUsers(serverUsers, localUsers) : serverUsers.concat(localUsers);
    const activeBans = await readActiveBans();
    const banSeed = Object.assign({}, discordUser, {nickname:nickname, pubgId:pubgId, gameId:pubgId, ref:pubgId});
    if(activeBans.some(b=>sameAnyUser(b, banSeed))){
      return res.status(403).json({ ok:false, message:"추방 기록이 있는 계정은 회원가입할 수 없습니다. 운영진에게 문의해주세요." });
    }

    if(!discordUser.discordId){
      return res.status(400).json({
        ok:false,
        message:"Discord 계정 정보가 없습니다."
      });
    }

    if(!isKoreanNickname(nickname)){
      return res.status(400).json({
        ok:false,
        message:"닉네임은 한글만 사용해서 1~4글자로 입력해주세요."
      });
    }

    if(!isValidPubgId(pubgId)){
      return res.status(400).json({
        ok:false,
        message:"배그 ID는 영문, 숫자, -, _ 만 사용할 수 있습니다."
      });
    }

    // 같은 디스코드 계정 찾기
    const existing=allUsers.find(u=>sameDiscord(u,discordUser));

    // 닉네임 중복 검사
    // 단, 기존 꼬인 데이터 때문에 false-positive 안나오게 안정화
    const taken=allUsers.some(u=>{
      if(!u) return false;

      const same=sameDiscord(u,discordUser);

      if(same) return false;

      const target=normalizeNickname(
        u.nickname||u.nick||u.name||u.displayName
      );

      return target && target===nickname;
    });

    if(taken){
      return res.status(409).json({
        ok:false,
        message:"이미 사용 중인 닉네임입니다."
      });
    }

    const user=buildApprovedUser(discordUser, nickname, pubgId, existing||{});
    if(!existing && Array.isArray(serverUsers) && serverUsers.length===0){
      user.role="admin";
      user.memberRole="admin";
      user.memberRoleName="관리자";
    }
    const nextUsers = firebaseStore.mergeUsers ? firebaseStore.mergeUsers(allUsers, [user]) : allUsers.concat([user]);
    const savedUsers = await firebaseStore.writeUsers(nextUsers);

    return res.status(200).json({
      ok:true,
      user:user,
      users:savedUsers,
      approved:true,
      status:"approved"
    });

  }catch(error){

    return res.status(500).json({
      ok:false,
      message:error&&error.message
        ? error.message
        : String(error)
    });

  }
}

module.exports=handler;
