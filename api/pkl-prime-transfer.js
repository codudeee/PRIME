const store = require("./pkl-supabase-store");

function clean(v){ return String(v == null ? "" : v).trim(); }
function did(u){
  u = u || {};
  const raw = clean(u.discord_id || u.discordId || u.discord || u.user_id || u.userId || u.uid || u.id || "");
  return raw.replace(/^discord-/i, "");
}
function identity(u){
  u = u || {};
  return {
    discordId: did(u),
    nickname: clean(u.nickname || u.nick || u.name || u.discord_username || u.discordUsername),
    pubgId: clean(u.pubg_id || u.pubgId || u.gameId || u.ref)
  };
}

module.exports = async function handler(req, res){
  try{
    if(req.method !== "POST") return res.status(405).json({ok:false, message:"Method not allowed"});
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const from = identity(body.from);
    const to = identity(body.to);
    const amount = Math.floor(Number(body.amount || 0));
    if(!amount || amount < 1) return res.status(400).json({ok:false, message:"송금액을 입력해주세요."});
    if(!from.discordId && !from.nickname && !from.pubgId) return res.status(400).json({ok:false, message:"보내는 유저 정보가 없습니다."});
    if(!to.discordId && !to.nickname && !to.pubgId) return res.status(400).json({ok:false, message:"받는 유저 정보가 없습니다."});
    if(from.discordId && to.discordId && from.discordId === to.discordId) return res.status(400).json({ok:false, message:"본인에게는 송금할 수 없습니다."});

    const fee = Math.floor(amount * 0.1);
    const receive = amount - fee;
    if(receive < 1) return res.status(400).json({ok:false, message:"수수료 차감 후 받을 금액이 없습니다."});

    const sender = await store.adjustUserPrime(from, -amount, `프라임 송금: ${to.nickname || to.pubgId || to.discordId} / 수수료 ${fee}`, from.nickname || "USER");
    const receiver = await store.adjustUserPrime(to, receive, `프라임 수신: ${from.nickname || from.pubgId || from.discordId} / 원송금 ${amount}, 수수료 ${fee}`, from.nickname || "USER");

    return res.status(200).json({
      ok:true,
      amount,
      fee,
      receive,
      senderPrime: sender.after,
      receiverPrime: receiver.after
    });
  }catch(error){
    return res.status(500).json({ok:false, message:error && error.message ? error.message : String(error)});
  }
};
