import { useState, useEffect, useRef, useCallback } from 'react'
import {
  CalendarCheck, Wallet, Receipt, CheckCircle2, XCircle, Star, UserPlus,
  AlertTriangle, Hourglass, Banknote, ThumbsDown, QrCode, Activity,
  PieChart as PieIcon, Clock3, CalendarDays, Layers, Trophy, History,
  ArrowUpRight, ArrowDownRight, RefreshCw,
} from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, Bar, BarChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from './supabase'
import { Spinner, Badge } from './UI'

// ── constants ───────────────────────────────────────────────────────────────
const PERIODS = [
  { key: '7d',  label: '7 days',  days: 7  },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
]
const STATUS_COLOR = {
  pending: '#f59e0b', scheduled: '#60a5fa', in_progress: '#7c6dff',
  completed: '#4ade80', cancelled: '#f87171',
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BOOKING_COLS = 'id,status,payment_status,estimated_fee,final_fee,rating,service_category,technician_id,created_at'

// ── helpers ─────────────────────────────────────────────────────────────────
const peso = (n) => '₱' + Math.round(Number(n) || 0).toLocaleString()
const fee  = (b) => Number(b.final_fee ?? b.estimated_fee) || 0
const isPaid = (b) => b.payment_status === 'paid'

// % delta vs previous period; null when previous is 0 (no meaningful baseline)
const delta = (cur, prev) => (!prev ? null : Math.round(((cur - prev) / prev) * 100))

function aggregate(rows) {
  const a = {
    count: rows.length, completed: 0, cancelled: 0,
    paidRev: 0, paidCount: 0, ratingSum: 0, ratingCount: 0,
  }
  for (const b of rows) {
    if (b.status === 'completed') a.completed++
    if (b.status === 'cancelled') a.cancelled++
    if (isPaid(b)) { a.paidRev += fee(b); a.paidCount++ }
    if (b.rating)  { a.ratingSum += Number(b.rating); a.ratingCount++ }
  }
  a.avgJob         = a.paidCount   ? a.paidRev / a.paidCount : 0
  a.completionRate = a.count       ? Math.round((a.completed / a.count) * 100) : 0
  a.cancelRate     = a.count       ? Math.round((a.cancelled / a.count) * 100) : 0
  a.avgRating      = a.ratingCount ? +(a.ratingSum / a.ratingCount).toFixed(2) : null
  return a
}

// Local-time date key (YYYY-MM-DD) — keeps all charts in the admin's timezone
const localKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function buildDaily(rows, days) {
  const map = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    map[localKey(d)] = { bookings: 0, revenue: 0 }
  }
  for (const b of rows) {
    const k = localKey(new Date(b.created_at))
    if (!map[k]) continue
    map[k].bookings++
    if (isPaid(b)) map[k].revenue += fee(b)
  }
  return Object.entries(map).map(([date, v]) => ({
    date: date.slice(5).replace('-', '/'), ...v,
  }))
}

