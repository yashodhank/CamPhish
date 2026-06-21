import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, Session } from '../api/client'

export default function Sessions() {
  const navigate = useNavigate()
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

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  return (
    <div className="space-y-4 stagger">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Sessions</h1>
          <p className="text-sm text-tertiary mt-0.5">{sessions.length} sessions</p>
        </div>
      </div>

      <div className="content-card">
        <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-3">Create New Session</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Session name (e.g. target-1)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input-apple"
            onKeyDown={e => e.key === 'Enter' && create()}
          />
          <select value={template} onChange={e => setTemplate(e.target.value)} className="select-apple">
            <option value="face-runner">Face Runner</option>
            <option value="festival">Festival</option>
            <option value="youtube">YouTube</option>
            <option value="meeting">Meeting</option>
          </select>
          <button onClick={create} className="px-4 py-2 accent-bg accent radius-sm text-sm font-medium hover:bg-accent-hover transition-colors">Create</button>
        </div>
      </div>

      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={s.id} onClick={() => navigate('/replay?session=' + s.id)} className="content-card cursor-pointer border-hoverable transition-all animate-fade-in"
            style={{ animationDelay: `${i * 0.03}s` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-primary">{s.name}</span>
                <span className="text-xs text-tertiary mono">{s.template_id}</span>
                {s.status === 'active' && (
                  <span className="badge" style={{ backgroundColor: '#34c75920', color: '#34c759' }}>active</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-tertiary">{new Date(s.created_at * 1000).toLocaleDateString()}</span>
                {s.id !== 'default' && (
                  <button onClick={e => { e.stopPropagation(); del(s.id) }} className="text-xs text-tertiary hover:text-red-400 transition-colors">Delete</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
