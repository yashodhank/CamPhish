import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface EventRow {
  id: string
  session_id: string
  event_type: string
  event_data: any
  created_at: number
}

interface SessionInfo {
  id: string
  name: string
}

function eventIcon(type: string) {
  const map: Record<string, string> = {
    page_visit: '🌐', location_granted: '📍', location_denied: '🚫',
    camera_capture: '📸', fingerprint_collected: '🔍',
    cross_session_match: '🔗', camera_granted: '📷', camera_denied: '🚫',
  }
  return map[type] || '⚡'
}

export default function SessionReplay() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const params = new URLSearchParams(window.location.search)
  const [selectedSession, setSelectedSession] = useState(params.get('session') || 'default')
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const data = await api.events(selectedSession, 0, 500)
      setEvents(data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    api.sessions().then(setSessions).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      await refresh()
      if (!cancelled) setTimeout(poll, 15000)
    }
    setTimeout(poll, 15000)
    return () => { cancelled = true }
  }, [selectedSession])

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-tertiary">{error}</p>
          <button onClick={refresh} className="px-4 py-2 text-sm accent-bg accent radius-sm">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap animate-fade-in">
        <h1 className="text-xl font-bold text-primary">Session Replay</h1>
        <select
          value={selectedSession}
          onChange={e => setSelectedSession(e.target.value)}
          className="select-apple"
        >
          {sessions.map(s => (
            <option key={s.id} value={s.id}>{s.name || s.id}</option>
          ))}
        </select>
      </div>
      <p className="text-sm text-tertiary">{events.length} events</p>
      <div className="content-card !p-0 overflow-hidden max-h-[70vh] overflow-y-auto">
        {events.length === 0 ? (
          <div className="empty-state !py-16 animate-fade-in">
            <div className="icon !text-4xl">⚡</div>
            <h3>No events yet</h3>
            <p>Events appear as the target interacts with the page.</p>
          </div>
        ) : (
          <div className="p-1">
            {events.map((e, i) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-subtle text-sm animate-fade-in"
                style={{ animationDelay: `${i * 0.02}s` }}>
                <span className="text-lg select-none">{eventIcon(e.event_type)}</span>
                <span className="text-secondary font-medium">{e.event_type.replace(/_/g, ' ')}</span>
                {e.event_data && (
                  <span className="text-xs text-tertiary mono truncate max-w-[40%]">
                    {typeof e.event_data === 'object' ? JSON.stringify(e.event_data).substring(0, 80) : e.event_data}
                  </span>
                )}
                <span className="text-xs text-tertiary ml-auto mono">{new Date(e.created_at * 1000).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
