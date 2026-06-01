import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, MapPin } from 'lucide-react'
import { supabase } from './supabase'
import { Spinner, Empty, Pagination } from './UI'

const PAGE_SIZE = 15
const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export default function TechnicianLocations() {
  const [rows, setRows]       = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const [mapId, setMapId]     = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('technician_locations')
      .select('technician_id, latitude, longitude, updated_at', { count: 'exact' })
    if (search) q = q.ilike('technician_id', `%${search}%`)
    q = q.order('updated_at', { ascending: false })
         .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!mountedRef.current) return
    if (!error) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page])

  useEffect(() => { load() }, [load])

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
          <button className="btn btn-ghost" onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {loading ? <Spinner /> : rows.length === 0 ? <Empty message="No technician locations tracked" /> : (
          <table>
            <thead><tr>
              <th>Status</th><th>Technician ID</th><th>Latitude</th><th>Longitude</th><th>Last Updated</th><th>Map</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.technician_id}>
                  <td>
                    <span className={`dot ${isRecent(r.updated_at) ? 'dot-green' : 'dot-muted'}`}
                      title={isRecent(r.updated_at) ? 'Online' : 'Offline'} />
                  </td>
                  <td><span className="mono">{r.technician_id?.slice(0, 12)}…</span></td>
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
              ))}
            </tbody>
          </table>
        )}

        {mapId && (() => {
          const loc = rows.find(r => r.technician_id === mapId)
          if (!loc) return null
          const src = `https://www.google.com/maps/embed/v1/place?key=${MAPS_API_KEY}&q=${loc.latitude},${loc.longitude}&zoom=15`
          return (
            <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Technician {loc.technician_id?.slice(0, 12)}… — last seen {loc.updated_at ? new Date(loc.updated_at).toLocaleString() : '—'}
              </div>
              <iframe src={src} width="100%" height="280" style={{ border: 0, borderRadius: 8 }} loading="lazy" />
            </div>
          )
        })()}

        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  )
}
