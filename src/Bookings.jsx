import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Pencil, Trash2, Eye } from 'lucide-react'
import { supabase } from './supabase'
import { Spinner, Empty, Badge, Modal, ConfirmDialog, Pagination, Stars } from './UI'
import { useToast } from './Toast'
import { addLog } from './Logs'

const PAGE_SIZE = 15
const STATUSES  = ['pending', 'scheduled', 'in_progress', 'completed', 'cancelled']
const PAY_STATI = ['', 'pending', 'paid', 'failed']
const CATS      = ['electrical', 'plumbing', 'aircon', 'appliance', 'carpentry', 'painting', 'cleaning', 'other']

const LIST_COLS   = 'id, service_category, issue_type, status, payment_status, estimated_fee, rating, created_at, customer_id, technician_id'
const DETAIL_COLS = 'id, service_category, issue_type, issue_description, status, payment_status, estimated_fee, final_fee, rating, rating_note, qr_token, qr_mismatch_alert, inspection_checklist, created_at, updated_at, customer_id, technician_id'

function BookingDetail({ booking, onClose }) {
  const [full, setFull] = useState(null)
  useEffect(() => {
    supabase.from('bookings').select(DETAIL_COLS).eq('id', booking.id).single()
      .then(({ data }) => setFull(data))
  }, [booking.id])

  const b = full || booking
  const fields = [
    ['ID',          b.id],
    ['Customer',    b.customer_id],
    ['Technician',  b.technician_id || '—'],
    ['Category',    b.service_category],
    ['Issue Type',  b.issue_type],
    ['Description', b.issue_description || '—'],
    ['Status',      b.status],
    ['Payment',     b.payment_status || '—'],
    ['Est. Fee',    b.estimated_fee ? `₱${Number(b.estimated_fee).toLocaleString()}` : '—'],
    ['Final Fee',   b.final_fee     ? `₱${Number(b.final_fee).toLocaleString()}`     : '—'],
    ['Rating',      b.rating ? `${b.rating}/5` : '—'],
    ['Rating Note', b.rating_note   || '—'],
    ['QR Token',    b.qr_token      || '—'],
    ['QR Mismatch', b.qr_mismatch_alert ? 'Yes' : 'No'],
    ['Created',     b.created_at ? new Date(b.created_at).toLocaleString() : '—'],
    ['Updated',     b.updated_at ? new Date(b.updated_at).toLocaleString() : '—'],
  ]
  return (
    <Modal title="Booking Details" onClose={onClose}>
      {!full && <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>Loading details…</div>}
      {full && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', minWidth: 110, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, paddingTop: 1 }}>{k}</span>
              <span style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>{String(v ?? '—')}</span>
            </div>
          ))}
          {b.inspection_checklist && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Checklist</div>
              <pre style={{ fontSize: 11, background: 'var(--surface2)', borderRadius: 5, padding: 10, overflow: 'auto', maxHeight: 140, color: 'var(--text-muted)' }}>
                {JSON.stringify(b.inspection_checklist, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function Bookings() {
  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page,         setPage]         = useState(1)
  const [editing,      setEditing]      = useState(null)
  const [viewing,      setViewing]      = useState(null)
  const [confirm,      setConfirm]      = useState(null)
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('bookings').select(LIST_COLS, { count: 'exact' })
    if (search)       q = q.or(`issue_type.ilike.%${search}%,service_category.ilike.%${search}%`)
    if (statusFilter) q = q.eq('status', statusFilter)
    q = q.order('created_at', { ascending: false })
         .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!mountedRef.current) return
    if (!error) { setRows(data || []); setTotal(count || 0) }
    else addLog('error', 'Failed to load bookings', error.message)
    setLoading(false)
  }, [search, statusFilter, page])

  useEffect(() => { load() }, [load])

  const save = async () => {
    const { id, status, service_category, issue_type, issue_description, estimated_fee, final_fee, payment_status, rating } = editing
    const payload = {
      status, service_category, issue_type, issue_description,
      estimated_fee: estimated_fee || null, final_fee: final_fee || null,
      payment_status: payment_status || null,
      rating: rating ? Number(rating) : null,
      updated_at: new Date().toISOString()
    }
    const { error } = await supabase.from('bookings').update(payload).eq('id', id)
    if (error) { toast(error.message, 'error'); addLog('error', 'Booking update failed', error.message); return }
    toast('Booking updated')
    addLog('ok', `Booking updated: ${issue_type}`, `status → ${status}`)
    setEditing(null); load()
  }

  const del = async (id) => {
    const row = rows.find(r => r.id === id)
    const { error } = await supabase.from('bookings').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); addLog('error', 'Booking delete failed', error.message); return }
    toast('Booking deleted')
    addLog('warn', `Booking deleted: ${row?.issue_type || id}`, id)
    setConfirm(null); load()
  }

  const sBadge = s => {
    const m = { pending: 'amber', scheduled: 'blue', completed: 'green', cancelled: 'red', in_progress: 'accent' }
    return <Badge color={m[s] || 'muted'}>{s || '—'}</Badge>
  }
  const pBadge = s => {
    if (!s) return <span className="mono">—</span>
    return <Badge color={s === 'paid' ? 'green' : s === 'failed' ? 'red' : 'amber'}>{s}</Badge>
  }

  return (
    <div>
      <div className="table-wrap">
        <div className="table-header">
          <span className="table-title">Bookings</span>
          <span className="table-count">{total} total</span>
          <div className="table-spacer" />
          <div className="search-wrap">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search issue, category…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="form-select" style={{ width: 130, padding: '6px 10px' }}
            value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <table>
            <thead><tr>
              <th>ID</th><th>Category</th><th>Issue</th><th>Status</th>
              <th>Payment</th><th>Est. Fee</th><th>Rating</th><th>Created</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><span className="mono">{r.id.slice(0, 8)}…</span></td>
                  <td><Badge color="blue">{r.service_category}</Badge></td>
                  <td><span className="truncate" style={{ display: 'block', maxWidth: 160 }}>{r.issue_type}</span></td>
                  <td>{sBadge(r.status)}</td>
                  <td>{pBadge(r.payment_status)}</td>
                  <td><span className="mono">{r.estimated_fee ? `₱${Number(r.estimated_fee).toLocaleString()}` : '—'}</span></td>
                  <td>{r.rating ? <Stars value={r.rating} /> : <span className="mono">—</span>}</td>
                  <td><span className="mono">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" title="View details" onClick={() => setViewing(r)}><Eye size={12} /></button>
                      <button className="icon-btn" title="Edit" onClick={() => setEditing({ ...r })}><Pencil size={12} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => setConfirm(r.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {viewing && <BookingDetail booking={viewing} onClose={() => setViewing(null)} />}

      {editing && (
        <Modal title="Edit Booking" onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </>}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={editing.status}
                onChange={e => setEditing(p => ({ ...p, status: e.target.value }))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Payment Status</label>
              <select className="form-select" value={editing.payment_status || ''}
                onChange={e => setEditing(p => ({ ...p, payment_status: e.target.value || null }))}>
                {PAY_STATI.map(s => <option key={s} value={s}>{s || 'none'}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Service Category</label>
            <select className="form-select" value={editing.service_category}
              onChange={e => setEditing(p => ({ ...p, service_category: e.target.value }))}>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Issue Type</label>
            <input className="form-input" value={editing.issue_type || ''}
              onChange={e => setEditing(p => ({ ...p, issue_type: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Issue Description</label>
            <textarea className="form-textarea" value={editing.issue_description || ''}
              onChange={e => setEditing(p => ({ ...p, issue_description: e.target.value }))} />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Estimated Fee (₱)</label>
              <input className="form-input" type="number" value={editing.estimated_fee || ''}
                onChange={e => setEditing(p => ({ ...p, estimated_fee: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Final Fee (₱)</label>
              <input className="form-input" type="number" value={editing.final_fee || ''}
                onChange={e => setEditing(p => ({ ...p, final_fee: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Rating (1–5)</label>
            <input className="form-input" type="number" min="1" max="5" value={editing.rating || ''}
              onChange={e => setEditing(p => ({ ...p, rating: e.target.value }))} />
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog message="Delete this booking? This cannot be undone."
          onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
