import { useEffect, useState } from 'react'
import { api, Template } from '../api/client'

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.templates().then(setTemplates).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">Templates ({templates.length})</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">📌 How Templates Work</h3>
        <p className="text-xs text-gray-500">
          Templates are self-contained HTML files in the <code className="text-cyan-400">templates/</code> directory.
          Drop a new <code className="text-cyan-400">.html</code> file and restart to register it automatically.
          Each template uses <code className="text-cyan-400">API_BASE_URL</code> placeholder for capture endpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-cyan-500/50 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{t.name}</h3>
                <code className="text-xs text-cyan-400">/t/{t.id}</code>
              </div>
              <a href={`/t/${t.id}`} target="_blank" rel="noreferrer" className="px-2 py-1 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700">Preview ↗</a>
            </div>
            {t.description && <p className="text-xs text-gray-500 mt-2">{t.description}</p>}
            <div className="text-xs text-gray-600 mt-3">{new Date(t.created_at * 1000).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
