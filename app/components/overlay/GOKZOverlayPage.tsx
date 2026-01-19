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
  }
}

export default function GOKZOverlayPage() {
  const [csgoRunning, setCsgoRunning] = useState(false)
  const [csgoProcessName, setCsgoProcessName] = useState<string | null>(null)
  const [gsiRunning, setGsiRunning] = useState(false)
  const [gsiPort, setGsiPort] = useState<number | null>(null)
  const [lastDataReceived, setLastDataReceived] = useState<number | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)

  // Load initial status and auto-start server
  useEffect(() => {
    const initialize = async () => {
      await loadStatus()
      // Auto-start GSI server if not running
      const status = await window.conveyor.gsi.getStatus()
      if (!status.running && !isStarting) {
        await handleStartServer()
      }
    }
    initialize()
    
    // Poll for status updates every 2 seconds
    const interval = setInterval(loadStatus, 2000)
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
    } catch (error) {
      console.error('Error loading status:', error)
    }
  }

  const handleStartServer = async () => {
    setIsStarting(true)
    try {
      const result = await window.conveyor.gsi.startServer()
      if (result.success) {
        setGsiRunning(true)
        setGsiPort(result.port)
        await loadStatus()
      } else {
        console.error('Failed to start GSI server:', result.error)
      }
    } catch (error) {
      console.error('Error starting GSI server:', error)
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopServer = async () => {
    setIsStopping(true)
    try {
      await window.conveyor.gsi.stopServer()
      setGsiRunning(false)
      setGsiPort(null)
      setLastDataReceived(null)
      setGameState(null)
    } catch (error) {
      console.error('Error stopping GSI server:', error)
    } finally {
      setIsStopping(false)
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
            </div>
          </div>
        )}

        {/* Server Controls */}
        <div className="flex gap-2">
          <Button
            onClick={handleStartServer}
            disabled={gsiRunning || isStarting}
            variant={gsiRunning ? 'outline' : 'default'}
          >
            {isStarting ? 'Starting...' : 'Start GSI Server'}
          </Button>
          <Button
            onClick={handleStopServer}
            disabled={!gsiRunning || isStopping}
            variant="outline"
          >
            {isStopping ? 'Stopping...' : 'Stop GSI Server'}
          </Button>
          <Button onClick={loadStatus} variant="outline">
            Refresh Status
          </Button>
        </div>

        {/* Instructions */}
        <div className="border rounded-lg p-4 bg-muted/50">
          <h3 className="text-sm font-medium mb-2">Instructions</h3>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Make sure CS:GO is running</li>
            <li>Start the GSI server using the button above</li>
            <li>The config file will be automatically written to your CS:GO cfg folder</li>
            <li>Restart CS:GO if needed for the GSI config to take effect</li>
            <li>Game state data will appear here once CS:GO starts sending data</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
