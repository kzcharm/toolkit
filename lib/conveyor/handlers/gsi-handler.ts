import { handle } from '@/lib/main/shared'
import { GSIServer } from '@/lib/main/gsi-server'
import * as fs from 'fs-extra'
import * as path from 'path'
import { app } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Singleton GSI server instance
let gsiServer: GSIServer | null = null

function getGSIServer(): GSIServer {
  if (!gsiServer) {
    gsiServer = new GSIServer()
  }
  return gsiServer
}

export function getGSIServerInstance(): GSIServer | null {
  return gsiServer
}

/**
 * Check if CS:GO/CS2 is running by checking for process names
 */
async function checkCSGORunning(): Promise<{ running: boolean; processName: string | null }> {
  try {
    if (process.platform === 'win32') {
      // Use tasklist on Windows
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq csgo.exe" /FO CSV')
      if (stdout.includes('csgo.exe')) {
        return { running: true, processName: 'csgo.exe' }
      }

      // Check for CS2
      const { stdout: cs2Stdout } = await execAsync('tasklist /FI "IMAGENAME eq cs2.exe" /FO CSV')
      if (cs2Stdout.includes('cs2.exe')) {
        return { running: true, processName: 'cs2.exe' }
      }

      return { running: false, processName: null }
    } else {
      // Use ps on Unix-like systems
      try {
        await execAsync('pgrep -f csgo')
        return { running: true, processName: 'csgo' }
      } catch {
        try {
          await execAsync('pgrep -f cs2')
          return { running: true, processName: 'cs2' }
        } catch {
          return { running: false, processName: null }
        }
      }
    }
  } catch (error) {
    console.error('Error checking CS:GO process:', error)
    return { running: false, processName: null }
  }
}

/**
 * Get CS:GO path from settings
 */
async function getCSGOPath(): Promise<string | null> {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json')
    if (await fs.pathExists(settingsPath)) {
      const content = await fs.readFile(settingsPath, 'utf-8')
      const settings = JSON.parse(content)
      return settings.csgoPath || null
    }
  } catch (error) {
    console.error('Error reading CS:GO path from settings:', error)
  }
  return null
}

/**
 * Save GSI auto-start preference
 */
async function saveGsiAutoStart(enabled: boolean): Promise<void> {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json')
    let settings: { gsiAutoStart?: boolean; [key: string]: unknown } = {}
    if (await fs.pathExists(settingsPath)) {
      const content = await fs.readFile(settingsPath, 'utf-8')
      settings = JSON.parse(content)
    }
    settings.gsiAutoStart = enabled
    await fs.ensureDir(path.dirname(settingsPath))
    await fs.writeJSON(settingsPath, settings, { spaces: 2 })
  } catch (error) {
    console.error('Error saving GSI auto-start preference:', error)
  }
}

/**
 * Check if GSI config file matches template (throttle and URI)
 */
