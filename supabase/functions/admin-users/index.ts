// supabase/functions/admin-users/index.ts
// Server-side wrapper for the auth.admin operations the panel needs.
// The service role key NEVER leaves this function's environment.
//
// Deploy:  supabase functions deploy admin-users
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected
//  automatically by the platform — no secrets to configure.)

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to your panel's domain in prod
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1 ── Authenticate the caller from their JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !caller) return json({ error: "Not authenticated" }, 401);

  // 2 ── Authorize: caller's profile must be role=admin (checked server-side)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: callerProfile } = await admin
    .from("profiles").select("role").eq("id", caller.id).single();
  if (callerProfile?.role !== "admin") return json({ error: "Admins only" }, 403);

  // 3 ── Dispatch
  let body: { action?: string; userId?: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { action, userId, payload = {} } = body;

  try {
    switch (action) {
      case "getUser": {
        if (!userId) return json({ error: "userId required" }, 400);
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error) throw error;
        return json({ user: { id: data.user.id, email: data.user.email } });
      }

      case "createUser": {
        const { email, password, full_name, phone, role } = payload as Record<string, string>;
        if (!email || !password) return json({ error: "email and password required" }, 400);
        if (!["customer", "technician", "admin"].includes(role ?? "")) {
          return json({ error: "invalid role" }, 400);
        }
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name, phone },
        });
        if (error) throw error;
        // Upsert the profile row (covers projects without a handle_new_user trigger)
        const { error: profErr } = await admin.from("profiles").upsert({
          id: data.user.id, full_name: full_name ?? null, phone: phone ?? null, role,
        });
        if (profErr) throw profErr;
        return json({ user: { id: data.user.id, email: data.user.email } });
      }

      case "updateUser": {
        if (!userId) return json({ error: "userId required" }, 400);
        const attrs: Record<string, unknown> = {};
        if (payload.email) { attrs.email = payload.email; attrs.email_confirm = true; }
        if (payload.password) attrs.password = payload.password;
        if (!Object.keys(attrs).length) return json({ error: "nothing to update" }, 400);
        const { data, error } = await admin.auth.admin.updateUserById(userId, attrs);
        if (error) throw error;
        return json({ user: { id: data.user.id, email: data.user.email } });
      }

      case "deleteUser": {
        if (!userId) return json({ error: "userId required" }, 400);
        if (userId === caller.id) return json({ error: "You can't delete your own account" }, 400);
        // FK cascades (001_admin_security.sql) remove profile/bookings/locations/etc.
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
