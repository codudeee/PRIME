function env(name) {
  return String(process.env[name] || "").trim();
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

function getConfig() {
  const url = cleanUrl(
    env("SUPABASE_URL") ||
    env("VITE_SUPABASE_URL") ||
    env("NEXT_PUBLIC_SUPABASE_URL") ||
    env("PKL_SUPABASE_URL")
  );

  const anonKey =
    env("SUPABASE_ANON_KEY") ||
    env("VITE_SUPABASE_ANON_KEY") ||
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    env("PKL_SUPABASE_ANON_KEY");

  return { url, anonKey, ready: !!(url && anonKey) };
}

exports.handler = async function() {
  const body = JSON.stringify(getConfig());
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body
  };
};

module.exports = async function(req, res) {
  const config = getConfig();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(JSON.stringify(config));
};
