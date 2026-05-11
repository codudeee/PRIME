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
      const limit = intParam(req.query && req.query.limit, 20, 1, 100);
      const offset = intParam(req.query && req.query.offset, 0, 0, 1000000);
      const q = String((req.query && req.query.q) || '').trim();
      const result = await supabaseStore.readUserDocs({ limit, offset, q });
      return res.status(200).json({ ok: true, users: result.users, count: result.count, limit, offset, q });
    }
    if (req.method === 'POST') {
      const body = parseBody(req);
      const input = body.user || (Array.isArray(body.users) ? body.users[0] : null);
      if (!input || typeof input !== 'object') return res.status(400).json({ ok: false, message: '저장할 user가 없습니다.' });
      const user = await supabaseStore.writeUserDoc(input, !!body.forceAdmin);
      return res.status(200).json({ ok: true, user, users: [user] });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || String(error) });
  }
};
