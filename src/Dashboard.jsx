import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Users, CalendarDays, MapPin, Clock, Star, TrendingUp,
  AlertCircle, CheckCircle2, XCircle, Hourglass, Banknote,
  ArrowUpRight, ArrowDownRight, Wrench, RefreshCw, CalendarClock, Filter
} from 'lucide-react'
import { supabase } from './supabase'
import { Spinner, Badge, Stars } from './UI'

// ── helpers ────────────────────────────────────────────────────────────────
const peso = n => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const pct  = (a, b) => b > 0 ? (((a - b) / b) * 100).toFixed(1) : null

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function todayRange() {
  const d = new Date()
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
  const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
  return { s, e }
}
function thisWeekRange() {
  const d = new Date()
  const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
  mon.setHours(0,0,0,0)
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

// ── agg moved outside so useMemo can reference it ─────────────────────────
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

// ── sub-components ─────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = 'accent', trend, trendLabel, onClick }) {
  const cols = {
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent)', border: 'var(--accent)' },
    green:  { bg: 'var(--green-soft)',  fg: 'var(--green)',  border: 'var(--green)' },
    amber:  { bg: 'var(--amber-soft)',  fg: 'var(--amber)',  border: 'var(--amber)' },
    blue:   { bg: 'var(--blue-soft)',   fg: 'var(--blue)',   border: 'var(--blue)' },
    red:    { bg: 'var(--red-soft)',    fg: 'var(--red)',    border: 'var(--red)' },
  }
  const c = cols[color] || cols.accent
  const trendUp = trend > 0

  return (
    <div onClick={onClick} style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${c.border}`,
      borderRadius: 8, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 4,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      position: 'relative', overflow: 'hidden',
    }}
      onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ position: 'absolute', right: -8, bottom: -8, opacity: 0.05 }}>
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
          <span style={{ fontSize: 10, fontWeight: 700, color: trendUp ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', gap: 2 }}>
            {trendUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(trend)}% {trendLabel || 'vs last month'}
          </span>
        )}
      </div>
    </div>
  )
}

function MiniBar({ label, value, max, color, total, onClick, active }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const share = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ marginBottom: 8, cursor: onClick ? 'pointer' : 'default', borderRadius: 4, padding: '2px 0' }}
      onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: active ? color : 'var(--text-muted)', fontWeight: active ? 700 : 500 }}>{label}</span>
        <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'DM Mono, monospace', display: 'flex', alignItems: 'center', gap: 5 }}>
          {value}
          {total > 0 && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 400 }}>{share}%</span>}
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease', opacity: active === false ? 0.3 : 1 }} />
      </div>
    </div>
  )
}

function SectionHead({ title, icon: Icon, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <Icon size={13} color="var(--text-muted)" />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{title}</span>
      {action}
    </div>
  )
}

function Widget({ children, span = 1, style = {} }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, gridColumn: `span ${span}`, ...style
    }}>
      {children}
    </div>
  )
}

const CAT_COLORS = {
  electrical: 'var(--amber)', plumbing: 'var(--blue)', aircon: 'var(--accent)',
  appliance: 'var(--green)', carpentry: 'var(--red)', cleaning: 'var(--blue)',
  painting: 'var(--amber)', other: 'var(--text-faint)',
}

// ── main component ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshed, setRefreshed] = useState(null)
  const [timeframe, setTimeframe] = useState('today')
  const [catFilter, setCatFilter] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const load = async () => {
    setLoading(true)
    const { s: todayS, e: todayE }         = todayRange()
    const { s: weekS, e: weekE }           = thisWeekRange()
    const { s: monthS, e: monthE }         = thisMonthRange()
    const { s: lastMonthS, e: lastMonthE } = lastMonthRange()

    const [
      { count: totalBookings }, { count: totalProfiles }, { count: totalCustomers },
      { count: totalTechs }, { count: totalLocations }, { count: totalAvail },
      { data: todayBookings }, { data: weekBookings }, { data: monthBookings },
      { data: lastMonthBookings }, { data: recent }, { data: allBookings },
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'technician'),
      supabase.from('locations').select('*', { count: 'exact', head: true }),
      supabase.from('availability').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('id, status, payment_status, estimated_fee, rating, created_at, service_category').gte('created_at', todayS).lt('created_at', todayE),
      supabase.from('bookings').select('id, status, payment_status, estimated_fee, rating, service_category, created_at').gte('created_at', weekS).lt('created_at', weekE),
      supabase.from('bookings').select('id, status, payment_status, estimated_fee, rating, service_category, created_at').gte('created_at', monthS).lte('created_at', monthE),
      supabase.from('bookings').select('id, status, payment_status, estimated_fee, rating, service_category, created_at').gte('created_at', lastMonthS).lte('created_at', lastMonthE),
      supabase.from('bookings').select('id, service_category, issue_type, status, payment_status, estimated_fee, rating, created_at, customer_id').order('created_at', { ascending: false }).limit(10),
      supabase.from('bookings').select('status, payment_status, estimated_fee, rating, service_category').order('created_at', { ascending: false }).limit(500),
    ])
    if (!mountedRef.current) return

    const rawAll = allBookings || []
    const today    = agg(todayBookings)
    const week     = agg(weekBookings)
    const month    = agg(monthBookings)
    const lastMo   = agg(lastMonthBookings)
    const all      = agg(rawAll)

    const catEntries = Object.entries(all.cats).sort((a, b) => b[1] - a[1]).slice(0, 8)
    const maxCat = catEntries[0]?.[1] || 1

    setData({
      counts: { totalBookings, totalProfiles, totalCustomers, totalTechs, totalLocations, totalAvail },
      today, week, month, lastMo, all,
      rawAll,
      catEntries, maxCat,
      recent: recent || [],
      monthTrend: pct(month.count, lastMo.count),
      revTrend: pct(month.rev, lastMo.rev),
    })
    setRefreshed(new Date())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── filtered breakdown data (client-side, no extra queries) ───────────────
  const filteredAll = useMemo(() => {
    if (!data) return null
    if (!catFilter) return data.all
    return agg((data.rawAll || []).filter(b => b.service_category === catFilter))
  }, [data, catFilter])

  const filteredCatEntries = useMemo(() => {
    if (!data) return []
    if (!catFilter) return data.catEntries
    return data.catEntries.filter(([cat]) => cat === catFilter)
  }, [data, catFilter])

  const filteredMaxCat = useMemo(() => filteredCatEntries[0]?.[1] || 1, [filteredCatEntries])

  if (loading) return <Spinner />
  const { counts, today, week, month, lastMo, all, catEntries, maxCat, recent, monthTrend, revTrend } = data

  const sBadge = s => {
    const m = { pending: 'amber', scheduled: 'blue', completed: 'green', cancelled: 'red', in_progress: 'accent' }
    return <Badge color={m[s] || 'muted'}>{s || '—'}</Badge>
  }

  const allCats = catEntries.map(([cat]) => cat)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Tab Navigation & Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="tabs" style={{ display: 'flex' }}>
          {[['today','Today'],['week','This Week'],['month','This Month'],['overall','Overall']].map(([k, l]) => (
            <button key={k} className={`tab ${timeframe === k ? 'active' : ''}`} onClick={() => setTimeframe(k)}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {refreshed && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'DM Mono, monospace' }}>Updated: {refreshed.toLocaleTimeString()}</span>}
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={load}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Dynamic KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
        {timeframe === 'today' && (<>
          <KpiCard icon={CalendarDays}  label="Today's Bookings" value={today.count}     color="accent" sub={`${today.completed} completed`} />
          <KpiCard icon={Hourglass}     label="Pending Today"    value={today.pending}    color="amber" />
          <KpiCard icon={CheckCircle2}  label="Completed Today"  value={today.completed}  color="green" />
          <KpiCard icon={Banknote}      label="Revenue Today"    value={peso(today.rev)}  color="green" sub="from paid bookings" />
          <KpiCard icon={Star}          label="Avg Rating"       value={today.avgRating || '—'} color="amber" />
          <KpiCard icon={XCircle}       label="Cancelled Today"  value={today.cancelled}  color="red" />
        </>)}
        {timeframe === 'week' && (<>
          <KpiCard icon={CalendarDays} label="Week Bookings"   value={week.count}       color="blue" />
          <KpiCard icon={CheckCircle2} label="Completed"       value={week.completed}   color="green" />
          <KpiCard icon={Hourglass}    label="Pending"         value={week.pending}     color="amber" />
          <KpiCard icon={Banknote}     label="Week Revenue"    value={peso(week.rev)}   color="green" />
          <KpiCard icon={Star}         label="Avg Rating"      value={week.avgRating || '—'} color="amber" />
          <KpiCard icon={Banknote}     label="Avg Fee / Paid"  value={peso(week.avgFee)} color="blue" sub="per paid booking" />
        </>)}
        {timeframe === 'month' && (<>
          <KpiCard icon={CalendarDays}  label="Month Bookings" value={month.count}      color="accent" trend={monthTrend} trendLabel="vs last month" />
          <KpiCard icon={CheckCircle2}  label="Completed"      value={month.completed}  color="green"  sub={`Last mo: ${lastMo.completed}`} />
          <KpiCard icon={Hourglass}     label="Pending"        value={month.pending}    color="amber"  sub={`Last mo: ${lastMo.pending}`} />
          <KpiCard icon={Banknote}      label="Month Revenue"  value={peso(month.rev)}  color="green"  trend={revTrend} trendLabel="vs last month" />
          <KpiCard icon={Star}          label="Avg Rating"     value={month.avgRating || '—'} color="amber" sub={`Last mo: ${lastMo.avgRating || '—'}`} />
          <KpiCard icon={XCircle}       label="Cancelled"      value={month.cancelled}  color="red"    sub={`Last mo: ${lastMo.cancelled}`} />
        </>)}
        {timeframe === 'overall' && (<>
          <KpiCard icon={CalendarDays} label="All Bookings"      value={counts.totalBookings ?? 0} color="accent" sub={`${all.completed} completed`} />
          <KpiCard icon={Users}        label="Total Users"        value={counts.totalProfiles ?? 0} color="blue"   sub={`${counts.totalCustomers} customers`} />
          <KpiCard icon={Wrench}       label="Technicians"        value={counts.totalTechs ?? 0}    color="accent" />
          <KpiCard icon={MapPin}       label="Locations"          value={counts.totalLocations ?? 0} color="green" />
          <KpiCard icon={Clock}        label="Avail Slots"        value={counts.totalAvail ?? 0}    color="amber" />
          <KpiCard icon={Star}         label="Overall Avg Rating" value={all.avgRating || '—'}      color="amber" />
        </>)}
      </div>

      {/* ── Category filter for breakdown widgets ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Filter size={12} color="var(--text-muted)" />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Filter breakdowns:</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => setCatFilter('')}
            style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 99, border: '1px solid var(--border)',
              background: !catFilter ? 'var(--accent)' : 'var(--surface)',
              color: !catFilter ? 'white' : 'var(--text-muted)',
              cursor: 'pointer', fontWeight: 600, transition: 'all 0.12s'
            }}>All</button>
          {allCats.map(cat => (
            <button key={cat} onClick={() => setCatFilter(c => c === cat ? '' : cat)}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 99, border: '1px solid var(--border)',
                background: catFilter === cat ? CAT_COLORS[cat] || 'var(--accent)' : 'var(--surface)',
                color: catFilter === cat ? 'white' : 'var(--text-muted)',
                cursor: 'pointer', fontWeight: catFilter === cat ? 700 : 500, transition: 'all 0.12s'
              }}>{cat}</button>
          ))}
        </div>
      </div>

      {/* ── Bottom two-col grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Category breakdown */}
        <Widget>
          <SectionHead
            title={catFilter ? `Category: ${catFilter}` : 'Bookings by Category (All Time)'}
            icon={TrendingUp}
            action={catFilter && (
              <button onClick={() => setCatFilter('')} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Show all
              </button>
            )}
          />
          {filteredCatEntries.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>No data yet</div>
            : filteredCatEntries.map(([cat, n]) => (
                <MiniBar
                  key={cat} label={cat} value={n} max={filteredMaxCat}
                  color={CAT_COLORS[cat] || 'var(--accent)'}
                  total={filteredAll?.count || 0}
                  onClick={() => setCatFilter(c => c === cat ? '' : cat)}
                  active={!catFilter || catFilter === cat}
                />
              ))}
        </Widget>

        {/* Status breakdown */}
        <Widget>
          <SectionHead
            title={catFilter ? `Status Breakdown — ${catFilter}` : 'Booking Status Breakdown'}
            icon={CheckCircle2}
          />
          {[
            { label: 'Completed',   val: filteredAll?.statuses.completed   || 0, color: 'var(--green)' },
            { label: 'Pending',     val: filteredAll?.statuses.pending     || 0, color: 'var(--amber)' },
            { label: 'Scheduled',   val: filteredAll?.statuses.scheduled   || 0, color: 'var(--blue)'  },
            { label: 'In Progress', val: filteredAll?.statuses.in_progress || 0, color: 'var(--accent)' },
            { label: 'Cancelled',   val: filteredAll?.statuses.cancelled   || 0, color: 'var(--red)'   },
          ].map(({ label, val, color }) => (
            <MiniBar key={label} label={label} value={val}
              max={filteredAll?.count || 1}
              color={color}
              total={filteredAll?.count || 0}
            />
          ))}
          {catFilter && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              {filteredAll?.count || 0} total · {peso(filteredAll?.rev || 0)} revenue · avg {filteredAll?.avgRating || '—'}★
            </div>
          )}
        </Widget>

        {/* Recent bookings — full width */}
        <Widget span={2}>
          <SectionHead title="Recent Bookings" icon={TrendingUp} />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Customer ID', 'Category', 'Issue', 'Status', 'Payment', 'Rating', 'Date'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.08s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px 12px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{b.customer_id?.slice(0, 8)}…</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button onClick={() => setCatFilter(c => c === b.service_category ? '' : b.service_category)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <Badge color={catFilter === b.service_category ? 'accent' : 'blue'}>{b.service_category}</Badge>
                    </button>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.issue_type}</td>
                  <td style={{ padding: '10px 12px' }}>{sBadge(b.status)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {b.payment_status
                      ? <Badge color={b.payment_status === 'paid' ? 'green' : b.payment_status === 'failed' ? 'red' : 'amber'}>{b.payment_status}</Badge>
                      : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{b.rating ? <Stars value={b.rating} /> : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>—</span>}</td>
                  <td style={{ padding: '10px 12px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{fmt(b.created_at)}</td>
                </tr>
              ))}
              {!recent.length && <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No bookings yet</td></tr>}
            </tbody>
          </table>
        </Widget>
      </div>
    </div>
  )
}
