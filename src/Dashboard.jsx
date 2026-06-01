import { useState, useEffect } from 'react'
import { Users, CalendarDays, MapPin, Clock, Star, TrendingUp, AlertCircle } from 'lucide-react'
import { supabase } from './supabase'
import { Spinner, Badge, StatusDot, Stars } from './UI'

function StatCard({ icon: Icon, label, value, sub, color = 'accent' }) {
  const colors = {
    accent: { bg: 'var(--accent-soft)', color: 'var(--accent)' },
    green: { bg: 'var(--green-soft)', color: 'var(--green)' },
    amber: { bg: 'var(--amber-soft)', color: 'var(--amber)' },
    blue: { bg: 'var(--blue-soft)', color: 'var(--blue)' },
  }
  const c = colors[color] || colors.accent
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: c.bg }}>
        <Icon size={14} color={c.color} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentBookings, setRecentBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [
        { count: bookingsTotal },
        { count: profilesTotal },
        { count: locationsTotal },
        { count: availTotal },
        { data: bookings },
        { data: allBookings }
      ] = await Promise.all([
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('locations').select('*', { count: 'exact', head: true }),
        supabase.from('availability').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('id, service_category, issue_type, status, payment_status, estimated_fee, rating, created_at, customer_id').order('created_at', { ascending: false }).limit(8),
        // limit to 500 most recent for stats — avoids full table scan
        supabase.from('bookings').select('status, rating, payment_status, estimated_fee').order('created_at', { ascending: false }).limit(500),
      ])
      if (cancelled) return

      const statusCounts = {}
      let totalRating = 0, ratingCount = 0, revenue = 0
      for (const b of (allBookings || [])) {
        statusCounts[b.status] = (statusCounts[b.status] || 0) + 1
        if (b.rating) { totalRating += b.rating; ratingCount++ }
        if (b.payment_status === 'paid') revenue += Number(b.estimated_fee || 0)
      }

      setStats({ bookingsTotal, profilesTotal, locationsTotal, availTotal, statusCounts, avgRating: ratingCount ? (totalRating / ratingCount).toFixed(1) : '-', revenue })
      setRecentBookings(bookings || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <Spinner />

  const statusBadge = (s) => {
    const map = { pending: 'amber', scheduled: 'blue', completed: 'green', cancelled: 'red', in_progress: 'accent' }
    return <Badge color={map[s] || 'muted'}>{s || '—'}</Badge>
  }

  return (
    <div>
      <div className="stats-row">
        <StatCard icon={CalendarDays} label="Total Bookings" value={stats.bookingsTotal ?? 0} sub={`${stats.statusCounts?.completed ?? 0} completed`} color="accent" />
        <StatCard icon={Users} label="Profiles" value={stats.profilesTotal ?? 0} sub="users & technicians" color="blue" />
        <StatCard icon={MapPin} label="Locations" value={stats.locationsTotal ?? 0} sub="saved addresses" color="green" />
        <StatCard icon={Clock} label="Availability" value={stats.availTotal ?? 0} sub="schedule slots" color="amber" />
        <StatCard icon={Star} label="Avg Rating" value={stats.avgRating} sub="across all bookings" color="amber" />
        <StatCard icon={AlertCircle} label="Pending" value={stats.statusCounts?.pending ?? 0} sub="awaiting action" color="accent" />
      </div>

      <div className="widgets-grid">
        <div className="widget" style={{ gridColumn: 'span 2' }}>
          <div className="widget-head">
            <TrendingUp size={13} color="var(--text-muted)" />
            <span className="widget-title">Recent Bookings</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Category</th>
                <th>Issue</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Rating</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentBookings.map(b => (
                <tr key={b.id}>
                  <td>
                    <span className="mono truncate" style={{ maxWidth: 120 }}>
                      {b.profiles?.full_name || b.customer_id?.slice(0, 8) + '…'}
                    </span>
                  </td>
                  <td><Badge color="blue">{b.service_category}</Badge></td>
                  <td><span className="truncate">{b.issue_type}</span></td>
                  <td>{statusBadge(b.status)}</td>
                  <td>
                    {b.payment_status
                      ? <Badge color={b.payment_status === 'paid' ? 'green' : b.payment_status === 'failed' ? 'red' : 'amber'}>{b.payment_status}</Badge>
                      : <span className="mono">—</span>}
                  </td>
                  <td>{b.rating ? <Stars value={b.rating} /> : <span className="mono">—</span>}</td>
                  <td><span className="mono">{b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</span></td>
                </tr>
              ))}
              {!recentBookings.length && (
                <tr><td colSpan={7} className="empty">No bookings yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