async function checkGSIConfigMatches(port: number): Promise<{ matches: boolean; message: string }> {
  try {
    const csgoPath = await getCSGOPath()
    if (!csgoPath) {
      return {
        matches: false,
        message: 'CS:GO path not set.',
      }
    }

    // Get template path
    const appPath = app.getAppPath()
    const templatePath = path.join(appPath, 'resources', 'gsi', 'gamestate_integration_gokz_overlay.cfg')
    
    let templateExists = await fs.pathExists(templatePath)
    let actualTemplatePath = templatePath
    
    if (!templateExists) {
      const fallbackPath = path.join(__dirname, '../../../resources/gsi/gamestate_integration_gokz_overlay.cfg')
      if (await fs.pathExists(fallbackPath)) {
        actualTemplatePath = fallbackPath
        templateExists = true
      }
    }
    
    if (!templateExists) {
      return {
        matches: false,
        message: 'Template not found.',
      }
    }

    // Read template
    const templateContent = await fs.readFile(actualTemplatePath, 'utf-8')
    
    // Extract throttle value from template
    const throttleRegex = /"throttle"\s+"([^"]+)"/i
    const throttleMatch = templateContent.match(throttleRegex)
    const expectedThrottle = throttleMatch ? throttleMatch[1] : null

    // Check if config file exists
    const cleanPath = csgoPath.endsWith(path.sep) ? csgoPath.slice(0, -1) : csgoPath
    const configFilePath = path.join(cleanPath, 'cfg', 'gamestate_integration_gokz_overlay.cfg')
    
    if (!(await fs.pathExists(configFilePath))) {
      return {
        matches: false,
        message: 'Config file does not exist.',
      }
    }

    // Read existing config
    const existingContent = await fs.readFile(configFilePath, 'utf-8')
    
    // Check URI matches
    const uriRegex = /"uri"\s+"([^"]+)"/i
    const uriMatch = existingContent.match(uriRegex)
    const existingUri = uriMatch ? uriMatch[1] : null
    const expectedUri = `http://localhost:${port}/`
    
    if (existingUri !== expectedUri) {
      return {
        matches: false,
        message: `URI mismatch: expected ${expectedUri}, found ${existingUri}`,
      }
    }

    // Check throttle matches
    if (expectedThrottle) {
      const existingThrottleMatch = existingContent.match(throttleRegex)
      const existingThrottle = existingThrottleMatch ? existingThrottleMatch[1] : null
      
      if (existingThrottle !== expectedThrottle) {
        return {
          matches: false,
          message: `Throttle mismatch: expected ${expectedThrottle}, found ${existingThrottle}`,
        }
      }
    }

    return {
      matches: true,
      message: 'Config file matches template.',
    }
  } catch (error) {
    return {
      matches: false,
      message: `Error checking config: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Write GSI config file to CS:GO cfg folder
 */
async function writeGSIConfig(port: number): Promise<{ success: boolean; message: string }> {
  try {
    const csgoPath = await getCSGOPath()
    if (!csgoPath) {
      return {
        success: false,
        message: 'CS:GO path not set. Please set it in settings first.',
      }
    }

    // Read template config - use app.getAppPath() for proper path resolution
    // In development: points to project root
    // In production: points to app.asar or app directory
    const appPath = app.getAppPath()
    const templatePath = path.join(appPath, 'resources', 'gsi', 'gamestate_integration_gokz_overlay.cfg')
    
    // Fallback: try relative to __dirname (for compiled output)
    let templateExists = await fs.pathExists(templatePath)
    let actualTemplatePath = templatePath
    
    if (!templateExists) {
      const fallbackPath = path.join(__dirname, '../../../resources/gsi/gamestate_integration_gokz_overlay.cfg')
      if (await fs.pathExists(fallbackPath)) {
        actualTemplatePath = fallbackPath
        templateExists = true
      }
    }
    
    if (!templateExists) {
      return {
        success: false,
        message: `GSI config template not found at ${templatePath} or fallback location.`,
      }
    }

    let configContent = await fs.readFile(actualTemplatePath, 'utf-8')

    // Replace URI with actual port
    const uriRegex = /"uri"\s+"([^"]+)"/i
    const newUri = `http://localhost:${port}/`
    configContent = configContent.replace(uriRegex, `"uri" "${newUri}"`)

    // Ensure cfg directory exists
    const cleanPath = csgoPath.endsWith(path.sep) ? csgoPath.slice(0, -1) : csgoPath
    const cfgPath = path.join(cleanPath, 'cfg')
    await fs.ensureDir(cfgPath)

    // Write config file
    const configFilePath = path.join(cfgPath, 'gamestate_integration_gokz_overlay.cfg')
    await fs.writeFile(configFilePath, configContent, 'utf-8')

    return {
      success: true,
      message: `GSI config written to ${configFilePath}`,
    }
  } catch (error) {
    return {
      success: false,
      message: `Error writing GSI config: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export const registerGsiHandlers = () => {
  // Start GSI server
  handle('gsi:start-server', async () => {
    try {
      const server = getGSIServer()
      const port = await server.start(3000, 3100)
      
      // Write config file after server starts
      const writeResult = await writeGSIConfig(port)
      if (!writeResult.success) {
        console.warn('Failed to write GSI config:', writeResult.message)
      }

      // Save auto-start preference
      await saveGsiAutoStart(true)

      return {
        success: true,
        port,
        error: writeResult.success ? undefined : writeResult.message,
      }
    } catch (error) {
      return {
        success: false,
        port: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  // Stop GSI server
  handle('gsi:stop-server', async () => {
    try {
      const server = getGSIServer()
      server.stop()
      
      // Clear auto-start preference when manually stopped
      await saveGsiAutoStart(false)
      
      return { success: true }
    } catch (error) {
      console.error('Error stopping GSI server:', error)
      return { success: false }
    }
  })

  // Get server status
  handle('gsi:get-status', async () => {
    const server = getGSIServer()
    return server.getStatus()
  })

  // Get latest game state
  handle('gsi:get-game-state', async () => {
    const server = getGSIServer()
    return server.getGameState()
  })

  // Write config file
  handle('gsi:write-config', async () => {
    const server = getGSIServer()
    const status = server.getStatus()
    
    if (!status.running || !status.port) {
      return {
        success: false,
        message: 'GSI server is not running. Please start it first.',
        port: null,
      }
    }

    const result = await writeGSIConfig(status.port)
    return {
      ...result,
      port: status.port,
    }
  })

  // Check if CS:GO is running
  handle('gsi:check-csgo-running', async () => {
    return await checkCSGORunning()
  })

  // Check if GSI config matches template
  handle('gsi:check-config', async () => {
    const server = getGSIServer()
    const status = server.getStatus()
    
    if (!status.running || !status.port) {
      return {
        matches: false,
        message: 'GSI server is not running.',
        port: null,
      }
    }

    const result = await checkGSIConfigMatches(status.port)
    return {
      ...result,
      port: status.port,
    }
  })
}

// Export functions for use in other handlers
export async function verifyAndUpdateGSIConfig(port: number): Promise<{ success: boolean; message: string }> {
  const checkResult = await checkGSIConfigMatches(port)
  if (!checkResult.matches) {
    // Config doesn't match, update it
    return await writeGSIConfig(port)
  }
  return {
    success: true,
    message: checkResult.message,
  }
}

/**
 * Auto-start GSI server if preference is enabled
 * Also starts overlay if overlayEnabled is true
 */
export async function autoStartGsiIfEnabled(): Promise<void> {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json')
    if (await fs.pathExists(settingsPath)) {
      const content = await fs.readFile(settingsPath, 'utf-8')
      const settings = JSON.parse(content)
      
      if (settings.gsiAutoStart === true) {
        const server = getGSIServer()
        const status = server.getStatus()
        
        // Only start if not already running
        if (!status.running) {
          console.log('Auto-starting GSI server...')
          const port = await server.start(3000, 3100)
          
          // Write config file after server starts
          const writeResult = await writeGSIConfig(port)
          if (!writeResult.success) {
            console.warn('Failed to write GSI config during auto-start:', writeResult.message)
          } else {
            console.log('GSI server auto-started on port', port)
          }

          // Also auto-start overlay if it was previously enabled
          if (settings.overlayEnabled === true) {
            // Import overlay server dynamically to avoid circular dependencies
            const { getOverlayServer } = await import('@/lib/main/overlay-server')
            const overlayServer = getOverlayServer()
            const overlayStatus = overlayServer.getStatus()
            
            if (!overlayStatus.running) {
              try {
                // Wait a bit for GSI to fully initialize
                await new Promise(resolve => setTimeout(resolve, 500))
                
                const overlayPort = await overlayServer.start(server, 4000, 4100)
                console.log('Overlay server auto-started on port', overlayPort)
              } catch (error) {
                console.warn('Failed to auto-start overlay server:', error)
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error during GSI auto-start:', error)
    // Don't throw - auto-start failure shouldn't prevent app from starting
  }
}
