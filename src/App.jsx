import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Users, CalendarCheck, MapPin, Clock,
  Navigation, Database, ChevronRight, ChevronLeft, LogOut,
  Sun, Moon, ScrollText, Settings as SettingsIcon,
  UserCircle, Map, BarChart2, Headphones
} from 'lucide-react'
import './index.css'
import { AuthProvider, useAuth } from './AuthContext'
import Login from './Login'
import Dashboard from './Dashboard'
import Profiles from './Profiles'
import Bookings from './Bookings'
import Locations from './Locations'
import Availability from './Availability'
import TechnicianLocations from './TechnicianLocations'
import LiveMap from './LiveMap'
import Logs from './Logs'
import Settings from './Settings'
import AdminProfile from './AdminProfile'
import Analytics from './Analytics'
import SupportTickets from './SupportTickets'
import { ToastContainer } from './Toast'
import { Avatar } from './UI'

const NAV = [
  { id: 'dashboard',      label: 'Overview',        icon: LayoutDashboard, section: 'General' },
  { id: 'analytics',      label: 'Analytics',        icon: BarChart2,       section: 'General' },
  { id: 'profiles',       label: 'Profiles',         icon: Users,           section: 'Data' },
  { id: 'bookings',       label: 'Bookings',         icon: CalendarCheck,   section: 'Data' },
  { id: 'locations',      label: 'Locations',        icon: MapPin,          section: 'Data' },
  { id: 'availability',   label: 'Availability',     icon: Clock,           section: 'Data' },
  { id: 'live-map',       label: 'Live Map',         icon: Map,             section: 'Live' },
  { id: 'tech-locations', label: 'Tech Locations',   icon: Navigation,      section: 'Live' },
  { id: 'support',        label: 'Support',           icon: Headphones,      section: 'Data' },
  { id: 'logs',           label: 'Activity Logs',    icon: ScrollText,      section: 'System' },
  { id: 'settings',       label: 'Settings',         icon: SettingsIcon,    section: 'System' },
  { id: 'profile',        label: 'My Profile',       icon: UserCircle,      section: 'System' },
]

const TITLES = {
  dashboard:        'Overview',
  analytics:        'Analytics',
  profiles:         'Profiles',
  bookings:         'Bookings',
  locations:        'Locations',
  availability:     'Availability',
  'live-map':       'Live Map',
  'tech-locations': 'Technician Locations',
  support:          'Support Tickets',
  logs:             'Activity Logs',
  settings:         'Settings',
  profile:          'My Profile',
}

const PAGES = {
  dashboard:        Dashboard,
  analytics:        Analytics,
  profiles:         Profiles,
  bookings:         Bookings,
  locations:        Locations,
  availability:     Availability,
  'live-map':       LiveMap,
  'tech-locations': TechnicianLocations,
  support:          SupportTickets,
  logs:             Logs,
  settings:         Settings,
  profile:          AdminProfile,
}

function PhClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const opts = { timeZone: 'Asia/Manila' }
  const time = now.toLocaleTimeString('en-PH', { ...opts, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const day  = now.toLocaleDateString('en-PH', { ...opts, weekday: 'long' })
  const date = now.toLocaleDateString('en-PH', { ...opts, month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
        <Clock size={12} color="var(--text-muted)" /> {time}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{day}, {date} · PHT</div>
    </div>
  )
}

function AppShell() {
  const { user, profile, loading, isAdmin, signOut, theme, toggleTheme } = useAuth()
  const [active,    setActive]    = useState('dashboard')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pf-sidebar') === 'true')

  const toggleSidebar = () => setCollapsed(c => {
    const next = !c
    localStorage.setItem('pf-sidebar', String(next))
    return next
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, color: 'var(--text-muted)', fontSize: 13 }}>
        <div className="spinner" />
        Loading…
      </div>
    )
  }

  if (!user || !isAdmin) return <Login />

  const Page = PAGES[active] || Dashboard
  const sections = [...new Set(NAV.map(n => n.section))]

  return (
    <div className="layout">
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>

        {/* ── Current user / collapse toggle ── */}
        <div className="sidebar-logo" style={{ justifyContent: collapsed ? 'center' : undefined, borderBottom: collapsed ? undefined : 'none' }}>
          {!collapsed && (
            <button
              onClick={() => setActive('profile')}
              title="My Profile"
              style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
            >
              <Avatar name={profile?.full_name || user.email} url={profile?.avatar_url} />
              <div style={{ overflow: 'hidden', minWidth: 0 }}>
                <div className="sidebar-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile?.full_name || user.email}
                </div>
                <div className="sidebar-user-role">admin</div>
              </div>
            </button>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ marginLeft: collapsed ? 0 : 'auto' }}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        {/* ── Philippine time ── */}
        {!collapsed && <PhClock />}

        {/* ── Nav ── */}
        <nav className="sidebar-nav">
          {sections.map(section => (
            <div key={section}>
              {!collapsed && <div className="nav-section-label">{section}</div>}
              {NAV.filter(n => n.section === section).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`nav-item${active === id ? ' active' : ''}`}
                  onClick={() => setActive(id)}
                  title={label}
                >
                  <Icon />
                  {!collapsed && <span>{label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* ── Bottom ── */}
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={signOut}
            title="Sign out"
            style={{ color: 'var(--red)', justifyContent: collapsed ? 'center' : undefined }}
          >
            <LogOut size={14} />
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Papafix</span>
          <ChevronRight size={12} color="var(--text-faint)" />
          <span className="topbar-title">{TITLES[active]}</span>
          <div className="topbar-spacer" />
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <span className="topbar-badge">
            <Database size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Supabase
          </span>
        </header>
        <div className="content">
          <Page />
        </div>
      </main>

      <ToastContainer />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
