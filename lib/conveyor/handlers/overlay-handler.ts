import { handle } from '@/lib/main/shared'
import { getOverlayServer } from '@/lib/main/overlay-server'
import { getGSIServerInstance, verifyAndUpdateGSIConfig } from './gsi-handler'

export const registerOverlayHandlers = () => {
  const overlayServer = getOverlayServer()

  // Start overlay server
  handle('overlay:start-server', async () => {
    try {
      const gsiServer = getGSIServerInstance()
      if (!gsiServer) {
        return {
          success: false,
          port: null,
          url: null,
          error: 'GSI server is not running. Please start GSI server first.',
        }
      }

      // Verify and update GSI config file matches template before starting overlay
      const gsiStatus = gsiServer.getStatus()
      if (gsiStatus.running && gsiStatus.port) {
        const configResult = await verifyAndUpdateGSIConfig(gsiStatus.port)
        if (!configResult.success) {
          console.warn('GSI config verification/update failed:', configResult.message)
        }
      }

      const port = await overlayServer.start(gsiServer, 4000, 4100)
      const status = overlayServer.getStatus()

      return {
        success: true,
        port,
        url: status.url,
        error: undefined,
      }
    } catch (error) {
      return {
        success: false,
        port: null,
        url: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  // Stop overlay server
  handle('overlay:stop-server', async () => {
    try {
      overlayServer.stop()
      return { success: true }
    } catch (error) {
      console.error('Error stopping overlay server:', error)
      return { success: false }
    }
  })

  // Get overlay server status
  handle('overlay:get-status', async () => {
    const status = overlayServer.getStatus()
    return status
  })
}
