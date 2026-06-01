import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Plus, Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { supabase } from './supabase'
import { Spinner, Empty, Modal, ConfirmDialog, Pagination } from './UI'
import { useToast } from './Toast'
import { addLog } from './Logs'

const PAGE_SIZE = 15

export default function Availability() {
  const [rows,   setRows]   = useState([])
  const [total,  setTotal]  = useState(0)
  const [loading,setLoading]= useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [page,   setPage]   = useState(1)
  const [editing,setEditing]= useState(null)
  const [confirm,setConfirm]= useState(null)
  const [techs,  setTechs]  = useState([])
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // Load technician list once for the dropdown
  useEffect(() => {
    supabase.from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'technician')
      .order('full_name')
      .then(({ data }) => { if (mountedRef.current) setTechs(data || []) })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('availability')
      .select('id, technician_id, date, start_time, end_time, is_available', { count: 'exact' })
    if (search) {
      const matchIds = techs
        .filter(t => t.full_name?.toLowerCase().includes(search.toLowerCase()))
        .map(t => t.id)
      if (matchIds.length) q = q.in('technician_id', matchIds)
      else q = q.ilike('technician_id', `%${search}%`)
    }
    if (filter === 'available')   q = q.eq('is_available', true)
    if (filter === 'unavailable') q = q.eq('is_available', false)
    q = q.order('date', { ascending: false })
         .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!mountedRef.current) return
    if (!error) { setRows(data || []); setTotal(count || 0) }
    else addLog('error', 'Failed to load availability', error.message)
    setLoading(false)
  }, [search, filter, page, techs])

  useEffect(() => { load() }, [load])

  const save = async () => {
    const { id, technician_id, date, start_time, end_time, is_available } = editing
    if (!technician_id) { toast('Please select a technician', 'error'); return }
    if (!date)          { toast('Please pick a date', 'error'); return }
    if (!start_time || !end_time) { toast('Set start and end times', 'error'); return }
    const payload = { technician_id, date, start_time, end_time, is_available: !!is_available }
    const { error } = id
      ? await supabase.from('availability').update(payload).eq('id', id)
      : await supabase.from('availability').insert({ ...payload, id: crypto.randomUUID() })
    if (error) { toast(error.message, 'error'); addLog('error', 'Availability save failed', error.message); return }
    const techName = techs.find(t => t.id === technician_id)?.full_name || technician_id.slice(0, 8)
    toast(id ? 'Slot updated' : 'Slot created')
    addLog('ok', `Availability ${id ? 'updated' : 'created'}: ${techName} on ${date}`, `${start_time}–${end_time}`)
    setEditing(null); load()
  }

  const del = async (id) => {
    const row = rows.find(r => r.id === id)
    const { error } = await supabase.from('availability').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); addLog('error', 'Slot delete failed', error.message); return }
    toast('Slot deleted')
    addLog('warn', `Availability slot deleted: ${row?.date}`, id)
    setConfirm(null); load()
  }

  const toggle = async (row) => {
    const { error } = await supabase.from('availability')
      .update({ is_available: !row.is_available }).eq('id', row.id)
    if (error) { toast(error.message, 'error'); return }
    const techName = techs.find(t => t.id === row.technician_id)?.full_name || '?'
    addLog('info', `Availability toggled: ${techName} ${row.date}`, row.is_available ? 'available → unavailable' : 'unavailable → available')
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_available: !row.is_available } : r))
  }

  const techName = id => techs.find(t => t.id === id)?.full_name || id?.slice(0, 8) + '…'
  const dur = (s, e) => {
    try {
      const [sh, sm] = s.split(':').map(Number), [eh, em] = e.split(':').map(Number)
      const m = (eh * 60 + em) - (sh * 60 + sm)
      if (m <= 0) return '—'
      const h = Math.floor(m / 60); return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
    } catch { return '—' }
  }

  return (
    <div>
      <div className="table-wrap">
        <div className="table-header">
          <span className="table-title">Availability</span>
          <span className="table-count">{total} slots</span>
          <div className="table-spacer" />
          <div className="search-wrap">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search technician…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="form-select" style={{ width: 140, padding: '6px 10px' }}
            value={filter} onChange={e => { setFilter(e.target.value); setPage(1) }}>
            <option value="">All</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <button className="btn btn-primary"
            onClick={() => setEditing({ technician_id: '', date: '', start_time: '08:00', end_time: '17:00', is_available: true })}>
            <Plus size={13} /> Add Slot
          </button>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <table>
            <thead><tr>
              <th>Technician</th><th>Date</th><th>Start</th><th>End</th><th>Duration</th><th>Available</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{techName(r.technician_id)}</div>
                    <div className="mono" style={{ fontSize: 10 }}>{r.technician_id?.slice(0, 8)}…</div>
                  </td>
                  <td><span className="mono">{r.date}</span></td>
                  <td><span className="mono">{r.start_time}</span></td>
                  <td><span className="mono">{r.end_time}</span></td>
                  <td><span className="mono" style={{ color: 'var(--text)' }}>{dur(r.start_time, r.end_time)}</span></td>
                  <td>
                    <button onClick={() => toggle(r)} className="icon-btn" style={{ width: 'auto', padding: '2px 6px', opacity: 1 }}>
                      {r.is_available
                        ? <span className="flex-center" style={{ gap: 4, color: 'var(--green)' }}><CheckCircle size={13} /> Yes</span>
                        : <span className="flex-center" style={{ gap: 4, color: 'var(--red)' }}><XCircle size={13} /> No</span>}
                    </button>
                  </td>
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
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit Slot' : 'New Slot'} onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>}>
          <div className="form-group">
            <label className="form-label">Technician <span style={{ color: 'var(--red)' }}>*</span></label>
            {techs.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-soft)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '8px 12px' }}>
                  No technicians found. Go to Profiles → set a user's role to "technician" first.
                </div>
              : <select className="form-select" value={editing.technician_id}
                  onChange={e => setEditing(p => ({ ...p, technician_id: e.target.value }))}>
                  <option value="">— Select technician —</option>
                  {techs.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || 'Unnamed'}{t.phone ? ` · ${t.phone}` : ''}
                    </option>
                  ))}
                </select>
            }
          </div>
          <div className="form-group">
            <label className="form-label">Date <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-input" type="date" value={editing.date || ''}
              onChange={e => setEditing(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input className="form-input" type="time" value={editing.start_time || ''}
                onChange={e => setEditing(p => ({ ...p, start_time: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">End Time</label>
              <input className="form-input" type="time" value={editing.end_time || ''}
                onChange={e => setEditing(p => ({ ...p, end_time: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="avail" checked={!!editing.is_available}
              onChange={e => setEditing(p => ({ ...p, is_available: e.target.checked }))} />
            <label htmlFor="avail" className="form-label" style={{ textTransform: 'none', marginBottom: 0 }}>Available</label>
          </div>
        </Modal>
      )}

      {confirm && <ConfirmDialog message="Delete this slot?"
        onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