function buildHourly(rows) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`, bookings: 0,
  }))
  for (const b of rows) {
    const h = new Date(b.created_at).getHours()
    if (!Number.isNaN(h)) hours[h].bookings++
  }
  return hours
}

function buildWeekday(rows) {
  const days = WEEKDAYS.map(day => ({ day, bookings: 0 }))
  for (const b of rows) {
    const d = new Date(b.created_at).getDay()
    if (!Number.isNaN(d)) days[d].bookings++
  }
  // Mon-first reads better for ops planning
  return [...days.slice(1), days[0]]
}

function buildCategories(rows) {
  const m = {}
  for (const b of rows) {
    const c = b.service_category || 'other'
    m[c] ??= { cat: c, count: 0, rev: 0, completed: 0, rSum: 0, rN: 0 }
    m[c].count++
    if (isPaid(b)) m[c].rev += fee(b)
    if (b.status === 'completed') m[c].completed++
    if (b.rating) { m[c].rSum += Number(b.rating); m[c].rN++ }
  }
  return Object.values(m)
    .map(c => ({
      ...c,
      completion: c.count ? Math.round((c.completed / c.count) * 100) : 0,
      rating: c.rN ? (c.rSum / c.rN).toFixed(1) : null,
    }))
    .sort((a, b) => b.rev - a.rev)
}

function buildLeaderboard(rows, techs) {
  const names = Object.fromEntries(techs.map(t => [t.id, t.full_name || 'Unnamed']))
  const m = {}
  for (const b of rows) {
    if (!b.technician_id) continue
    const t = (m[b.technician_id] ??= { id: b.technician_id, jobs: 0, done: 0, rev: 0, rSum: 0, rN: 0 })
    t.jobs++
    if (b.status === 'completed') t.done++
    if (isPaid(b)) t.rev += fee(b)
    if (b.rating) { t.rSum += Number(b.rating); t.rN++ }
  }
  return Object.values(m)
    .map(t => ({ ...t, name: names[t.id] || t.id.slice(0, 8) + '…', rating: t.rN ? (t.rSum / t.rN).toFixed(1) : null }))
    .sort((a, b) => b.rev - a.rev || b.done - a.done)
    .slice(0, 8)
}

// ── small UI pieces (self-contained, uses existing CSS vars / .widget) ──────
function Kpi({ icon: Icon, label, value, change, sub, invert }) {
  // invert: for metrics where "up" is bad (cancellation rate)
  const good = change != null && (invert ? change < 0 : change > 0)
  return (
    <div className="widget" style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <Icon size={12} /> {label}
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--text)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, minHeight: 14 }}>
        {change != null && (
          <span style={{ color: good ? 'var(--green)' : 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 700 }}>
            {change > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(change)}%
          </span>
        )}
        <span style={{ color: 'var(--text-faint)' }}>{change != null ? 'vs prev period' : sub || '—'}</span>
      </div>
    </div>
  )
}

function AttentionItem({ icon: Icon, color, count, label, detail }) {
  const active = count > 0
  return (
    <div style={{
      flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 13px', borderRadius: 8,
      background: active ? `color-mix(in srgb, ${color} 9%, transparent)` : 'var(--surface2)',
      border: `1px solid ${active ? `color-mix(in srgb, ${color} 28%, transparent)` : 'var(--border)'}`,
      opacity: active ? 1 : 0.55,
    }}>
      <Icon size={15} style={{ color: active ? color : 'var(--text-faint)', flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'DM Mono, monospace', color: active ? 'var(--text)' : 'var(--text-muted)' }}>
          {count}{detail ? <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>{detail}</span> : null}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, right, children, style }) {
  return (
    <div className="widget" style={{ padding: 16, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icon size={13} color="var(--text-muted)" />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

function Tip({ active, payload, label, money }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-sm)' }}>
      {label != null && <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 10, fontFamily: 'DM Mono, monospace' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.payload?.fill, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: p.color || p.payload?.fill, display: 'inline-block' }} />
          {p.name}: <span style={{ color: 'var(--text)' }}>{money && p.dataKey === 'revenue' ? peso(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const sBadge = (s) => {
  const m = { pending: 'amber', scheduled: 'blue', completed: 'green', cancelled: 'red', in_progress: 'accent' }
  return <Badge color={m[s] || 'muted'}>{s || '—'}</Badge>
}

// ── main ────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [period,    setPeriod]    = useState('30d')
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshed, setRefreshed] = useState(null)
  const mountedRef = useRef(true)
  const loadIdRef  = useRef(0)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current
    setLoading(true)
    const days = PERIODS.find(p => p.key === period)?.days ?? 30
    const now      = new Date()
    const curFrom  = new Date(now.getTime() - days * 86400e3).toISOString()
    const prevFrom = new Date(now.getTime() - 2 * days * 86400e3).toISOString()
    const staleCut = new Date(now.getTime() - 48 * 3600e3).toISOString()

    const [
      { data: cur,  error: e1 },
      { data: prev, error: e2 },
      { count: newUsersCur },
      { count: newUsersPrev },
      { data: techs },
      { data: recent },
      { count: stalePending },
      { count: qrAlerts },
      { count: totalBookings },
      { count: totalUsers },
    ] = await Promise.all([
      supabase.from('bookings').select(BOOKING_COLS).gte('created_at', curFrom),
      supabase.from('bookings').select(BOOKING_COLS).gte('created_at', prevFrom).lt('created_at', curFrom),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', curFrom),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', prevFrom).lt('created_at', curFrom),
      supabase.from('profiles').select('id, full_name').eq('role', 'technician'),
      supabase.from('bookings').select('id, issue_type, service_category, status, payment_status, estimated_fee, final_fee, created_at').order('created_at', { ascending: false }).limit(7),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending').lt('created_at', staleCut),
      supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('qr_mismatch_alert', true),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
    ])
    if (!mountedRef.current || loadId !== loadIdRef.current) return
    if (e1 || e2) { console.error('Dashboard load failed', e1 || e2); setLoading(false); return }

    const curRows  = cur  || []
    const prevRows = prev || []
    const a  = aggregate(curRows)
    const pA = aggregate(prevRows)

    const unpaidDone = curRows.filter(b => b.status === 'completed' && !isPaid(b))
    const lowRatings = curRows.filter(b => b.rating && Number(b.rating) <= 2).length

    const statusPie = Object.entries(
      curRows.reduce((m, b) => ((m[b.status] = (m[b.status] || 0) + 1), m), {})
    ).map(([status, value]) => ({ status, value, fill: STATUS_COLOR[status] || '#9ca3af' }))

    setData({
      days, a,
      deltas: {
        bookings:   delta(a.count, pA.count),
        revenue:    delta(a.paidRev, pA.paidRev),
        avgJob:     delta(a.avgJob, pA.avgJob),
        completion: delta(a.completionRate, pA.completionRate),
        cancel:     delta(a.cancelRate, pA.cancelRate),
        users:      delta(newUsersCur || 0, newUsersPrev || 0),
      },
      newUsers: newUsersCur || 0,
      attention: {
        stalePending: stalePending || 0,
        unpaidCount:  unpaidDone.length,
        unpaidValue:  unpaidDone.reduce((s, b) => s + fee(b), 0),
        lowRatings,
        qrAlerts: qrAlerts || 0,
      },
      daily:    buildDaily(curRows, days),
      hourly:   buildHourly(curRows),
      weekday:  buildWeekday(curRows),
      cats:     buildCategories(curRows),
      leaders:  buildLeaderboard(curRows, techs || []),
      statusPie,
      recent:   recent || [],
      totals: { totalBookings: totalBookings || 0, totalUsers: totalUsers || 0 },
    })
    setRefreshed(new Date())
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  if (loading && !data) return <Spinner />
  if (!data) return null

  const { a, deltas, attention, daily, hourly, weekday, cats, leaders, statusPie, recent, totals, days } = data
  const maxCatRev = cats[0]?.rev || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── period selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)} style={{
              border: 'none', cursor: 'pointer', borderRadius: 6, padding: '5px 12px',
              fontSize: 11.5, fontWeight: 600,
              background: period === p.key ? 'var(--surface)' : 'transparent',
              color: period === p.key ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: period === p.key ? 'var(--shadow-sm)' : 'none',
            }}>
              {p.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          vs the {days} days before · {totals.totalBookings.toLocaleString()} bookings / {totals.totalUsers.toLocaleString()} users all-time
        </span>
        <div style={{ flex: 1 }} />
        {refreshed && <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'DM Mono, monospace' }}>updated {refreshed.toLocaleTimeString()}</span>}
        <button className="btn btn-ghost" onClick={load} style={{ padding: '4px 10px', fontSize: 11 }} disabled={loading}>
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh
        </button>
      </div>

      {/* ── KPI grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
        <Kpi icon={CalendarCheck} label="Bookings"      value={a.count}                    change={deltas.bookings} />
        <Kpi icon={Wallet}        label="Paid Revenue"  value={peso(a.paidRev)}            change={deltas.revenue} />
        <Kpi icon={Receipt}       label="Avg Job Value" value={a.avgJob ? peso(a.avgJob) : '—'} change={deltas.avgJob} />
        <Kpi icon={CheckCircle2}  label="Completion"    value={a.completionRate + '%'}     change={deltas.completion} />
        <Kpi icon={XCircle}       label="Cancellation"  value={a.cancelRate + '%'}         change={deltas.cancel} invert />
        <Kpi icon={Star}          label="Avg Rating"    value={a.avgRating ?? '—'}         sub={`${a.ratingCount} reviews`} />
        <Kpi icon={UserPlus}      label="New Users"     value={data.newUsers}              change={deltas.users} />
      </div>

      {/* ── needs attention ── */}
      <Panel title="Needs attention" icon={AlertTriangle}
        right={<span style={{ fontSize: 10, color: 'var(--text-faint)' }}>action queue — items don't expire with the period filter</span>}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <AttentionItem icon={Hourglass}  color="#f59e0b" count={attention.stalePending}
            label="pending jobs older than 48h (all-time)" />
          <AttentionItem icon={Banknote}  color="#f87171" count={attention.unpaidCount}
            detail={attention.unpaidValue ? `${peso(attention.unpaidValue)} at risk` : null}
            label="completed but unpaid (this period)" />
          <AttentionItem icon={ThumbsDown} color="#f87171" count={attention.lowRatings}
            label="ratings of 2★ or below (this period)" />
          <AttentionItem icon={QrCode}     color="#7c6dff" count={attention.qrAlerts}
            label="QR mismatch alerts (all-time)" />
        </div>
      </Panel>

      {/* ── trend + status ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Panel title={`Bookings & paid revenue — last ${days} days`} icon={Activity}>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={daily} margin={{ top: 4, right: 0, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}
                interval={days > 30 ? 9 : days > 7 ? 4 : 0} />
              <YAxis yAxisId="rev" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}
                tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <YAxis yAxisId="cnt" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<Tip money />} />
              <Bar  yAxisId="rev" dataKey="revenue"  name="Revenue"  fill="#4ade80" opacity={0.75} radius={[3, 3, 0, 0]} />
              <Line yAxisId="cnt" dataKey="bookings" name="Bookings" stroke="#7c6dff" strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Bookings by status" icon={PieIcon}>
          {statusPie.length === 0
            ? <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-faint)' }}>No bookings in this period</div>
            : <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="status" cx="50%" cy="45%"
                    innerRadius={48} outerRadius={78} paddingAngle={3} strokeWidth={0}>
                    {statusPie.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip content={<Tip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => v.replace('_', ' ')} />
                </PieChart>
              </ResponsiveContainer>}
        </Panel>
      </div>

      {/* ── demand patterns ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Panel title="Demand by hour of day" icon={Clock3}
          right={<span style={{ fontSize: 10, color: 'var(--text-faint)' }}>schedule technicians around the peaks</span>}>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={hourly} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="bookings" name="Bookings" fill="#60a5fa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Demand by weekday" icon={CalendarDays}>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={weekday} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="bookings" name="Bookings" fill="#7c6dff" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* ── categories + technicians ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14 }}>
        <Panel title="Service categories" icon={Layers}
          right={<span style={{ fontSize: 10, color: 'var(--text-faint)' }}>sorted by paid revenue</span>}>
          {cats.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '20px 0', textAlign: 'center' }}>No data in this period</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px 8px 0', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '4px 8px 8px', fontWeight: 600, textAlign: 'right' }}>Jobs</th>
                  <th style={{ padding: '4px 8px 8px', fontWeight: 600, textAlign: 'right' }}>Revenue</th>
                  <th style={{ padding: '4px 8px 8px', fontWeight: 600, textAlign: 'right' }}>Done</th>
                  <th style={{ padding: '4px 0 8px 8px', fontWeight: 600, textAlign: 'right' }}>Rating</th>
                </tr>
              </thead>
              <tbody>
                {cats.map(c => (
                  <tr key={c.cat} style={{ borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <td style={{ padding: '8px 8px 8px 0', minWidth: 120 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize', marginBottom: 4 }}>{c.cat}</div>
                      <div style={{ height: 3, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(2, (c.rev / maxCatRev) * 100)}%`, background: '#4ade80', borderRadius: 99 }} />
                      </div>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{c.count}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{peso(c.rev)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: c.completion >= 70 ? 'var(--green)' : c.completion >= 40 ? 'var(--amber)' : 'var(--red)' }}>{c.completion}%</td>
                    <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontFamily: 'DM Mono, monospace', color: 'var(--amber)' }}>{c.rating ? `${c.rating}★` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Top technicians" icon={Trophy}
          right={<span style={{ fontSize: 10, color: 'var(--text-faint)' }}>this period</span>}>
          {leaders.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '20px 0', textAlign: 'center' }}>No assigned bookings in this period</div>
            : <div style={{ display: 'flex', flexDirection: 'column' }}>
                {leaders.map((t, i) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, fontFamily: 'DM Mono, monospace', flexShrink: 0,
                      background: i === 0 ? 'rgba(245,158,11,0.15)' : 'var(--surface2)',
                      color: i === 0 ? 'var(--amber)' : 'var(--text-muted)',
                    }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{t.done} completed · {t.jobs} total{t.rating ? ` · ${t.rating}★` : ''}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{peso(t.rev)}</span>
                  </div>
                ))}
              </div>}
        </Panel>
      </div>

      {/* ── recent activity ── */}
      <Panel title="Latest bookings" icon={History}>
        {recent.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '20px 0', textAlign: 'center' }}>Nothing yet</div>
          : <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recent.map((b, i) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.issue_type || 'Untitled job'}
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', textTransform: 'capitalize' }}> · {b.service_category}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'DM Mono, monospace' }}>
                      {new Date(b.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{fee(b) ? peso(fee(b)) : '—'}</span>
                  {b.payment_status === 'paid' && <Badge color="green">paid</Badge>}
                  {sBadge(b.status)}
                </div>
              ))}
            </div>}
      </Panel>
    </div>
  )
}