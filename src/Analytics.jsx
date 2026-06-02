import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  FunnelChart, Funnel, LabelList
} from 'recharts'
import { supabase } from './supabase'
import { Spinner } from './UI'
import { TrendingUp, TrendingDown, Minus, X, Filter, BarChart2, Download } from 'lucide-react'

// ── palette ────────────────────────────────────────────────────────────────
const PAL  = ['#7c6dff','#4ade80','#f59e0b','#f87171','#60a5fa','#a78bfa','#34d399','#fb923c']
const CAT_COLOR = { electrical:'#f59e0b', plumbing:'#60a5fa', aircon:'#7c6dff', appliance:'#4ade80', carpentry:'#f87171', painting:'#a78bfa', cleaning:'#34d399', other:'#94a3b8' }
const ST_COLOR  = { pending:'#f59e0b', scheduled:'#60a5fa', in_progress:'#7c6dff', completed:'#4ade80', cancelled:'#f87171' }

// ── helpers ────────────────────────────────────────────────────────────────
const peso = n => `₱${Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:0})}`
const pct  = (a,b) => b>0 ? (((a-b)/b)*100).toFixed(1) : null
const isoDate = d => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }

function periodRange(period, customStart, customEnd) {
  const now = new Date()
  const today = isoDate(now)
  if (period === 'today')   return { s: today, e: today }
  if (period === 'week')    { const d=new Date(now); d.setDate(d.getDate()-d.getDay()+(d.getDay()===0?-6:1)); d.setHours(0,0,0,0); const e=new Date(d); e.setDate(d.getDate()+6); return { s:isoDate(d), e:isoDate(e) } }
  if (period === 'month')   return { s: isoDate(new Date(now.getFullYear(),now.getMonth(),1)), e: today }
  if (period === 'quarter') { const q=Math.floor(now.getMonth()/3); return { s: isoDate(new Date(now.getFullYear(),q*3,1)), e: today } }
  if (period === 'year')    return { s: `${now.getFullYear()}-01-01`, e: today }
  if (period === 'all')     return { s: '2020-01-01', e: today }
  if (period === 'custom')  return { s: customStart || today, e: customEnd || today }
  return { s: today, e: today }
}

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', fontSize:12, boxShadow:'var(--shadow)' }}>
      <div style={{ fontWeight:700, color:'var(--text)', marginBottom:6 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, color:'var(--text-muted)', marginBottom:2 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:p.color, flexShrink:0 }} />
          <span>{p.name}:</span>
          <span style={{ color:'var(--text)', fontWeight:600 }}>{formatter ? formatter(p.value, p.name) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, children, height = 260, action }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
        <BarChart2 size={13} color="var(--text-muted)" />
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', flex:1 }}>{title}</span>
        {action}
      </div>
      <div style={{ padding:16, height }}>{children}</div>
    </div>
  )
}

function KpiStrip({ label, value, prev, unit = '' }) {
  const trend = pct(Number(value), Number(prev))
  const up    = trend > 0
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'14px 16px', display:'flex', flexDirection:'column', gap:5 }}>
      <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
      <div style={{ fontSize:24, fontWeight:700, color:'var(--text)', fontFamily:'DM Mono, monospace', letterSpacing:'-0.02em' }}>{unit}{value}</div>
      {trend !== null && (
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color: up ? 'var(--green)' : 'var(--red)' }}>
          {up ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
          {Math.abs(trend)}% vs prev period
        </div>
      )}
      {trend === null && prev !== undefined && (
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text-faint)' }}>
          <Minus size={11}/> No prior data
        </div>
      )}
    </div>
  )
}

function DrillTag({ label, onRemove }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, background:'var(--accent-soft)', color:'var(--accent)', border:'1px solid var(--accent-border)', borderRadius:99, padding:'3px 10px', fontSize:11, fontWeight:600 }}>
      <Filter size={10}/>{label}
      <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', padding:0, display:'flex', lineHeight:1 }}>
        <X size={11}/>
      </button>
    </div>
  )
}

