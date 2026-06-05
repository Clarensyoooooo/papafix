import { useState, useEffect, useRef } from 'react'
import {
  Users, CalendarDays, MapPin, Clock, Star, TrendingUp,
  AlertCircle, CheckCircle2, XCircle, Hourglass, Banknote,
  ArrowUpRight, ArrowDownRight, Wrench, RefreshCw, Activity
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { supabase } from './supabase'
import { Spinner, Badge, Stars } from './UI'

// ── helpers ────────────────────────────────────────────────────────────────
const peso = n => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const pct  = (a, b) => b > 0 ? (((a - b) / b) * 100).toFixed(1) : null
const fmt  = ts => !ts ? '—' : new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

function todayRange() {
  const d = new Date()
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
  const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
  return { s, e }
}
function thisWeekRange() {
  const d = new Date()
  const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 7)
  return { s: mon.toISOString(), e: sun.toISOString() }
}
function thisMonthRange() {
  const d = new Date()
  return {
    s: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
    e: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()
  }
}
function lastMonthRange() {
  const d = new Date()
  return {
    s: new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString(),
    e: new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59).toISOString()
  }
}
function last14DaysRange() {
  const now = new Date()
  const s = new Date(now); s.setDate(s.getDate() - 13); s.setHours(0, 0, 0, 0)
  return { s: s.toISOString(), e: now.toISOString() }
}

function agg(arr) {
  const statuses = {}, cats = {}
  let rev = 0, ratings = [], paid = 0, pending = 0, cancelled = 0, completed = 0
  for (const b of (arr || [])) {
    statuses[b.status] = (statuses[b.status] || 0) + 1
    cats[b.service_category] = (cats[b.service_category] || 0) + 1
    const fee = Number(b.estimated_fee || 0)
    if (b.payment_status === 'paid') { rev += fee; paid++ }
    if (b.status === 'pending')   pending++
    if (b.status === 'cancelled') cancelled++
    if (b.status === 'completed') completed++
    if (b.rating) ratings.push(Number(b.rating))
  }
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null
  const avgFee = paid > 0 ? Math.round(rev / paid) : 0
  return { statuses, cats, rev, paid, pending, cancelled, completed, avgRating, avgFee, count: (arr || []).length }
}

function buildDailyTrend(bookings) {
  const now = new Date()
  const days = [], counts = {}, done = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    counts[key] = 0; done[key] = 0; days.push(key)
  }
  for (const b of (bookings || [])) {
    const key = new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (key in counts) { counts[key]++; if (b.status === 'completed') done[key]++ }
  }
  return days.map(date => ({ date, Bookings: counts[date], Completed: done[date] }))
}

function buildRevenueByCategory(bookings) {
  const cats = {}
  for (const b of (bookings || [])) {
    const cat = b.service_category || 'other'
    if (!cats[cat]) cats[cat] = { revenue: 0, count: 0 }
    cats[cat].count++
    if (b.payment_status === 'paid') cats[cat].revenue += Number(b.estimated_fee || 0)
  }
  return Object.entries(cats)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 6)
    .map(([cat, v]) => ({ cat: cat.charAt(0).toUpperCase() + cat.slice(1), ...v }))
}

// ── chart colors (hex needed for recharts) ─────────────────────────────────
const STATUS_PIE = [
  { key: 'completed',   label: 'Completed',   color: '#4ade80' },
  { key: 'pending',     label: 'Pending',      color: '#fbbf24' },
  { key: 'scheduled',  label: 'Scheduled',    color: '#60a5fa' },
  { key: 'in_progress',label: 'In Progress',  color: '#a8a8b8' },
  { key: 'cancelled',  label: 'Cancelled',    color: '#f87171' },
]

const CAT_HEX = {
  electrical: '#fbbf24', plumbing: '#60a5fa', aircon: '#a8a8b8',
  appliance: '#4ade80', carpentry: '#f87171', cleaning: '#60a5fa',
  painting: '#fbbf24', other: '#888',
}

const CAT_COLORS = {
  electrical: 'var(--amber)', plumbing: 'var(--blue)', aircon: 'var(--accent)',
  appliance: 'var(--green)', carpentry: 'var(--red)', cleaning: 'var(--blue)',
  painting: 'var(--amber)', other: 'var(--text-faint)',
}

