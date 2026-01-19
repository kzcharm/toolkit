import { app, session, net } from 'electron'
import { handle } from '@/lib/main/shared'
import * as fs from 'fs-extra'
import * as path from 'path'
import { promisify } from 'util'

// Use require for native-reg since it's a CommonJS native module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativeReg = require('native-reg')
const { openKey, queryValue, closeKey, HKEY, Access } = nativeReg

// Use require for seek-bzip since it's a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { decode: bzip2Decode } = require('seek-bzip')

const readFile = promisify(fs.readFile)

interface LibraryFolder {
  path: string
  apps: Record<string, string>
}

/**
 * Parse Steam libraryfolders.vdf file
 * Simplified parsing - just extract paths from lines containing "path"
 */
function parseVDF(content: string): Record<string, LibraryFolder> {
  const folders: Record<string, LibraryFolder> = {}
  const lines = content.split('\n')
  let folderIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Look for lines containing "path" followed by a quoted path
    // Format: "path"		"C:\\..." or "path" "C:\\..."
    const pathMatch = line.match(/"path"\s+"([^"]+)"/)
    if (pathMatch) {
      const folderId = folderIndex.toString()
      folders[folderId] = {
        path: pathMatch[1].replace(/\\\\/g, '\\'),
        apps: {},
      }
      folderIndex++
    }
  }

  return folders
}

/**
 * Find CS:GO installation path by checking Steam library folders
 */
async function findCSGOPath(): Promise<string | null> {
  try {
    // Step 1: Check Windows Registry for Steam path
    let steamPath: string | null = null

    // Only try registry on Windows
    if (process.platform === 'win32' && nativeReg && openKey && HKEY) {
      try {
        const key = openKey(HKEY.CURRENT_USER, 'Software\\Valve\\Steam', Access.READ)
        if (key) {
          const steamPathValue = queryValue(key, 'SteamPath')
          if (steamPathValue && typeof steamPathValue === 'string') {
            steamPath = steamPathValue.replace(/\\\\/g, '\\')
          }
          closeKey(key)
        }
      } catch (error) {
        console.warn('Could not read Steam path from registry:', error)
      }
    }

    // Step 2: If registry failed, try common locations
    if (!steamPath) {
      const commonPaths = [
        'C:\\Program Files (x86)\\Steam',
        'C:\\Program Files\\Steam',
        path.join(process.env.USERPROFILE || '', 'Steam'),
      ]

      for (const commonPath of commonPaths) {
        if (await fs.pathExists(commonPath)) {
          steamPath = commonPath
          break
        }
      }
    }

    if (!steamPath) {
      return null
    }

    // Step 3: Read libraryfolders.vdf
    const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
    if (!(await fs.pathExists(libraryFoldersPath))) {
      return null
    }

    const content = await readFile(libraryFoldersPath, 'utf-8')
    const folders = parseVDF(content)

    // Step 4: Search for CS:GO/CS2 in all library folders
    for (const folder of Object.values(folders)) {
      if (!folder.path) continue

      // Check for CS:GO (appid 730) - return the csgo folder
      const csgoBasePath = path.join(folder.path, 'steamapps', 'common', 'Counter-Strike Global Offensive')
      if (await fs.pathExists(csgoBasePath)) {
        // Return the csgo folder path with trailing slash
        const csgoPath = path.join(csgoBasePath, 'csgo')
        if (await fs.pathExists(csgoPath)) {
          return csgoPath + path.sep
        }
        // Fallback to base path if csgo folder doesn't exist
        return csgoBasePath + path.sep
      }

      // Check for CS2 directly (separate installation)
      const cs2Path = path.join(folder.path, 'steamapps', 'common', 'Counter-Strike 2')
      if (await fs.pathExists(cs2Path)) {
        // For separate CS2 installation, return the game/csgo path with trailing slash
        const cs2GamePath = path.join(cs2Path, 'game', 'csgo')
        if (await fs.pathExists(cs2GamePath)) {
          return cs2GamePath + path.sep
        }
        return cs2Path + path.sep
      }
    }

    return null
  } catch (error) {
    console.error('Error detecting CS:GO path:', error)
    return null
  }
}

/**
 * Get settings file path
 */
function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

