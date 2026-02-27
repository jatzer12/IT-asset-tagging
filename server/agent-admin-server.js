const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || "");
const ALLOW_ORIGIN = String(process.env.ALLOW_ORIGIN || "*");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY");
  process.exit(1);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload || {});
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  });
  res.end(body);
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function isStrongPassword(value) {
  const pass = String(value || "");
  return pass.length >= 12
    && /[A-Z]/.test(pass)
    && /[a-z]/.test(pass)
    && /[0-9]/.test(pass)
    && /[^A-Za-z0-9]/.test(pass);
}

function deriveEmailFromUsername(username) {
  if (username.includes("@")) return username.toLowerCase();
  const cleaned = username.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return cleaned + "@pcc.local";
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function fetchAuthUser(accessToken) {
  const result = await fetch(SUPABASE_URL + "/auth/v1/user", {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + accessToken
    }
  });
  if (!result.ok) return null;
  return await result.json();
}

async function fetchProfileRole(userId) {
  const result = await fetch(
    SUPABASE_URL + "/rest/v1/profiles?id=eq." + encodeURIComponent(userId) + "&select=id,username,role",
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY
      }
    }
  );
  if (!result.ok) return null;
  const rows = await result.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0];
}

async function createAuthUser(email, password, username) {
  const result = await fetch(SUPABASE_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: username
      }
    })
  });
  const payload = await result.json().catch(function () { return {}; });
  return { ok: result.ok, status: result.status, payload: payload };
}

async function upsertAgentProfile(userId, username) {
  const result = await fetch(SUPABASE_URL + "/rest/v1/profiles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([{
      id: userId,
      username: username,
      role: "AGENT"
    }])
  });
  return result.ok;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    });
    res.end();
    return;
  }

  if (req.url !== "/api/admin/create-agent" || req.method !== "POST") {
    json(res, 404, { ok: false, message: "Not found." });
    return;
  }

  const authHeader = String(req.headers.authorization || "");
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    json(res, 401, { ok: false, message: "Missing bearer token." });
    return;
  }

  const accessToken = tokenMatch[1];
  const authUser = await fetchAuthUser(accessToken);
  if (!authUser || !authUser.id) {
    json(res, 401, { ok: false, message: "Invalid session token." });
    return;
  }

  const callerProfile = await fetchProfileRole(authUser.id);
  const callerRole = String((callerProfile && callerProfile.role) || "").toUpperCase();
  if (!["MANAGER", "SUPERVISOR"].includes(callerRole)) {
    json(res, 403, { ok: false, message: "Only Manager/Supervisor can create agents." });
    return;
  }

  const body = await readJsonBody(req);
  if (!body) {
    json(res, 400, { ok: false, message: "Invalid JSON body." });
    return;
  }

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  if (!username || !password) {
    json(res, 400, { ok: false, message: "Username (or email) and password are required." });
    return;
  }
  if (!isStrongPassword(password)) {
    json(res, 400, { ok: false, message: "Password must be at least 12 chars with upper, lower, number, and symbol." });
    return;
  }

  const loginEmail = deriveEmailFromUsername(username);
  const created = await createAuthUser(loginEmail, password, username);
  if (!created.ok || !created.payload || !created.payload.user || !created.payload.user.id) {
    const msg = created.payload && created.payload.msg ? created.payload.msg : "Unable to create auth user.";
    json(res, created.status || 400, { ok: false, message: msg });
    return;
  }

  const newUserId = created.payload.user.id;
  const profileOk = await upsertAgentProfile(newUserId, username);
  if (!profileOk) {
    json(res, 500, { ok: false, message: "Auth user created, but profile role insert failed." });
    return;
  }

  json(res, 200, {
    ok: true,
    message: "Agent account created.",
    loginEmail: loginEmail
  });
});

server.listen(PORT, () => {
  console.log("Agent admin API listening on http://localhost:" + PORT);
});
