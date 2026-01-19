// Utility functions for map overlay

export interface MapData {
  validated: boolean
  difficulty?: number
  [key: string]: unknown
}

export interface Record {
  time: number
  player_name: string
  [key: string]: unknown
}

const API_BASE_URL = 'https://kztimerglobal.com/api/v2.0'
const CACHE_LIFETIME = 25 // seconds

const VALID_KZ_MODES = ['KZT', 'SKZ', 'VNL', 'FKZ', 'HKZ']
const VALID_KZ_MAP_PREFIXES = ['kz', 'xc', 'bkz', 'skz', 'vnl', 'kzpro']

const GLOBAL_MODE_MAP: Record<string, string> = {
  KZT: 'kz_timer',
  SKZ: 'kz_simple',
  VNL: 'kz_vanilla',
}

interface CacheEntry {
  data: unknown
  expires: number
}

// Cache utilities
function getCacheEntry(key: string): CacheEntry | null {
  const data = sessionStorage.getItem(key)
  if (!data) return null
  try {
    return JSON.parse(data) as CacheEntry
  } catch {
    return null
  }
}

function setCacheEntry(key: string, value: unknown, lifetimeSeconds: number): void {
  sessionStorage.setItem(
    key,
    JSON.stringify({
      data: value,
      expires: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    })
  )
}

function isExpiredCacheEntry(entry: CacheEntry | null): boolean {
  if (!entry) return true
  return entry.expires < Math.floor(Date.now() / 1000)
}

// Extract map name from workshop path (e.g., "workshop/123456/kz_mapname" -> "kz_mapname")
export function getMapPrettyName(fullMapName: string): string {
  return fullMapName.split('/').pop() || fullMapName
}

// Extract map prefix (e.g., "kz_mapname" -> "kz")
export function getMapPrefix(mapName: string): string {
  return mapName.includes('_') ? mapName.split('_')[0] : ''
}

// Check if map is a valid KZ map
export function isValidKzMap(mapName: string): boolean {
  const prefix = getMapPrefix(mapName).toLowerCase()
  return VALID_KZ_MAP_PREFIXES.includes(prefix)
}

// Get global mode string from mode name
export function getGlobalMode(modeName: string): string | null {
  return GLOBAL_MODE_MAP[modeName] || null
}

// Format time as MM:SS.mmm or HH:MM:SS.mmm
export function formatTime(seconds: number): string {
  const fixed = parseFloat(seconds.toFixed(2))
  const h = Math.floor(fixed / 3600)
  const m = Math.floor((fixed % 3600) / 60)
  const s = Math.floor((fixed % 3600) % 60)
  const ms = fixed.toFixed(2).slice(-3)

  const pad = (num: number): string => ('000' + num).slice(-2)
  const result = `${pad(m)}:${pad(s)}.${ms}`

  if (h > 0) {
    return `${pad(h)}:${result}`
  }

  return result
}

// Extract mode from clan tag (e.g., "[KZT]" -> "KZT")
export function extractModeFromClan(clan: string | undefined): string | null {
  if (!clan) return null
  const match = clan.match(/^\[([A-Z]{3})/)
  return match ? match[1] : null
}

// API Client class
export class MapOverlayApiClient {
  private abortController: AbortController = new AbortController()

  private async cachedFetch(url: string, queryParams?: Record<string, string | number | boolean>): Promise<unknown> {
    const fullUrl = new URL(url, API_BASE_URL)
    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        fullUrl.searchParams.append(key, String(value))
      })
    }

    const cacheKey = fullUrl.toString()
    const cacheEntry = getCacheEntry(cacheKey)

    if (!isExpiredCacheEntry(cacheEntry)) {
      return cacheEntry!.data
    }

    try {
      const response = await fetch(fullUrl, {
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        return undefined
      }

      const data = await response.json()
      setCacheEntry(cacheKey, data, CACHE_LIFETIME)
      return data
    } catch (err) {
      // Abort errors are expected when canceling requests
      if (err instanceof Error && err.name === 'AbortError') {
        return undefined
      }
      console.error('[MapOverlay] API error:', err)
      return null
    }
  }

  async getMapByName(mapName: string): Promise<MapData | undefined | null> {
    const result = await this.cachedFetch(`/maps/name/${mapName}`)
    if (result === undefined || result === null) return result
    return result as MapData
  }

  async getTpWorldRecord(mapName: string, mode: string): Promise<Record[] | undefined | null> {
    const result = await this.cachedFetch('/records/top', {
      limit: 1,
      stage: 0,
      tickrate: 128,
      map_name: mapName,
      has_teleports: true,
      modes_list_string: mode,
    })
    if (result === undefined || result === null) return result
    return Array.isArray(result) ? (result as Record[]) : undefined
  }

  async getProWorldRecord(mapName: string, mode: string): Promise<Record[] | undefined | null> {
    const result = await this.cachedFetch('/records/top', {
      limit: 1,
      stage: 0,
      tickrate: 128,
      map_name: mapName,
      has_teleports: false,
      modes_list_string: mode,
    })
    if (result === undefined || result === null) return result
    return Array.isArray(result) ? (result as Record[]) : undefined
  }

  async getTpPersonalBest(mapName: string, mode: string, steamId: string): Promise<Record[] | undefined | null> {
    const result = await this.cachedFetch('/records/top', {
      stage: 0,
      limit: 1,
      tickrate: 128,
      map_name: mapName,
      steamId64: steamId,
      has_teleports: true,
      modes_list_string: mode,
    })
    if (result === undefined || result === null) return result
    return Array.isArray(result) ? (result as Record[]) : undefined
  }

  async getProPersonalBest(mapName: string, mode: string, steamId: string): Promise<Record[] | undefined | null> {
    const result = await this.cachedFetch('/records/top', {
      stage: 0,
      limit: 1,
      tickrate: 128,
      map_name: mapName,
      steamId64: steamId,
      has_teleports: false,
      modes_list_string: mode,
    })
    if (result === undefined || result === null) return result
    return Array.isArray(result) ? (result as Record[]) : undefined
  }

  abortInflightRequests(): void {
    this.abortController.abort()
    this.abortController = new AbortController()
  }
}

// Export constants
export const VALID_KZ_MODES_LIST = VALID_KZ_MODES
export const DEFAULT_MODE = 'KZT'
export const DEFAULT_MAP_NAME = 'Unknown map'
