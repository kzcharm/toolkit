import { BrowserWindow, shell, app } from 'electron'
import { join } from 'path'
import appIcon from '@/resources/build/icon.png?asset'
import { registerResourcesProtocol } from './protocols'
import { registerWindowHandlers } from '@/lib/conveyor/handlers/window-handler'
import { registerAppHandlers } from '@/lib/conveyor/handlers/app-handler'
import { registerSettingsHandlers } from '@/lib/conveyor/handlers/settings-handler'
import { registerGsiHandlers, autoStartGsiIfEnabled } from '@/lib/conveyor/handlers/gsi-handler'
import { registerOverlayHandlers } from '@/lib/conveyor/handlers/overlay-handler'
import { registerPingHandlers } from '@/lib/conveyor/handlers/ping-handler'

export function createAppWindow(): void {
  // Register custom protocol for resources
  registerResourcesProtocol()

  // Create the main window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    backgroundColor: '#1c1c1c',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'GOKZ.TOP Toolkit',
    maximizable: false,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
  })

  // Register IPC events for the main window.
  registerWindowHandlers(mainWindow)
  registerAppHandlers(app)
  registerSettingsHandlers()
  registerGsiHandlers()
  registerOverlayHandlers()
  registerPingHandlers()

  // Auto-start GSI server if preference is enabled
  autoStartGsiIfEnabled().catch((error) => {
    console.error('Failed to auto-start GSI:', error)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