// ── matrix row with drill-down ─────────────────────────────────────────────
function MatrixRow({ cat, items, onDrill, drilled }) {
  const [open, setOpen] = useState(false)
  const total = items.reduce((s,i)=>s+i.count,0)
  const rev   = items.reduce((s,i)=>s+i.rev,0)
  return (
    <>
      <tr onClick={() => setOpen(o=>!o)} style={{ cursor:'pointer', borderBottom:'1px solid var(--border)', transition:'background 0.08s' }}
        onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        <td style={{ padding:'10px 14px', fontWeight:600, fontSize:12, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:10, color:'var(--text-muted)', transition:'transform 0.15s', display:'inline-block', transform: open?'rotate(90deg)':'rotate(0deg)' }}>▶</span>
          <div style={{ width:8, height:8, borderRadius:'50%', background: CAT_COLOR[cat]||PAL[0], flexShrink:0 }}/>
          {cat}
        </td>
        <td style={{ padding:'10px 14px', fontSize:12, fontFamily:'DM Mono, monospace', textAlign:'right', color:'var(--text-muted)' }}>{total}</td>
        <td style={{ padding:'10px 14px', fontSize:12, fontFamily:'DM Mono, monospace', textAlign:'right' }}>{peso(rev)}</td>
        <td style={{ padding:'10px 14px', textAlign:'right' }}>
          <button onClick={e=>{e.stopPropagation();onDrill(cat)}} style={{ background: drilled?'var(--accent)':'var(--accent-soft)', color: drilled?'white':'var(--accent)', border:'none', borderRadius:5, padding:'3px 8px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
            {drilled ? 'Active' : 'Filter'}
          </button>
        </td>
      </tr>
      {open && items.map(it => (
        <tr key={it.type} style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
          <td style={{ padding:'8px 14px 8px 34px', fontSize:11, color:'var(--text-muted)' }}>↳ {it.type}</td>
          <td style={{ padding:'8px 14px', fontSize:11, fontFamily:'DM Mono, monospace', textAlign:'right', color:'var(--text-muted)' }}>{it.count}</td>
          <td style={{ padding:'8px 14px', fontSize:11, fontFamily:'DM Mono, monospace', textAlign:'right', color:'var(--text-muted)' }}>{peso(it.rev)}</td>
          <td />
        </tr>
      ))}
    </>
  )
}

// ── main ───────────────────────────────────────────────────────────────────
export default function Analytics() {
  const [period,      setPeriod]      = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd,   setCustomEnd]   = useState('')
  const [drillCat,    setDrillCat]    = useState(null)
  const [drillStatus, setDrillStatus] = useState(null)
  const [data,        setData]        = useState(null)
  const [prevData,    setPrevData]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const mountedRef = useRef(true)

  useEffect(()=>{ mountedRef.current=true; return ()=>{ mountedRef.current=false }},[])

  const fetchPeriod = useCallback(async (s, e) => {
    let q = supabase.from('bookings')
      .select('id, service_category, issue_type, status, payment_status, estimated_fee, rating, created_at')
      .gte('created_at', new Date(s).toISOString())
      .lte('created_at', new Date(e+'T23:59:59').toISOString())
    if (drillCat)    q = q.eq('service_category', drillCat)
    if (drillStatus) q = q.eq('status', drillStatus)
    const { data } = await q.limit(2000)
    return data || []
  }, [drillCat, drillStatus])

  const prevRange = useCallback((s, e) => {
    const ms   = new Date(s).getTime()
    const me   = new Date(e).getTime()
    const diff = me - ms + 86400000
    return {
      s: isoDate(new Date(ms - diff)),
      e: isoDate(new Date(me - diff))
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { s, e } = periodRange(period, customStart, customEnd)
    const { s: ps, e: pe } = prevRange(s, e)
    const [cur, prev] = await Promise.all([fetchPeriod(s, e), fetchPeriod(ps, pe)])
    if (!mountedRef.current) return

    const process = (rows) => {
      const byCat = {}, byStatus = {}, byDay = {}, byIssue = {}
      let totalRev = 0, paid = 0, ratingSum = 0, ratingCnt = 0

      rows.forEach(b => {
        const fee = Number(b.estimated_fee || 0)
        const d   = (b.created_at||'').slice(0,10)

        // by category
        if (!byCat[b.service_category]) byCat[b.service_category] = { count:0, rev:0, issues:{} }
        byCat[b.service_category].count++
        byCat[b.service_category].rev += fee
        const it = b.issue_type || 'Unknown'
        byCat[b.service_category].issues[it] = (byCat[b.service_category].issues[it] || { count:0, rev:0 })
        byCat[b.service_category].issues[it].count++
        byCat[b.service_category].issues[it].rev += fee

        // by status
        byStatus[b.status] = (byStatus[b.status] || { count:0, rev:0 })
        byStatus[b.status].count++
        byStatus[b.status].rev += fee

        // by day
        byDay[d] = (byDay[d] || { date:d, bookings:0, revenue:0 })
        byDay[d].bookings++
        byDay[d].revenue += fee

        if (b.payment_status === 'paid') { totalRev += fee; paid++ }
        if (b.rating) { ratingSum += b.rating; ratingCnt++ }
      })

      const catArr    = Object.entries(byCat).map(([cat, v]) => ({
        cat, count:v.count, rev:v.rev,
        items: Object.entries(v.issues).map(([type, iv]) => ({ type, count:iv.count, rev:iv.rev }))
          .sort((a,b)=>b.count-a.count)
      })).sort((a,b)=>b.count-a.count)

      const statusArr = Object.entries(byStatus).map(([status, v]) => ({ status, ...v })).sort((a,b)=>b.count-a.count)
      const dayArr    = Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date))

      // ratings distribution
      const ratingDist = [1,2,3,4,5].map(r => ({ rating:`${r}★`, count: rows.filter(b=>b.rating===r).length }))

      // funnel: pending → scheduled → in_progress → completed
      const funnel = ['pending','scheduled','in_progress','completed'].map(s => ({
        name: s.replace('_',' '), value: byStatus[s]?.count || 0
      }))

      return {
        total: rows.length,
        totalRev,
        avgRating: ratingCnt ? (ratingSum/ratingCnt).toFixed(1) : null,
        completionRate: rows.length > 0 ? Math.round(((byStatus.completed?.count||0)/rows.length)*100) : 0,
        catArr, statusArr, dayArr, ratingDist, funnel,
      }
    }

    setData(process(cur))
    setPrevData(process(prev))
    setLoading(false)
  }, [period, customStart, customEnd, fetchPeriod, prevRange])

  useEffect(()=>{ load() },[load])

  const exportCsv = () => {
    if (!data) return
    const rows = [['Category','Bookings','Revenue'],
      ...data.catArr.map(c => [c.cat, c.count, c.rev])
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `papafix-analytics-${isoDate(new Date())}.csv`; a.click()
  }

  const toggleDrill = (type, val) => {
    if (type === 'cat')    setDrillCat   (v => v===val ? null : val)
    if (type === 'status') setDrillStatus(v => v===val ? null : val)
  }

  const anyDrill = drillCat || drillStatus

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* ── Filter bar ── */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 16px', display:'flex', flexWrap:'wrap', alignItems:'flex-end', gap:14 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <label style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Period</label>
          <select className="form-select" style={{ width:150, padding:'6px 10px' }} value={period} onChange={e=>{ setPeriod(e.target.value) }}>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        {period === 'custom' && <>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Start</label>
            <input className="form-input" type="date" value={customStart} style={{ width:140 }}
              onChange={e=>setCustomStart(e.target.value)} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>End</label>
            <input className="form-input" type="date" value={customEnd} style={{ width:140 }}
              onChange={e=>setCustomEnd(e.target.value)} />
          </div>
        </>}
        <button className="btn btn-primary" onClick={load} style={{ alignSelf:'flex-end' }}>Apply</button>
        <div style={{ flex:1 }} />
        {anyDrill && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>Filters:</span>
            {drillCat    && <DrillTag label={`Category: ${drillCat}`}    onRemove={()=>setDrillCat(null)} />}
            {drillStatus && <DrillTag label={`Status: ${drillStatus}`}   onRemove={()=>setDrillStatus(null)} />}
            <button onClick={()=>{ setDrillCat(null); setDrillStatus(null) }} style={{ fontSize:11, color:'var(--red)', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>Clear all</button>
          </div>
        )}
        <button className="btn btn-ghost" onClick={exportCsv} style={{ alignSelf:'flex-end' }}>
          <Download size={13}/> Export CSV
        </button>
      </div>

      {loading ? <Spinner /> : !data ? null : <>

        {/* ── KPI strip ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(148px,1fr))', gap:10 }}>
          <KpiStrip label="Total Bookings"    value={data.total}              prev={prevData?.total}          />
          <KpiStrip label="Paid Revenue"      value={peso(data.totalRev)}     prev={prevData ? peso(prevData.totalRev) : undefined} />
          <KpiStrip label="Completion Rate"   value={data.completionRate+'%'} prev={prevData ? prevData.completionRate+'%' : undefined} />
          <KpiStrip label="Avg Rating"        value={data.avgRating || '—'}   prev={prevData?.avgRating} />
        </div>

        {/* ── Row 1: Trend + Donut ── */}
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
          <ChartCard title="Booking Trend Over Time" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dayArr} margin={{ top:5, right:10, bottom:5, left:10 }}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7c6dff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#7c6dff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize:10, fill:'var(--text-muted)' }} tickFormatter={d=>d.slice(5)} />
                <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Area type="monotone" dataKey="bookings" stroke="#7c6dff" strokeWidth={2} fill="url(#grad1)" name="Bookings" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="By Status" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.statusArr} dataKey="count" nameKey="status" cx="50%" cy="50%"
                  innerRadius={55} outerRadius={90} paddingAngle={3}
                  onClick={(_,i)=>toggleDrill('status', data.statusArr[i]?.status)}
                  style={{ cursor:'pointer' }}>
                  {data.statusArr.map((e,i) => (
                    <Cell key={i} fill={ST_COLOR[e.status]||PAL[i%PAL.length]}
                      opacity={drillStatus && drillStatus!==e.status ? 0.3 : 1} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip formatter={(v,n)=>`${v} bookings`} />} />
                <Legend wrapperStyle={{ fontSize:11 }} formatter={v=>v.replace('_',' ')} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Row 2: Category bar + rating dist ── */}
        <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:14 }}>
          <ChartCard title="Bookings by Service Category (click to drill)" height={260}
            action={<span style={{ fontSize:10, color:'var(--text-faint)' }}>Click bar to filter</span>}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.catArr} margin={{ top:5, right:10, bottom:5, left:5 }}
                onClick={e=>{ if (e?.activeLabel) toggleDrill('cat', e.activeLabel) }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="cat" tick={{ fontSize:10, fill:'var(--text-muted)' }} />
                <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} />
                <Tooltip content={<CustomTooltip formatter={(v,n)=>n==='revenue'?peso(v):v} />} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Bar dataKey="count" name="bookings" radius={[4,4,0,0]} style={{ cursor:'pointer' }}>
                  {data.catArr.map((e,i) => (
                    <Cell key={i} fill={CAT_COLOR[e.cat]||PAL[i%PAL.length]}
                      opacity={drillCat && drillCat!==e.cat ? 0.3 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Rating Distribution" height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ratingDist} layout="vertical" margin={{ top:5, right:10, bottom:5, left:10 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" horizontal={false}/>
                <XAxis type="number" tick={{ fontSize:10, fill:'var(--text-muted)' }} />
                <YAxis type="category" dataKey="rating" tick={{ fontSize:12, fill:'var(--amber)' }} width={30}/>
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="reviews" fill="#f59e0b" radius={[0,4,4,0]} barSize={16}/>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Row 3: Revenue by category + Booking funnel ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <ChartCard title="Revenue by Category" height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.catArr} margin={{ top:5, right:10, bottom:5, left:5 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="cat" tick={{ fontSize:10, fill:'var(--text-muted)' }} />
                <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} tickFormatter={v=>peso(v)} />
                <Tooltip content={<CustomTooltip formatter={v=>peso(v)} />} />
                <Bar dataKey="rev" name="revenue" radius={[4,4,0,0]}>
                  {data.catArr.map((e,i) => (
                    <Cell key={i} fill={CAT_COLOR[e.cat]||PAL[i%PAL.length]}
                      opacity={drillCat && drillCat!==e.cat ? 0.3 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Booking Funnel" height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.funnel} layout="vertical" margin={{ top:5, right:40, bottom:5, left:10 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" horizontal={false}/>
                <XAxis type="number" tick={{ fontSize:10, fill:'var(--text-muted)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:'var(--text-muted)' }} width={90}/>
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="bookings" radius={[0,4,4,0]} barSize={22}>
                  {data.funnel.map((e,i) => (
                    <Cell key={i} fill={PAL[i % PAL.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Detailed matrix with drill-down rows ── */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
            <BarChart2 size={13} color="var(--text-muted)"/>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', flex:1 }}>Detailed Breakdown by Category</span>
            <span style={{ fontSize:11, color:'var(--text-faint)' }}>Click row to expand issue types</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['Category / Issue', 'Bookings', 'Revenue', 'Drill'].map(h=>(
                    <th key={h} style={{ padding:'10px 14px', textAlign: h==='Bookings'||h==='Revenue'?'right':'left', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', background:'var(--surface2)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.catArr.map(c => (
                  <MatrixRow key={c.cat} cat={c.cat} items={c.items}
                    onDrill={cat=>toggleDrill('cat',cat)} drilled={drillCat===c.cat} />
                ))}
                {data.catArr.length === 0 && (
                  <tr><td colSpan={4} style={{ padding:32, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No data for this period{anyDrill?' with current filters':''}</td></tr>
                )}
              </tbody>
              {data.catArr.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop:'2px solid var(--border)' }}>
                    <td style={{ padding:'10px 14px', fontWeight:700, fontSize:12 }}>Total</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, fontSize:12, fontFamily:'DM Mono, monospace', textAlign:'right' }}>{data.total}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, fontSize:12, fontFamily:'DM Mono, monospace', textAlign:'right' }}>{peso(data.totalRev)}</td>
                    <td/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </>}
    </div>
  )
}
