// src/adminApi.js
// Drop-in replacements for the old `supabase.auth.admin.*` calls.
// Each call is authenticated with the current admin session and authorized
// server-side inside the `admin-users` Edge Function.
//
// Requires: admin-users Edge Function deployed with "Verify JWT" OFF in the
// Supabase dashboard (the function handles its own auth internally).

import { supabase } from './supabase'

const FN_URL  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function call(action, userId, payload) {
  // Get the live session token — fall back clearly if missing
  const { data: { session }, error: sessErr } = await supabase.auth.getSession()
  if (sessErr) return { data: null, error: { message: `Session error: ${sessErr.message}` } }
  if (!session) return { data: null, error: { message: 'Not signed in — please refresh the page.' } }

  let res, body
  try {
    res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, userId, payload }),
    })
  } catch (e) {
    // Network / CORS / DNS failure — surface the raw browser error
    return { data: null, error: { message: `Network error: ${e.message}` } }
  }

  try {
    body = await res.json()
  } catch {
    return { data: null, error: { message: `HTTP ${res.status} — non-JSON response from Edge Function` } }
  }

  if (!res.ok || body?.error) {
    return { data: null, error: { message: body?.error || `HTTP ${res.status}` } }
  }
  return { data: body, error: null }
}

export const adminGetUser    = (userId)          => call('getUser',    userId)
export const adminCreateUser = (payload)         => call('createUser', undefined, payload)
export const adminUpdateUser = (userId, payload) => call('updateUser', userId,    payload)
export const adminDeleteUser = (userId)          => call('deleteUser', userId)
