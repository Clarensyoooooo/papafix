import { X } from 'lucide-react'

export function Modal({ title, onClose, footer, children, size = '' }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size}`}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="icon-btn" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Spinner() {
  return <div className="loading"><div className="spinner" /><span>Loading…</span></div>
}

export function Empty({ message = 'No data found' }) {
  return <div className="empty">{message}</div>
}

export function Badge({ children, color = 'muted' }) {
  return <span className={`badge badge-${color}`}>{children}</span>
}

export function Avatar({ name, url }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'
  return (
    <div className="avatar">
      {url ? <img src={url} alt={name} /> : initials}
    </div>
  )
}

export function Stars({ value = 0 }) {
  return (
    <div className="stars">
      {[1,2,3,4,5].map(i => (
        <span key={i} className={`star ${i <= value ? '' : 'empty'}`}>★</span>
      ))}
    </div>
  )
}

export function StatusDot({ status }) {
  const map = {
    pending: 'amber', scheduled: 'blue', in_progress: 'accent',
    completed: 'green', cancelled: 'red', paid: 'green', failed: 'red'
  }
  const color = map[status] || 'muted'
  return <span className={`dot dot-${color}`} />
}

export function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal confirm-box">
        <div className="modal-head">
          <span className="modal-title">Confirm</span>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

export function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="pagination">
      <span>{from}–{to} of {total}</span>
      <div className="pagination-spacer" />
      <button className="page-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        let p = i + 1
        if (totalPages > 5) {
          if (page <= 3) p = i + 1
          else if (page >= totalPages - 2) p = totalPages - 4 + i
          else p = page - 2 + i
        }
        return (
          <button key={p} className={`page-btn ${p === page ? 'current' : ''}`} onClick={() => onChange(p)}>
            {p}
          </button>
        )
      })}
      <button className="page-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  )
}
