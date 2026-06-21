import { useEffect, useState } from 'react'
import { api, Template } from '../api/client'

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.templates()
      .then(setTemplates)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-tertiary">{error}</p>
          <button onClick={() => { setLoading(true); setError(null); api.templates().then(setTemplates).catch(e => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false)) }} className="px-4 py-2 text-sm accent-bg accent radius-sm">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 stagger">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Templates</h1>
          <p className="text-sm text-tertiary mt-0.5">{templates.length} templates</p>
        </div>
      </div>

      <div className="content-card">
        <p className="text-xs text-tertiary leading-relaxed">
          Templates are self-contained HTML files in the <code className="mono accent px-1 radius-sm" style={{ backgroundColor: 'var(--accent-bg)' }}>templates/</code> directory.
          Drop a new <code className="mono accent px-1 radius-sm" style={{ backgroundColor: 'var(--accent-bg)' }}>.html</code> file and restart to register it automatically.
          Each template uses <code className="mono accent px-1 radius-sm" style={{ backgroundColor: 'var(--accent-bg)' }}>API_BASE_URL</code> placeholder for capture endpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t, i) => (
          <div key={t.id} className="stat-card animate-scale-in"
            style={{ animationDelay: `${i * 0.04}s`, animationFillMode: 'both' }}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-primary">{t.name}</h3>
                <code className="text-xs accent mono">/t/{t.id}</code>
              </div>
              <a href={`/t/${t.id}`} target="_blank" rel="noreferrer" className="px-3 py-1 bg-tertiary text-secondary rounded-lg text-xs hover:text-primary transition-colors">Preview ↗</a>
            </div>
            {t.description && <p className="text-xs text-tertiary mt-2 leading-relaxed">{t.description}</p>}
            {t.total_served !== undefined && (
              <div className="flex gap-4 mt-3 pt-3 border-t border-subtle">
                <div className="text-xs">
                  <span className="text-tertiary">Served: </span>
                  <span className="text-primary mono">{t.total_served}</span>
                </div>
                <div className="text-xs">
                  <span className="text-tertiary">Camera: </span>
                  <span className="text-primary mono">{t.total_camera_grants ?? 0}</span>
                </div>
                <div className="text-xs">
                  <span className="text-tertiary">Location: </span>
                  <span className="text-primary mono">{t.total_location_grants ?? 0}</span>
                </div>
              </div>
            )}
            <div className="text-xs text-tertiary mt-3">{new Date(t.created_at * 1000).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
