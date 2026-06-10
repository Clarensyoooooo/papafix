// src/adminApi.js
// Drop-in replacements for the old `supabase.auth.admin.*` calls.
// Each call is authenticated with the current admin session and authorized
// server-side inside the `admin-users` Edge Function.

import { supabase } from './supabase'

async function call(action, userId, payload) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, userId, payload },
  })
  if (error) {
    // functions.invoke surfaces non-2xx as FunctionsHttpError; pull the body msg.
    // Clone first — the body stream may already be consumed by supabase-js.
    let msg = error.message
    try {
      const ctx = error.context?.clone ? error.context.clone() : error.context
      const body = await ctx?.json()
      if (body?.error) msg = body.error
    } catch { /* keep generic message */ }
    return { data: null, error: { message: msg } }
  }
  if (data?.error) return { data: null, error: { message: data.error } }
  return { data, error: null }
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