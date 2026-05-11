let firebaseStore;
try{ firebaseStore = require("./pkl-supabase-store"); }catch(e){ firebaseStore = null; }
let memoryUsers = [];

function mergeUsers(base, incoming){
  if (firebaseStore && firebaseStore.mergeUsers) return firebaseStore.mergeUsers(base, incoming);
  const out = Array.isArray(base) ? base.slice() : [];
  (Array.isArray(incoming) ? incoming : []).forEach(u => out.push(u));
  return out;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const users = firebaseStore ? await firebaseStore.readUsers() : memoryUsers;
      memoryUsers = mergeUsers(memoryUsers, users);
      return res.status(200).json({ ok: true, users: memoryUsers });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const incoming = Array.isArray(body.users) ? body.users : [];
      const current = firebaseStore ? await firebaseStore.readUsers() : memoryUsers;
      memoryUsers = mergeUsers(current, incoming);
      if (firebaseStore) memoryUsers = await firebaseStore.writeUsers(memoryUsers);
      return res.status(200).json({ ok: true, users: memoryUsers });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || String(error) });
  }
};
