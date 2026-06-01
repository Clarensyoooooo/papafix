import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, Trash2, Download, Terminal, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { Spinner, Empty, Badge, Pagination, ConfirmDialog } from './UI'
import { useToast } from './Toast'

const PAGE_SIZE = 50
const LOG_KEY   = 'pf_admin_logs'
const MAX_LOGS  = 1000
const LEVELS    = ['all', 'info', 'ok', 'warn', 'error']

// ── Public API ──────────────────────────────────────────
export function addLog(level, message, meta = '') {
  try {
    const logs = readLogs()
    logs.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      level,
      message,
      meta: String(meta || '').slice(0, 300),
    })
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)))
  } catch {}
}

function readLogs() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') }
  catch { return [] }
}
// ────────────────────────────────────────────────────────

const LEVEL_ICON = {
  info:  <Info    size={12} />,
  ok:    <CheckCircle size={12} />,
  warn:  <AlertTriangle size={12} />,
  error: <AlertCircle size={12} />,
}
const LEVEL_COLOR = { info: 'blue', ok: 'green', warn: 'amber', error: 'red' }

export default function Logs() {
  const [all,      setAll]      = useState([])
  const [filtered, setFiltered] = useState([])
  const [search,   setSearch]   = useState('')
  const [level,    setLevel]    = useState('all')
  const [page,     setPage]     = useState(1)
  const [confirm,  setConfirm]  = useState(false)
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(() => {
    if (mountedRef.current) setAll(readLogs())
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 8s
  useEffect(() => {
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    let f = all
    if (level !== 'all') f = f.filter(l => l.level === level)
    if (search) {
      const q = search.toLowerCase()
      f = f.filter(l =>
        l.message.toLowerCase().includes(q) ||
        l.meta.toLowerCase().includes(q)
      )
    }
    setFiltered(f)
    setPage(1)
  }, [all, level, search])

  const clearAll = () => {
    localStorage.removeItem(LOG_KEY)
    setAll([])
    setConfirm(false)
    toast('Logs cleared')
  }

  const exportLogs = () => {
    const csv = ['timestamp,level,message,meta',
      ...all.map(l => `"${l.ts}","${l.level}","${l.message.replace(/"/g, '""')}","${l.meta.replace(/"/g, '""')}"`)
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `papafix-logs-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
    addLog('ok', 'Exported activity logs', `${all.length} entries`)
  }

  const counts = { info: 0, ok: 0, warn: 0, error: 0 }
  all.forEach(l => { if (counts[l.level] !== undefined) counts[l.level]++ })

  const pageData   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const fmt = ts => { try { return new Date(ts).toLocaleString() } catch { return ts } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 8 }}>
        {Object.entries(counts).map(([lv, n]) => (
          <button key={lv}
            onClick={() => setLevel(lv === level ? 'all' : lv)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
              border: `1px solid ${level === lv ? 'var(--accent-border)' : 'var(--border)'}`,
              background: level === lv ? 'var(--accent-soft)' : 'var(--surface)',
              color: level === lv ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 0.12s',
            }}>
            <span style={{ color: `var(--${LEVEL_COLOR[lv]})` }}>{LEVEL_ICON[lv]}</span>
            {lv.toUpperCase()} <span style={{ fontFamily: 'DM Mono, monospace' }}>{n}</span>
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'DM Mono, monospace', alignSelf: 'center' }}>
          {all.length} / {MAX_LOGS} entries
        </span>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <Terminal size={13} color="var(--text-muted)" />
          <span className="table-title">Activity Logs</span>
          <span className="table-count">{filtered.length} shown</span>
          <div className="table-spacer" />
          <div className="search-wrap">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 120, padding: '6px 10px' }}
            value={level} onChange={e => { setLevel(e.target.value); setPage(1) }}>
            {LEVELS.map(l => <option key={l} value={l}>{l === 'all' ? 'All levels' : l.toUpperCase()}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={load} title="Refresh"><RefreshCw size={13} /></button>
          <button className="btn btn-ghost" onClick={exportLogs} title="Export CSV"><Download size={13} /> CSV</button>
          <button className="btn btn-danger" onClick={() => setConfirm(true)}><Trash2 size={13} /> Clear</button>
        </div>

        {pageData.length === 0 ? (
          <Empty message={all.length === 0
            ? 'No activity logged yet — actions like saves, updates, and deletes will appear here.'
            : 'No logs match your filter.'} />
        ) : (
          <div>
            {pageData.map(log => (
              <div key={log.id} className="log-entry">
                <span className="log-time">{fmt(log.ts)}</span>
                <span className={`log-level ${log.level}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {LEVEL_ICON[log.level]} {log.level}
                </span>
                <span className="log-msg">{log.message}</span>
                {log.meta && (
                  <span className="log-meta" title={log.meta}>
                    {log.meta.length > 60 ? log.meta.slice(0, 60) + '…' : log.meta}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {confirm && (
        <ConfirmDialog message="Clear all logs? This cannot be undone."
          onConfirm={clearAll} onCancel={() => setConfirm(false)} />
      )}
    </div>
  )
}
