import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Navigation, MapPin, Clock, Wifi, WifiOff } from 'lucide-react'
import { supabase } from './supabase'
import { getPref } from './prefs'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
// Conservative refresh — 45s avoids hammering Maps Embed API
const REFRESH_MS = 45_000

function TechCard({ loc, prof, isActive, isOnline, timeSince, onClick }) {
  const initials = prof?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderBottom: '1px solid var(--border)',
      background: isActive ? 'var(--accent-soft)' : 'transparent',
      border: 'none', borderBottom: '1px solid var(--border)',
      cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        background: isOnline ? 'var(--green-soft)' : 'var(--surface2)',
        border: `2px solid ${isOnline ? 'var(--green)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
        color: isOnline ? 'var(--green)' : 'var(--text-muted)',
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {prof?.full_name || 'Unknown'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 5, marginTop: 2, alignItems: 'center' }}>
          {isOnline
            ? <><Wifi size={9} color="var(--green)" /> <span style={{ color: 'var(--green)' }}>online</span></>
            : <><WifiOff size={9} /> <span>offline</span></>}
          <span>·</span>
          <Clock size={9} />
          <span>{timeSince}</span>
        </div>
      </div>
      <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-faint)', flexShrink: 0, textAlign: 'right' }}>
        <div>{Number(loc.latitude).toFixed(3)}</div>
        <div>{Number(loc.longitude).toFixed(3)}</div>
      </div>
    </button>
  )
}

export default function LiveMap() {
  const [locs,         setLocs]         = useState([])
  const [profiles,     setProfiles]     = useState({})
  const [selected,     setSelected]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [lastRefresh,  setLastRefresh]  = useState(null)
  const [mapLoaded,    setMapLoaded]    = useState(false)   // don't load iframe until needed
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    const { data: locData } = await supabase
      .from('technician_locations')
      .select('technician_id, latitude, longitude, updated_at')
      .order('updated_at', { ascending: false })

    if (!mountedRef.current) return
    if (!locData?.length) { setLoading(false); return }

    const ids = [...new Set(locData.map(l => l.technician_id))]
    const { data: profData } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', ids)

    if (!mountedRef.current) return
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

  const mapSrc = () => {
    if (selected) {
      const loc = locs.find(l => l.technician_id === selected)
      if (loc) return `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${loc.latitude},${loc.longitude}&zoom=15`
    }
    if (locs.length === 1) {
      const l = locs[0]
      return `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${l.latitude},${l.longitude}&zoom=14`
    }
    if (locs.length > 1) {
      const c = locs[0]
      return `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${c.latitude},${c.longitude}&zoom=11`
    }
    return `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=Philippines&zoom=6`
  }

  const online = locs.filter(l => isOnline(l.updated_at))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, height: 'calc(100vh - 112px)' }}>
      {/* Left panel */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Navigation size={13} color="var(--accent)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Technicians</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>
            <span style={{ color: 'var(--green)' }}>{online.length}</span>
            <span style={{ color: 'var(--text-faint)' }}>/{locs.length}</span>
          </span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
          {!loading && locs.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12 }}>
              <MapPin size={24} color="var(--text-faint)" style={{ margin: '0 auto 8px' }} />
              <div style={{ color: 'var(--text-muted)' }}>No locations tracked yet.</div>
              <div style={{ color: 'var(--text-faint)', marginTop: 4, fontSize: 11 }}>Technicians need to enable location in the mobile app.</div>
            </div>
          )}
          {locs.map(loc => (
            <TechCard key={loc.technician_id}
              loc={loc}
              prof={profiles[loc.technician_id]}
              isActive={selected === loc.technician_id}
              isOnline={isOnline(loc.updated_at)}
              timeSince={timeSince(loc.updated_at)}
              onClick={() => {
                const next = selected === loc.technician_id ? null : loc.technician_id
                setSelected(next)
                setMapLoaded(true) // load map on first selection
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={load}>
            <RefreshCw size={11} /> Refresh
          </button>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 'auto', fontFamily: 'DM Mono, monospace' }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ padding: '6px 14px 10px', fontSize: 10, color: 'var(--text-faint)' }}>
          Auto-refreshes every {REFRESH_MS / 1000}s · Click a technician to view on map
        </div>
      </div>

      {/* Map panel */}
      <div style={{
        borderRadius: 8, overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--surface2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {!mapLoaded && !loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <MapPin size={32} color="var(--text-faint)" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, fontWeight: 500 }}>Select a technician to view their location</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Map loads on demand to conserve API quota</div>
          </div>
        )}
        {mapLoaded && (
          <iframe
            key={selected || 'overview'}
            src={mapSrc()}
            width="100%" height="100%"
            style={{ border: 0, display: 'block', minHeight: 400 }}
            loading="lazy"
            allowFullScreen
            title="Technician Location"
          />
        )}
        {/* Show overview button when a technician is selected */}
        {selected && mapLoaded && (
          <button
            onClick={() => setSelected(null)}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: 'var(--shadow-sm)',
            }}>
            <Navigation size={11} /> Overview
          </button>
        )}
      </div>
    </div>
  )
}
