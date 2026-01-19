import { useEffect, useState } from 'react'
import { Button } from '../ui/button'

interface MapInfo {
  id: number
  name: string
  filesize: number
  validated: boolean
  difficulty: number
  created_on: string
  updated_on: string
  approved_by_steamid64: string
  workshop_url: string | null
  download_url: string | null
}

interface LocalMapInfo {
  name: string
  filesize: number | null
  exists: boolean
}

interface MapDownloadProgress {
  mapName: string
  progress: number
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  error: string | null
}

interface BulkDownloadProgress {
  total: number
  completed: number
  failed: number
  maps: MapDownloadProgress[]
  downloading: boolean
  currentMap: string | null
  downloadSpeed: number | null // bytes per second
}

declare global {
  interface Window {
    conveyor: {
      settings: {
        getCSGOPath: () => Promise<string | null>
        detectCSGOPath: () => Promise<string | null>
        setCSGOPath: (path: string) => Promise<void>
        fetchMapsList: () => Promise<MapInfo[]>
        checkLocalMaps: () => Promise<LocalMapInfo[]>
        downloadMissingMaps: (mapNames: string[]) => Promise<{ success: boolean; message: string }>
        getBulkDownloadProgress: () => Promise<BulkDownloadProgress>
        downloadMapPackage: () => Promise<{ success: boolean; message: string }>
        getPackageDownloadProgress: () => Promise<{ progress: number; downloading: boolean; downloadSpeed: number | null }>
        cancelPackageDownload: () => Promise<{ success: boolean }>
        saveCheckedMaps: (mapsData: MapWithStatus[]) => Promise<void>
        loadCheckedMaps: () => Promise<{ data: MapWithStatus[]; timestamp: number } | null>
      }
    }
  }
}

type MapStatus = 'downloaded' | 'missing' | 'size_mismatch'

interface MapWithStatus extends MapInfo {
  status: MapStatus
  localSize: number | null
}

