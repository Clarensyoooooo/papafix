import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabaseAuth, supabase } from './supabase'
import { addLog } from './Logs'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme]     = useState(() => localStorage.getItem('pf-theme') || 'dark')

  // Track last-loaded userId so onAuthStateChange doesn't re-fetch on every token refresh
  const loadedForRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('pf-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  // Load profile once per unique user id
  const loadProfile = async (userId) => {
    if (loadedForRef.current === userId) return  // already loaded, skip
    loadedForRef.current = userId
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url, phone')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  useEffect(() => {
    // 1. Check existing session on mount (no network call if already cached)
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // 2. Listen for sign-in / sign-out events only — ignore TOKEN_REFRESHED
    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return  // ← key fix: skip noisy refresh events

      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        // loadProfile is guarded by ref, won't double-fetch
        loadProfile(session.user.id)
      }

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        loadedForRef.current = null
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password })
    if (error) return { error }

    // RBAC check — only admin role allowed
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url, phone')
      .eq('id', data.user.id)
      .single()

    if (profErr || !prof || prof.role !== 'admin') {
      await supabaseAuth.auth.signOut()
      return { error: { message: 'Access denied. Admin accounts only.' } }
    }

    loadedForRef.current = prof.id
    setProfile(prof)
    setUser(data.user)

    addLog('info', 'Admin logged in', `Email: ${email} | Role: ${prof.role}`)

    return { data }
  }

  const signOut = async () => {

    if (user) addLog('info', 'Admin logged out', `ID: ${user.id}`)

    await supabaseAuth.auth.signOut()
    setUser(null)
    setProfile(null)
    loadedForRef.current = null
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signIn, signOut, theme, toggleTheme }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
