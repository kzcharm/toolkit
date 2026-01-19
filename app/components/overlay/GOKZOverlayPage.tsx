import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

declare global {
  interface Window {
    conveyor: {
      gsi: {
        startServer: () => Promise<{ success: boolean; port: number | null; error?: string }>
        stopServer: () => Promise<{ success: boolean }>
        getStatus: () => Promise<{ running: boolean; port: number | null; lastDataReceived: number | null }>
        getGameState: () => Promise<any>
        checkCSGORunning: () => Promise<{ running: boolean; processName: string | null }>
      }
      overlay: {
        startServer: () => Promise<{ success: boolean; port: number | null; url: string | null; error?: string }>
        stopServer: () => Promise<{ success: boolean }>
        getStatus: () => Promise<{ running: boolean; port: number | null; url: string | null }>
      }
      settings: {
        getOverlayEnabled: () => Promise<boolean>
        setOverlayEnabled: (enabled: boolean) => Promise<void>
      }
    }
  }
}

interface GameState {
  provider?: {
    name?: string
  }
  map?: {
    name?: string
  }
  player?: {
    name?: string
    match_stats?: {
      score?: number
    }
  }
}

export default function GOKZOverlayPage() {
  const [csgoRunning, setCsgoRunning] = useState(false)
  const [csgoProcessName, setCsgoProcessName] = useState<string | null>(null)
  const [gsiRunning, setGsiRunning] = useState(false)
  const [gsiPort, setGsiPort] = useState<number | null>(null)
  const [lastDataReceived, setLastDataReceived] = useState<number | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [overlayRunning, setOverlayRunning] = useState(false)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [isToggling, setIsToggling] = useState(false)
  const [copied, setCopied] = useState(false)

  // Load initial status (no auto-start)
  useEffect(() => {
    loadStatus()
    
    // Poll for status updates every 2 seconds
    const interval = setInterval(async () => {
      await loadStatus()
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      // Check CS:GO running status
      const csgoStatus = await window.conveyor.gsi.checkCSGORunning()
      setCsgoRunning(csgoStatus.running)
      setCsgoProcessName(csgoStatus.processName)

      // Check GSI server status
      const gsiStatus = await window.conveyor.gsi.getStatus()
      setGsiRunning(gsiStatus.running)
      setGsiPort(gsiStatus.port)
      setLastDataReceived(gsiStatus.lastDataReceived)

      // Get latest game state
      if (gsiStatus.running) {
        const state = await window.conveyor.gsi.getGameState()
        setGameState(state)
      }

      // Check overlay server status
      const overlayStatus = await window.conveyor.overlay.getStatus()
      setOverlayRunning(overlayStatus.running)
      setOverlayUrl(overlayStatus.url)
    } catch (error) {
      console.error('Error loading status:', error)
    }
  }

  const handleToggleServices = async (enabled: boolean) => {
    setIsToggling(true)
    try {
      if (enabled) {
        // Start both services
        const gsiResult = await window.conveyor.gsi.startServer()
        if (gsiResult.success) {
          // Wait a bit for GSI to start
          await new Promise(resolve => setTimeout(resolve, 500))
          const overlayResult = await window.conveyor.overlay.startServer()
          if (overlayResult.success) {
            await window.conveyor.settings.setOverlayEnabled(true)
            await loadStatus()
          } else {
            console.error('Failed to start overlay server:', overlayResult.error)
            // Stop GSI if overlay failed
            await window.conveyor.gsi.stopServer()
          }
        } else {
          console.error('Failed to start GSI server:', gsiResult.error)
        }
      } else {
        // Stop both services
        await window.conveyor.overlay.stopServer()
        await window.conveyor.gsi.stopServer()
        await window.conveyor.settings.setOverlayEnabled(false)
        setOverlayRunning(false)
        setOverlayUrl(null)
        setGsiRunning(false)
        setGsiPort(null)
        setLastDataReceived(null)
        setGameState(null)
      }
    } catch (error) {
      console.error('Error toggling services:', error)
    } finally {
      setIsToggling(false)
    }
  }

  const handleCopyLink = async () => {
    if (overlayUrl) {
      try {
        await navigator.clipboard.writeText(overlayUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (error) {
        console.error('Error copying link:', error)
      }
    }
  }

  const isReceivingData = lastDataReceived !== null && Date.now() - lastDataReceived < 10000 // 10 seconds threshold

  return (
    <div className="flex flex-col gap-6 p-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-2">GOKZ Overlay</h1>
        <p className="text-muted-foreground">Monitor CS:GO game state integration</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Server Controls */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              onClick={() => handleToggleServices(!gsiRunning || !overlayRunning)}
              disabled={isToggling}
              variant={gsiRunning && overlayRunning ? 'destructive' : 'default'}
              className="flex-1"
            >
              {isToggling
                ? 'Starting...'
                : gsiRunning && overlayRunning
                  ? 'Stop Overlay'
                  : 'Start Overlay'}
            </Button>
            <Button onClick={loadStatus} variant="outline">
              Refresh Status
            </Button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CS:GO Running Status */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">CS:GO Status</h3>
              <Badge variant={csgoRunning ? 'default' : 'destructive'}>
                {csgoRunning ? 'Running' : 'Not Running'}
              </Badge>
            </div>
            {csgoRunning && csgoProcessName && (
              <p className="text-xs text-muted-foreground">Process: {csgoProcessName}</p>
            )}
          </div>

          {/* GSI Server Status */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">GSI Server</h3>
              <Badge variant={gsiRunning ? 'default' : 'destructive'}>
                {gsiRunning ? 'Running' : 'Stopped'}
              </Badge>
            </div>
            {gsiRunning && gsiPort && (
              <p className="text-xs text-muted-foreground">Port: {gsiPort}</p>
            )}
          </div>
        </div>

        {/* Overlay Server Status */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Stream Overlay</h3>
            <Badge variant={overlayRunning ? 'default' : 'destructive'}>
              {overlayRunning ? 'Running' : 'Stopped'}
            </Badge>
          </div>
          {overlayRunning && overlayUrl && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Available URLs:</p>
              <div className="flex flex-col gap-2">
                <a
                  href={`${overlayUrl}/progress?color=red`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:text-blue-700 underline cursor-pointer"
                >
                  {overlayUrl}/progress?color=red
                </a>
                <a
                  href={`${overlayUrl}/map?pb=true&wr=true&show_pts=true`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:text-blue-700 underline cursor-pointer"
                >
                  {overlayUrl}/map?pb=true&wr=true&show_pts=true
                </a>
              </div>
            </div>
          )}
        </div>

        {/* GSI Connection Status */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">GSI Connection</h3>
            <Badge variant={isReceivingData ? 'default' : 'outline'}>
              {isReceivingData ? 'Receiving Data' : 'No Data'}
            </Badge>
          </div>
          {lastDataReceived && (
            <p className="text-xs text-muted-foreground">
              Last update: {new Date(lastDataReceived).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Game State Information */}
        {gameState && (
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-4">Game State</h3>
            <div className="flex flex-col gap-3">
              {gameState.player?.name && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Player Name</p>
                  <p className="text-sm font-medium">{gameState.player.name}</p>
                </div>
              )}
              {gameState.map?.name && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Current Map</p>
                  <p className="text-sm font-medium">{gameState.map.name}</p>
                </div>
              )}
              {gameState.provider?.name && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Provider</p>
                  <p className="text-sm font-medium">{gameState.provider.name}</p>
                </div>
              )}
              {typeof gameState.player?.match_stats?.score === 'number' && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Progress</p>
                  <p className="text-sm font-medium">
                    {Math.max(0, Math.min(100, gameState.player.match_stats.score / 10)).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="border rounded-lg p-4 bg-muted/50">
          <h3 className="text-sm font-medium mb-2">Instructions</h3>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Make sure CS:GO is running</li>
            <li>Click "Start Overlay" to start both GSI and Overlay servers</li>
            <li>The config file will be automatically written to your CS:GO cfg folder</li>
            <li>Restart CS:GO if needed for the GSI config to take effect</li>
            <li>Game state data will appear here once CS:GO starts sending data</li>
            <li>Your preference will be saved and restored when you return</li>
            <li>Copy the overlay URL and use it in OBS or your streaming software</li>
            <li>The overlay shows your match score progress as a percentage</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