export default function MapDownloadPage() {
  const [csgoPath, setCsgoPath] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [maps, setMaps] = useState<MapWithStatus[]>([])
  const [loadingMaps, setLoadingMaps] = useState(false)
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkDownloadProgress | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [packageDownloading, setPackageDownloading] = useState(false)
  const [packageProgress, setPackageProgress] = useState({ progress: 0, downloadSpeed: null as number | null })

  useEffect(() => {
    loadCSGOPath()
    loadCachedMaps()
  }, [])

  const loadCachedMaps = async () => {
    try {
      const cached = await window.conveyor.settings.loadCheckedMaps()
      if (cached && cached.data.length > 0) {
        setMaps(cached.data as MapWithStatus[])
      }
    } catch (error) {
      console.error('Error loading cached maps:', error)
    }
  }

  useEffect(() => {
    // Poll for bulk download progress
    const interval = setInterval(async () => {
      if (bulkDownloading) {
        try {
          const progressData = await window.conveyor.settings.getBulkDownloadProgress()
          setBulkProgress(progressData)
          setBulkDownloading(progressData.downloading)
        } catch (error) {
          console.error('Error getting bulk download progress:', error)
        }
      }
    }, 200)

    return () => clearInterval(interval)
  }, [bulkDownloading])

  useEffect(() => {
    // Poll for package download progress
    const interval = setInterval(async () => {
      if (packageDownloading) {
        try {
          const progressData = await window.conveyor.settings.getPackageDownloadProgress()
          setPackageProgress({
            progress: progressData.progress,
            downloadSpeed: progressData.downloadSpeed,
          })
          setPackageDownloading(progressData.downloading)
        } catch (error) {
          console.error('Error getting package download progress:', error)
        }
      }
    }, 200)

    return () => clearInterval(interval)
  }, [packageDownloading])

  const loadCSGOPath = async () => {
    try {
      let path = await window.conveyor.settings.getCSGOPath()
      
      // Auto-detect if not set
      if (!path) {
        try {
          const detectedPath = await window.conveyor.settings.detectCSGOPath()
          if (detectedPath) {
            // Auto-save the detected path
            await window.conveyor.settings.setCSGOPath(detectedPath)
            path = detectedPath
          }
        } catch (error) {
          // Silently fail auto-detection
          console.log('Auto-detection failed:', error)
        }
      }
      
      setCsgoPath(path)
      if (!path) {
        setMessage({
          type: 'error',
          text: 'CS:GO path not set. Please configure it in Settings first.',
        })
      }
    } catch (error) {
      console.error('Error loading CS:GO path:', error)
    }
  }

  const loadMaps = async (forceRefresh = false) => {
    if (!csgoPath) {
      setMessage({
        type: 'error',
        text: 'CS:GO path not set. Please configure it in Settings first.',
      })
      return
    }

    setLoadingMaps(true)
    setMessage(null)

    try {
      // Check if we have valid cached checked maps
      let mapsList: MapInfo[]
      let cachedCheckedMaps: MapWithStatus[] | null = null

      if (!forceRefresh) {
        const cached = await window.conveyor.settings.loadCheckedMaps()
        if (cached && cached.data.length > 0) {
          cachedCheckedMaps = cached.data as MapWithStatus[]
          // Use cached maps list data (extract just the map info without status)
          mapsList = cachedCheckedMaps.map(({ status, localSize, ...mapInfo }) => mapInfo)
        }
      }

      // If no valid cache or force refresh, fetch from API
      if (!cachedCheckedMaps || forceRefresh) {
        mapsList = await window.conveyor.settings.fetchMapsList()
      }

      // Always check local maps to update status
      const localMaps = await window.conveyor.settings.checkLocalMaps()

      // Create a map of local maps by name
      const localMapsMap = new Map(localMaps.map((map) => [map.name, map]))

      // Combine and determine status
      const mapsWithStatus: MapWithStatus[] = mapsList.map((map) => {
        const localMap = localMapsMap.get(map.name)
        let status: MapStatus = 'missing'
        let localSize: number | null = null

        if (localMap?.exists) {
          localSize = localMap.filesize
          if (localMap.filesize === map.filesize) {
            status = 'downloaded'
          } else {
            status = 'size_mismatch'
          }
        }

        return {
          ...map,
          status,
          localSize,
        }
      })

      setMaps(mapsWithStatus)
      
      // Save to cache
      try {
        await window.conveyor.settings.saveCheckedMaps(mapsWithStatus)
      } catch (error) {
        console.error('Error saving checked maps to cache:', error)
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error loading maps: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setLoadingMaps(false)
    }
  }

  const downloadMissingMaps = async () => {
    if (!csgoPath) {
      setMessage({
        type: 'error',
        text: 'CS:GO path not set. Please configure it in Settings first.',
      })
      return
    }

    const missingMaps = maps.filter((map) => map.status === 'missing' || map.status === 'size_mismatch')
    if (missingMaps.length === 0) {
      setMessage({
        type: 'success',
        text: 'All maps are already downloaded!',
      })
      return
    }

    setBulkDownloading(true)
    setMessage(null)

    try {
      const mapNames = missingMaps.map((map) => map.name)
      const result = await window.conveyor.settings.downloadMissingMaps(mapNames)
      
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      })

      // Reload maps to update status (this will also save to cache)
      if (result.success) {
        await loadMaps()
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error downloading maps: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setBulkDownloading(false)
      setBulkProgress(null)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const downloadMapPackage = async () => {
    if (!csgoPath) {
      setMessage({
        type: 'error',
        text: 'CS:GO path not set. Please configure it in Settings first.',
      })
      return
    }

    setPackageDownloading(true)
    setPackageProgress({ progress: 0, downloadSpeed: null })
    setMessage(null)

    try {
      const result = await window.conveyor.settings.downloadMapPackage()
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.message,
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error downloading map package: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setPackageDownloading(false)
      setPackageProgress({ progress: 0, downloadSpeed: null })
    }
  }

  const cancelPackageDownload = async () => {
    try {
      await window.conveyor.settings.cancelPackageDownload()
      setPackageDownloading(false)
      setPackageProgress({ progress: 0, downloadSpeed: null })
      setMessage({
        type: 'success',
        text: 'Download cancelled',
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error cancelling download: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  const filteredMaps = maps
    .filter((map) => map.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Sort invalid maps (missing or size_mismatch) to the top
      const aInvalid = a.status === 'missing' || a.status === 'size_mismatch'
      const bInvalid = b.status === 'missing' || b.status === 'size_mismatch'
      
      if (aInvalid && !bInvalid) return -1
      if (!aInvalid && bInvalid) return 1
      
      // If both have same validity status, sort alphabetically by name
      return a.name.localeCompare(b.name)
    })

  const missingMapsCount = maps.filter((map) => map.status === 'missing' || map.status === 'size_mismatch').length
  const downloadedMapsCount = maps.filter((map) => map.status === 'downloaded').length

  return (
    <div className="flex flex-col gap-6 p-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-2">Download Maps</h1>
        <p className="text-muted-foreground">Download CS:GO/CS2 maps directly to your game directory</p>
      </div>

      {csgoPath && (
        <div className="p-3 rounded-md bg-blue-500/20 text-blue-600 dark:text-blue-400 text-sm">
          Maps will be saved to: <code className="font-mono">{csgoPath}maps</code>
        </div>
      )}

      {/* Package Download Section */}
      <div className="flex flex-col gap-4 p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Map Package Download</h2>
            <p className="text-sm text-muted-foreground">
              Download GlobalMaps.7z package containing all maps
            </p>
          </div>
          <div className="flex gap-2">
            {packageDownloading ? (
              <Button onClick={cancelPackageDownload} variant="destructive">
                Cancel Download
              </Button>
            ) : (
              <Button onClick={downloadMapPackage} disabled={!csgoPath}>
                Download Package
              </Button>
            )}
          </div>
        </div>

        {packageDownloading && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span>Downloading GlobalMaps.7z...</span>
              <div className="flex items-center gap-2">
                {packageProgress.downloadSpeed !== null && packageProgress.downloadSpeed > 0 && (
                  <span className="text-muted-foreground">
                    {formatFileSize(packageProgress.downloadSpeed)}/s
                  </span>
                )}
                <span>{Math.round(packageProgress.progress * 100)}%</span>
              </div>
            </div>
            <div className="w-full h-2 bg-input rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${packageProgress.progress * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bulk Download Section */}
      <div className="flex flex-col gap-4 p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">KZ Timer Global Maps</h2>
            {maps.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {downloadedMapsCount} downloaded, {missingMapsCount} missing or outdated
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={loadMaps} disabled={loadingMaps || !csgoPath} variant="outline">
              {loadingMaps ? 'Loading...' : 'Check Maps'}
            </Button>
            {missingMapsCount > 0 && (
              <Button onClick={downloadMissingMaps} disabled={bulkDownloading || !csgoPath}>
                {bulkDownloading ? 'Downloading...' : `Download Missing (${missingMapsCount})`}
              </Button>
            )}
          </div>
        </div>

        {bulkProgress && bulkProgress.downloading && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span>
                Downloading maps... ({bulkProgress.completed}/{bulkProgress.total} completed
                {bulkProgress.failed > 0 && `, ${bulkProgress.failed} failed`})
              </span>
              <span>{Math.round((bulkProgress.completed / bulkProgress.total) * 100)}%</span>
            </div>
            {bulkProgress.currentMap && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">Current: {bulkProgress.currentMap}.bsp</span>
                {bulkProgress.downloadSpeed !== null && bulkProgress.downloadSpeed > 0 && (
                  <span>
                    {formatFileSize(bulkProgress.downloadSpeed)}/s
                  </span>
                )}
              </div>
            )}
            <div className="w-full h-2 bg-input rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(bulkProgress.completed / bulkProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {maps.length > 0 ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search maps..."
              className="px-3 py-2 rounded-md border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="max-h-96 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Map Name</th>
                    <th className="text-left p-2 font-medium">Size</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Difficulty</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaps.length > 0 ? (
                    filteredMaps.map((map) => {
                    const mapProgress = bulkProgress?.maps.find((m) => m.mapName === map.name)
                    return (
                      <tr key={map.id} className="border-t hover:bg-muted/50">
                        <td className="p-2 font-mono text-xs">{map.name}</td>
                        <td className="p-2">{formatFileSize(map.filesize)}</td>
                        <td className="p-2">
                          {mapProgress ? (
                            <div className="flex flex-col gap-1">
                              <span
                                className={`text-xs ${
                                  mapProgress.status === 'completed'
                                    ? 'text-green-600 dark:text-green-400'
                                    : mapProgress.status === 'failed'
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-blue-600 dark:text-blue-400'
                                }`}
                              >
                                {mapProgress.status === 'completed'
                                  ? 'Completed'
                                  : mapProgress.status === 'failed'
                                    ? `Failed: ${mapProgress.error || 'Unknown error'}`
                                    : mapProgress.status === 'downloading'
                                      ? `Downloading... ${Math.round(mapProgress.progress * 100)}%`
                                      : 'Pending'}
                              </span>
                              {mapProgress.status === 'downloading' && (
                                <div className="w-full h-1 bg-input rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${mapProgress.progress * 100}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <span
                              className={`text-xs ${
                                map.status === 'downloaded'
                                  ? 'text-green-600 dark:text-green-400'
                                  : map.status === 'size_mismatch'
                                    ? 'text-yellow-600 dark:text-yellow-400'
                                    : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {map.status === 'downloaded'
                                ? 'Downloaded'
                                : map.status === 'size_mismatch'
                                  ? `Size mismatch (${map.localSize ? formatFileSize(map.localSize) : 'unknown'})`
                                  : 'Missing'}
                            </span>
                          )}
                        </td>
                        <td className="p-2">{map.difficulty}</td>
                      </tr>
                    )
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-sm text-muted-foreground">
                        No maps found matching "{searchQuery}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Click "Check Maps" to load maps from KZ Timer Global</p>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`p-3 rounded-md ${
            message.type === 'success'
              ? 'bg-green-500/20 text-green-600 dark:text-green-400'
              : 'bg-red-500/20 text-red-600 dark:text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