// ── sub-components ─────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = 'accent', trend, trendLabel }) {
  const cols = {
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent)',  border: 'var(--accent)' },
    green:  { bg: 'var(--green-soft)',  fg: 'var(--green)',   border: 'var(--green)' },
    amber:  { bg: 'var(--amber-soft)',  fg: 'var(--amber)',   border: 'var(--amber)' },
    blue:   { bg: 'var(--blue-soft)',   fg: 'var(--blue)',    border: 'var(--blue)' },
    red:    { bg: 'var(--red-soft)',    fg: 'var(--red)',     border: 'var(--red)' },
  }
  const c = cols[color] || cols.accent
  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${c.border}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -8, bottom: -8, opacity: 0.05, pointerEvents: 'none' }}>
        <Icon size={72} color={c.fg} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} color={c.fg} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', fontFamily: 'DM Mono, monospace', lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
        {trend !== undefined && trend !== null && (
          <span style={{ fontSize: 10, fontWeight: 700, color: trend > 0 ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', gap: 2 }}>
            {trend > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(trend)}% {trendLabel || 'vs last month'}
          </span>
        )}
      </div>
    </div>
  )
}

function MiniBar({ label, value, max, color, total }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const share = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 500, textTransform: 'capitalize' }}>{label}</span>
        <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'DM Mono, monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
          {value}
          {total > 0 && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 400 }}>{share}%</span>}
        </span>
      </div>
      <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function SectionHead({ title, icon: Icon, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <Icon size={13} color="var(--text-muted)" />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
      {right}
    </div>
  )
}

