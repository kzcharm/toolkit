import { useEffect, useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { useConveyor } from '@/app/hooks/use-conveyor'
import { FolderOpen, Play, Settings, Copy, Check } from 'lucide-react'

export default function ServerSetupPage() {
  const settingsApi = useConveyor('settings')
  const [steamCmdDir, setSteamCmdDir] = useState<string | null>(null)
  const [csgoPath, setCsgoPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState<string>('')
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [localIP, setLocalIP] = useState<string>('127.0.0.1')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadPaths()
    loadLocalIP()
  }, [])

  const loadLocalIP = async () => {
    try {
      const ip = await settingsApi.getLocalIP()
      if (ip) {
        setLocalIP(ip)
      }
    } catch (error) {
      console.error('Error loading local IP:', error)
    }
  }

  const loadPaths = async () => {
    try {
      setIsLoading(true)
      const [steamCmd, csgo] = await Promise.all([
        settingsApi.getSteamCmdDir(),
        settingsApi.getCSGOPath(),
      ])
      setSteamCmdDir(steamCmd)
      setCsgoPath(csgo)

      // Auto-derive SteamCMD directory from CS:GO path if not set
      if (!steamCmd && csgo) {
        const derivedPath = deriveSteamCmdDir(csgo)
        setSteamCmdDir(derivedPath)
      }
    } catch (error) {
      console.error('Error loading paths:', error)
      setMessage({ type: 'error', text: 'Failed to load configuration' })
    } finally {
      setIsLoading(false)
    }
  }

  const deriveSteamCmdDir = (csgoPath: string): string => {
    // Remove trailing slash if present
    const cleanPath = csgoPath.endsWith('\\') || csgoPath.endsWith('/') 
      ? csgoPath.slice(0, -1) 
      : csgoPath
    
    // Go up one level from csgo folder and add \server
    const lastSlash = Math.max(cleanPath.lastIndexOf('\\'), cleanPath.lastIndexOf('/'))
    if (lastSlash === -1) {
      // No parent directory found, use root
      return `${cleanPath}\\server`
    }
    const parentPath = cleanPath.substring(0, lastSlash)
    return `${parentPath}\\server`
  }

  const handleBrowseFolder = async () => {
    try {
      const selectedPath = await settingsApi.showFolderDialog()
      if (selectedPath) {
        setSteamCmdDir(selectedPath)
        await settingsApi.setSteamCmdDir(selectedPath)
        setMessage({ type: 'success', text: 'SteamCMD directory updated' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      setMessage({ type: 'error', text: 'Failed to select folder' })
    }
  }

  const handleSaveSteamCmdDir = async () => {
    if (!steamCmdDir) return
    
    try {
      await settingsApi.setSteamCmdDir(steamCmdDir)
      setMessage({ type: 'success', text: 'SteamCMD directory saved' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Error saving SteamCMD directory:', error)
      setMessage({ type: 'error', text: 'Failed to save SteamCMD directory' })
    }
  }

  const handleRunScript = async () => {
    if (!steamCmdDir || !csgoPath) {
      setMessage({ type: 'error', text: 'Please set both SteamCMD directory and CS:GO path' })
      return
    }

    setIsRunning(true)
    setOutput('')
    setMessage(null)

    try {
      const result = await settingsApi.runGokzScript(steamCmdDir, csgoPath)
      setOutput(result.output || '')
      
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Script executed successfully' })
      } else {
        setMessage({ type: 'error', text: result.message || 'Script execution failed' })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      setOutput(errorMessage)
      setMessage({ type: 'error', text: `Failed to run script: ${errorMessage}` })
    } finally {
      setIsRunning(false)
    }
  }

  const handleCopyConnectCommand = async () => {
    const connectCommand = `connect ${localIP}:27015`
    try {
      await navigator.clipboard.writeText(connectCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      setMessage({ type: 'error', text: 'Failed to copy connect command' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading configuration...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">GOKZ Server Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and run the GOKZ server installation script
        </p>
      </div>

      {/* Configuration Section */}
      <div className="flex flex-col gap-4 border rounded-lg p-6">
        <h2 className="text-lg font-semibold">Configuration</h2>

        {/* CS:GO Path (Read-only) */}
        <div className="flex flex-col gap-2">
          <label htmlFor="csgo-path" className="text-sm font-medium">
            CS:GO Installation Path
          </label>
          <div className="flex gap-2">
            <input
              id="csgo-path"
              type="text"
              value={csgoPath || ''}
              readOnly
              className="flex-1 px-3 py-2 rounded-md border bg-muted text-muted-foreground cursor-not-allowed"
            />
            <Button
              variant="outline"
              onClick={() => {
                // Note: User should navigate to Settings page manually
                setMessage({ 
                  type: 'info', 
                  text: 'Please navigate to the Settings page to configure CS:GO path' 
                })
                setTimeout(() => setMessage(null), 5000)
              }}
            >
              <Settings className="h-4 w-4 mr-2" />
              Info
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Set this path in the Settings page. This path is used for symlinking game files.
          </p>
        </div>

        {/* SteamCMD Directory */}
        <div className="flex flex-col gap-2">
          <label htmlFor="steamcmd-dir" className="text-sm font-medium">
            SteamCMD Installation Directory
          </label>
          <div className="flex gap-2">
            <input
              id="steamcmd-dir"
              type="text"
              value={steamCmdDir || ''}
              onChange={(e) => setSteamCmdDir(e.target.value)}
              placeholder="C:\\steamcmd"
              className="flex-1 px-3 py-2 rounded-md border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button onClick={handleBrowseFolder} variant="outline">
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Directory where SteamCMD and the CS:GO dedicated server will be installed.
            {csgoPath && !steamCmdDir && ' Auto-set from CS:GO path.'}
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-md ${
              message.type === 'success'
                ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                : message.type === 'error'
                  ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                  : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={handleSaveSteamCmdDir} disabled={!steamCmdDir} variant="outline">
            Save Directory
          </Button>
        </div>
      </div>

      {/* Run Script Section */}
      <div className="flex flex-col gap-4 border rounded-lg p-6">
        <h2 className="text-lg font-semibold">Run Installation Script</h2>
        <p className="text-sm text-muted-foreground">
          This will download and install SteamCMD, set up the CS:GO dedicated server, and install
          MetaMod, SourceMod, MovementAPI, and GOKZ.
        </p>

        <div className="flex justify-end">
          <Button
            onClick={handleRunScript}
            disabled={isRunning || !steamCmdDir || !csgoPath}
            className="min-w-[120px]"
          >
            {isRunning ? (
              <>Running...</>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Setup
              </>
            )}
          </Button>
        </div>

        {/* Output Area */}
        {(output || isRunning) && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Script Output</label>
            <textarea
              readOnly
              value={output || (isRunning ? 'Running script...' : '')}
              className="w-full h-64 px-3 py-2 rounded-md border bg-background text-foreground font-mono text-sm resize-none"
              placeholder="Script output will appear here..."
            />
          </div>
        )}
      </div>

      {/* Connect Command Section */}
      <div className="flex flex-col gap-4 border rounded-lg p-6">
        <h2 className="text-lg font-semibold">Connect to Server</h2>
        <p className="text-sm text-muted-foreground">
          Use this command in CS:GO console to connect to your local server
        </p>
        
        <div className="flex gap-2 items-center">
          <div className="flex-1 px-3 py-2 rounded-md border bg-muted font-mono text-sm">
            connect {localIP}:27015
          </div>
          <Button
            onClick={handleCopyConnectCommand}
            variant="outline"
            size="icon"
            title="Copy connect command"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Default CS:GO server port is 27015. Make sure your server is running before connecting.
        </p>
      </div>
    </div>
  )
}
