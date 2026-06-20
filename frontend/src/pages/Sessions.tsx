import { useEffect, useState } from 'react'
import { api, Session } from '../api/client'

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('face-runner')

  const refresh = async () => {
    try { setSessions(await api.sessions()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  const create = async () => {
    if (!name.trim()) return
    await api.createSession(name, template)
    setName('')
    refresh()
  }

  const del = async (id: string) => {
    if (id === 'default') { alert('Cannot delete default session'); return }
    if (!confirm('Delete this session?')) return
    await api.deleteSession(id)
    refresh()
  }

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">Sessions ({sessions.length})</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Create New Session</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Session name (e.g. target-1)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-cyan-500"
          />
          <select value={template} onChange={e => setTemplate(e.target.value)} className="px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300">
            <option value="face-runner">Face Runner</option>
            <option value="festival">Festival</option>
            <option value="youtube">YouTube</option>
            <option value="meeting">Meeting</option>
          </select>
          <button onClick={create} className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-cyan-600">Create</button>
        </div>
      </div>

      <div className="space-y-2">
        {sessions.map(s => (
          <div key={s.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-3 hover:border-gray-700">
            <div>
              <span className="text-sm font-medium text-white">{s.name}</span>
              <span className="text-xs text-gray-600 ml-2">{s.template_id}</span>
              {s.status === 'active' && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">active</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600">{new Date(s.created_at * 1000).toLocaleDateString()}</span>
              {s.id !== 'default' && (
                <button onClick={() => del(s.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