function Card({ children, style = {} }) {
  return (
    <div className="widget" style={style}>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      {label && <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 10, fontFamily: 'DM Mono, monospace' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: p.color, display: 'inline-block' }} />
          {p.name}: <span style={{ color: 'var(--text)' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function RevTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      {label && <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: 10 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 700 }}>
          {p.name}: <span style={{ color: 'var(--text)' }}>{p.name === 'Revenue' ? peso(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshed, setRefreshed] = useState(null)
  const [timeframe, setTimeframe] = useState('today')
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = async () => {
    setLoading(true)
    const { s: todayS, e: todayE }         = todayRange()
    const { s: weekS,  e: weekE  }         = thisWeekRange()
    const { s: monthS, e: monthE }         = thisMonthRange()
    const { s: lastMonthS, e: lastMonthE } = lastMonthRange()
    const { s: trend14S, e: trend14E }     = last14DaysRange()

    const [
      { count: totalBookings }, { count: totalProfiles }, { count: totalCustomers },
      { count: totalTechs },   { count: totalLocations }, { count: totalAvail },
      { data: todayBookings }, { data: weekBookings },    { data: monthBookings },
      { data: lastMonthBookings }, { data: recent },      { data: allBookings },
      { data: trend14Raw },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'technician'),
      supabase.from('locations').select('*', { count: 'exact', head: true }),
      supabase.from('availability').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('id,status,payment_status,estimated_fee,rating,created_at,service_category').gte('created_at', todayS).lt('created_at', todayE),
      supabase.from('bookings').select('id,status,payment_status,estimated_fee,rating,service_category,created_at').gte('created_at', weekS).lt('created_at', weekE),
      supabase.from('bookings').select('id,status,payment_status,estimated_fee,rating,service_category,created_at').gte('created_at', monthS).lte('created_at', monthE),
      supabase.from('bookings').select('id,status,payment_status,estimated_fee,rating,service_category,created_at').gte('created_at', lastMonthS).lte('created_at', lastMonthE),
      supabase.from('bookings').select('id,service_category,issue_type,status,payment_status,estimated_fee,rating,created_at').order('created_at', { ascending: false }).limit(8),
      supabase.from('bookings').select('status,payment_status,estimated_fee,rating,service_category').order('created_at', { ascending: false }).limit(500),
      supabase.from('bookings').select('id,status,created_at').gte('created_at', trend14S).lte('created_at', trend14E),
    ])
    if (!mountedRef.current) return

    const rawAll = allBookings || []
    const today  = agg(todayBookings)
    const week   = agg(weekBookings)
    const month  = agg(monthBookings)
    const lastMo = agg(lastMonthBookings)
    const all    = agg(rawAll)

    const catEntries = Object.entries(all.cats).sort((a, b) => b[1] - a[1]).slice(0, 8)
    const maxCat     = catEntries[0]?.[1] || 1

    setData({
      counts: { totalBookings, totalProfiles, totalCustomers, totalTechs, totalLocations, totalAvail },
      today, week, month, lastMo, all,
      catEntries, maxCat,
      recent: recent || [],
      monthTrend: pct(month.count, lastMo.count),
      revTrend:   pct(month.rev,   lastMo.rev),
      dailyTrend:      buildDailyTrend(trend14Raw),
      revenueByCategory: buildRevenueByCategory(rawAll),
    })
    setRefreshed(new Date())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <Spinner />

  const {
    counts, today, week, month, lastMo, all,
    catEntries, maxCat, recent, monthTrend, revTrend,
    dailyTrend, revenueByCategory,
  } = data

  const tf = { today, week, month }[timeframe] || all

  const statusPieData = STATUS_PIE
    .map(s => ({ ...s, value: all.statuses[s.key] || 0 }))
    .filter(s => s.value > 0)

  const completionRate = all.count > 0
    ? Math.round(((all.statuses.completed || 0) / all.count) * 100)
    : 0

  const sBadge = s => {
    const m = { pending: 'amber', scheduled: 'blue', completed: 'green', cancelled: 'red', in_progress: 'accent' }
    return <Badge color={m[s] || 'muted'}>{s?.replace('_', ' ') || '—'}</Badge>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {[['today','Today'],['week','This Week'],['month','This Month'],['overall','Overall']].map(([k, l]) => (
            <button key={k} onClick={() => setTimeframe(k)} style={{
              padding: '5px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'DM Sans, sans-serif',
              background: timeframe === k ? 'var(--accent)' : 'transparent',
              color: timeframe === k ? 'var(--bg)' : 'var(--text-muted)',
            }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {refreshed && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'DM Mono, monospace' }}>Updated {refreshed.toLocaleTimeString()}</span>}
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }} onClick={load}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
        {timeframe === 'today' && (<>
          <KpiCard icon={CalendarDays} label="Bookings Today"  value={today.count}           color="accent" sub={`${today.completed} completed`} />
          <KpiCard icon={Hourglass}    label="Pending"         value={today.pending}          color="amber" />
          <KpiCard icon={CheckCircle2} label="Completed"       value={today.completed}        color="green" />
          <KpiCard icon={Banknote}     label="Revenue"         value={peso(today.rev)}        color="green" sub="from paid bookings" />
          <KpiCard icon={Star}         label="Avg Rating"      value={today.avgRating || '—'} color="amber" />
          <KpiCard icon={XCircle}      label="Cancelled"       value={today.cancelled}        color="red" />
        </>)}
        {timeframe === 'week' && (<>
          <KpiCard icon={CalendarDays} label="Week Bookings"   value={week.count}             color="blue" />
          <KpiCard icon={CheckCircle2} label="Completed"       value={week.completed}         color="green" />
          <KpiCard icon={Hourglass}    label="Pending"         value={week.pending}           color="amber" />
          <KpiCard icon={Banknote}     label="Revenue"         value={peso(week.rev)}         color="green" />
          <KpiCard icon={Star}         label="Avg Rating"      value={week.avgRating || '—'}  color="amber" />
          <KpiCard icon={Banknote}     label="Avg Fee / Paid"  value={peso(week.avgFee)}      color="blue" sub="per paid booking" />
        </>)}
        {timeframe === 'month' && (<>
          <KpiCard icon={CalendarDays} label="Month Bookings"  value={month.count}            color="accent" trend={monthTrend} />
          <KpiCard icon={CheckCircle2} label="Completed"       value={month.completed}        color="green"  sub={`Last mo: ${lastMo.completed}`} />
          <KpiCard icon={Hourglass}    label="Pending"         value={month.pending}          color="amber"  sub={`Last mo: ${lastMo.pending}`} />
          <KpiCard icon={Banknote}     label="Revenue"         value={peso(month.rev)}        color="green"  trend={revTrend} />
          <KpiCard icon={Star}         label="Avg Rating"      value={month.avgRating || '—'} color="amber"  sub={`Last mo: ${lastMo.avgRating || '—'}`} />
          <KpiCard icon={XCircle}      label="Cancelled"       value={month.cancelled}        color="red"    sub={`Last mo: ${lastMo.cancelled}`} />
        </>)}
        {timeframe === 'overall' && (<>
          <KpiCard icon={CalendarDays} label="All Bookings"    value={counts.totalBookings ?? 0}  color="accent" sub={`${all.completed} completed`} />
          <KpiCard icon={Users}        label="Total Users"     value={counts.totalProfiles ?? 0}  color="blue"   sub={`${counts.totalCustomers} customers`} />
          <KpiCard icon={Wrench}       label="Technicians"     value={counts.totalTechs ?? 0}     color="accent" />
          <KpiCard icon={MapPin}       label="Locations"       value={counts.totalLocations ?? 0} color="green" />
          <KpiCard icon={Clock}        label="Avail Slots"     value={counts.totalAvail ?? 0}     color="amber" />
          <KpiCard icon={Star}         label="Avg Rating"      value={all.avgRating || '—'}       color="amber" />
        </>)}
      </div>

      {/* ── charts row 1: trend (2/3) + status donut (1/3) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>

        {/* 14-day booking trend */}
        <Card>
          <SectionHead title="Booking Trend — Last 14 Days" icon={Activity} />
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4ade80" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="Bookings"  stroke="#60a5fa" strokeWidth={2} fill="url(#gBlue)"  dot={false} />
              <Area type="monotone" dataKey="Completed" stroke="#4ade80" strokeWidth={2} fill="url(#gGreen)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            {[{ label: 'Bookings', color: '#60a5fa' }, { label: 'Completed', color: '#4ade80' }].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 20, height: 2, borderRadius: 99, background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </Card>

        {/* Status donut */}
        <Card>
          <SectionHead title="Status Breakdown" icon={CheckCircle2} />
          <div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={statusPieData} cx="50%" cy="50%"
                  innerRadius={52} outerRadius={75}
                  paddingAngle={2} dataKey="value" strokeWidth={0}
                >
                  {statusPieData.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -56%)', textAlign: 'center', pointerEvents: 'none'
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{completionRate}%</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>done</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
            {statusPieData.map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
                <div style={{ width: 7, height: 7, borderRadius: 99, background: s.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--text-muted)', flex: 1 }}>{s.label}</span>
                <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── charts row 2: revenue by category (1/2) + category breakdown (1/2) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Revenue by category — horizontal bar */}
        <Card>
          <SectionHead title="Revenue by Category" icon={Banknote} />
          {revenueByCategory.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>No paid bookings yet</div>
            : (
              <ResponsiveContainer width="100%" height={Math.max(160, revenueByCategory.length * 32)}>
                <BarChart data={revenueByCategory} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false}
                    tickFormatter={v => v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`} />
                  <YAxis type="category" dataKey="cat" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip content={<RevTip />} />
                  <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} maxBarSize={14}>
                    {revenueByCategory.map((entry, i) => (
                      <Cell key={i} fill={CAT_HEX[entry.cat.toLowerCase()] || '#60a5fa'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </Card>

        {/* Bookings by category — mini bars */}
        <Card>
          <SectionHead
            title="Bookings by Category"
            icon={TrendingUp}
            right={<span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'DM Mono, monospace' }}>{all.count} total</span>}
          />
          {catEntries.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center' }}>No data yet</div>
            : catEntries.map(([cat, n]) => (
                <MiniBar key={cat} label={cat} value={n} max={maxCat}
                  color={CAT_COLORS[cat] || 'var(--accent)'}
                  total={all.count} />
              ))
          }
        </Card>
      </div>

      {/* ── recent bookings table ── */}
      <div className="table-wrap">
        <div className="table-header">
          <Activity size={13} color="var(--text-muted)" />
          <span className="table-title">Recent Bookings</span>
          <span className="table-count">{recent.length} shown</span>
        </div>
        <table>
          <thead>
            <tr>
              {['Category', 'Issue', 'Status', 'Payment', 'Fee', 'Rating', 'Date'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recent.map(b => (
              <tr key={b.id}>
                <td>
                  <Badge color="blue">{b.service_category || '—'}</Badge>
                </td>
                <td style={{ maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.issue_type || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>
                <td>{sBadge(b.status)}</td>
                <td>
                  {b.payment_status
                    ? <Badge color={b.payment_status === 'paid' ? 'green' : b.payment_status === 'failed' ? 'red' : 'amber'}>{b.payment_status}</Badge>
                    : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>
                <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                  {b.estimated_fee ? peso(b.estimated_fee) : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>
                <td>{b.rating ? <Stars value={b.rating} /> : <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                <td className="mono">{fmt(b.created_at)}</td>
              </tr>
            ))}
            {!recent.length && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No bookings yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