/**
 * Load settings from disk
 */
async function loadSettings(): Promise<{ csgoPath?: string; theme?: 'dark' | 'light' | 'system'; overlayEnabled?: boolean; gsiAutoStart?: boolean }> {
  const settingsPath = getSettingsPath()
  if (await fs.pathExists(settingsPath)) {
    try {
      const content = await readFile(settingsPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      console.error('Error loading settings:', error)
      return {}
    }
  }
  return {}
}

/**
 * Save settings to disk
 */
async function saveSettings(settings: { csgoPath?: string; theme?: 'dark' | 'light' | 'system'; overlayEnabled?: boolean; gsiAutoStart?: boolean }): Promise<void> {
  const settingsPath = getSettingsPath()
  await fs.ensureDir(path.dirname(settingsPath))
  await fs.writeJSON(settingsPath, settings, { spaces: 2 })
}

/**
 * Get maps cache file path
 */
function getMapsCachePath(): string {
  return path.join(app.getPath('userData'), 'maps-cache.json')
}

/**
 * Load cached maps list
 */
async function loadCachedMaps(): Promise<{ data: unknown[]; timestamp: number } | null> {
  const cachePath = getMapsCachePath()
  if (await fs.pathExists(cachePath)) {
    try {
      const content = await readFile(cachePath, 'utf-8')
      const cache = JSON.parse(content)
      if (cache.data && cache.timestamp && typeof cache.timestamp === 'number') {
        return cache as { data: unknown[]; timestamp: number }
      }
    } catch (error) {
      console.error('Error loading cached maps:', error)
    }
  }
  return null
}

/**
 * Save maps list to cache
 */
async function saveCachedMaps(mapsData: unknown[]): Promise<void> {
  const cachePath = getMapsCachePath()
  const cache = {
    data: mapsData,
    timestamp: Date.now(),
  }
  await fs.ensureDir(path.dirname(cachePath))
  await fs.writeJSON(cachePath, cache, { spaces: 2 })
}

/**
 * Check if cached maps data is still valid (less than 1 day old)
 */
function isCacheValid(timestamp: number): boolean {
  const oneDayInMs = 24 * 60 * 60 * 1000
  const age = Date.now() - timestamp
  return age < oneDayInMs
}

/**
 * Get checked maps cache file path
 */
function getCheckedMapsCachePath(): string {
  return path.join(app.getPath('userData'), 'checked-maps-cache.json')
}

/**
 * Load cached checked maps (maps with status)
 */
async function loadCachedCheckedMaps(): Promise<{ data: unknown[]; timestamp: number } | null> {
  const cachePath = getCheckedMapsCachePath()
  if (await fs.pathExists(cachePath)) {
    try {
      const content = await readFile(cachePath, 'utf-8')
      const cache = JSON.parse(content)
      if (cache.data && cache.timestamp && typeof cache.timestamp === 'number') {
        return cache as { data: unknown[]; timestamp: number }
      }
    } catch (error) {
      console.error('Error loading cached checked maps:', error)
    }
  }
  return null
}

/**
 * Save checked maps (maps with status) to cache
 */
async function saveCachedCheckedMaps(mapsData: unknown[]): Promise<void> {
  const cachePath = getCheckedMapsCachePath()
  const cache = {
    data: mapsData,
    timestamp: Date.now(),
  }
  await fs.ensureDir(path.dirname(cachePath))
  await fs.writeJSON(cachePath, cache, { spaces: 2 })
}

/**
 * Download progress tracking
 */
let downloadProgress = { progress: 0, downloading: false }

/**
 * Package download progress tracking
 */
let packageDownloadProgress = {
  progress: 0,
  downloading: false,
  downloadSpeed: null as number | null,
}

/**
 * Package download cancellation flag
 */
let packageDownloadCancelled = false

/**
 * Bulk download progress tracking
 */
interface MapDownloadProgress {
  mapName: string
  progress: number
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  error: string | null
}

let bulkDownloadProgress: {
  total: number
  completed: number
  failed: number
  maps: MapDownloadProgress[]
  downloading: boolean
  currentMap: string | null
  downloadSpeed: number | null // bytes per second
} = {
  total: 0,
  completed: 0,
  failed: 0,
  maps: [],
  downloading: false,
  currentMap: null,
  downloadSpeed: null,
}

/**
 * Get maps folder path from settings
 */
async function getMapsFolder(): Promise<string | null> {
  const settings = await loadSettings()
  const csgoPath = settings.csgoPath

  if (!csgoPath) {
    return null
  }

  const cleanPath = csgoPath.endsWith(path.sep) ? csgoPath.slice(0, -1) : csgoPath
  return path.join(cleanPath, 'maps')
}

/**
 * Decompress bzip2 file
 */
async function decompressBzip2(inputPath: string, outputPath: string): Promise<void> {
  const compressedData = await fs.readFile(inputPath)
  const decompressedData = bzip2Decode(compressedData)
  await fs.writeFile(outputPath, decompressedData)
  // Remove the compressed file after successful decompression
  await fs.remove(inputPath)
}

/**
 * Download a single map with bz2 support and fallback
 */
async function downloadMapFile(
  mapName: string,
  expectedSize: number,
  mapsFolder: string
): Promise<{ success: boolean; error?: string }> {
  const mapPath = path.join(mapsFolder, `${mapName}.bsp`)
  const mapBz2Path = path.join(mapsFolder, `${mapName}.bsp.bz2`)
  const baseUrl = 'http://r2.axekz.com/csgo/maps'

  // Update progress for this map
  const mapProgress = bulkDownloadProgress.maps.find((m) => m.mapName === mapName)
  if (mapProgress) {
    mapProgress.status = 'downloading'
    mapProgress.progress = 0
  }
  
  // Set as current downloading map
  bulkDownloadProgress.currentMap = mapName
  bulkDownloadProgress.downloadSpeed = null

  // For maps < 150MB, try bz2 first
  if (expectedSize < 150 * 1024 * 1024) {
    try {
      const bz2Url = `${baseUrl}/${mapName}.bsp.bz2`
      const response = await net.fetch(bz2Url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Download bz2 file
      const startTime = Date.now()
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const totalTime = (Date.now() - startTime) / 1000

      // Update progress
      if (mapProgress) {
        mapProgress.progress = 1
      }
      
      // Calculate download speed
      if (totalTime > 0) {
        bulkDownloadProgress.downloadSpeed = buffer.length / totalTime
      }

      // Save compressed file
      await fs.writeFile(mapBz2Path, buffer)

      // Decompress
      await decompressBzip2(mapBz2Path, mapPath)

      // Verify file size
      const stats = await fs.stat(mapPath)
      if (stats.size !== expectedSize) {
        console.warn(`Size mismatch for ${mapName}: expected ${expectedSize}, got ${stats.size}`)
        // Still consider it successful if it's close (within 1MB tolerance)
        if (Math.abs(stats.size - expectedSize) > 1024 * 1024) {
          await fs.remove(mapPath)
          throw new Error(`Size mismatch: expected ${expectedSize}, got ${stats.size}`)
        }
      }

      if (mapProgress) {
        mapProgress.status = 'completed'
        mapProgress.progress = 1
      }
      return { success: true }
    } catch (bz2Error) {
      console.log(`bz2 download failed for ${mapName}, trying .bsp:`, bz2Error)
      // Fall through to try .bsp
    }
  }

  // Download .bsp directly (for >= 150MB or if bz2 failed)
  try {
    const bspUrl = `${baseUrl}/${mapName}.bsp`
    const response = await net.fetch(bspUrl)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    // Download with progress tracking
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10)
    const startTime = Date.now()
    let lastUpdateTime = startTime
    let lastReceivedBytes = 0
    
    // Try to use streaming if available for progress tracking
    let buffer: Buffer
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let receivedBytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        receivedBytes += value.length

        // Update progress
        if (mapProgress && contentLength > 0) {
          mapProgress.progress = receivedBytes / contentLength
        }

        // Calculate download speed (update every 500ms)
        const now = Date.now()
        if (now - lastUpdateTime >= 500) {
          const bytesSinceLastUpdate = receivedBytes - lastReceivedBytes
          const timeSinceLastUpdate = (now - lastUpdateTime) / 1000 // seconds
          if (timeSinceLastUpdate > 0) {
            bulkDownloadProgress.downloadSpeed = bytesSinceLastUpdate / timeSinceLastUpdate
          }
          lastUpdateTime = now
          lastReceivedBytes = receivedBytes
        }
      }

      buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
      
      // Calculate final speed
      const totalTime = (Date.now() - startTime) / 1000
      if (totalTime > 0) {
        bulkDownloadProgress.downloadSpeed = receivedBytes / totalTime
      }
    } else {
      // Fallback to arrayBuffer if streaming not available
      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
      if (mapProgress) {
        mapProgress.progress = 1
      }
      // Calculate speed for non-streaming download
      const totalTime = (Date.now() - startTime) / 1000
      if (totalTime > 0) {
        bulkDownloadProgress.downloadSpeed = buffer.length / totalTime
      }
    }

    await fs.writeFile(mapPath, buffer)

    // Verify file size
    const stats = await fs.stat(mapPath)
    if (expectedSize > 0 && stats.size !== expectedSize) {
      console.warn(`Size mismatch for ${mapName}: expected ${expectedSize}, got ${stats.size}`)
      // Still consider it successful if it's close (within 1MB tolerance)
      if (Math.abs(stats.size - expectedSize) > 1024 * 1024) {
        await fs.remove(mapPath)
        throw new Error(`Size mismatch: expected ${expectedSize}, got ${stats.size}`)
      }
    }

      if (mapProgress) {
        mapProgress.status = 'completed'
        mapProgress.progress = 1
      }
      bulkDownloadProgress.currentMap = null
      bulkDownloadProgress.downloadSpeed = null
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (mapProgress) {
        mapProgress.status = 'failed'
        mapProgress.error = errorMessage
      }
      bulkDownloadProgress.failed++
      bulkDownloadProgress.currentMap = null
      bulkDownloadProgress.downloadSpeed = null
      return { success: false, error: errorMessage }
    }
  }

