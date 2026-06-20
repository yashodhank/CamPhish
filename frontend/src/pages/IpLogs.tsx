import { useEffect, useState, useCallback } from 'react'
import { api, IpStats } from '../api/client'

function BarChart({ title, data, color }: { title: string; data: Record<string, number>; color: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">{title}</h3>
      {entries.length === 0 ? <p className="text-sm text-gray-600">No data yet</p> : (
        <div className="space-y-3">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 text-xs">
              <span className="w-20 text-right text-gray-500">{k}</span>
              <div className="flex-1 h-6 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full bg-${color}-500 rounded-full transition-all duration-500`} style={{ width: `${(v / max) * 100}%` }}></div>
              </div>
              <span className="text-gray-400 w-8 tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const deviceColors: Record<string, string> = {
  Mobile: 'bg-green-500/10 text-green-400',
  Desktop: 'bg-blue-500/10 text-blue-400',
  Tablet: 'bg-yellow-500/10 text-yellow-400',
  Unknown: 'bg-gray-700 text-gray-400',
}

export default function IpLogs() {
  const [data, setData] = useState<IpStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const refresh = useCallback(async () => {
    try { setData(await api.ips()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refresh()
    if (autoRefresh) {
      const timer = setInterval(refresh, 5000)
      return () => clearInterval(timer)
    }
  }, [refresh, autoRefresh])

  const filtered = data?.entries.filter(e =>
    !search || e.ip_address.includes(search) || (e.user_agent ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? []

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">IP Logs</h2>
          <p className="text-sm text-gray-500 mt-1">{data?.total ?? 0} visits · {data?.unique_ips ?? 0} unique IPs</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${autoRefresh ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            {autoRefresh ? '● Live' : 'Paused'}
          </button>
          <button onClick={refresh} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">🔄</button>
        </div>
      </div>

      {data && data.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BarChart title="📱 Devices" data={data.device_breakdown} color="green" />
          <BarChart title="🌐 Browsers" data={data.browser_breakdown} color="blue" />
          <BarChart title="💻 Operating Systems" data={data.os_breakdown} color="purple" />
        </div>
      )}

      <input
        type="text"
        placeholder="🔍 Search by IP or user agent..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-300 focus:outline-none focus:border-cyan-500 transition-colors"
      />

      {filtered.length === 0 ? (
        <div className="text-center py-24 text-gray-600">
          <div className="text-6xl mb-4 opacity-20">🌐</div>
          <h3 className="text-lg text-gray-400">No IP logs yet</h3>
          <p className="text-sm mt-2">IP addresses appear when targets visit your link</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-2xl">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 font-medium">Time</th>
                <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 font-medium">IP Address</th>
                <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 font-medium">Device</th>
                <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 font-medium">Browser</th>
                <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 font-medium">OS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(e => (
                <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(e.created_at * 1000).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-cyan-400 font-mono cursor-pointer hover:underline" onClick={() => navigator.clipboard.writeText(e.ip_address)}>{e.ip_address}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${deviceColors[e.device ?? 'Unknown'] ?? deviceColors.Unknown}`}>{e.device}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{e.browser}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{e.os}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
