import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'midnight' | 'terminal'

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'midnight', toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme] = useState<Theme>('midnight')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'midnight')
    document.documentElement.style.colorScheme = 'dark'
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
