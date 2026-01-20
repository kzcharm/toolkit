import { ArrowDown, ArrowUp, Copy, Grid, List, Play } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table'
import { cn } from '@/lib/utils'
import { ServerCard, type ServerStatus, type PlayerInfo } from './ServerCard'
import {
  getCountryFlag,
  formatTimerTime,
  getTierColor,
  formatTier,
} from './server-utils'

type SortField = 'hostname' | 'map_name' | 'map_tier' | 'player_count'
type SortDirection = 'asc' | 'desc'
type ViewMode = 'table' | 'grid'

interface ServersStatusResponse {
  data: ServerStatus[]
  count: number
}

// Load preferences from localStorage
function loadViewMode(): ViewMode {
  const saved = localStorage.getItem('servers_view_mode')
  return saved === 'grid' || saved === 'table' ? saved : 'grid'
}

function loadSortField(): SortField {
  const saved = localStorage.getItem('servers_sort_field')
  return (saved as SortField) || 'player_count'
}

function loadSortDirection(): SortDirection {
  const saved = localStorage.getItem('servers_sort_direction')
  return (saved === 'asc' || saved === 'desc' ? saved : 'desc') as SortDirection
}

function loadCountryFilter(): string {
  const saved = localStorage.getItem('servers_country_filter')
  return saved || ''
}

