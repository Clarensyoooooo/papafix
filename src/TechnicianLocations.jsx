import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, MapPin } from 'lucide-react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabase'
import { getPref } from './prefs'
import { Spinner, Empty, Pagination } from './UI'

const REFRESH_MS = 45 * 1000

// ── Map helper: recenter when the selected technician changes ──────────────
function Recenter({ center, zoom = 16 }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 0.6 })
  }, [center, zoom, map])
  return null
}

export default function TechnicianLocations() {
  const PAGE_SIZE = getPref('pageSize', 15)
  const [rows, setRows]         = useState([])
  const [profiles, setProfiles] = useState({})   // id -> { full_name, phone }
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [mapId, setMapId]       = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // `silent` skips the big spinner so the auto-refresh interval doesn't flicker the table
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    let q = supabase
      .from('technician_locations')
      .select('technician_id, latitude, longitude, updated_at', { count: 'exact' })
    if (search) q = q.ilike('technician_id', `%${search}%`)
    q = q.order('updated_at', { ascending: false })
         .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error } = await q
    if (!mountedRef.current) return

    if (error) {
      console.error('[TechnicianLocations] query failed:', error)
      setLoadError(error.message)
      setLoading(false)
      return
    }

    setLoadError(null)
    const locData = data || []
    setRows(locData)
    setTotal(count || 0)

    // Enrich with technician names (same pattern as LiveMap)
    const ids = [...new Set(locData.map(r => r.technician_id))]
    if (ids.length) {
      const { data: profData, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', ids)
      if (mountedRef.current && !profErr) {
        setProfiles(Object.fromEntries((profData || []).map(p => [p.id, p])))
      }
    }

    setLoading(false)
  }, [search, page, PAGE_SIZE])

  useEffect(() => { load() }, [load])

  // Quiet auto-refresh, respecting the same preference LiveMap uses
  useEffect(() => {
    if (!getPref('liveMapRefresh', true)) return
    const t = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const timeSince = (ts) => {
    if (!ts) return '—'
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const isRecent = (ts) => ts && Date.now() - new Date(ts).getTime() < 15 * 60 * 1000

  const selected = rows.find(r => r.technician_id === mapId)
  const selectedCenter = selected
    ? [Number(selected.latitude), Number(selected.longitude)]
    : null

  return (
    <div>
      <div className="table-wrap">
        <div className="table-header">
          <span className="table-title">Technician Locations</span>
          <span className="table-count">{total} total</span>
          <div className="table-spacer" />
          <div className="search-wrap">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Technician ID…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <button className="btn btn-ghost" onClick={() => load()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {loading ? <Spinner /> : loadError ? (
          <div style={{ padding: 20, margin: '12px 16px', background: 'var(--red-soft, #fee)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ color: 'var(--red, #c00)', fontWeight: 600, marginBottom: 4 }}>Failed to load technician locations</div>
            <div style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginBottom: 8 }}>{loadError}</div>
            <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>
              Check that the <code>technician_locations</code> table exists in Supabase and that your RLS policy allows admin reads.
            </div>
          </div>
        ) : rows.length === 0 ? <Empty message="No technician locations tracked" /> : (
          <table>
            <thead><tr>
              <th>Status</th><th>Technician</th><th>Latitude</th><th>Longitude</th><th>Last Updated</th><th>Map</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const prof = profiles[r.technician_id]
                return (
                  <tr key={r.technician_id}>
                    <td>
                      <span className={`dot ${isRecent(r.updated_at) ? 'dot-green' : 'dot-muted'}`}
                        title={isRecent(r.updated_at) ? 'Online' : 'Offline'} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{prof?.full_name || 'Unknown technician'}</div>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        {r.technician_id?.slice(0, 12)}…
                      </span>
                    </td>
                    <td><span className="mono">{Number(r.latitude).toFixed(6)}</span></td>
                    <td><span className="mono">{Number(r.longitude).toFixed(6)}</span></td>
                    <td>
                      <span className="mono" style={{ color: isRecent(r.updated_at) ? 'var(--green)' : 'var(--text-muted)' }}>
                        {timeSince(r.updated_at)}
                      </span>
                    </td>
                    <td>
                      <button className="icon-btn" style={{ opacity: 1 }}
                        onClick={() => setMapId(r.technician_id === mapId ? null : r.technician_id)}>
                        <MapPin size={13} color={r.technician_id === mapId ? 'var(--accent)' : undefined} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* ── Inline Leaflet map (replaces the Google embed iframe) ── */}
        {selected && selectedCenter && (() => {
          const prof   = profiles[selected.technician_id]
          const online = isRecent(selected.updated_at)
          return (
            <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                {prof?.full_name || 'Technician'} — last seen {timeSince(selected.updated_at)}
                {' · '}
                <span className="mono">{selectedCenter[0].toFixed(6)}, {selectedCenter[1].toFixed(6)}</span>
              </div>
              <div style={{ height: 280, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <MapContainer center={selectedCenter} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <Recenter center={selectedCenter} />
                  <CircleMarker
                    center={selectedCenter}
                    radius={10}
                    fillColor={online ? '#22c55e' : '#6b7280'}
                    color={online ? '#15803d' : '#374151'}
                    weight={2}
                    fillOpacity={0.9}
                  >
                    <Popup minWidth={180}>
                      <div style={{ fontFamily: 'inherit' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 4 }}>Technician</div>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{prof?.full_name || 'Unknown'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: online ? '#22c55e' : '#6b7280' }} />
                          <span style={{ fontSize: 12, color: online ? '#15803d' : '#6b7280' }}>{online ? 'Online' : 'Offline'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>Updated {timeSince(selected.updated_at)}</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                </MapContainer>
              </div>
            </div>
          )
        })()}

        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  )
}