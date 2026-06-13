import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Pencil, Trash2, MapPin, Star, Plus, X } from 'lucide-react'
import { supabase } from './supabase'
import { getPref } from './prefs'
import { Spinner, Empty, Modal, ConfirmDialog, Pagination } from './UI'
import { addLog } from './Logs'
import { useToast } from './Toast'
import { useAuth } from './AuthContext'

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export default function Locations() {
  const { user } = useAuth()
  const PAGE_SIZE = getPref('pageSize', 15)
  const [rows,          setRows]          = useState([])
  const [total,         setTotal]         = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [defaultFilter, setDefaultFilter] = useState('')
  const [page,          setPage]          = useState(1)
  const [editing,       setEditing]       = useState(null)
  const [confirm,       setConfirm]       = useState(null)
  const [mapId,         setMapId]         = useState(null)
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('locations')
      .select('id, label, address, latitude, longitude, is_default, user_id, created_at', { count: 'exact' })
    if (search)                        q = q.or(`label.ilike.%${search}%,address.ilike.%${search}%`)
    if (defaultFilter === 'default')   q = q.eq('is_default', true)
    if (defaultFilter === 'other')     q = q.eq('is_default', false)
    q = q.order('created_at', { ascending: false })
         .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!mountedRef.current) return
    if (!error) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, defaultFilter, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, defaultFilter])

  const save = async () => {
    const { id, label, address, latitude, longitude, is_default } = editing
    const payload = { label, address, latitude: Number(latitude), longitude: Number(longitude), is_default: !!is_default }
    const { error } = id
      ? await supabase.from('locations').update(payload).eq('id', id)
      : await supabase.from('locations').insert({ ...payload, id: crypto.randomUUID(), user_id: editing.user_id || user.id, created_at: new Date().toISOString() })
    if (error) { toast(error.message, 'error'); return }
    toast(id ? 'Location updated' : 'Location created')
    addLog('ok', `Location ${id ? 'updated' : 'created'}: ${label}`, address)
    setEditing(null)
    load()
  }

  const del = async (id) => {
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    toast('Location deleted')
    addLog('warn', 'Location deleted', id)
    setConfirm(null)
    load()
  }

  const clearFilters = () => { setSearch(''); setDefaultFilter(''); setPage(1) }
  const hasFilters = search || defaultFilter

  return (
    <div>
      <div className="table-wrap">
        {/* ── Filter bar ── */}
        <div className="table-header">
          <span className="table-title">Locations</span>
          <span className="table-count">{total} total</span>
          <div className="table-spacer" />
          <div className="search-wrap">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search label, address…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="form-select" style={{ width: 140, padding: '6px 10px' }}
            value={defaultFilter} onChange={e => { setDefaultFilter(e.target.value); setPage(1) }}>
            <option value="">All locations</option>
            <option value="default">Default only</option>
            <option value="other">Non-default</option>
          </select>
          {hasFilters && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={clearFilters}>
              <X size={11} /> Clear
            </button>
          )}
          <button className="btn btn-primary"
            onClick={() => setEditing({ label: '', address: '', latitude: '', longitude: '', is_default: false })}>
            <Plus size={13} /> New Location
          </button>
        </div>

        {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <table>
            <thead><tr>
              <th>Label</th><th>Address</th><th>Coordinates</th><th>Default</th><th>User ID</th><th>Created</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="flex-center">
                      <MapPin size={12} color="var(--accent)" />
                      <span style={{ fontWeight: 500 }}>{r.label}</span>
                    </div>
                  </td>
                  <td>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 12 }}>
                      <span className="truncate" style={{ display: 'block', maxWidth: 200 }}>{r.address}</span>
                    </a>
                  </td>
                  <td>
                    <button className="icon-btn" style={{ width: 'auto', padding: '2px 6px', opacity: 1 }}
                      onClick={() => setMapId(r.id === mapId ? null : r.id)}>
                      <span className="mono" style={{ fontSize: 11 }}>
                        {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                      </span>
                    </button>
                  </td>
                  <td>
                    {r.is_default
                      ? <span className="flex-center" style={{ gap: 4, color: 'var(--amber)' }}><Star size={12} /> Default</span>
                      : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>}
                  </td>
                  <td><span className="mono">{r.user_id?.slice(0, 8)}…</span></td>
                  <td><span className="mono">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => setEditing({ ...r })}><Pencil size={12} /></button>
                      <button className="icon-btn danger" onClick={() => setConfirm(r.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {mapId && (() => {
          const loc = rows.find(r => r.id === mapId)
          if (!loc) return null
          const src = `https://www.google.com/maps/embed/v1/place?key=${MAPS_API_KEY}&q=${loc.latitude},${loc.longitude}&zoom=16`
          return (
            <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{loc.label} — {loc.address}</div>
              <iframe src={src} width="100%" height="240" style={{ border: 0, borderRadius: 8 }} loading="lazy" />
            </div>
          )
        })()}

        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit Location' : 'New Location'} onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>}>
          <div className="form-group">
            <label className="form-label">Label</label>
            <input className="form-input" value={editing.label || ''} onChange={e => setEditing(p => ({ ...p, label: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-input" value={editing.address || ''} onChange={e => setEditing(p => ({ ...p, address: e.target.value }))} />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Latitude</label>
              <input className="form-input" type="number" step="any" value={editing.latitude || ''} onChange={e => setEditing(p => ({ ...p, latitude: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Longitude</label>
              <input className="form-input" type="number" step="any" value={editing.longitude || ''} onChange={e => setEditing(p => ({ ...p, longitude: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="isDefault" checked={!!editing.is_default} onChange={e => setEditing(p => ({ ...p, is_default: e.target.checked }))} />
            <label htmlFor="isDefault" className="form-label" style={{ textTransform: 'none', marginBottom: 0 }}>Default location</label>
          </div>
        </Modal>
      )}

      {confirm && <ConfirmDialog message="Delete this location?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
