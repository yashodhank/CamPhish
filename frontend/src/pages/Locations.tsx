import { useEffect, useState } from 'react'
import { api, Location } from '../api/client'

export default function Locations() {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try { setLocations(await api.locations()) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 10000)
    return () => clearInterval(timer)
  }, [])

  const copy = (text: string) => { navigator.clipboard.writeText(text) }

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Locations ({locations.length})</h2>
        <button onClick={refresh} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">🔄</button>
      </div>

      {locations.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <div className="text-5xl mb-4 opacity-30">📍</div>
          <h3 className="text-lg text-gray-400">No locations captured</h3>
          <p className="text-sm mt-1">GPS data appears when targets grant location access</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map(l => {
            const acc = l.accuracy ?? 999
            const accColor = acc < 10 ? 'text-green-400' : acc < 50 ? 'text-yellow-400' : 'text-red-400'
            const accLabel = acc < 10 ? 'High precision' : acc < 50 ? 'Medium precision' : 'Low precision'
            return (
              <div key={l.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-cyan-500/50 transition-colors">
                <div className="text-sm text-cyan-400 font-mono cursor-pointer" onClick={() => copy(`${l.latitude}, ${l.longitude}`)}>
                  📍 {l.latitude}, {l.longitude}
                </div>
                <div className={`text-xs mt-1 ${accColor}`}>{accLabel} ({acc}m)</div>
                <a href={l.maps_url} target="_blank" rel="noreferrer" className="text-xs text-green-400 hover:underline mt-2 inline-block">
                  🗺 Open in Google Maps →
                </a>
                <div className="text-xs text-gray-600 mt-2">{new Date(l.created_at * 1000).toLocaleString()}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
