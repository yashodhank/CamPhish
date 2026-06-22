import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

type Theme = 'midnight' | 'terminal'

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'midnight', toggle: () => {} })

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'midnight'
  return (localStorage.getItem('camphish-theme') as Theme) || 'midnight'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = 'dark'
    localStorage.setItem('camphish-theme', theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => t === 'midnight' ? 'terminal' : 'midnight')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
