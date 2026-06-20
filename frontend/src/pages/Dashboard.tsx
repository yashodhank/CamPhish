import { useEffect, useState } from 'react'
import { api, Stats } from '../api/client'

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 relative overflow-hidden hover:border-cyan-500/50 transition-colors">
      <div className="absolute top-3 right-3 text-2xl opacity-20">{icon}</div>
      <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-bold text-cyan-400 mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      setStats(await api.stats())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>

  const sessionDuration = stats?.first_capture
    ? Math.floor((Date.now() / 1000 - stats.first_capture) / 60)
    : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Dashboard</h2>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span className="text-xs text-gray-500">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Captures" value={stats?.total_captures ?? 0} sub={`${stats?.total_size_mb ?? 0} MB`} icon="📷" />
        <StatCard label="Locations" value={stats?.total_locations ?? 0} sub="GPS pins" icon="📍" />
        <StatCard label="Unique IPs" value={stats?.unique_ips ?? 0} sub={`${stats?.total_ips ?? 0} visits`} icon="🌐" />
        <StatCard label="Data Size" value={`${stats?.total_size_mb ?? 0}`} sub="MB total" icon="💾" />
        <StatCard label="Session" value={`${sessionDuration}m`} sub={stats?.last_capture ? `${Math.floor((Date.now() / 1000 - stats.last_capture) / 60)}m ago` : 'waiting'} icon="⏱️" />
      </div>

      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <a href="/captures" className="px-4 py-2 bg-cyan-500/10 text-cyan-400 rounded-lg text-sm font-medium hover:bg-cyan-500/20 transition-colors">📷 View Captures</a>
          <a href="/locations" className="px-4 py-2 bg-green-500/10 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/20 transition-colors">📍 View Locations</a>
          <a href="/ips" className="px-4 py-2 bg-blue-500/10 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-colors">🌐 View IPs</a>
          <a href="/templates" className="px-4 py-2 bg-purple-500/10 text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-500/20 transition-colors">🎭 Browse Templates</a>
        </div>
      </div>
    </div>
  )
}
