(function () {
  const SESSION_KEY = "it_asset_session_v2";
  const DEFAULT_EDGE_FUNCTION_NAME = "super-endpoint";

  function getSupabaseClient() {
    const cfg = window.SUPABASE_CONFIG || null;
    if (!window.supabase || !cfg || !cfg.url || !cfg.anonKey) return null;
    try {
      return window.supabase.createClient(cfg.url, cfg.anonKey);
    } catch (_error) {
      return null;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  async function loadValidatedSession() {
    const client = getSupabaseClient();
    if (!client) return { ok: false, message: "Supabase is not configured." };

    const userResult = await client.auth.getUser();
    const user = userResult && userResult.data ? userResult.data.user : null;
    if (!user || !user.id) {
      clearSessionStorage();
      return { ok: false, message: "No active login session." };
    }

    const profileResult = await client
      .from("profiles")
      .select("username, role")
      .eq("id", user.id)
      .single();

    if (profileResult.error || !profileResult.data) {
      clearSessionStorage();
      return { ok: false, message: "No profile role found. Contact administrator." };
    }

    const session = {
      userId: user.id,
      username: String(profileResult.data.username || user.email || "user"),
      role: String(profileResult.data.role || "AGENT"),
      loginAt: nowIso()
    };
    writeSession(session);
    return { ok: true, session: session };
  }

  function readSession() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function writeSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSessionStorage() {
    localStorage.removeItem(SESSION_KEY);
  }

  function ensureDefaultAccounts() {
    return [];
  }

  async function authenticate(username, password) {
    const email = String(username || "").trim();
    const pass = String(password || "");
    if (!email || !pass) return { ok: false, message: "Email and password are required." };

    const client = getSupabaseClient();
    if (!client) return { ok: false, message: "Supabase is not configured." };

    const signIn = await client.auth.signInWithPassword({ email: email, password: pass });
    if (signIn.error || !signIn.data || !signIn.data.user) {
      return { ok: false, message: "Invalid email or password." };
    }

    const validated = await loadValidatedSession();
    if (!validated.ok) {
      await client.auth.signOut();
      clearSessionStorage();
      return { ok: false, message: validated.message || "No profile role found. Contact administrator." };
    }
    return { ok: true, session: validated.session };
  }

  function getSession() {
    return readSession();
  }

  function clearSession() {
    clearSessionStorage();
    const client = getSupabaseClient();
    if (client) client.auth.signOut();
  }

  function requireAuth(options) {
    const opts = options || {};
    const allowRoles = Array.isArray(opts.allowRoles) ? opts.allowRoles : null;
    const session = readSession();
    if (!session) {
      const currentFile = window.location.pathname.split("/").pop() || "index.html";
      window.location.href = "./login.html?returnTo=" + encodeURIComponent(currentFile);
      return null;
    }
    if (allowRoles && allowRoles.length && !allowRoles.includes(session.role)) {
      window.location.href = "./index.html";
      return null;
    }
    return session;
  }

  async function requireAuthAsync(options) {
    const opts = options || {};
    const allowRoles = Array.isArray(opts.allowRoles) ? opts.allowRoles : null;
    const validated = await loadValidatedSession();
    if (!validated.ok || !validated.session) {
      const currentFile = window.location.pathname.split("/").pop() || "index.html";
      window.location.href = "./login.html?returnTo=" + encodeURIComponent(currentFile);
      return null;
    }
    if (allowRoles && allowRoles.length && !allowRoles.includes(validated.session.role)) {
      window.location.href = "./index.html";
      return null;
    }
    return validated.session;
  }

  function canManageUsers(role) {
    return role === "MANAGER" || role === "SUPERVISOR";
  }

  function canMassDelete(role) {
    return role === "MANAGER" || role === "SUPERVISOR";
  }

  async function readInvokeErrorMessage(invokeError, fallbackMessage) {
    if (!invokeError) return fallbackMessage || "Request failed.";
    if (invokeError.message && !/non-2xx status code/i.test(String(invokeError.message))) {
      return String(invokeError.message);
    }
    const context = invokeError.context;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        if (body && body.message) return String(body.message);
      } catch (_error) {}
    }
    return invokeError.message ? String(invokeError.message) : (fallbackMessage || "Request failed.");
  }

  async function createAgentAccount(_currentSession, _username, _password) {
    const currentSession = _currentSession || null;
    if (!currentSession || !canManageUsers(currentSession.role)) {
      return { ok: false, message: "Permission denied." };
    }
    const username = String(_username || "").trim();
    const password = String(_password || "");
    if (!username || !password) {
      return { ok: false, message: "Username (or email) and password are required." };
    }

    const client = getSupabaseClient();
    if (!client) return { ok: false, message: "Supabase is not configured." };
    const cfg = window.SUPABASE_CONFIG || {};
    const fnName = String(cfg.adminFunctionName || DEFAULT_EDGE_FUNCTION_NAME).trim() || DEFAULT_EDGE_FUNCTION_NAME;
    const invokeResult = await client.functions.invoke(fnName, {
      body: {
        action: "create_agent",
        username: username,
        password: password
      }
    });
    if (invokeResult.error) {
      const message = await readInvokeErrorMessage(invokeResult.error, "Unable to create agent account.");
      return { ok: false, message: message };
    }
    const body = invokeResult.data || {};
    if (!body.ok) return { ok: false, message: body.message || "Unable to create agent account." };

    return {
      ok: true,
      loginEmail: body.loginEmail ? body.loginEmail : ""
    };
  }

  async function resetAccountPassword(_currentSession, _targetUserId, _password) {
    const currentSession = _currentSession || null;
    if (!currentSession || !canManageUsers(currentSession.role)) {
      return { ok: false, message: "Permission denied." };
    }
    const targetUserId = String(_targetUserId || "").trim();
    const password = String(_password || "");
    if (!targetUserId || !password) {
      return { ok: false, message: "Target account and new password are required." };
    }

    const client = getSupabaseClient();
    if (!client) return { ok: false, message: "Supabase is not configured." };
    const cfg = window.SUPABASE_CONFIG || {};
    const fnName = String(cfg.adminFunctionName || DEFAULT_EDGE_FUNCTION_NAME).trim() || DEFAULT_EDGE_FUNCTION_NAME;
    const invokeResult = await client.functions.invoke(fnName, {
      body: {
        action: "reset_password",
        targetUserId: targetUserId,
        password: password
      }
    });
    if (invokeResult.error) {
      const message = await readInvokeErrorMessage(invokeResult.error, "Unable to reset password.");
      return { ok: false, message: message };
    }
    const body = invokeResult.data || {};
    if (!body.ok) return { ok: false, message: body.message || "Unable to reset password." };
    return { ok: true };
  }

  async function listAccounts() {
    const client = getSupabaseClient();
    if (!client) return [];
    const result = await client
      .from("profiles")
      .select("id, username, role, created_at")
      .order("username", { ascending: true });
    if (result.error || !Array.isArray(result.data)) return [];
    return result.data.map(function (item) {
      return {
        userId: item.id || "",
        username: item.username || "-",
        role: item.role || "-",
        createdBy: "-",
        createdAt: item.created_at || ""
      };
    });
  }

  window.PCCAuth = {
    SESSION_KEY: SESSION_KEY,
    ensureDefaultAccounts: ensureDefaultAccounts,
    authenticate: authenticate,
    getSession: getSession,
    clearSession: clearSession,
    requireAuth: requireAuth,
    requireAuthAsync: requireAuthAsync,
    canManageUsers: canManageUsers,
    canMassDelete: canMassDelete,
    createAgentAccount: createAgentAccount,
    resetAccountPassword: resetAccountPassword,
    listAccounts: listAccounts
  };
})();
