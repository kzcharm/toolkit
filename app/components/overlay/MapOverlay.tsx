import { useEffect, useState, useRef } from 'react'
import RecordRow from './RecordRow'
import {
  MapOverlayApiClient,
  getMapPrettyName,
  getMapPrefix,
  isValidKzMap,
  getGlobalMode,
  extractModeFromClan,
  formatTime,
  DEFAULT_MODE,
  DEFAULT_MAP_NAME,
  VALID_KZ_MODES_LIST,
  type MapData,
  type Record,
} from './map-overlay-utils'

interface GameState {
  map?: {
    name?: string
  }
  player?: {
    steamid?: string
    clan?: string
  }
  provider?: {
    steamid?: string
  }
}

export default function MapOverlay() {
  const [mapName, setMapName] = useState(DEFAULT_MAP_NAME)
  const [modeName, setModeName] = useState(DEFAULT_MODE)
  const [steamId, setSteamId] = useState('')
  const [map, setMap] = useState<MapData | null | undefined>(null)
  const [tpWr, setTpWr] = useState<Record | null | undefined>(null)
  const [tpPb, setTpPb] = useState<Record | null | undefined>(null)
  const [proWr, setProWr] = useState<Record | null | undefined>(null)
  const [proPb, setProPb] = useState<Record | null | undefined>(null)

  const apiClientRef = useRef(new MapOverlayApiClient())
  const fetchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const dataFetchInterval = 30 // seconds

  // Computed values
  const mapPrefix = getMapPrefix(mapName).toLowerCase()
  const mapIsKz = isValidKzMap(mapName)
  const globalMode = getGlobalMode(modeName)

  // Calculate NUB WR/PB (best of TP and PRO)
  const nubWr =
    tpWr !== undefined && proWr !== undefined
      ? tpWr && proWr
        ? tpWr.time <= proWr.time
          ? tpWr
          : proWr
        : tpWr || proWr
      : undefined

  const nubPb =
    tpPb !== undefined && proPb !== undefined
      ? tpPb && proPb
        ? tpPb.time <= proPb.time
          ? tpPb
          : proPb
        : tpPb || proPb
      : undefined

  const preferNubTimes = false // Can be made configurable later

  // Fetch map data and records
  useEffect(() => {
    const currentMapIsKz = isValidKzMap(mapName)
    const currentGlobalMode = getGlobalMode(modeName)

    // Reset state when map or mode changes
    const resetState = (isMapChange: boolean) => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current)
        fetchTimerRef.current = null
      }
      apiClientRef.current.abortInflightRequests()

      if (isMapChange) {
        setMap(currentMapIsKz ? undefined : null)
      }

      // Invalidate records
      const state = currentMapIsKz && currentGlobalMode ? undefined : null
      setTpWr(state)
      setTpPb(state)
      setProWr(state)
      setProPb(state)
    }

    // Queue next data fetch
    const queueDataFetch = () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current)
      }
      if (dataFetchInterval) {
        fetchTimerRef.current = setTimeout(() => {
          fetchData()
        }, dataFetchInterval * 1000)
      }
    }

    // Fetch map data and records
    const fetchData = async () => {
      if (!currentMapIsKz) {
        return
      }

      try {
        // Fetch map data
        const mapData = await apiClientRef.current.getMapByName(mapName)
        setMap(mapData)

        if (mapData === undefined) {
          // Still loading, queue next fetch
          queueDataFetch()
          return
        }

        if (!mapData?.validated) {
          // Map is not validated/global
          setTpWr(null)
          setTpPb(null)
          setProWr(null)
          setProPb(null)
          return
        }

        if (!currentGlobalMode) {
          return
        }

        // Fetch world records
        const [tpWrResult, proWrResult] = await Promise.all([
          apiClientRef.current.getTpWorldRecord(mapName, currentGlobalMode),
          apiClientRef.current.getProWorldRecord(mapName, currentGlobalMode),
        ])

        const tpWrRecord = Array.isArray(tpWrResult) && tpWrResult.length > 0 ? tpWrResult[0] : null
        const proWrRecord = Array.isArray(proWrResult) && proWrResult.length > 0 ? proWrResult[0] : null

        setTpWr(tpWrRecord)
        setProWr(proWrRecord)

        // Fetch personal bests if we have a steam ID and WRs
        if (steamId) {
          const [tpPbResult, proPbResult] = await Promise.all([
            tpWrRecord ? apiClientRef.current.getTpPersonalBest(mapName, currentGlobalMode, steamId) : Promise.resolve(null),
            proWrRecord ? apiClientRef.current.getProPersonalBest(mapName, currentGlobalMode, steamId) : Promise.resolve(null),
          ])

          const tpPbRecord = Array.isArray(tpPbResult) && tpPbResult.length > 0 ? tpPbResult[0] : null
          const proPbRecord = Array.isArray(proPbResult) && proPbResult.length > 0 ? proPbResult[0] : null

          setTpPb(tpPbRecord)
          setProPb(proPbRecord)
        } else {
          setTpPb(null)
          setProPb(null)
        }

        queueDataFetch()
      } catch (error) {
        console.error('[MapOverlay] Error fetching data:', error)
        queueDataFetch()
      }
    }

    resetState(true)
    fetchData()

    return () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current)
      }
      apiClientRef.current.abortInflightRequests()
    }
  }, [mapName, modeName, steamId])

  // Poll GSI data
  useEffect(() => {
    const pollGSIData = async () => {
      try {
        const baseUrl = window.location.origin
        const response = await fetch(`${baseUrl}/api/gsi-data`)

        if (response.ok) {
          const data: GameState = await response.json()

          // Extract Steam ID
          const newSteamId = data?.player?.steamid || data?.provider?.steamid || ''
          if (newSteamId !== steamId) {
            setSteamId(newSteamId)
          }

          // Extract map name
          const fullMapName = data?.map?.name || DEFAULT_MAP_NAME
          const prettyName = getMapPrettyName(fullMapName)
          if (prettyName !== mapName) {
            setMapName(prettyName)
          }

          // Extract mode from clan tag
          const clan = data?.player?.clan
          const extractedMode = extractModeFromClan(clan)
          const newMode = extractedMode && VALID_KZ_MODES_LIST.includes(extractedMode) ? extractedMode : DEFAULT_MODE
          if (newMode !== modeName) {
            setModeName(newMode)
          }
        }
      } catch (error) {
        console.warn('[MapOverlay] Error fetching GSI data:', error)
      }
    }

    // Poll every 100ms for smooth updates
    const interval = setInterval(pollGSIData, 100)
    pollGSIData() // Initial fetch

    return () => {
      clearInterval(interval)
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current)
      }
      apiClientRef.current.abortInflightRequests()
    }
  }, []) // Only run on mount

  return (
    <div className="p-5 rounded-[15px] font-['Work_Sans',sans-serif]">
      <table>
        <tbody>
          <tr>
            <td>
              <span className="text-[34px] font-medium pr-[1px] text-white">{mapName}</span>

              {map === undefined ? (
                <img
                  className="h-5 ml-1.5 align-bottom"
                  src="/map/assets/loading.gif"
                  alt="Loading"
                  onError={(e) => {
                    const target = e.currentTarget
                    target.style.display = 'none'
                    const spinner = document.createElement('div')
                    spinner.className = 'inline-block h-5 w-5 ml-1.5 align-bottom border-2 border-white border-t-transparent rounded-full animate-spin'
                    target.parentElement?.appendChild(spinner)
                  }}
                />
              ) : map && map.validated ? (
                <span className="text-white text-[22px] font-light pl-[5px]">
                  {' '}
                  {modeName} / T{map.difficulty || '?'}
                </span>
              ) : mapIsKz ? (
                <span className="text-white text-[22px] font-light pl-[5px]"> {modeName} / NON GLOBAL</span>
              ) : null}
            </td>
          </tr>

          {map && proWr !== null && (
            <RecordRow wr={proWr} pb={proPb} label="PRO" />
          )}

          {map && tpWr !== null && !preferNubTimes && (
            <RecordRow wr={tpWr} pb={tpPb} label="TP" />
          )}

          {map && nubWr !== null && preferNubTimes && (
            <RecordRow wr={nubWr} pb={nubPb} label="NUB" />
          )}
        </tbody>
      </table>
    </div>
  )
}
