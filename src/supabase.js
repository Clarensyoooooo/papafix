import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY MODEL (changed June 2026)
//
// One client, anon key only. Admin authorization is enforced by Postgres RLS
// (see supabase/migrations/001_admin_security.sql): the signed-in session's
// JWT travels with every request, and the `is_admin()` policies decide access.
// The service role key must NEVER appear in this codebase or in any VITE_*
// env var — anything VITE_* is compiled into the public JS bundle.
//
// auth.admin operations (create/delete users, change emails) go through the
// `admin-users` Edge Function instead — see src/adminApi.js.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at startup rather than with confusing 401s later.
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // flip to true if OAuth/magic links are ever added
  },
  global: {
    headers: { 'x-client-info': 'papafix-admin' },
  },
})

// Backwards-compat alias: AuthContext/Login import `supabaseAuth` for auth
// calls. Auth and data now share one session-backed client.
export const supabaseAuth = supabase