export default function ServersPage() {
  const [servers, setServers] = useState<ServerStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const [sortField, setSortField] = useState<SortField>(loadSortField())
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    loadSortDirection()
  )
  const [selectedCountry, setSelectedCountry] = useState<string>(
    loadCountryFilter()
  )
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('servers_view_mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    localStorage.setItem('servers_sort_field', sortField)
  }, [sortField])

  useEffect(() => {
    localStorage.setItem('servers_sort_direction', sortDirection)
  }, [sortDirection])

  useEffect(() => {
    localStorage.setItem('servers_country_filter', selectedCountry)
  }, [selectedCountry])

  // Fetch servers
  useEffect(() => {
    const fetchServers = async () => {
      try {
        console.log('[ServersPage] Fetching servers from API...')
        const url = 'https://api.gokz.top/api/v1/public-servers/status/?offset=0&limit=100'
        console.log('[ServersPage] URL:', url)
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        })
        
        console.log('[ServersPage] Response status:', response.status, response.statusText)
        console.log('[ServersPage] Response headers:', Object.fromEntries(response.headers.entries()))
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('[ServersPage] Response not OK:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          })
          throw new Error(`Failed to fetch servers: ${response.status} ${response.statusText}`)
        }
        
        const rawData = await response.json()
        console.log('[ServersPage] Raw response:', rawData)
        
        // Handle different response structures
        let servers: ServerStatus[] = []
        if (Array.isArray(rawData)) {
          // If response is directly an array
          servers = rawData
        } else if (rawData.data && Array.isArray(rawData.data)) {
          // If response has a data property
          servers = rawData.data
        } else if (rawData.results && Array.isArray(rawData.results)) {
          // Alternative structure
          servers = rawData.results
        } else {
          console.warn('[ServersPage] Unexpected response structure:', rawData)
          servers = []
        }
        
        console.log('[ServersPage] Parsed servers:', {
          count: servers.length,
          firstServer: servers[0] ? {
            id: servers[0].server_id,
            hostname: servers[0].hostname,
            country: servers[0].country,
          } : null,
        })
        
        setServers(servers)
        setError(null)
      } catch (err) {
        console.error('[ServersPage] Failed to fetch servers:', err)
        const errorMessage = err instanceof Error 
          ? `Failed to load servers: ${err.message}` 
          : 'Failed to load servers. Please try again later.'
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchServers()
    const interval = setInterval(fetchServers, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [])

  // Get available countries
  const availableCountries = useMemo(() => {
    const countrySet = new Set<string>()
    servers.forEach((server) => {
      if (server.country) {
        countrySet.add(server.country)
      }
    })
    return Array.from(countrySet).sort()
  }, [servers])

  // Calculate player count per country (only from online servers)
  const countryPlayerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    servers.forEach((server) => {
      if (server.is_online && server.country) {
        const botCount = server.bot_count ?? 0
        const playerCount = server.player_count ?? 0
        const realPlayers = Math.max(0, playerCount - botCount)
        counts[server.country] = (counts[server.country] || 0) + realPlayers
      }
    })
    return counts
  }, [servers])

  // Default to first country when countries become available (only once)
  useEffect(() => {
    if (availableCountries.length > 0) {
      if (!selectedCountry || !availableCountries.includes(selectedCountry)) {
        setSelectedCountry(availableCountries[0])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCountries.length, availableCountries[0]])

  // Filter by country
  const filteredServers = useMemo(() => {
    let filtered = servers
    if (selectedCountry) {
      filtered = filtered.filter((server) => server.country === selectedCountry)
    }
    return filtered
  }, [servers, selectedCountry])

  // Calculate statistics from all online servers (not filtered)
  const allOnlineServers = useMemo(() => {
    return servers.filter((server) => server.is_online)
  }, [servers])

  const totalPlayers = useMemo(() => {
    return allOnlineServers.reduce((sum, s) => {
      const botCount = s.bot_count ?? 0
      const playerCount = s.player_count ?? 0
      return sum + Math.max(0, playerCount - botCount)
    }, 0)
  }, [allOnlineServers])

  const totalServers = useMemo(() => {
    return allOnlineServers.length
  }, [allOnlineServers])

  // Sort servers
  const sortedServers = useMemo(() => {
    if (!filteredServers) return []

    const sorted = [...filteredServers].sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (sortField) {
        case 'hostname':
          aValue = (a.hostname || '').toLowerCase()
          bValue = (b.hostname || '').toLowerCase()
          break
        case 'map_name':
          aValue = (a.map_name || '').toLowerCase()
          bValue = (b.map_name || '').toLowerCase()
          break
        case 'map_tier':
          aValue = a.map_tier ?? 0
          bValue = b.map_tier ?? 0
          break
        case 'player_count': {
          const aBotCount = a.bot_count ?? 0
          const bBotCount = b.bot_count ?? 0
          aValue = Math.max(0, (a.player_count ?? 0) - aBotCount)
          bValue = Math.max(0, (b.player_count ?? 0) - bBotCount)
          break
        }
        default:
          return 0
      }

      // Primary sort
      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1
      }

      // Tiebreaker: always sort by hostname (ascending) when primary values are equal
      const aHostname = (a.hostname || '').toLowerCase()
      const bHostname = (b.hostname || '').toLowerCase()
      if (aHostname < bHostname) return -1
      if (aHostname > bHostname) return 1
      return 0
    })

    return sorted
  }, [filteredServers, sortField, sortDirection])

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((currentDir) =>
          currentDir === 'asc' ? 'desc' : 'asc'
        )
      } else {
        setSortField(field)
        // Default to DESC for player_count, ASC for others
        setSortDirection(field === 'player_count' ? 'desc' : 'asc')
      }
    },
    [sortField]
  )

  const handleCopyAddress = useCallback((host: string, port: number) => {
    const address = `connect ${host}:${port}`
    navigator.clipboard.writeText(address).catch((err) => {
      console.error('Failed to copy:', err)
    })
  }, [])

  const handleSteamConnect = useCallback((host: string, port: number) => {
    window.location.href = `steam://connect/${host}:${port}`
  }, [])

  const toggleRowExpansion = useCallback((serverId: string) => {
    setExpandedRows((current) => {
      const newSet = new Set(current)
      if (newSet.has(serverId)) {
        newSet.delete(serverId)
      } else {
        newSet.add(serverId)
      }
      return newSet
    })
  }, [])

  const SortableHeader = useCallback(
    ({ field, children }: { field: SortField; children: React.ReactNode }) => {
      const isActive = sortField === field
      return (
        <button
          onClick={() => handleSort(field)}
          className="flex items-center gap-2 hover:bg-accent rounded-md px-2 py-1 -mx-2 -my-1"
        >
          {children}
          {isActive && (
            <span className="text-muted-foreground">
              {sortDirection === 'asc' ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
            </span>
          )}
        </button>
      )
    },
    [sortField, sortDirection, handleSort]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading servers...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <div className="text-destructive text-center">{error}</div>
        <Button
          onClick={() => {
            setLoading(true)
            setError(null)
            // Trigger refetch by updating a dependency
            const fetchServers = async () => {
              try {
                console.log('[ServersPage] Retrying fetch...')
                const url = 'https://api.gokz.top/api/v1/public-servers/status/?offset=0&limit=100'
                const response = await fetch(url, {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/json',
                  },
                })
                
                console.log('[ServersPage] Retry response status:', response.status)
                
                if (!response.ok) {
                  const errorText = await response.text()
                  console.error('[ServersPage] Retry failed:', errorText)
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                }
                
                const rawData = await response.json()
                console.log('[ServersPage] Retry raw response:', rawData)
                
                let servers: ServerStatus[] = []
                if (Array.isArray(rawData)) {
                  servers = rawData
                } else if (rawData.data && Array.isArray(rawData.data)) {
                  servers = rawData.data
                } else if (rawData.results && Array.isArray(rawData.results)) {
                  servers = rawData.results
                }
                
                setServers(servers)
                setError(null)
              } catch (err) {
                console.error('[ServersPage] Retry error:', err)
                setError(
                  err instanceof Error
                    ? `Failed to load servers: ${err.message}`
                    : 'Failed to load servers. Please check the console for details.'
                )
              } finally {
                setLoading(false)
              }
            }
            fetchServers()
          }}
        >
          Retry
        </Button>
        <div className="text-xs text-muted-foreground text-center max-w-md">
          Check the browser console (F12) for detailed error information.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servers</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Online:</span>
          <Badge className="bg-orange-500 text-white">
            {totalPlayers} players
          </Badge>
          <Badge variant="outline">{totalServers} servers</Badge>
          <div className="flex gap-1">
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('table')}
              aria-label="Table view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Country Tabs */}
      {availableCountries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {availableCountries.map((country) => {
            const isSelected = selectedCountry === country
            const playerCount = countryPlayerCounts[country] || 0
            return (
              <Button
                key={country}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (!isSelected) {
                    setSelectedCountry(country)
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">
                    {getCountryFlag(country)}
                  </span>
                  <span>{country}</span>
                  <span className="text-xs opacity-80">({playerCount})</span>
                </div>
              </Button>
            )
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHeader field="hostname">Server</SortableHeader>
                  </TableHead>
                  <TableHead>
                    <SortableHeader field="map_name">Map</SortableHeader>
                  </TableHead>
                  <TableHead>
                    <SortableHeader field="map_tier">Tier</SortableHeader>
                  </TableHead>
                  <TableHead>
                    <SortableHeader field="player_count">Players</SortableHeader>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedServers.length > 0 ? (
                  sortedServers.map((server) => {
                    const botCount = server.bot_count ?? 0
                    const playerCount = server.player_count ?? 0
                    const realPlayers = Math.max(0, playerCount - botCount)
                    const maxPlayers = server.max_players ?? 0
                    const isFull = maxPlayers > 0 && realPlayers >= maxPlayers
                    const isEmpty = realPlayers === 0
                    const isOnline = server.is_online
                    const isExpanded = expandedRows.has(server.server_id)
                    const hasPlayers = (server.players?.length ?? 0) > 0
                    const hasMap =
                      server.map_name && server.map_name.trim() !== ''
                    const isExpandable = hasPlayers || hasMap

                    return (
                      <>
                        <TableRow
                          key={server.server_id}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-muted/50',
                            !isExpandable && 'cursor-default',
                            !isOnline && 'opacity-60'
                          )}
                          onClick={() => {
                            if (isExpandable) {
                              toggleRowExpansion(server.server_id)
                            }
                          }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {server.country && (
                                <span className="text-lg leading-none">
                                  {getCountryFlag(server.country)}
                                </span>
                              )}
                              <span>{server.hostname || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell>{server.map_name || '-'}</TableCell>
                          <TableCell>
                            {server.map_tier !== null &&
                            server.map_tier !== undefined &&
                            server.map_tier !== 0 ? (
                              <Badge
                                style={{
                                  backgroundColor: getTierColor(server.map_tier),
                                }}
                                className="text-white"
                              >
                                {formatTier(server.map_tier)}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                !isOnline
                                  ? 'bg-gray-500 text-white'
                                  : isFull
                                    ? 'bg-red-500 text-white'
                                    : isEmpty
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-green-500 text-white'
                              )}
                            >
                              {realPlayers}/{maxPlayers}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyAddress(server.host, server.port)
                                }}
                                disabled={!isOnline}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSteamConnect(server.host, server.port)
                                }}
                                disabled={!isOnline}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Connect
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={5} className="p-4">
                              <div className="space-y-4">
                                {hasMap && (
                                  <div>
                                    <h4 className="font-semibold mb-2">Map</h4>
                                    <div className="text-sm text-muted-foreground">
                                      {server.map_name}
                                    </div>
                                  </div>
                                )}
                                {hasPlayers && (
                                  <div>
                                    <h4 className="font-semibold mb-2">
                                      Players ({server.players?.length || 0})
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                      {server.players?.map((player, idx) => {
                                        const playerName =
                                          player.name || 'Unknown'
                                        const playerMode = player.mode
                                        const timerTime = player.timer_time

                                        return (
                                          <div
                                            key={idx}
                                            className="rounded-md bg-muted px-2 py-1 text-xs"
                                          >
                                            {playerMode && (
                                              <span className="mr-1 text-muted-foreground">
                                                [{playerMode}]
                                              </span>
                                            )}
                                            {playerName}
                                            {timerTime !== null &&
                                              timerTime !== undefined && (
                                                <span className="ml-1 text-muted-foreground">
                                                  - {formatTimerTime(timerTime)}
                                                </span>
                                              )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No servers found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="space-y-4">
          {/* Sort controls */}
          <div className="rounded-md border bg-muted/20 px-6 py-3">
            <div className="flex flex-wrap gap-4">
              <SortableHeader field="hostname">
                <span className="text-sm font-medium">Server</span>
              </SortableHeader>
              <SortableHeader field="map_name">
                <span className="text-sm font-medium">Map</span>
              </SortableHeader>
              <SortableHeader field="map_tier">
                <span className="text-sm font-medium">Difficulty</span>
              </SortableHeader>
              <SortableHeader field="player_count">
                <span className="text-sm font-medium">Players</span>
              </SortableHeader>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedServers.map((server) => (
              <ServerCard
                key={server.server_id}
                server={server}
                onCopyAddress={handleCopyAddress}
                onSteamConnect={handleSteamConnect}
              />
            ))}
          </div>

          {sortedServers.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No servers available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
