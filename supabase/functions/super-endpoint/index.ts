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

function deriveEmailFromUsername(username: string) {
  if (username.includes("@")) return username.toLowerCase();
  const cleaned = username.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return cleaned + "@pcc.local";
}

function normalizeAction(value: unknown) {
  return String(value || "create_agent").trim().toLowerCase();
}

function normalizeRole(value: unknown) {
  return String(value || "AGENT").trim().toUpperCase();
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
  if (callerRole !== "MANAGER") {
    return json(403, { ok: false, message: "Only Manager can manage users." });
  }

  if (action === "create_agent" || action === "create_user") {
    const password = String(body.password || "");
    if (!password) return json(400, { ok: false, message: "Password is required." });
    const username = normalizeUsername(body.username);
    const role = normalizeRole(body.role);
    if (!username) return json(400, { ok: false, message: "Username (or email) is required." });
    if (!["AGENT", "SUPERVISOR", "MANAGER"].includes(role)) {
      return json(400, { ok: false, message: "Role must be AGENT, SUPERVISOR, or MANAGER." });
    }

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
        role: role,
        created_by: caller.id
      }, { onConflict: "id" });

    if (profileUpsert.error) {
      return json(500, { ok: false, message: "Auth user created, but profile role insert failed." });
    }

    return json(200, {
      ok: true,
      message: "User account created.",
      loginEmail: loginEmail,
      role: role
    });
  }

  if (action === "reset_password") {
    const password = String(body.password || "");
    if (!password) return json(400, { ok: false, message: "Password is required." });
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

  if (action === "change_user_role" || action === "update_role") {
    const targetUserId = String(body.targetUserId || "").trim();
    const role = normalizeRole(body.role);
    if (!targetUserId) return json(400, { ok: false, message: "Target user id is required." });
    if (!["AGENT", "SUPERVISOR", "MANAGER"].includes(role)) {
      return json(400, { ok: false, message: "Role must be AGENT, SUPERVISOR, or MANAGER." });
    }
    if (targetUserId === caller.id) {
      return json(400, { ok: false, message: "You cannot change your own role." });
    }

    const profileUpdate = await adminClient
      .from("profiles")
      .update({ role: role })
      .eq("id", targetUserId)
      .select("id")
      .single();

    if (profileUpdate.error || !profileUpdate.data) {
      return json(400, { ok: false, message: profileUpdate.error?.message || "Unable to change user role." });
    }

    return json(200, {
      ok: true,
      message: "User role updated successfully.",
      role: role
    });
  }

  return json(400, { ok: false, message: "Unsupported action." });
});
