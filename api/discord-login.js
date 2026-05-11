const PRODUCTION_HOST = "prime-theta-five.vercel.app";
const PRODUCTION_REDIRECT_URI = `https://${PRODUCTION_HOST}/api/discord-callback`;

function env(name) {
  return String(process.env[name] || "").trim();
}

function currentSiteUrl(event) {
  const host = String(event.headers.host || event.headers.Host || PRODUCTION_HOST).trim();
  const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function getRedirectUri(event) {
  const configured = env("DISCORD_REDIRECT_URI");
  const siteUrl = currentSiteUrl(event);
  const host = String(event.headers.host || event.headers.Host || "");
  if (/localhost|127\.0\.0\.1/i.test(host)) {
    return `${siteUrl}/api/discord-callback`;
  }
  if (configured && !/localhost|127\.0\.0\.1/i.test(configured)) return configured.replace(/\/$/, "");
  return `${siteUrl}/api/discord-callback`;
}

exports.handler = async function(event) {
  const clientId = env("DISCORD_CLIENT_ID") || env("DISCORD_APPLICATION_ID") || env("CLIENT_ID");
  const redirectUri = getRedirectUri(event);

  if (!/^\d{16,22}$/.test(clientId)) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: "Discord Client ID가 비어 있거나 잘못되었습니다. Vercel Environment Variables에 DISCORD_CLIENT_ID를 Discord Developer Portal의 Application ID 숫자로 넣어주세요."
    };
  }

  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email",
    state
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
      "Set-Cookie": `pkl_discord_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    },
    body: ""
  };
};


async function vercelAdapter(req, res) {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || PRODUCTION_HOST;
    const url = new URL(req.url || "/api/discord-login", `${proto}://${host}`);
    const event = {
      headers: req.headers || {},
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: req.body
    };
    const result = await exports.handler(event);
    Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.status(result.statusCode || 200).send(result.body || "");
  } catch (error) {
    console.error("discord-login failed", error);
    res.status(500).send("Discord login function error: " + (error && error.message ? error.message : String(error)));
  }
}

module.exports = vercelAdapter;
