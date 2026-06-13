// src/adminApi.js
// Drop-in replacements for the old `supabase.auth.admin.*` calls.
// Each call is authenticated with the current admin session and authorized
// server-side inside the `admin-users` Edge Function.

import { supabase } from './supabase'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Uses plain fetch instead of supabase.functions.invoke() because the new
// sb_publishable_ key format causes invoke() to fail attaching the auth header.
async function call(action, userId, payload) {
  const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr || !session) {
    return { data: null, error: { message: 'No active session — please sign in again.' } }
  }

  let res, body
  try {
    res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, userId, payload }),
    })
    body = await res.json()
  } catch (e) {
    return { data: null, error: { message: e.message || 'Network error reaching Edge Function' } }
  }

  if (!res.ok || body?.error) {
    return { data: null, error: { message: body?.error || `HTTP ${res.status}` } }
  }
  return { data: body, error: null }
}

/** was: supabase.auth.admin.getUserById(id) → { data: { user }, error } */
export const adminGetUser = (userId) => call('getUser', userId)

/** was: supabase.auth.admin.createUser({...}) + manual profile insert.
 *  payload: { email, password, full_name, phone, role } */
export const adminCreateUser = (payload) => call('createUser', undefined, payload)

/** was: supabase.auth.admin.updateUserById(id, { email?, password? }) */
export const adminUpdateUser = (userId, payload) => call('updateUser', userId, payload)

/** was: manual bookings/locations/profile deletes + auth.admin.deleteUser(id).
 *  Now a single call — DB cascades handle related rows atomically. */
export const adminDeleteUser = (userId) => call('deleteUser', userId)
