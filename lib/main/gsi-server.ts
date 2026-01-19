import * as http from 'http'
import { EventEmitter } from 'events'

export interface GSIGameState {
  provider?: {
    name?: string
    appid?: number
    version?: number
    steamid?: string
    timestamp?: number
  }
  map?: {
    name?: string
    phase?: string
    round?: number
    team_ct?: {
      score?: number
      timeouts_remaining?: number
      matches_won_this_series?: number
    }
    team_t?: {
      score?: number
      timeouts_remaining?: number
      matches_won_this_series?: number
    }
    num_matches_to_win_series?: number
    current_spectators?: number
    souvenirs_total?: number
    round_wins?: {
      [key: string]: string
    }
  }
  player?: {
    steamid?: string
    name?: string
    observer_slot?: number
    team?: string
    activity?: string
    clan?: string
    state?: {
      health?: number
      armor?: number
      helmet?: boolean
      flashed?: number
      burning?: number
      money?: number
      round_kills?: number
      round_killhs?: number
      round_totaldmg?: number
    }
    match_stats?: {
      kills?: number
      assists?: number
      deaths?: number
      mvps?: number
      score?: number
    }
    weapons?: {
      [key: string]: {
        name?: string
        paintkit?: string
        type?: string
        state?: string
        ammo_clip?: number
        ammo_clip_max?: number
        ammo_reserve?: number
      }
    }
    position?: string
  }
  allplayers?: {
    [key: string]: {
      name?: string
      observer_slot?: number
      team?: string
      state?: {
        health?: number
        armor?: number
        helmet?: boolean
        flashed?: number
        burning?: number
        money?: number
        round_kills?: number
        round_killhs?: number
        round_totaldmg?: number
      }
      match_stats?: {
        kills?: number
        assists?: number
        deaths?: number
        mvps?: number
        score?: number
      }
      weapons?: {
        [key: string]: {
          name?: string
          paintkit?: string
          type?: string
          state?: string
          ammo_clip?: number
          ammo_clip_max?: number
          ammo_reserve?: number
        }
      }
      position?: string
    }
  }
  round?: {
    phase?: string
    win_team?: string
    bomb?: string
  }
  bomb?: {
    state?: string
    position?: string
    player?: string
  }
  phase_countdowns?: {
    phase?: string
    phase_ends_in?: string
  }
}

export class GSIServer extends EventEmitter {
  private server: http.Server | null = null
  private port: number | null = null
  private isRunning = false
  private latestGameState: GSIGameState | null = null
  private lastDataReceived: number | null = null

  async start(startPort: number = 3000, maxPort: number = 3100): Promise<number> {
    if (this.isRunning && this.port) {
      return this.port
    }

    for (let port = startPort; port <= maxPort; port++) {
      try {
        await this.tryStartServer(port)
        this.port = port
        this.isRunning = true
        this.emit('started', port)
        return port
      } catch (error) {
        if (port === maxPort) {
          throw new Error(`Could not find available port between ${startPort} and ${maxPort}`)
        }
        // Continue to next port
      }
    }

    throw new Error('Failed to start GSI server')
  }

  private tryStartServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        // Handle CORS
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }

        if (req.method === 'POST') {
          let body = ''

          req.on('data', (chunk) => {
            body += chunk.toString()
          })

          req.on('end', () => {
            try {
              const gameState: GSIGameState = JSON.parse(body)
              this.latestGameState = gameState
              this.lastDataReceived = Date.now()
              this.emit('data', gameState)
              
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true }))
            } catch (error) {
              console.error('Error parsing GSI data:', error)
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }))
            }
          })
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Method not allowed' }))
        }
      })

      server.listen(port, () => {
        this.server = server
        resolve()
      })

      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`))
        } else {
          reject(error)
        }
      })
    })
  }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
    this.isRunning = false
    this.port = null
    this.emit('stopped')
  }

  getStatus(): {
    running: boolean
    port: number | null
    lastDataReceived: number | null
  } {
    return {
      running: this.isRunning,
      port: this.port,
      lastDataReceived: this.lastDataReceived,
    }
  }

  getGameState(): GSIGameState | null {
    return this.latestGameState
  }

  getPort(): number | null {
    return this.port
  }
}
