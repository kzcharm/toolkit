import { Socket } from 'net'
import { handle } from '@/lib/main/shared'

/**
 * Ping a server by attempting a TCP connection and measuring the time
 * @param host - Server hostname or IP address
 * @param port - Server port
 * @returns Ping time in milliseconds, or null if connection failed
 */
async function pingServer(host: string, port: number): Promise<{ ping: number | null; error: string | null }> {
  return new Promise((resolve) => {
    const socket = new Socket()
    const startTime = Date.now()
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        socket.destroy()
        resolve({ ping: null, error: 'Connection timeout' })
      }
    }, 5000) // 5 second timeout

    socket.once('connect', () => {
      const pingTime = Date.now() - startTime
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        socket.destroy()
        resolve({ ping: pingTime, error: null })
      }
    })

    socket.once('error', (err) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve({ ping: null, error: err.message })
      }
    })

    try {
      socket.connect(port, host)
    } catch (err) {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve({ ping: null, error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }
  })
}

export const registerPingHandlers = () => {
  handle('pingServer', async ({ host, port }) => {
    return await pingServer(host, port)
  })
}
