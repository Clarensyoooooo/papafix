import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, Trash2, Download, Terminal, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { supabase } from './supabase'
import { Spinner, Empty, Badge, Pagination, ConfirmDialog } from './UI'
import { useToast } from './Toast'

const PAGE_SIZE = 50
const LEVELS    = ['all', 'info', 'ok', 'warn', 'error']

// ── Public API ──────────────────────────────────────────
export async function addLog(level, message, meta = '') {
  try {
    await supabase.from('admin_logs').insert([{
      level,
      message,
      meta: String(meta || '').slice(0, 500),
    }])
  } catch (err) {
    console.error('Failed to write log', err)
  }
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
  const [rows,      setRows]      = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [level,     setLevel]     = useState('all')
  const [page,      setPage]      = useState(1)
  const [confirm,   setConfirm]   = useState(false)
  const [counts,    setCounts]    = useState({ info: 0, ok: 0, warn: 0, error: 0 })
  
  const mountedRef = useRef(true)
  const toast = useToast()

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // Fetch summary counts for the top chips
  const loadCounts = useCallback(async () => {
    const promises = LEVELS.filter(l => l !== 'all').map(async (lv) => {
      const { count } = await supabase.from('admin_logs').select('*', { count: 'exact', head: true }).eq('level', lv)
      return [lv, count || 0]
    })
    const results = await Promise.all(promises)
    if (mountedRef.current) setCounts(Object.fromEntries(results))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('admin_logs').select('*', { count: 'exact' })
    
    if (level !== 'all') q = q.eq('level', level)
    if (search) q = q.or(`message.ilike.%${search}%,meta.ilike.%${search}%`)
    
    q = q.order('created_at', { ascending: false })
         .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error } = await q
    if (!mountedRef.current) return
    
    if (!error) {
      setRows(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }, [level, search, page])

  useEffect(() => { loadCounts() }, [loadCounts])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [level, search])

  const clearAll = async () => {
    const { error } = await supabase.from('admin_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000') // Deletes all rows
    if (error) { toast('Failed to clear logs', 'error'); return }
    
    toast('Database logs cleared')
    setConfirm(false)
    load()
    loadCounts()
  }

  const exportLogs = async () => {
    toast('Generating CSV...')
    let q = supabase.from('admin_logs').select('created_at, level, message, meta').order('created_at', { ascending: false })
    if (level !== 'all') q = q.eq('level', level)
    if (search) q = q.or(`message.ilike.%${search}%,meta.ilike.%${search}%`)

    const { data, error } = await q
    if (error || !data) { toast('Export failed', 'error'); return }

    const csv = ['timestamp,level,message,meta',
      ...data.map(l => `"${l.created_at}","${l.level}","${l.message.replace(/"/g, '""')}","${(l.meta || '').replace(/"/g, '""')}"`)
    ].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `papafix-logs-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
    addLog('info', 'Exported database logs to CSV', `${data.length} rows exported`)
  }

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
          {total} total entries
        </span>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <Terminal size={13} color="var(--text-muted)" />
          <span className="table-title">Activity Logs</span>
          <span className="table-count">{total} found</span>
          <div className="table-spacer" />
          <div className="search-wrap">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search DB..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 120, padding: '6px 10px' }}
            value={level} onChange={e => { setLevel(e.target.value); setPage(1) }}>
            {LEVELS.map(l => <option key={l} value={l}>{l === 'all' ? 'All levels' : l.toUpperCase()}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={() => { load(); loadCounts(); }} title="Refresh"><RefreshCw size={13} /></button>
          <button className="btn btn-ghost" onClick={exportLogs} title="Export CSV"><Download size={13} /> CSV</button>
          <button className="btn btn-danger" onClick={() => setConfirm(true)}><Trash2 size={13} /> Clear</button>
        </div>

        {loading ? <Spinner /> : rows.length === 0 ? (
          <Empty message="No logs found in the database." />
        ) : (
          <div>
            {rows.map(log => (
              <div key={log.id} className="log-entry">
                <span className="log-time">{fmt(log.created_at)}</span>
                <span className={`log-level ${log.level}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {LEVEL_ICON[log.level]} {log.level}
                </span>
                <span className="log-msg">{log.message}</span>
                {log.meta && (
                  <span className="log-meta" title={log.meta}>
                    {log.meta.length > 80 ? log.meta.slice(0, 80) + '…' : log.meta}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {confirm && (
        <ConfirmDialog message="Permanently delete ALL logs from the database? This cannot be undone."
          onConfirm={clearAll} onCancel={() => setConfirm(false)} />
      )}
    </div>
  )
}