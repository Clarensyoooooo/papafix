import { useState } from 'react'
import { Pencil, ShieldCheck, Mail, Phone, Calendar, Key, Check, X } from 'lucide-react'
import { useAuth } from './AuthContext'
import { supabase, supabaseAuth } from './supabase'
import { useToast } from './Toast'
import { Badge } from './UI'

export default function AdminProfile() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const [editingName, setEditingName] = useState(false)
  const [editingPw, setEditingPw]     = useState(false)
  const [name, setName]               = useState(profile?.full_name || '')
  const [phone, setPhone]             = useState(profile?.phone || '')
  const [pwForm, setPwForm]           = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving]           = useState(false)

  const initials = (profile?.full_name || user?.email || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const saveProfile = async () => {
    setSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ full_name: name, phone, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Profile updated')
    setEditingName(false)
  }

  const savePassword = async () => {
    if (pwForm.next !== pwForm.confirm) { toast('Passwords do not match', 'error'); return }
    if (pwForm.next.length < 6) { toast('Password must be at least 6 characters', 'error'); return }
    setSaving(true)
    const { error } = await supabaseAuth.auth.updateUser({ password: pwForm.next })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Password updated')
    setEditingPw(false)
    setPwForm({ current: '', next: '', confirm: '' })
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Hero */}
      <div className="profile-hero">
        <div className="profile-avatar-lg">{initials}</div>
        <div style={{ flex: 1 }}>
          <div className="profile-name">{profile?.full_name || 'Admin'}</div>
          <div className="profile-email">{user?.email}</div>
          <div className="profile-meta">
            <Badge color="red">Admin</Badge>
            {profile?.phone_verified && <Badge color="green">Phone Verified</Badge>}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Joined {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="settings-section" style={{ marginBottom: 16 }}>
        <div className="settings-section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="settings-section-title">Account Info</div>
            <div className="settings-section-sub">Your basic profile details</div>
          </div>
          {!editingName && (
            <button className="btn btn-ghost" onClick={() => setEditingName(true)}>
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>

        {editingName ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+63 9XX XXX XXXX" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditingName(false)}><X size={12} /> Cancel</button>
              <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
                {saving ? 'Saving…' : <><Check size={12} /> Save</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="info-list">
            <div className="info-row">
              <span className="info-key"><Mail size={11} style={{ display: 'inline', marginRight: 4 }} />Email</span>
              <span className="info-val">{user?.email}</span>
            </div>
            <div className="info-row">
              <span className="info-key"><Phone size={11} style={{ display: 'inline', marginRight: 4 }} />Phone</span>
              <span className="info-val">{profile?.phone || <span style={{ color: 'var(--text-muted)' }}>Not set</span>}</span>
            </div>
            <div className="info-row">
              <span className="info-key"><ShieldCheck size={11} style={{ display: 'inline', marginRight: 4 }} />Role</span>
              <span className="info-val"><Badge color="red">admin</Badge></span>
            </div>
            <div className="info-row">
              <span className="info-key"><Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />Auth ID</span>
              <span className="info-val" style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{user?.id}</span>
            </div>
          </div>
        )}
      </div>

      {/* Password */}
      <div className="settings-section">
        <div className="settings-section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="settings-section-title">Password</div>
            <div className="settings-section-sub">Change your login password</div>
          </div>
          {!editingPw && (
            <button className="btn btn-ghost" onClick={() => setEditingPw(true)}>
              <Key size={12} /> Change password
            </button>
          )}
        </div>

        {editingPw && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface2)', borderRadius: 6, padding: '8px 12px' }}>
              You'll be asked to sign in again after changing your password.
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" value={pwForm.next}
                onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input className="form-input" type="password" value={pwForm.confirm}
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setEditingPw(false)}><X size={12} /> Cancel</button>
              <button className="btn btn-primary" onClick={savePassword} disabled={saving}>
                {saving ? 'Saving…' : <><Check size={12} /> Update Password</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
