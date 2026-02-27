import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function normalizeUsername(value: unknown) {
  return String(value || "").trim();
}

function isStrongPassword(value: unknown) {
  const pass = String(value || "");
  return pass.length >= 12
    && /[A-Z]/.test(pass)
    && /[a-z]/.test(pass)
    && /[0-9]/.test(pass)
    && /[^A-Za-z0-9]/.test(pass);
}

function deriveEmailFromUsername(username: string) {
  if (username.includes("@")) return username.toLowerCase();
  const cleaned = username.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return cleaned + "@pcc.local";
}

function normalizeAction(value: unknown) {
  return String(value || "create_agent").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json(500, { ok: false, message: "Function environment is not configured." });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json(401, { ok: false, message: "Missing bearer token." });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_error) {
    return json(400, { ok: false, message: "Invalid JSON body." });
  }

  const action = normalizeAction(body.action);
  const password = String(body.password || "");
  if (!password) return json(400, { ok: false, message: "Password is required." });
  if (!isStrongPassword(password)) {
    return json(400, { ok: false, message: "Password must be at least 12 chars with upper, lower, number, and symbol." });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: "Bearer " + token
      }
    }
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const authUserResult = await userClient.auth.getUser();
  const caller = authUserResult.data.user;
  if (authUserResult.error || !caller || !caller.id) {
    return json(401, { ok: false, message: "Invalid session token." });
  }

  const callerProfileResult = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();
  const callerRole = String(callerProfileResult.data?.role || "").toUpperCase();
  if (!["MANAGER", "SUPERVISOR"].includes(callerRole)) {
    return json(403, { ok: false, message: "Only Manager/Supervisor can create agents." });
  }

  if (action === "create_agent") {
    const username = normalizeUsername(body.username);
    if (!username) return json(400, { ok: false, message: "Username (or email) is required." });

    const loginEmail = deriveEmailFromUsername(username);
    const createResult = await adminClient.auth.admin.createUser({
      email: loginEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: username
      }
    });

    if (createResult.error || !createResult.data.user?.id) {
      return json(400, { ok: false, message: createResult.error?.message || "Unable to create auth user." });
    }

    const profileUpsert = await adminClient
      .from("profiles")
      .upsert({
        id: createResult.data.user.id,
        username: username,
        role: "AGENT"
      }, { onConflict: "id" });

    if (profileUpsert.error) {
      return json(500, { ok: false, message: "Auth user created, but profile role insert failed." });
    }

    return json(200, {
      ok: true,
      message: "Agent account created.",
      loginEmail: loginEmail
    });
  }

  if (action === "reset_password") {
    const targetUserId = String(body.targetUserId || "").trim();
    if (!targetUserId) return json(400, { ok: false, message: "Target user id is required." });

    const updateResult = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: password
    });
    if (updateResult.error) {
      return json(400, { ok: false, message: updateResult.error.message || "Unable to reset password." });
    }

    return json(200, {
      ok: true,
      message: "Password updated successfully."
    });
  }

  return json(400, { ok: false, message: "Unsupported action." });
});
