import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Pencil, Trash2, ShieldCheck, Info, UserPlus, Users, Wrench, UserCheck, Shield } from 'lucide-react'
import { supabase } from './supabase'
import { Spinner, Empty, Badge, Avatar, Modal, ConfirmDialog, Pagination } from './UI'
import { useToast } from './Toast'
import { addLog } from './Logs'

const PAGE_SIZE = 15
const ROLES = ['customer', 'technician', 'admin']
const TABS  = [
  { key: 'all',        label: 'All',          icon: Users },
  { key: 'customer',   label: 'Customers',    icon: UserCheck },
  { key: 'technician', label: 'Technicians',  icon: Wrench },
  { key: 'admin',      label: 'Admins',       icon: Shield },
]

function StatCard({ icon: Icon, label, value, sub, color = 'accent' }) {
  const cols = {
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent)', border: 'var(--accent)' },
    blue:   { bg: 'var(--blue-soft)',   fg: 'var(--blue)',   border: 'var(--blue)'   },
    green:  { bg: 'var(--green-soft)',  fg: 'var(--green)',  border: 'var(--green)'  },
    amber:  { bg: 'var(--amber-soft)',  fg: 'var(--amber)',  border: 'var(--amber)'  },
    red:    { bg: 'var(--red-soft)',    fg: 'var(--red)',    border: 'var(--red)'    },
  }
  const c = cols[color] || cols.accent
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${c.border}`, borderRadius: 8,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 5,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', right: -6, bottom: -6, opacity: 0.05 }}>
        <Icon size={60} color={c.fg} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 24, height: 24, borderRadius: 5, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={12} color={c.fg} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

export default function Profiles() {
  const [tab,        setTab]        = useState('all')
  const [rows,       setRows]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [counts,     setCounts]     = useState({ all: 0, customer: 0, technician: 0, admin: 0, verified: 0 })
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [page,       setPage]       = useState(1)
  
  const [editing,    setEditing]    = useState(null)
  const [fetchingEmail, setFetchingEmail] = useState(null)
  
  const [creating,   setCreating]   = useState(false)
  const [confirm,    setConfirm]    = useState(null)
  
  // Added password field for manual creation
  const [newUser,    setNewUser]    = useState({ email: '', password: '', full_name: '', phone: '', role: 'customer' })
  const [saving,     setSaving]     = useState(false)
  
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const loadCounts = useCallback(async () => {
    const [
      { count: all }, { count: customer }, { count: technician }, { count: admin }, { count: verified },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'technician'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('phone_verified', true),
    ])
    if (mountedRef.current) setCounts({ all, customer, technician, admin, verified })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('profiles')
      .select('id, full_name, role, phone, phone_verified, avatar_url, created_at', { count: 'exact' })
    if (tab !== 'all') q = q.eq('role', tab)
    if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
    q = q.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    
    const { data, count, error } = await q
    if (!mountedRef.current) return
    if (!error) { setRows(data || []); setTotal(count || 0) }
    else addLog('error', 'Failed to load profiles', error.message)
    setLoading(false)
  }, [tab, search, page])

  useEffect(() => { loadCounts() }, [loadCounts])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [tab, search])

  // Fetches the Auth email before opening the edit modal
  const openEdit = async (row) => {
    setFetchingEmail(row.id)
    const { data, error } = await supabase.auth.admin.getUserById(row.id)
    setFetchingEmail(null)
    
    if (error) {
      toast('Could not fetch Auth details', 'error')
      addLog('error', 'Admin API fetch failed', error.message)
      return
    }
    setEditing({ ...row, email: data.user.email || '' })
  }

  const saveEdit = async () => {
    const { id, role, full_name, phone, phone_verified, email } = editing
    setSaving(true)

    // 1. Update Auth Email if provided
    if (email) {
      const { error: authErr } = await supabase.auth.admin.updateUserById(id, {
        email: email,
        email_confirm: true // Auto-confirms so they don't get locked out
      })
      if (authErr) {
        toast(`Auth Update Error: ${authErr.message}`, 'error')
        setSaving(false)
        return
      }
    }

    // 2. Update Public Profile
    const { error: profErr } = await supabase.from('profiles')
      .update({ role, full_name, phone, phone_verified, updated_at: new Date().toISOString() })
      .eq('id', id)
      
    setSaving(false)
    if (profErr) { 
      toast(profErr.message, 'error')
      addLog('error', 'Profile update failed', profErr.message)
      return 
    }
    
    toast('Profile & credentials updated')
    addLog('ok', `Profile updated: ${full_name}`, `role → ${role}`)
    setEditing(null); load(); loadCounts()
  }

  const createUser = async () => {
    const { email, password, full_name, phone, role } = newUser
    if (!email || !password) { toast('Email and password are required', 'error'); return }
    if (password.length < 6) { toast('Password must be at least 6 characters', 'error'); return }
    
    setSaving(true)
    
    // Create directly via Admin API with a manual password
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true // Bypasses email verification requirements
    })

    if (error) {
      toast(error.message, 'error')
      addLog('error', 'User creation failed', error.message)
      setSaving(false); return
    }

    const { error: profErr } = await supabase.from('profiles').insert({
      id: data.user.id, full_name, phone, role, phone_verified: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    })
    
    setSaving(false)
    if (profErr) { toast(profErr.message, 'error'); return }
    
    toast(`User created: ${email}`)
    addLog('ok', `User created: ${email}`, `role: ${role}`)
    setCreating(false)
    setNewUser({ email: '', password: '', full_name: '', phone: '', role: 'customer' })
    load(); loadCounts()
  }

  const del = async (id) => {
    const row = rows.find(r => r.id === id)
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); addLog('error', 'Profile delete failed', error.message); return }
    toast('Profile deleted')
    addLog('warn', `Profile deleted: ${row?.full_name || id}`, id)
    setConfirm(null); load(); loadCounts()
  }

  const roleBadge = r => {
    const m = { admin: 'red', technician: 'accent', customer: 'blue' }
    return <Badge color={m[r] || 'muted'}>{r}</Badge>
  }

  const verifiedPct = counts.all > 0 ? Math.round((counts.verified / counts.all) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
        <StatCard icon={Users}     label="All Users"    value={counts.all        ?? 0} color="blue"   sub="across all roles" />
        <StatCard icon={UserCheck} label="Customers"    value={counts.customer   ?? 0} color="blue"   sub="registered customers" />
        <StatCard icon={Wrench}    label="Technicians"  value={counts.technician ?? 0} color="accent" sub="field technicians" />
        <StatCard icon={Shield}    label="Admins"       value={counts.admin      ?? 0} color="red"    sub="admin accounts" />
        <StatCard icon={ShieldCheck} label="Verified"  value={counts.verified   ?? 0} color="green"  sub={`${verifiedPct}% of all users`} />
      </div>

      {/* ── Info banner ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        background: 'var(--blue-soft)', border: '1px solid rgba(96,165,250,0.2)',
        borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)'
      }}>
        <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Admin API Active:</strong> User creation directly inserts credentials into Supabase Auth without requiring magic-link verification. You can also manually update a user's email address by clicking Edit.
        </span>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: 0 }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          const count  = key === 'all' ? counts.all : counts[key]
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 14px', border: 'none', background: 'none',
              cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 600,
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.12s',
            }}>
              <Icon size={13} />
              {label}
              <span style={{
                fontSize: 10, fontFamily: 'DM Mono, monospace',
                background: active ? 'var(--accent-soft)' : 'var(--surface2)',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                padding: '1px 6px', borderRadius: 99,
              }}>{count ?? 0}</span>
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 6 }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--text-muted)' }} />
            <input className="search-input" placeholder="Search name, phone…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 28 }} />
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <UserPlus size={13} /> Create User
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-wrap">
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="table-title">
            {TABS.find(t => t.key === tab)?.label || 'Profiles'}
          </span>
          <span className="table-count">{total} total</span>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty message={`No ${tab === 'all' ? 'profiles' : tab + 's'} found`} /> : (
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
                        <div style={{ fontWeight: 500 }}>
                          {r.full_name || <span style={{ color: 'var(--text-muted)' }}>No name</span>}
                        </div>
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
                      <button className="icon-btn" title="Edit" disabled={fetchingEmail === r.id} onClick={() => openEdit(r)}>
                        {fetchingEmail === r.id ? <Spinner size={12} /> : <Pencil size={12} />}
                      </button>
                      <button className="icon-btn danger" title="Delete" onClick={() => setConfirm(r.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* ── Edit modal ── */}
      {editing && (
        <Modal title="Edit Profile" onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>}>
          <div className="form-group">
            <label className="form-label">Auth ID</label>
            <input className="form-input" value={editing.id} disabled
              style={{ opacity: 0.45, cursor: 'not-allowed', fontFamily: 'DM Mono, monospace', fontSize: 11 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address (Login Credential)</label>
            <input className="form-input" type="email" value={editing.email || ''}
              onChange={e => setEditing(p => ({ ...p, email: e.target.value }))} />
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

      {/* ── Create User modal ── */}
      {creating && (
        <Modal title="Create New User" onClose={() => setCreating(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setCreating(false)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={createUser} disabled={saving}>
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </>}>
          <div className="form-group">
            <label className="form-label">Email <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-input" type="email" placeholder="user@example.com"
              value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Password <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-input" type="text" placeholder="Min 6 characters"
              value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
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