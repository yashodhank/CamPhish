import { useEffect, useState, useCallback } from 'react'
import { api, IpStats } from '../api/client'

function BarChart({ title, data, color }: { title: string; data: Record<string, number>; color: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div className="content-card">
      <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-4">{title}</h3>
      {entries.length === 0 ? <p className="text-sm text-tertiary">No data yet</p> : (
        <div className="space-y-2.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 text-xs">
              <span className="w-20 text-right text-tertiary truncate">{k}</span>
              <div className="flex-1 h-5 bg-tertiary radius-sm overflow-hidden">
                <div className="h-full transition-all duration-500 ease-out" style={{ width: `${(v / max) * 100}%`, backgroundColor: color, opacity: 0.7 }}></div>
              </div>
              <span className="text-secondary w-8 mono text-right">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DeviceBadge({ device }: { device: string | null }) {
  if (!device) return <span className="badge bg-tertiary text-tertiary">—</span>
  const styles: Record<string, { cls: string }> = {
    Mobile: { cls: 'accent-bg accent' },
    Desktop: { cls: 'badge-primary' },
    Tablet: { cls: 'badge-primary' },
  }
  const s = styles[device] || { cls: 'bg-tertiary text-tertiary' }
  return <span className={`badge ${s.cls}`}>{device}</span>
}

export default function IpLogs() {
  const [data, setData] = useState<IpStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [visibleCount, setVisibleCount] = useState(100)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      setData(await api.ips())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refresh()
    if (autoRefresh) {
      const timer = setInterval(refresh, 15000)
      return () => clearInterval(timer)
    }
  }, [refresh, autoRefresh])

  const filtered = data?.entries.filter(e =>
    !search
    || e.ip_address.toLowerCase().includes(search.toLowerCase())
    || (e.local_ip ?? '').toLowerCase().includes(search.toLowerCase())
    || (e.user_agent ?? '').toLowerCase().includes(search.toLowerCase())
  ) ?? []

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  if (error) {
    return (
      <div className="space-y-4">
        <div className="empty-state animate-fade-in">
          <div className="icon">⚠️</div>
          <h3>Failed to load IP logs</h3>
          <p>{error}</p>
          <button onClick={() => { setLoading(true); refresh() }} className="inline-block mt-5 px-4 py-2 nav-link active">⟳ Retry</button>
        </div>
      </div>
    )
  }

  const showCount = Math.min(visibleCount, filtered.length)

  return (
    <div className="space-y-4 stagger">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">IP Logs</h1>
          <p className="text-sm text-tertiary mt-0.5">{data?.total ?? 0} visits · {data?.unique_ips ?? 0} unique IPs</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`select-apple cursor-pointer ${autoRefresh ? 'accent-bg accent' : ''}`}>
            {autoRefresh ? '● Live' : 'Paused'}
          </button>
          <button onClick={refresh} className="select-apple cursor-pointer">⟳</button>
        </div>
      </div>

      {data && data.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <BarChart title="Devices" data={data.device_breakdown} color="#34c759" />
          <BarChart title="Browsers" data={data.browser_breakdown} color="#0a84ff" />
          <BarChart title="Operating Systems" data={data.os_breakdown} color="#bf5af2" />
        </div>
      )}

      <input
        type="text"
        placeholder="Search by IP, local IP, or user agent..."
        value={search}
        onChange={e => { setSearch(e.target.value); setVisibleCount(100) }}
        className="input-apple"
      />

      {filtered.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">🌐</div>
          <h3>{search ? 'No matches' : 'No IP logs yet'}</h3>
          <p>{search ? 'Try a different search term' : 'IP addresses appear when targets visit your link'}</p>
        </div>
      ) : (
        <div className="content-card-lg overflow-hidden !p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Public IP</th>
                <th>Local IP</th>
                <th>Location</th>
                <th>Device</th>
                <th>Browser</th>
                <th>OS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, showCount).map((e, i) => (
                <tr key={e.id} className="animate-fade-in" style={{ animationDelay: `${i * 0.02}s` }}>
                  <td className="text-tertiary">{new Date(e.created_at * 1000).toLocaleString()}</td>
                  <td className="accent mono cursor-pointer hover:underline" onClick={() => navigator.clipboard.writeText(e.ip_address)}>{e.ip_address}</td>
                  <td className="text-xs mono">
                    {e.local_ip ? (
                      <span className="text-secondary cursor-pointer hover:underline" onClick={() => navigator.clipboard.writeText(e.local_ip!)}>{e.local_ip}</span>
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </td>
                  <td className="text-xs text-secondary">
                    {e.city || e.country ? (
                      <span>{[e.city, e.country].filter(Boolean).join(', ')}</span>
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </td>
                  <td><DeviceBadge device={e.device} /></td>
                  <td className="text-secondary">{e.browser}</td>
                  <td className="text-secondary">{e.os}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > showCount && (
            <div className="flex justify-center py-4">
              <button onClick={() => setVisibleCount(c => c + 100)}
                className="px-6 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary)' }}>
                Show More ({filtered.length - showCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
