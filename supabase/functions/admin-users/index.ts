import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Verify the caller is an authenticated admin using their session JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authErr } = await callerClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') return json({ error: 'Admin access required' }, 403)

    // Use service role for privileged auth operations
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { action, userId, payload } = await req.json()

    switch (action) {
      case 'getUser': {
        const { data, error } = await admin.auth.admin.getUserById(userId)
        if (error) return json({ error: error.message }, 400)
        return json({ user: data.user })
      }

      case 'createUser': {
        const { email, password, full_name, phone, role } = payload
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name, phone },
        })
        if (error) return json({ error: error.message }, 400)

        // Profile row is usually created by a DB trigger, but insert as fallback
        await admin.from('profiles').upsert({
          id: data.user.id,
          full_name,
          phone,
          role: role || 'customer',
        })

        return json({ user: data.user })
      }

      case 'updateUser': {
        const updates: Record<string, string> = {}
        if (payload?.email)    updates.email    = payload.email
        if (payload?.password) updates.password = payload.password
        const { data, error } = await admin.auth.admin.updateUserById(userId, updates)
        if (error) return json({ error: error.message }, 400)
        return json({ user: data.user })
      }

      case 'deleteUser': {
        // DB cascades (on delete cascade) clean up profiles, bookings, locations
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error) return json({ error: error.message }, 400)
        return json({ deleted: true })
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
