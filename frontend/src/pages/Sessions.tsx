import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, Session, Template } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'

export default function Sessions() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('face-runner')
  const [search, setSearch] = useState('')

  const refresh = async () => {
    try {
      setError(null)
      const [s, t] = await Promise.all([api.sessions(), api.templates()])
      setSessions(s)
      setTemplates(t)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  const create = async () => {
    if (!name.trim()) return
    try {
      await api.createSession(name, template)
      setName('')
      refresh()
    } catch {
      setError('Failed to create session')
    }
  }

  const del = async (id: string) => {
    if (id === 'default') { alert('Cannot delete default session'); return }
    if (!confirm('Delete this session and all its data?')) return
    await api.deleteSession(id)
    refresh()
  }

  const filtered = useMemo(() => {
    if (!search) return sessions
    const q = search.toLowerCase()
    return sessions.filter(s =>
      s.name.toLowerCase().includes(q)
      || s.id.toLowerCase().includes(q)
      || s.template_id.toLowerCase().includes(q)
    )
  }, [sessions, search])

  const active = useMemo(() => sessions.filter(s => s.status === 'active').length, [sessions])

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  return (
    <div className="space-y-4 stagger">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Sessions</h1>
          <p className="text-sm text-tertiary mt-0.5">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            {active > 0 ? ` · ${active} active` : ''}
          </p>
        </div>
        <button onClick={() => { setLoading(true); refresh() }} className="select-apple cursor-pointer">⟳</button>
      </div>

      <div className="content-card">
        <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wider mb-3">Create New Session</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Session name (e.g. target-1)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input-apple flex-1 min-w-[180px]"
            onKeyDown={e => e.key === 'Enter' && create()}
          />
          <select value={template} onChange={e => setTemplate(e.target.value)} className="select-apple">
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button onClick={create} disabled={!name.trim()}
            className="px-4 py-2 accent-bg accent radius-sm text-sm font-medium transition-colors disabled:opacity-40">Create</button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by name, ID, or template..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="input-apple"
      />

      {filtered.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">{search ? '🔍' : '🗂'}</div>
          <h3>{search ? 'No matches' : 'No sessions yet'}</h3>
          <p>{search ? 'Try a different search term' : 'Create a session above to start tracking targets'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s, i) => {
            const tmpl = templates.find(t => t.id === s.template_id)
            return (
              <div key={s.id} onClick={() => navigate('/replay?session=' + s.id)}
                className="content-card cursor-pointer border-hoverable transition-all animate-fade-in"
                style={{ animationDelay: `${Math.min(i * 0.03, 0.5)}s` }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-primary truncate">{s.name}</span>
                    <span className="text-xs text-tertiary mono shrink-0">{tmpl?.name || s.template_id}</span>
                    {s.status === 'active' && (
                      <span className="badge" style={{ backgroundColor: '#34c75920', color: '#34c759' }}>active</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-tertiary">{new Date(s.created_at * 1000).toLocaleDateString()}</span>
                    <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(s.id) }}
                      className="text-[10px] text-tertiary hover:text-primary transition-colors" title="Copy session ID">📋</button>
                    {s.id !== 'default' && (
                      <button onClick={e => { e.stopPropagation(); del(s.id) }}
                        className="text-xs text-tertiary hover:text-red-400 transition-colors">Delete</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
