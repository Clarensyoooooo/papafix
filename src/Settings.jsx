import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from './AuthContext'
import { useToast } from './Toast'

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="toggle-track" />
      <div className="toggle-thumb" />
    </label>
  )
}

function Section({ title, sub, children }) {
  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <div className="settings-section-head">
        <div className="settings-section-title">{title}</div>
        {sub && <div className="settings-section-sub">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, sub, children }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">{label}</div>
        {sub && <div className="settings-row-sub">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const { theme, toggleTheme } = useAuth()
  const toast = useToast()
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pf_prefs') || '{}') }
    catch { return {} }
  })
  const setPref = (key, val) => {
    const next = { ...prefs, [key]: val }
    setPrefs(next)
    localStorage.setItem('pf_prefs', JSON.stringify(next))
  }

  const pref = (key, def = false) => prefs[key] !== undefined ? prefs[key] : def

  return (
    <div style={{ maxWidth: 640 }}>
      <Section title="Appearance" sub="Customize how the admin panel looks">
        <Row label="Dark mode" sub="Toggle between light and dark theme">
          <Toggle checked={theme === 'dark'} onChange={() => toggleTheme()} />
        </Row>
        <Row label="Compact tables" sub="Show more rows with reduced row padding">
          <Toggle checked={pref('compactTables')} onChange={v => setPref('compactTables', v)} />
        </Row>
      </Section>

      <Section title="Data & Refresh" sub="Control how data is fetched">
        <Row label="Live map auto-refresh" sub="Refresh technician locations every 45 seconds automatically">
          <Toggle checked={pref('liveMapRefresh', true)} onChange={v => setPref('liveMapRefresh', v)} />
        </Row>
        <Row label="Rows per page" sub="How many rows to show in data tables — takes effect when you next open a tab">
          <select className="form-select" style={{ width: 90 }}
            value={pref('pageSize', 15)}
            onChange={e => setPref('pageSize', Number(e.target.value))}>
            {[10, 15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Row>
      </Section>

      <Section title="Notifications" sub="Save feedback preferences">
        <Row label="Show toast on save" sub="Show a success notification after saves — errors always show regardless">
          <Toggle checked={pref('toastOnSave', true)} onChange={v => setPref('toastOnSave', v)} />
        </Row>
      </Section>

      <Section title="Supabase Connection" sub="Read-only connection info">
        <Row label="Project URL" sub="Your Supabase project endpoint">
          <code style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', background: 'var(--surface2)', padding: '3px 8px', borderRadius: 4 }}>
            {import.meta.env.VITE_SUPABASE_URL?.replace('https://', '').split('.')[0]}…
          </code>
        </Row>
        <Row label="Auth" sub="Anon key + your admin session — access enforced by database row-level security">
          <span className="badge badge-green">Anon + RLS</span>
        </Row>
        <Row label="Google Maps" sub="Used for location embeds — charges apply per map load">
          <span className="badge badge-blue">Embedded API</span>
        </Row>
      </Section>

      <Section title="Maintenance" sub="Local preference management">
        <Row label="Reset preferences" sub="Restore all settings to their defaults">
          <button className="btn btn-ghost" onClick={() => {
            localStorage.removeItem('pf_prefs')
            setPrefs({})
            toast('Preferences reset')
          }}>
            <RefreshCw size={12} /> Reset
          </button>
        </Row>
      </Section>
    </div>
  )
}