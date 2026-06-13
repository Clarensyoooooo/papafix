import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { RefreshCw, Navigation, MapPin, Clock, Wifi, WifiOff, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { supabase } from './supabase'
import { getPref } from './prefs'
import 'leaflet/dist/leaflet.css'

const REFRESH_MS = 45_000
const PH_CENTER  = [12.8797, 121.774]

// Custom pin icon for customer locations
const customerIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:14px;height:14px;
    background:#3b82f6;border:2px solid #1d4ed8;
    border-radius:3px;transform:rotate(45deg);
    box-shadow:0 1px 4px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function BoundsFitter({ locs, customers, showCustomers }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    const all = [
      ...locs.map(l => [l.latitude, l.longitude]),
      ...(showCustomers ? customers.map(c => [c.latitude, c.longitude]) : []),
    ].filter(([lat, lng]) => lat && lng)

    if (!all.length || fitted.current) return
    fitted.current = true
    if (all.length === 1) {
      map.setView(all[0], 14)
    } else {
      map.fitBounds(all, { padding: [48, 48] })
    }
  }, [locs, customers, showCustomers, map])
  return null
}

export default function LiveMap() {
  const [locs,           setLocs]           = useState([])
  const [profiles,       setProfiles]       = useState({})
  const [customers,      setCustomers]      = useState([])   // from locations table
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [lastRefresh,    setLastRefresh]    = useState(null)
  const [sidebarOpen,    setSidebarOpen]    = useState(true)
  const [showCustomers,  setShowCustomers]  = useState(true)
  const [activeTab,      setActiveTab]      = useState('techs') // 'techs' | 'customers'
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    // Fetch technician live positions + customer saved locations in parallel
    const [techRes, custRes] = await Promise.all([
      supabase
        .from('technician_locations')
        .select('technician_id, latitude, longitude, updated_at')
        .order('updated_at', { ascending: false }),
      supabase
        .from('locations')
        .select('id, label, address, latitude, longitude, user_id')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null),
    ])

    if (!mountedRef.current) return

    if (techRes.error) {
      console.error('[LiveMap] technician_locations:', techRes.error)
      setError(techRes.error.message)
      setLoading(false)
      return
    }
    setError(null)

    if (custRes.error) {
      console.error('[LiveMap] locations:', custRes.error)
    } else {
      setCustomers(custRes.data || [])
    }

    const locData = techRes.data || []
    if (!locData.length) { setLoading(false); return }

    const ids = [...new Set(locData.map(l => l.technician_id))]
    const { data: profData, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', ids)

    if (!mountedRef.current) return
    if (profErr) console.error('[LiveMap] profiles:', profErr)
    setProfiles(Object.fromEntries((profData || []).map(p => [p.id, p])))
    setLocs(locData)
    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    if (!getPref('liveMapRefresh', true)) return
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const isOnline  = ts => ts && Date.now() - new Date(ts).getTime() < 15 * 60 * 1000
  const timeSince = ts => {
    if (!ts) return '—'
    const diff = Date.now() - new Date(ts).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    return `${Math.floor(m / 60)}h ago`
  }

  const onlineCount = locs.filter(l => isOnline(l.updated_at)).length

  const tabStyle = active => ({
    flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600, border: 'none',
    cursor: 'pointer', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    background: 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)',
    transition: 'color 0.15s',
  })

  return (
    <div style={{
      position: 'relative', height: 'calc(100vh - 112px)',
      borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)',
    }}>

      {/* ── Map ── */}
      <MapContainer center={PH_CENTER} zoom={6} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {!loading && <BoundsFitter locs={locs} customers={customers} showCustomers={showCustomers} />}

        {/* Technician dots */}
        {locs.map(loc => {
          const prof   = profiles[loc.technician_id]
          const online = isOnline(loc.updated_at)
          return (
            <CircleMarker
              key={loc.technician_id}
              center={[Number(loc.latitude), Number(loc.longitude)]}
              radius={10}
              fillColor={online ? '#22c55e' : '#6b7280'}
              color={online ? '#15803d' : '#374151'}
              weight={2}
              fillOpacity={0.9}
            >
              <Popup minWidth={180}>
                <div style={{ fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 4 }}>
                    Technician
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                    {prof?.full_name || 'Unknown'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: online ? '#22c55e' : '#6b7280' }} />
                    <span style={{ fontSize: 12, color: online ? '#15803d' : '#6b7280' }}>{online ? 'Online' : 'Offline'}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>· {timeSince(loc.updated_at)}</span>
                  </div>
                  {prof?.phone && <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>{prof.phone}</div>}
                  <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', marginTop: 4 }}>
                    {Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}

        {/* Customer location pins */}
        {showCustomers && customers.map(c => (
          <Marker key={c.id} position={[Number(c.latitude), Number(c.longitude)]} icon={customerIcon}>
            <Popup minWidth={180}>
              <div style={{ fontFamily: 'inherit' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#3b82f6', marginBottom: 4 }}>
                  Customer Location
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{c.label}</div>
                {c.address && <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>{c.address}</div>}
                <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
                  {Number(c.latitude).toFixed(5)}, {Number(c.longitude).toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ── Sidebar toggle ── */}
      <button
        onClick={() => setSidebarOpen(o => !o)}
        style={{
          position: 'absolute', top: 12,
          left: sidebarOpen ? 272 : 12,
          zIndex: 1001, transition: 'left 0.2s',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '6px 8px', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', color: 'var(--text-muted)',
        }}
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* ── Sidebar overlay ── */}
      {sidebarOpen && (
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: 260, zIndex: 1000,
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '2px 0 12px rgba(0,0,0,0.1)',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Navigation size={13} color="var(--accent)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Command Center</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
              <span style={{ color: 'var(--green, #22c55e)' }}>{onlineCount}</span>
              <span style={{ color: 'var(--text-faint)' }}>/{locs.length}</span>
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 8px' }}>
            <button style={tabStyle(activeTab === 'techs')} onClick={() => setActiveTab('techs')}>
              Technicians ({locs.length})
            </button>
            <button style={tabStyle(activeTab === 'customers')} onClick={() => setActiveTab('customers')}>
              Customers ({customers.length})
            </button>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}

            {!loading && error && (
              <div style={{ padding: 16, margin: 12, background: 'var(--red-soft, #fee)', borderRadius: 6, fontSize: 11 }}>
                <div style={{ color: 'var(--red, #c00)', fontWeight: 600, marginBottom: 4 }}>Failed to load locations</div>
                <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', wordBreak: 'break-word' }}>{error}</div>
                <div style={{ color: 'var(--text-faint)', marginTop: 6 }}>Check Supabase table & RLS policies.</div>
              </div>
            )}

            {/* Technicians tab */}
            {!loading && !error && activeTab === 'techs' && (
              locs.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12 }}>
                    <MapPin size={24} color="var(--text-faint)" style={{ margin: '0 auto 8px' }} />
                    <div style={{ color: 'var(--text-muted)' }}>No technicians tracked yet.</div>
                    <div style={{ color: 'var(--text-faint)', marginTop: 4, fontSize: 11 }}>Enable location sharing in the mobile app.</div>
                  </div>
                : locs.map(loc => {
                    const prof    = profiles[loc.technician_id]
                    const online  = isOnline(loc.updated_at)
                    const initials = prof?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
                    return (
                      <div key={loc.technician_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: online ? 'var(--green-soft, #dcfce7)' : 'var(--surface2)',
                          border: `2px solid ${online ? 'var(--green, #22c55e)' : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                          color: online ? 'var(--green, #22c55e)' : 'var(--text-muted)',
                        }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {prof?.full_name || 'Unknown'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
                            {online
                              ? <><Wifi size={9} color="var(--green, #22c55e)" /><span style={{ color: 'var(--green, #22c55e)' }}>online</span></>
                              : <><WifiOff size={9} /><span>offline</span></>}
                            <span>·</span><Clock size={9} /><span>{timeSince(loc.updated_at)}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-faint)', flexShrink: 0, textAlign: 'right' }}>
                          <div>{Number(loc.latitude).toFixed(3)}</div>
                          <div>{Number(loc.longitude).toFixed(3)}</div>
                        </div>
                      </div>
                    )
                  })
            )}

            {/* Customers tab */}
            {!loading && activeTab === 'customers' && (
              customers.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12 }}>
                    <Users size={24} color="var(--text-faint)" style={{ margin: '0 auto 8px' }} />
                    <div style={{ color: 'var(--text-muted)' }}>No customer locations saved yet.</div>
                    <div style={{ color: 'var(--text-faint)', marginTop: 4, fontSize: 11 }}>Customers add their address in the mobile app.</div>
                  </div>
                : customers.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 4, flexShrink: 0,
                        background: '#eff6ff', border: '2px solid #3b82f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <MapPin size={13} color="#3b82f6" />
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.label}
                        </div>
                        {c.address && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                            {c.address}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={load}>
              <RefreshCw size={11} /> Refresh
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 8px', marginLeft: 'auto', color: showCustomers ? '#3b82f6' : undefined }}
              onClick={() => setShowCustomers(s => !s)}
              title={showCustomers ? 'Hide customer pins' : 'Show customer pins'}
            >
              <MapPin size={11} /> {showCustomers ? 'Hide' : 'Show'} customers
            </button>
          </div>
          <div style={{ padding: '4px 14px 10px', fontSize: 10, color: 'var(--text-faint)' }}>
            Auto-refreshes every {REFRESH_MS / 1000}s · Click any marker to inspect
          </div>
        </div>
      )}

      {/* ── Top-right stats + legend ── */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 1000,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        display: 'flex', gap: 14, alignItems: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green, #22c55e)', fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{onlineCount}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>online</div>
        </div>
        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{locs.length}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>techs</div>
        </div>
        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6', fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{customers.length}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>locations</div>
        </div>
      </div>

      {/* ── Bottom-right legend ── */}
      <div style={{
        position: 'absolute', bottom: 24, right: 12, zIndex: 1000,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        fontSize: 11, color: 'var(--text-muted)',
        display: 'flex', flexDirection: 'column', gap: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid #15803d', display: 'inline-block' }} />
          Technician (online)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6b7280', border: '2px solid #374151', display: 'inline-block' }} />
          Technician (offline)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#3b82f6', border: '2px solid #1d4ed8', transform: 'rotate(45deg)', display: 'inline-block' }} />
          Customer location
        </div>
      </div>

    </div>
  )
}
