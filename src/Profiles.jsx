import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Pencil, Trash2, ShieldCheck, Info, UserPlus } from 'lucide-react'
import { supabase, supabaseAuth } from './supabase'
import { Spinner, Empty, Badge, Avatar, Modal, ConfirmDialog, Pagination } from './UI'
import { useToast } from './Toast'
import { addLog } from './Logs'

const PAGE_SIZE = 15
const ROLES = ['customer', 'technician', 'admin']

export default function Profiles() {
  const [rows,       setRows]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [page,       setPage]       = useState(1)
  const [editing,    setEditing]    = useState(null)
  const [creating,   setCreating]   = useState(false)   // invite/create modal
  const [confirm,    setConfirm]    = useState(null)
  const [newUser,    setNewUser]    = useState({ email: '', full_name: '', phone: '', role: 'customer' })
  const [creating2,  setCreating2]  = useState(false)   // saving spinner
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('profiles')
      .select('id, full_name, role, phone, phone_verified, avatar_url, created_at', { count: 'exact' })
    if (search)     q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
    if (roleFilter) q = q.eq('role', roleFilter)
    q = q.order('created_at', { ascending: false })
         .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!mountedRef.current) return
    if (!error) { setRows(data || []); setTotal(count || 0) }
    else addLog('error', 'Failed to load profiles', error.message)
    setLoading(false)
  }, [search, roleFilter, page])

  useEffect(() => { load() }, [load])

  // Edit existing profile (no FK issue — profile already exists)
  const saveEdit = async () => {
    const { id, role, full_name, phone, phone_verified } = editing
    const { error } = await supabase.from('profiles')
      .update({ role, full_name, phone, phone_verified, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { toast(error.message, 'error'); addLog('error', 'Profile update failed', error.message); return }
    toast('Profile updated')
    addLog('ok', `Profile updated: ${full_name}`, `role → ${role}`)
    setEditing(null); load()
  }

  // Create new user via Supabase Admin Auth + insert profile
  const createUser = async () => {
    const { email, full_name, phone, role } = newUser
    if (!email) { toast('Email is required', 'error'); return }
    setCreating2(true)
    // Use admin API to invite user — sends a magic link
    const { data, error } = await supabaseAuth.auth.admin.inviteUserByEmail(email)
    if (error) {
      // inviteUserByEmail requires admin key scope — if that fails, show a helpful note
      toast('Use Supabase dashboard to create auth users, then edit their profile here.', 'error')
      addLog('warn', 'Cannot invite user from browser', error.message)
      setCreating2(false)
      return
    }
    // Insert profile row for the new auth user
    const userId = data.user.id
    const { error: profErr } = await supabase.from('profiles').insert({
      id: userId, full_name, phone, role, phone_verified: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    })
    setCreating2(false)
    if (profErr) { toast(profErr.message, 'error'); return }
    toast(`Invite sent to ${email}`)
    addLog('ok', `New user invited: ${email}`, `role: ${role}`)
    setCreating(false)
    setNewUser({ email: '', full_name: '', phone: '', role: 'customer' })
    load()
  }

  const del = async (id) => {
    const row = rows.find(r => r.id === id)
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); addLog('error', 'Profile delete failed', error.message); return }
    toast('Profile deleted')
    addLog('warn', `Profile deleted: ${row?.full_name || id}`, id)
    setConfirm(null); load()
  }

  const roleBadge = r => {
    const m = { admin: 'red', technician: 'accent', customer: 'blue' }
    return <Badge color={m[r] || 'muted'}>{r}</Badge>
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: 'var(--blue-soft)', border: '1px solid rgba(96,165,250,0.2)',
        borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-muted)'
      }}>
        <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
        <span>
          Profiles are linked to Supabase Auth accounts. Use the <strong>Invite User</strong> button to create new accounts and send them a login link,
          or create them directly in the{' '}
          <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>
            Supabase Auth dashboard
          </a>.
        </span>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <span className="table-title">Profiles</span>
          <span className="table-count">{total} total</span>
          <div className="table-spacer" />
          <div className="search-wrap">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search name, phone…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="form-select" style={{ width: 130, padding: '6px 10px' }}
            value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }}>
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <UserPlus size={13} /> Invite User
          </button>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <table>
            <thead><tr>
              <th>User</th><th>Role</th><th>Phone</th><th>Verified</th><th>Joined</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="flex-center">
                      <Avatar name={r.full_name} url={r.avatar_url} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{r.full_name || <span style={{ color: 'var(--text-muted)' }}>No name</span>}</div>
                        <div className="mono" style={{ fontSize: 10 }}>{r.id.slice(0, 8)}…</div>
                      </div>
                    </div>
                  </td>
                  <td>{roleBadge(r.role)}</td>
                  <td><span className="mono">{r.phone || '—'}</span></td>
                  <td>
                    {r.phone_verified
                      ? <span className="flex-center" style={{ gap: 4, color: 'var(--green)' }}><ShieldCheck size={13} /> Yes</span>
                      : <span style={{ color: 'var(--text-muted)' }}>No</span>}
                  </td>
                  <td><span className="mono">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" title="Edit" onClick={() => setEditing({ ...r })}><Pencil size={12} /></button>
                      <button className="icon-btn danger" title="Delete profile row" onClick={() => setConfirm(r.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit Profile" onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEdit}>Save</button>
          </>}>
          <div className="form-group">
            <label className="form-label">Auth ID</label>
            <input className="form-input" value={editing.id} disabled
              style={{ opacity: 0.45, cursor: 'not-allowed', fontFamily: 'DM Mono, monospace', fontSize: 11 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" value={editing.full_name || ''}
              onChange={e => setEditing(p => ({ ...p, full_name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="form-input" placeholder="+63 9XX XXX XXXX" value={editing.phone || ''}
              onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-select" value={editing.role}
              onChange={e => setEditing(p => ({ ...p, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="pv" checked={!!editing.phone_verified}
              onChange={e => setEditing(p => ({ ...p, phone_verified: e.target.checked }))} />
            <label htmlFor="pv" className="form-label" style={{ textTransform: 'none', marginBottom: 0 }}>Phone Verified</label>
          </div>
        </Modal>
      )}

      {/* Invite modal */}
      {creating && (
        <Modal title="Invite New User" onClose={() => setCreating(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={createUser} disabled={creating2}>
              {creating2 ? 'Sending…' : 'Send Invite'}
            </button>
          </>}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', lineHeight: 1.6 }}>
            This sends a magic-link email to the user. They click it to set their password and sign in to the mobile app.
          </div>
          <div className="form-group">
            <label className="form-label">Email <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-input" type="email" placeholder="user@example.com" value={newUser.email}
              onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" value={newUser.full_name}
              onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="form-input" placeholder="+63 9XX XXX XXXX" value={newUser.phone}
              onChange={e => setNewUser(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-select" value={newUser.role}
              onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message="Delete this profile row? The Supabase Auth account will still exist — delete it separately from the Supabase dashboard if needed."
          onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
