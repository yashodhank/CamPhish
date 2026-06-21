import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'classic' | 'apple'

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'classic', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('camphish-theme')
    if (saved === 'classic' || saved === 'apple') return saved
    return 'classic'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('camphish-theme', theme)
    document.documentElement.style.colorScheme = theme === 'apple' ? 'dark' : 'dark'
  }, [theme])

  const toggle = () => setTheme(t => (t === 'classic' ? 'apple' : 'classic'))

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
