import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

declare global {
  interface Window {
    conveyor: {
      settings: {
        getTheme: () => Promise<Theme>
        setTheme: (theme: Theme) => Promise<void>
      }
    }
  }
}

/**
 * Apply theme to the document
 */
export function applyTheme(themePreference: Theme) {
  const root = document.documentElement

  if (themePreference === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  } else if (themePreference === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

// Global listener for system theme changes
let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null

/**
 * Initialize theme on app load
 */
export async function initializeTheme() {
  try {
    const theme = await window.conveyor.settings.getTheme()
    applyTheme(theme)

    // Set up global listener for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      // Only apply if current theme is 'system'
      window.conveyor.settings
        .getTheme()
        .then((currentTheme) => {
          if (currentTheme === 'system') {
            applyTheme('system')
          }
        })
        .catch(() => {
          // If we can't get theme, assume system and apply
          applyTheme('system')
        })
    }
    
    // Remove old listener if exists
    if (systemThemeListener) {
      mediaQuery.removeEventListener('change', systemThemeListener)
    }
    
    systemThemeListener = handleSystemThemeChange
    mediaQuery.addEventListener('change', systemThemeListener)
  } catch (error) {
    console.error('Error initializing theme:', error)
    // Default to system if there's an error
    applyTheme('system')
  }
}

/**
 * Hook to manage theme state
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    // Load theme on mount
    window.conveyor.settings
      .getTheme()
      .then((loadedTheme) => {
        setTheme(loadedTheme)
        applyTheme(loadedTheme)
      })
      .catch((error) => {
        console.error('Error loading theme:', error)
        applyTheme('system')
      })
  }, [])

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setThemeAndSave = async (newTheme: Theme) => {
    try {
      await window.conveyor.settings.setTheme(newTheme)
      setTheme(newTheme)
      applyTheme(newTheme)
    } catch (error) {
      console.error('Error saving theme:', error)
    }
  }

  return { theme, setTheme: setThemeAndSave }
}
