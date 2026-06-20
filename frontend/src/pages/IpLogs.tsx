import { useEffect, useState } from 'react'
import { api, IpStats } from '../api/client'

function BarChart({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">{title}</h3>
      {entries.length === 0 ? <p className="text-sm text-gray-600">No data</p> : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-right text-gray-500">{k}</span>
              <div className="h-5 bg-cyan-500 rounded min-w-[2px] transition-all" style={{ width: `${(v / max) * 100}%` }}></div>
              <span className="text-gray-600">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function IpLogs() {
  const [data, setData] = useState<IpStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const refresh = async () => {
    try { setData(await api.ips()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 10000)
    return () => clearInterval(timer)
  }, [])

  const filtered = data?.entries.filter(e =>
    !search || e.ip_address.includes(search) || (e.user_agent ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? []

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">IP Logs ({data?.total ?? 0})</h2>
        <button onClick={refresh} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">🔄</button>
      </div>

      {data && data.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <BarChart title="📱 Devices" data={data.device_breakdown} />
          <BarChart title="🌍 Browsers" data={data.browser_breakdown} />
          <BarChart title="💻 Operating Systems" data={data.os_breakdown} />
        </div>
      )}

      <input
        type="text"
        placeholder="🔍 Search IPs..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-4 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-cyan-500"
      />

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <div className="text-5xl mb-4 opacity-30">🌐</div>
          <h3 className="text-lg text-gray-400">No IP logs yet</h3>
          <p className="text-sm mt-1">IP addresses appear when targets visit your link</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs text-gray-500 uppercase px-3 py-2">Time</th>
                <th className="text-left text-xs text-gray-500 uppercase px-3 py-2">IP</th>
                <th className="text-left text-xs text-gray-500 uppercase px-3 py-2">Device</th>
                <th className="text-left text-xs text-gray-500 uppercase px-3 py-2">Browser</th>
                <th className="text-left text-xs text-gray-500 uppercase px-3 py-2">OS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(e => (
                <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="px-3 py-2 text-xs text-gray-400">{new Date(e.created_at * 1000).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-cyan-400 font-mono cursor-pointer" onClick={() => navigator.clipboard.writeText(e.ip_address)}>{e.ip_address}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      e.device === 'Mobile' ? 'bg-green-500/10 text-green-400' :
                      e.device === 'Desktop' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>{e.device}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">{e.browser}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{e.os}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
