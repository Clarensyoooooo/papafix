import { useState } from 'react'
import {
  LayoutDashboard, Users, CalendarCheck, MapPin, Clock,
  Navigation, Database, ChevronRight, ChevronLeft, LogOut,
  Sun, Moon, Wrench, ScrollText, Settings as SettingsIcon,
  UserCircle, Map, BarChart2
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
  logs:             Logs,
  settings:         Settings,
  profile:          AdminProfile,
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

        {/* ── Logo / collapse toggle ── */}
        <div className="sidebar-logo" style={{ justifyContent: collapsed ? 'center' : undefined }}>
          {!collapsed && (
            <>
              <div className="logo-mark"><Wrench size={15} color="white" /></div>
              <span className="logo-text">Papafix Admin</span>
            </>
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
            className="sidebar-user"
            style={{ border: 'none', cursor: 'pointer', width: '100%', background: 'none', borderRadius: 5, transition: 'background 0.1s', textAlign: 'left', justifyContent: collapsed ? 'center' : undefined }}
            onClick={() => setActive('profile')}
            title={collapsed ? (profile?.full_name || 'My Profile') : undefined}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <Avatar name={profile?.full_name || user.email} url={profile?.avatar_url} />
            {!collapsed && (
              <div style={{ overflow: 'hidden' }}>
                <div className="sidebar-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile?.full_name || user.email}
                </div>
                <div className="sidebar-user-role">admin</div>
              </div>
            )}
          </button>
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
