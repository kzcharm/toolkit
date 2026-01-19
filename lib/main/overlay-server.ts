import * as http from 'http'
import * as fs from 'fs-extra'
import * as path from 'path'
import { app } from 'electron'
import { GSIServer } from './gsi-server'

export interface OverlayServer {
  start: (gsiServer: GSIServer, startPort?: number, maxPort?: number) => Promise<number>
  stop: () => void
  getStatus: () => { running: boolean; port: number | null; url: string | null }
}

class OverlayServerImpl implements OverlayServer {
  private server: http.Server | null = null
  private port: number | null = null
  private isRunning = false
  private gsiServer: GSIServer | null = null

  async start(
    gsiServer: GSIServer,
    startPort: number = 4000,
    maxPort: number = 4100
  ): Promise<number> {
    if (this.isRunning && this.port) {
      return this.port
    }

    this.gsiServer = gsiServer

    for (let port = startPort; port <= maxPort; port++) {
      try {
        await this.tryStartServer(port)
        this.port = port
        this.isRunning = true
        return port
      } catch (error) {
        if (port === maxPort) {
          throw new Error(`Could not find available port between ${startPort} and ${maxPort}`)
        }
        // Continue to next port
      }
    }

    throw new Error('Failed to start overlay server')
  }

  private tryStartServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          // Handle CORS
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

          if (req.method === 'OPTIONS') {
            res.writeHead(200)
            res.end()
            return
          }

          const url = new URL(req.url || '/', `http://localhost:${port}`)

          // API endpoint to get GSI data
          if (url.pathname === '/api/gsi-data') {
            if (this.gsiServer) {
              const gameState = this.gsiServer.getGameState()
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(gameState || {}))
            } else {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'GSI server not available' }))
            }
            return
          }

          // Serve overlay HTML
          if (url.pathname === '/' || url.pathname === '/index.html') {
            // Serve standalone HTML overlay
            const html = await this.getOverlayHTML()
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(html)
            return
          }

          // Serve static assets (CSS, JS, etc.)
          if (url.pathname.startsWith('/')) {
            const filePath = url.pathname.slice(1)
            const appPath = app.getAppPath()
            let assetPath = path.join(appPath, 'app', 'overlay', filePath)

            if (!(await fs.pathExists(assetPath))) {
              assetPath = path.join(__dirname, '../../app/overlay', filePath)
            }

            if (await fs.pathExists(assetPath)) {
              const content = await fs.readFile(assetPath)
              const ext = path.extname(assetPath).toLowerCase()
              const contentType = this.getContentType(ext)
              res.writeHead(200, { 'Content-Type': contentType })
              res.end(content)
            } else {
              res.writeHead(404, { 'Content-Type': 'text/plain' })
              res.end('Not found')
            }
            return
          }

          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
        } catch (error) {
          console.error('Overlay server error:', error)
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Internal server error')
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

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    }
    return types[ext] || 'application/octet-stream'
  }

  private async getOverlayHTML(): Promise<string> {
    // Return standalone HTML with inline CSS (no dependencies)
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Progress Overlay</title>
  
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }
    
    .container {
      width: 80%;
      max-width: 800px;
      height: 40px;
      margin: 40vh auto 0 auto;
      position: relative;
      background-color: rgba(0, 0, 0, 0.4);
      border: 2px solid rgba(255, 255, 255, 0.15);
      border-radius: 9999px;
      overflow: hidden;
    }
    
    .bar {
      height: 100%;
      background: linear-gradient(to right, #ee657a, #ab3c4c);
      width: 0%;
      transition: width 0.4s ease;
      position: relative;
    }
    
    
    .marker {
      position: absolute;
      top: 50%;
      left: 100%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 5;
      filter: drop-shadow(0 0 4px white);
    }
    
    .marker img {
      height: 48px;
      width: auto;
      object-fit: contain;
    }
    
    .label {
      position: absolute;
      width: 100%;
      top: 0;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: white;
      font-weight: normal;
      text-shadow: 1px 1px 3px black;
      pointer-events: none;
      z-index: 5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="bar" class="bar">
      <div class="marker">
        <img src="https://r2.axekz.com/img/gokz.gif" alt="GOKZ Indicator" />
      </div>
    </div>
    <div id="label" class="label">0%</div>
  </div>

  <script>
    const bar = document.getElementById('bar');
    const label = document.getElementById('label');
    
    const pollGSIData = async () => {
      try {
        const response = await fetch('/api/gsi-data');
        if (response.ok) {
          const data = await response.json();
          const score = data?.player?.match_stats?.score;
          
          if (typeof score === 'number') {
            const adjusted = score / 10;
            const percent = Math.max(0, Math.min(100, adjusted));
            bar.style.width = percent + '%';
            label.textContent = percent.toFixed(1) + '%';
          }
        }
      } catch (error) {
        console.warn('[Overlay] Error fetching GSI data:', error);
      }
    };
    
    // Poll every 100ms for smooth updates
    const interval = setInterval(pollGSIData, 100);
    pollGSIData(); // Initial fetch
  </script>
</body>
</html>`
  }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
    this.isRunning = false
    this.port = null
    this.gsiServer = null
  }

  getStatus(): { running: boolean; port: number | null; url: string | null } {
    return {
      running: this.isRunning,
      port: this.port,
      url: this.port ? `http://localhost:${this.port}` : null,
    }
  }
}

// Singleton instance
let overlayServerInstance: OverlayServerImpl | null = null

export function getOverlayServer(): OverlayServer {
  if (!overlayServerInstance) {
    overlayServerInstance = new OverlayServerImpl()
  }
  return overlayServerInstance
}
