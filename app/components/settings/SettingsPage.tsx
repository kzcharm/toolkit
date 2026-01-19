import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { useTheme } from '@/app/hooks/use-theme'

declare global {
  interface Window {
    conveyor: {
      settings: {
        detectCSGOPath: () => Promise<string | null>
        getCSGOPath: () => Promise<string | null>
        setCSGOPath: (path: string) => Promise<void>
      }
    }
  }
}

export default function SettingsPage() {
  const [csgoPath, setCsgoPath] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    loadCSGOPath()
  }, [])

  const loadCSGOPath = async () => {
    try {
      let path = await window.conveyor.settings.getCSGOPath()
      
      // Auto-detect if not set
      if (!path) {
        try {
          const detectedPath = await window.conveyor.settings.detectCSGOPath()
          if (detectedPath) {
            // Auto-save the detected path
            await window.conveyor.settings.setCSGOPath(detectedPath)
            path = detectedPath
            setMessage({ type: 'success', text: 'CS:GO path auto-detected and saved!' })
            // Clear message after 3 seconds
            setTimeout(() => setMessage(null), 3000)
          }
        } catch (error) {
          // Silently fail auto-detection, user can manually detect later
          console.log('Auto-detection failed:', error)
        }
      }
      
      setCsgoPath(path)
    } catch (error) {
      console.error('Error loading CS:GO path:', error)
    }
  }

  const detectCSGOPath = async () => {
    setIsDetecting(true)
    setMessage(null)
    try {
      const detectedPath = await window.conveyor.settings.detectCSGOPath()
      if (detectedPath) {
        setCsgoPath(detectedPath)
        setMessage({ type: 'success', text: 'CS:GO path detected successfully!' })
      } else {
        setMessage({
          type: 'error',
          text: 'Could not detect CS:GO installation. Please set it manually.',
        })
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error detecting CS:GO path: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const saveCSGOPath = async () => {
    if (!csgoPath) {
      setMessage({ type: 'error', text: 'Please enter or detect a CS:GO path first.' })
      return
    }

    setIsSaving(true)
    setMessage(null)
    try {
      await window.conveyor.settings.setCSGOPath(csgoPath)
      setMessage({ type: 'success', text: 'CS:GO path saved successfully!' })
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error saving CS:GO path: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setIsSaving(false)
    }
  }



  return (
    <div className="flex flex-col gap-6 p-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure your application settings</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Theme Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Theme</label>
          <div className="flex gap-2">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              onClick={() => setTheme('light')}
              className="flex-1"
            >
              Light
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              onClick={() => setTheme('dark')}
              className="flex-1"
            >
              Dark
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              onClick={() => setTheme('system')}
              className="flex-1"
            >
              System
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Choose your preferred color scheme. System mode follows your OS theme.
          </p>
        </div>

        {/* CS:GO Path Section */}
        <div className="flex flex-col gap-4 border-t pt-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="csgo-path" className="text-sm font-medium">
              CS:GO Installation Path
            </label>
            <div className="flex gap-2">
              <input
                id="csgo-path"
                type="text"
                value={csgoPath || ''}
                onChange={(e) => setCsgoPath(e.target.value)}
                placeholder="C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\csgo\\"
                className="flex-1 px-3 py-2 rounded-md border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button onClick={detectCSGOPath} disabled={isDetecting} variant="outline">
                {isDetecting ? 'Detecting...' : 'Auto-Detect'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The path should point to your CS:GO csgo folder (e.g., ...\\Counter-Strike Global Offensive\\csgo)
            </p>
          </div>

          {message && (
            <div
              className={`p-3 rounded-md ${
                message.type === 'success'
                  ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                  : 'bg-red-500/20 text-red-600 dark:text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={saveCSGOPath} disabled={isSaving || !csgoPath}>
              {isSaving ? 'Saving...' : 'Save Path'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
