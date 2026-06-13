import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Plus, Eye, Pencil, Trash2, X } from 'lucide-react'
import { supabase } from './supabase'
import { getPref } from './prefs'
import { Spinner, Empty, Badge, Modal, ConfirmDialog, Pagination } from './UI'
import { useToast } from './Toast'
import { addLog } from './Logs'

const STATUSES   = ['open', 'in_review', 'resolved', 'dismissed']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']

const STATUS_COLOR   = { open: 'amber', in_review: 'blue', resolved: 'green', dismissed: 'muted' }
const PRIORITY_COLOR = { low: 'muted', medium: 'blue', high: 'amber', urgent: 'red' }

const LIST_COLS   = 'id, subject, status, priority, booking_id, customer_id, created_at'
const DETAIL_COLS = 'id, subject, description, status, priority, booking_id, customer_id, admin_note, created_at, updated_at'

const BLANK = { subject: '', description: '', customer_id: '', booking_id: '', status: 'open', priority: 'medium', admin_note: '' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const toUuid = v => (v && v.trim()) ? v.trim() : null
const validUuid = v => !v || !v.trim() || UUID_RE.test(v.trim())

function TicketDetail({ ticket, onClose }) {
  const [full, setFull] = useState(null)
  useEffect(() => {
    supabase.from('support_tickets').select(DETAIL_COLS).eq('id', ticket.id).single()
      .then(({ data }) => setFull(data))
  }, [ticket.id])

  const t = full || ticket
  const fields = [
    ['ID',          t.id],
    ['Subject',     t.subject],
    ['Status',      t.status],
    ['Priority',    t.priority],
    ['Customer',    t.customer_id || '—'],
    ['Booking',     t.booking_id  || '—'],
    ['Description', t.description || '—'],
    ['Admin Note',  t.admin_note  || '—'],
    ['Created',     t.created_at  ? new Date(t.created_at).toLocaleString()  : '—'],
    ['Updated',     t.updated_at  ? new Date(t.updated_at).toLocaleString()  : '—'],
  ]
  return (
    <Modal title="Ticket Details" onClose={onClose}>
      {!full && <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
      {full && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', minWidth: 110, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, paddingTop: 1 }}>{k}</span>
              <span style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>{String(v ?? '—')}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function TicketForm({ ticket, onClose, onSave, title }) {
  const [form, setForm] = useState(ticket)
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(form)}>Save</button>
      </>}>
      <div className="form-group">
        <label className="form-label">Subject *</label>
        <input className="form-input" value={form.subject} onChange={set('subject')} placeholder="Brief summary of the complaint" />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={form.description} onChange={set('description')} placeholder="Full details of the complaint…" rows={4} />
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={form.status} onChange={set('status')}>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Priority</label>
          <select className="form-select" value={form.priority} onChange={set('priority')}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Customer ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
        <input className="form-input" value={form.customer_id} onChange={set('customer_id')} placeholder="UUID of the customer" />
      </div>
      <div className="form-group">
        <label className="form-label">Booking ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
        <input className="form-input" value={form.booking_id} onChange={set('booking_id')} placeholder="UUID of the related booking" />
      </div>
      <div className="form-group">
        <label className="form-label">Admin Note <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(internal)</span></label>
        <textarea className="form-textarea" value={form.admin_note} onChange={set('admin_note')} placeholder="Resolution notes, internal context…" rows={3} />
      </div>
    </Modal>
  )
}

export default function SupportTickets() {
  const PAGE_SIZE = getPref('pageSize', 15)
  const [rows,           setRows]           = useState([])
  const [total,          setTotal]          = useState(0)
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [page,           setPage]           = useState(1)
  const [viewing,        setViewing]        = useState(null)
  const [editing,        setEditing]        = useState(null)
  const [creating,       setCreating]       = useState(false)
  const [confirm,        setConfirm]        = useState(null)
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('support_tickets').select(LIST_COLS, { count: 'exact' })
    if (search)         q = q.ilike('subject', `%${search}%`)
    if (statusFilter)   q = q.eq('status', statusFilter)
    if (priorityFilter) q = q.eq('priority', priorityFilter)
    q = q.order('created_at', { ascending: false })
         .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!mountedRef.current) return
    if (!error) { setRows(data || []); setTotal(count || 0) }
    else addLog('error', 'Failed to load support tickets', error.message)
    setLoading(false)
  }, [search, statusFilter, priorityFilter, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, statusFilter, priorityFilter])

  const create = async (form) => {
    if (!form.subject.trim()) { toast('Subject is required', 'error'); return }
    if (!validUuid(form.customer_id)) { toast('Customer ID must be a valid UUID', 'error'); return }
    if (!validUuid(form.booking_id))  { toast('Booking ID must be a valid UUID', 'error'); return }
    const payload = {
      subject:     form.subject.trim(),
      description: form.description || null,
      status:      form.status,
      priority:    form.priority,
      customer_id: toUuid(form.customer_id),
      booking_id:  toUuid(form.booking_id),
      admin_note:  form.admin_note  || null,
    }
    const { error } = await supabase.from('support_tickets').insert(payload)
    if (error) { toast(error.message, 'error'); addLog('error', 'Ticket create failed', error.message); return }
    toast('Ticket created')
    addLog('ok', `Support ticket created: ${form.subject}`)
    setCreating(false); load()
  }

  const save = async (form) => {
    if (!form.subject.trim()) { toast('Subject is required', 'error'); return }
    if (!validUuid(form.customer_id)) { toast('Customer ID must be a valid UUID', 'error'); return }
    if (!validUuid(form.booking_id))  { toast('Booking ID must be a valid UUID', 'error'); return }
    const payload = {
      subject:     form.subject.trim(),
      description: form.description || null,
      status:      form.status,
      priority:    form.priority,
      customer_id: toUuid(form.customer_id),
      booking_id:  toUuid(form.booking_id),
      admin_note:  form.admin_note  || null,
      updated_at:  new Date().toISOString(),
    }
    const { error } = await supabase.from('support_tickets').update(payload).eq('id', form.id)
    if (error) { toast(error.message, 'error'); addLog('error', 'Ticket update failed', error.message); return }
    toast('Ticket updated')
    addLog('ok', `Support ticket updated: ${form.subject}`, `status → ${form.status}`)
    setEditing(null); load()
  }

  const del = async (id) => {
    const row = rows.find(r => r.id === id)
    const { error } = await supabase.from('support_tickets').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); addLog('error', 'Ticket delete failed', error.message); return }
    toast('Ticket deleted')
    addLog('warn', `Support ticket deleted: ${row?.subject || id}`, id)
    setConfirm(null); load()
  }

  const hasFilters = search || statusFilter || priorityFilter
  const clearFilters = () => { setSearch(''); setStatusFilter(''); setPriorityFilter(''); setPage(1) }

  const sBadge = s => <Badge color={STATUS_COLOR[s] || 'muted'}>{s?.replace('_', ' ') || '—'}</Badge>
  const pBadge = p => <Badge color={PRIORITY_COLOR[p] || 'muted'}>{p || '—'}</Badge>

  return (
    <div>
      <div className="table-wrap">
        <div className="table-header">
          <span className="table-title">Support Tickets</span>
          <span className="table-count">{total} total</span>
          <div className="table-spacer" />
          <div className="search-wrap">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search subject…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="form-select" style={{ width: 130, padding: '6px 10px' }}
            value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select className="form-select" style={{ width: 120, padding: '6px 10px' }}
            value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1) }}>
            <option value="">All priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {hasFilters && (
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={clearFilters}>
              <X size={11} /> Clear
            </button>
          )}
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setCreating(true)}>
            <Plus size={13} /> New Ticket
          </button>
        </div>

        {loading ? <Spinner /> : rows.length === 0 ? <Empty message="No tickets found" /> : (
          <table>
            <thead><tr>
              <th>ID</th><th>Subject</th><th>Status</th><th>Priority</th>
              <th>Customer</th><th>Booking</th><th>Created</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><span className="mono">{r.id.slice(0, 8)}…</span></td>
                  <td><span className="truncate" style={{ display: 'block', maxWidth: 200 }}>{r.subject}</span></td>
                  <td>{sBadge(r.status)}</td>
                  <td>{pBadge(r.priority)}</td>
                  <td><span className="mono">{r.customer_id ? r.customer_id.slice(0, 8) + '…' : '—'}</span></td>
                  <td><span className="mono">{r.booking_id  ? r.booking_id.slice(0, 8)  + '…' : '—'}</span></td>
                  <td><span className="mono">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" title="View" onClick={() => setViewing(r)}><Eye size={12} /></button>
                      <button className="icon-btn" title="Edit" onClick={() => setEditing({ description: '', admin_note: '', ...r })}><Pencil size={12} /></button>
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

      {viewing  && <TicketDetail ticket={viewing} onClose={() => setViewing(null)} />}
      {creating && <TicketForm ticket={{ ...BLANK }} title="New Support Ticket" onClose={() => setCreating(false)} onSave={create} />}
      {editing  && <TicketForm ticket={editing} title="Edit Ticket" onClose={() => setEditing(null)} onSave={save} />}

      {confirm && (
        <ConfirmDialog message="Delete this ticket? This cannot be undone."
          onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
