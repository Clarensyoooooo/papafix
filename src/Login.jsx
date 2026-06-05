import { useState } from 'react'
import { useAuth } from './AuthContext'
import { Eye, EyeOff, Wrench } from 'lucide-react'

export default function Login() {
  const { signIn, theme, toggleTheme } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await signIn(email, password)
    if (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div className="login-page">
      <button className="theme-toggle-login" onClick={toggleTheme} title="Toggle theme">
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">
            <Wrench size={20} color={theme === 'dark' ? '#060608' : 'white'} />
          </div>
          <div>
            <div className="login-brand-name">Papafix</div>
            <div className="login-brand-sub">Admin Portal</div>
          </div>
        </div>

        <div className="login-title">Welcome back</div>
        <div className="login-subtitle">Sign in with your admin account to continue.</div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingRight: 36 }}
              />
              <button
                type="button"
                className="icon-btn"
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', opacity: 1 }}
                onClick={() => setShowPw(v => !v)}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">{error}</div>
          )}

          <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : null}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-footer">
          Only <strong>admin</strong> accounts can access this panel.
        </div>
      </div>
    </div>
  )
}