export const registerSettingsHandlers = () => {
  // Detect CS:GO path automatically
  handle('settings:detect-csgo-path', async () => {
    return await findCSGOPath()
  })

  // Get saved CS:GO path
  handle('settings:get-csgo-path', async () => {
    const settings = await loadSettings()
    return settings.csgoPath || null
  })

  // Set CS:GO path
  handle('settings:set-csgo-path', async (csgoPath: string) => {
    const settings = await loadSettings()
    // Ensure path ends with a trailing slash
    const normalizedPath = csgoPath.endsWith(path.sep) ? csgoPath : csgoPath + path.sep
    settings.csgoPath = normalizedPath
    await saveSettings(settings)
  })

  // Download map
  handle('settings:download-map', async ({ url, mapName }) => {
    try {
      const settings = await loadSettings()
      const csgoPath = settings.csgoPath

      if (!csgoPath) {
        return {
          success: false,
          message: 'CS:GO path not set. Please set it in settings first.',
        }
      }

      // Determine maps folder
      // The csgoPath should already be pointing to the csgo folder (with trailing slash)
      // Remove trailing slash if present, then join with maps
      const cleanPath = csgoPath.endsWith(path.sep) ? csgoPath.slice(0, -1) : csgoPath
      const mapsFolder = path.join(cleanPath, 'maps')

      await fs.ensureDir(mapsFolder)
      const mapPath = path.join(mapsFolder, mapName)

      // Reset progress
      downloadProgress = { progress: 0, downloading: true }

      // Download using Electron's session API
      return new Promise((resolve, reject) => {
        const downloadSession = session.fromPartition('map-downloads')
        let downloadItem: Electron.DownloadItem | null = null
        let resolved = false

        const cleanup = () => {
          downloadSession.removeAllListeners('will-download')
          if (downloadItem) {
            downloadItem.removeAllListeners('updated')
            downloadItem.removeAllListeners('done')
          }
        }

        // Set up the will-download listener BEFORE calling downloadURL
        downloadSession.on('will-download', (event, item) => {
          downloadItem = item
          item.setSavePath(mapPath)

          item.on('updated', (_, state) => {
            if (state === 'progressing') {
              const received = item.getReceivedBytes()
              const total = item.getTotalBytes()
              if (total > 0) {
                downloadProgress.progress = received / total
              }
            }
          })

          item.on('done', (_, state) => {
            if (resolved) return
            resolved = true
            cleanup()

            downloadProgress.downloading = false
            if (state === 'completed') {
              downloadProgress.progress = 1
              resolve({
                success: true,
                message: `Map downloaded successfully to ${mapPath}`,
              })
            } else {
              downloadProgress.progress = 0
              resolve({
                success: false,
                message: `Download failed: ${state}`,
              })
            }
          })
        })

        // Set a timeout in case the download doesn't start
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            cleanup()
            downloadProgress.downloading = false
            downloadProgress.progress = 0
            reject(new Error('Download timeout: The download did not start'))
          }
        }, 30000) // 30 second timeout

        try {
          downloadSession.downloadURL(url)
        } catch (error) {
          clearTimeout(timeout)
          if (!resolved) {
            resolved = true
            cleanup()
            downloadProgress.downloading = false
            downloadProgress.progress = 0
            reject(error)
          }
        }
      })
    } catch (error) {
      downloadProgress.downloading = false
      downloadProgress.progress = 0
      return {
        success: false,
        message: `Error downloading map: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  })

  // Get download progress
  handle('settings:get-download-progress', async () => {
    return downloadProgress
  })

  // Fetch maps list from KZ Timer Global API (with 1-day cache)
  handle('settings:fetch-maps-list', async () => {
    try {
      // Check cache first
      const cached = await loadCachedMaps()
      if (cached && isCacheValid(cached.timestamp)) {
        console.log('Using cached maps list')
        return cached.data
      }

      // Fetch fresh data
      const response = await net.fetch('https://kztimerglobal.com/api/v2.0/maps?is_validated=true&limit=9999')
      if (!response.ok) {
        // If fetch fails but we have cached data (even if expired), return it as fallback
        if (cached) {
          console.log('Fetch failed, using expired cache as fallback')
          return cached.data
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      
      // Save to cache
      await saveCachedMaps(data)
      console.log('Fetched and cached fresh maps list')
      
      return data
    } catch (error) {
      // If we have cached data, return it even if expired as a fallback
      const cached = await loadCachedMaps()
      if (cached) {
        console.log('Error fetching maps, using cached data as fallback:', error)
        return cached.data
      }
      console.error('Error fetching maps list:', error)
      throw error
    }
  })

  // Check local maps directory
  handle('settings:check-local-maps', async () => {
    try {
      const mapsFolder = await getMapsFolder()
      if (!mapsFolder) {
        return []
      }

      if (!(await fs.pathExists(mapsFolder))) {
        return []
      }

      const files = await fs.readdir(mapsFolder)
      const mapFiles = files.filter((file) => file.endsWith('.bsp'))

      const localMaps = await Promise.all(
        mapFiles.map(async (file) => {
          const mapName = file.replace('.bsp', '')
          const filePath = path.join(mapsFolder, file)
          try {
            const stats = await fs.stat(filePath)
            return {
              name: mapName,
              filesize: stats.size,
              exists: true,
            }
          } catch {
            return {
              name: mapName,
              filesize: null,
              exists: false,
            }
          }
        })
      )

      return localMaps
    } catch (error) {
      console.error('Error checking local maps:', error)
      return []
    }
  })

  // Download missing maps
  handle('settings:download-missing-maps', async (mapNames: string[]) => {
    try {
      const settings = await loadSettings()
      const csgoPath = settings.csgoPath

      if (!csgoPath) {
        return {
          success: false,
          message: 'CS:GO path not set. Please set it in settings first.',
        }
      }

      const mapsFolder = await getMapsFolder()
      if (!mapsFolder) {
        return {
          success: false,
          message: 'Could not determine maps folder.',
        }
      }

      await fs.ensureDir(mapsFolder)

      // Fetch maps list to get expected file sizes
      const mapsList = await net
        .fetch('https://kztimerglobal.com/api/v2.0/maps?is_validated=true&limit=9999')
        .then((res) => res.json())

      const mapsMap = new Map(mapsList.map((map: { name: string; filesize: number }) => [map.name, map.filesize]))

      // Initialize bulk download progress
      bulkDownloadProgress = {
        total: mapNames.length,
        completed: 0,
        failed: 0,
        maps: mapNames.map((name) => ({
          mapName: name,
          progress: 0,
          status: 'pending' as const,
          error: null,
        })),
        downloading: true,
        currentMap: null,
        downloadSpeed: null,
      }

      // Download maps sequentially to avoid overwhelming the server
      for (const mapName of mapNames) {
        const expectedSize = mapsMap.get(mapName) || 0
        const result = await downloadMapFile(mapName, expectedSize, mapsFolder)

        if (result.success) {
          bulkDownloadProgress.completed++
        } else {
          bulkDownloadProgress.failed++
        }
      }

      bulkDownloadProgress.downloading = false
      bulkDownloadProgress.currentMap = null
      bulkDownloadProgress.downloadSpeed = null

      const successCount = bulkDownloadProgress.completed
      const failCount = bulkDownloadProgress.failed

      return {
        success: failCount === 0,
        message: `Downloaded ${successCount} map(s)${failCount > 0 ? `, ${failCount} failed` : ''}.`,
      }
    } catch (error) {
      bulkDownloadProgress.downloading = false
      bulkDownloadProgress.currentMap = null
      bulkDownloadProgress.downloadSpeed = null
      return {
        success: false,
        message: `Error downloading maps: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  })

  // Get bulk download progress
  handle('settings:get-bulk-download-progress', async () => {
    return bulkDownloadProgress
  })

  // Download map package
  handle('settings:download-map-package', async () => {
    try {
      const settings = await loadSettings()
      const csgoPath = settings.csgoPath

      if (!csgoPath) {
        return {
          success: false,
          message: 'CS:GO path not set. Please set it in settings first.',
        }
      }

      const mapsFolder = await getMapsFolder()
      if (!mapsFolder) {
        return {
          success: false,
          message: 'Could not determine maps folder.',
        }
      }

      await fs.ensureDir(mapsFolder)
      const packagePath = path.join(mapsFolder, 'GlobalMaps.7z')
      const packageUrl = 'https://r2.axekz.com/packages/GlobalMaps.7z'

      // Reset progress and cancellation flag
      packageDownloadCancelled = false
      packageDownloadProgress = {
        progress: 0,
        downloading: true,
        downloadSpeed: null,
      }

      const startTime = Date.now()
      let lastUpdateTime = startTime
      let lastReceivedBytes = 0

      try {
        const response = await net.fetch(packageUrl)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const contentLength = parseInt(response.headers.get('content-length') || '0', 10)

        // Download with progress tracking
        let buffer: Buffer
        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader()
          const chunks: Uint8Array[] = []
          let receivedBytes = 0

          while (true) {
            // Check for cancellation
            if (packageDownloadCancelled) {
              packageDownloadProgress.downloading = false
              packageDownloadProgress.progress = 0
              packageDownloadProgress.downloadSpeed = null
              // Clean up partial file if it exists
              if (await fs.pathExists(packagePath)) {
                await fs.remove(packagePath)
              }
              return {
                success: false,
                message: 'Download cancelled by user',
              }
            }

            const { done, value } = await reader.read()
            if (done) break

            chunks.push(value)
            receivedBytes += value.length

            // Update progress
            if (contentLength > 0) {
              packageDownloadProgress.progress = receivedBytes / contentLength
            }

            // Calculate download speed (update every 500ms)
            const now = Date.now()
            if (now - lastUpdateTime >= 500) {
              const bytesSinceLastUpdate = receivedBytes - lastReceivedBytes
              const timeSinceLastUpdate = (now - lastUpdateTime) / 1000 // seconds
              if (timeSinceLastUpdate > 0) {
                packageDownloadProgress.downloadSpeed = bytesSinceLastUpdate / timeSinceLastUpdate
              }
              lastUpdateTime = now
              lastReceivedBytes = receivedBytes
            }
          }

          // Check for cancellation before writing file
          if (packageDownloadCancelled) {
            packageDownloadProgress.downloading = false
            packageDownloadProgress.progress = 0
            packageDownloadProgress.downloadSpeed = null
            return {
              success: false,
              message: 'Download cancelled by user',
            }
          }

          buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))

          // Calculate final speed
          const totalTime = (Date.now() - startTime) / 1000
          if (totalTime > 0) {
            packageDownloadProgress.downloadSpeed = receivedBytes / totalTime
          }
        } else {
          // Fallback to arrayBuffer if streaming not available
          const arrayBuffer = await response.arrayBuffer()
          buffer = Buffer.from(arrayBuffer)
          packageDownloadProgress.progress = 1
          const totalTime = (Date.now() - startTime) / 1000
          if (totalTime > 0) {
            packageDownloadProgress.downloadSpeed = buffer.length / totalTime
          }
        }

        // Check for cancellation before writing file
        if (packageDownloadCancelled) {
          packageDownloadProgress.downloading = false
          packageDownloadProgress.progress = 0
          packageDownloadProgress.downloadSpeed = null
          return {
            success: false,
            message: 'Download cancelled by user',
          }
        }

        await fs.writeFile(packagePath, buffer)

        packageDownloadProgress.downloading = false
        packageDownloadProgress.progress = 1

        return {
          success: true,
          message: `Map package downloaded successfully to ${packagePath}`,
        }
      } catch (error) {
        packageDownloadProgress.downloading = false
        packageDownloadProgress.progress = 0
        packageDownloadProgress.downloadSpeed = null
        throw error
      }
    } catch (error) {
      packageDownloadProgress.downloading = false
      packageDownloadProgress.progress = 0
      packageDownloadProgress.downloadSpeed = null
      return {
        success: false,
        message: `Error downloading map package: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  })

  // Get package download progress
  handle('settings:get-package-download-progress', async () => {
    return packageDownloadProgress
  })

  // Cancel package download
  handle('settings:cancel-package-download', async () => {
    packageDownloadCancelled = true
    
    // Clear maps cache if it exists
    try {
      const cachePath = getMapsCachePath()
      if (await fs.pathExists(cachePath)) {
        await fs.remove(cachePath)
      }
      // Also clear checked maps cache
      const checkedCachePath = getCheckedMapsCachePath()
      if (await fs.pathExists(checkedCachePath)) {
        await fs.remove(checkedCachePath)
      }
    } catch (error) {
      console.error('Error clearing cache during cancel:', error)
    }
    
    return { success: true }
  })

  // Clear maps cache
  handle('settings:clear-maps-cache', async () => {
    try {
      const cachePath = getMapsCachePath()
      if (await fs.pathExists(cachePath)) {
        await fs.remove(cachePath)
        return { success: true, message: 'Maps cache cleared successfully' }
      }
      return { success: true, message: 'No cache to clear' }
    } catch (error) {
      return {
        success: false,
        message: `Error clearing cache: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  })

  // Save checked maps (maps with status) to cache
  handle('settings:save-checked-maps', async (mapsData: unknown[]) => {
    await saveCachedCheckedMaps(mapsData)
  })

  // Load checked maps (maps with status) from cache
  handle('settings:load-checked-maps', async () => {
    const cached = await loadCachedCheckedMaps()
    if (cached && isCacheValid(cached.timestamp)) {
      return { data: cached.data, timestamp: cached.timestamp }
    }
    return null
  })

  // Get theme preference
  handle('settings:get-theme', async () => {
    const settings = await loadSettings()
    return settings.theme || 'system'
  })

  // Set theme preference
  handle('settings:set-theme', async (theme: 'dark' | 'light' | 'system') => {
    const settings = await loadSettings()
    settings.theme = theme
    await saveSettings(settings)
  })

  // Get overlay enabled preference
  handle('settings:get-overlay-enabled', async () => {
    const settings = await loadSettings()
    return settings.overlayEnabled ?? false
  })

  // Set overlay enabled preference
  handle('settings:set-overlay-enabled', async (enabled: boolean) => {
    const settings = await loadSettings()
    settings.overlayEnabled = enabled
    await saveSettings(settings)
  })

  // Get GSI auto-start preference
  handle('settings:get-gsi-auto-start', async () => {
    const settings = await loadSettings()
    return settings.gsiAutoStart ?? false
  })

  // Set GSI auto-start preference
  handle('settings:set-gsi-auto-start', async (enabled: boolean) => {
    const settings = await loadSettings()
    settings.gsiAutoStart = enabled
    await saveSettings(settings)
  })
}
