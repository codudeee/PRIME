let supabaseStore;
try { supabaseStore = require('./pkl-supabase-store'); } catch (e) { supabaseStore = null; }

function intParam(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function parseBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; }
  }
  return req.body || {};
}
module.exports = async function handler(req, res) {
  try {
    if (!supabaseStore) throw new Error('Supabase store module load failed');
    if (req.method === 'GET') {
      const tierOnly = String((req.query && (req.query.tierOnly || req.query.tier_only)) || '').trim() === '1';
      const limit = intParam(req.query && req.query.limit, tierOnly ? 500 : 20, 1, tierOnly ? 500 : 100);
      const offset = intParam(req.query && req.query.offset, 0, 0, 1000000);
      const q = String((req.query && req.query.q) || '').trim();
      const discordId = String((req.query && (req.query.discordId || req.query.discord_id)) || '').trim();
      const result = await supabaseStore.readUserDocs({ limit, offset, q, discordId, tierOnly });
      return res.status(200).json({ ok: true, users: result.users, count: result.count, limit, offset, q, discordId, tierOnly });
    }
    if (req.method === 'PATCH') {
      const body = parseBody(req);
      if (body.action === 'cleanupDuplicateUsers') {
        if (typeof supabaseStore.cleanupDuplicateUsersByDiscordId !== 'function') throw new Error('Supabase duplicate cleanup function missing');
        const result = await supabaseStore.cleanupDuplicateUsersByDiscordId(Number(body.limit || 2000));
        return res.status(200).json({ ok: true, ...result });
      }
      if (body.action === 'adjustPrime') {
        if (typeof supabaseStore.adjustUserPrime !== 'function') throw new Error('Supabase prime adjustment function missing');
        const result = await supabaseStore.adjustUserPrime(body.user || body.identity || {}, Number(body.amount || 0), String(body.reason || ''), String(body.actor || 'ADMIN'));
        return res.status(200).json({ ok: true, ...result });
      }
      if (body.action === 'updateTier') {
        if (typeof supabaseStore.updateUserTier !== 'function') throw new Error('Supabase tier update function missing');
        const user = await supabaseStore.updateUserTier(body.identity || body.user || {}, body.tier || body.memberTier || body.role || '', body.actor || 'TIER');
        return res.status(200).json({ ok: true, user });
      }
      if (body.action === 'updateUserWithLog') {
        if (typeof supabaseStore.updateUserWithLog !== 'function') throw new Error('Supabase user log function missing');
        const user = await supabaseStore.updateUserWithLog(body.user || body.identity || {}, body.log || {}, body.originalIdentity || body.before || {}, body.before || body.originalIdentity || {});
        return res.status(200).json({ ok: true, user });
      }
      if (body.action === 'recordBan') {
        if (typeof supabaseStore.recordBan !== 'function') throw new Error('Supabase ban function missing');
        const ban = await supabaseStore.recordBan(body.ban || {}, String(body.actor || 'ADMIN'));
        return res.status(200).json({ ok: true, ban });
      }
      if (body.action === 'deleteBanRecord') {
        if (typeof supabaseStore.deleteBanRecord !== 'function') throw new Error('Supabase ban delete function missing');
        const result = await supabaseStore.deleteBanRecord(body.ban || {}, String(body.actor || 'ADMIN'));
        return res.status(200).json({ ok: true, ...result });
      }
      return res.status(400).json({ ok: false, message: '지원하지 않는 PATCH action입니다.' });
    }
    if (req.method === 'POST') {
      const body = parseBody(req);
      const input = body.user || (Array.isArray(body.users) ? body.users[0] : null);
      if (!input || typeof input !== 'object') return res.status(400).json({ ok: false, message: '저장할 user가 없습니다.' });
      const user = await supabaseStore.writeUserDoc(input, !!body.forceAdmin);
      return res.status(200).json({ ok: true, user, users: [user] });
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || String(error) });
  }
};
