import { ArrowDown, ArrowUp, Copy, Play } from 'lucide-react'
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
import { useConveyor } from '@/app/hooks/use-conveyor'
import { ServerCard, type ServerStatus, type PlayerInfo } from './ServerCard'
import {
  getCountryFlag,
  formatTimerTime,
  getTierColor,
  formatTier,
  getMapImageUrl,
} from './server-utils'

type SortField = 'hostname' | 'map_name' | 'map_tier' | 'player_count' | 'ping'
type SortDirection = 'asc' | 'desc'

interface ServersStatusResponse {
  data: ServerStatus[]
  count: number
}

// Load preferences from localStorage
function loadSortField(): SortField {
  const saved = localStorage.getItem('servers_sort_field')
  const validFields: SortField[] = ['hostname', 'map_name', 'map_tier', 'player_count', 'ping']
  return validFields.includes(saved as SortField) ? (saved as SortField) : 'player_count'
}

function loadSortDirection(): SortDirection {
  const saved = localStorage.getItem('servers_sort_direction')
  return (saved === 'asc' || saved === 'desc' ? saved : 'desc') as SortDirection
}

function loadGroupFilter(): string | null {
  const saved = localStorage.getItem('servers_group_filter')
  return saved || null
}

function loadCountryFilter(): string | null {
  const saved = localStorage.getItem('servers_country_filter')
  return saved || null
}

export default function ServersPage() {
  const [servers, setServers] = useState<ServerStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>(loadSortField())
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    loadSortDirection()
  )
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    loadGroupFilter()
  )
  const [selectedCountry, setSelectedCountry] = useState<string | null>(
    loadCountryFilter()
  )
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [pingResults, setPingResults] = useState<Map<string, number | null>>(new Map())
  const [pingingIPs, setPingingIPs] = useState<Set<string>>(new Set())
  const pingApi = useConveyor('ping')

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('servers_sort_field', sortField)
  }, [sortField])

  useEffect(() => {
    localStorage.setItem('servers_sort_direction', sortDirection)
  }, [sortDirection])

  useEffect(() => {
    if (selectedGroup) {
      localStorage.setItem('servers_group_filter', selectedGroup)
    } else {
      localStorage.removeItem('servers_group_filter')
    }
  }, [selectedGroup])

  useEffect(() => {
    if (selectedCountry) {
      localStorage.setItem('servers_country_filter', selectedCountry)
    } else {
      localStorage.removeItem('servers_country_filter')
    }
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

  // Ping unique IPs
  useEffect(() => {
    if (servers.length === 0) return

    // Get unique IP:port combinations
    const uniqueIPs = new Map<string, { host: string; port: number }>()
    servers.forEach((server) => {
      if (server.host && server.port) {
        const key = `${server.host}:${server.port}`
        if (!uniqueIPs.has(key)) {
          uniqueIPs.set(key, { host: server.host, port: server.port })
        }
      }
    })

    // Ping each unique IP
    const pingAllServers = async () => {
      const pingPromises = Array.from(uniqueIPs.entries()).map(async ([key, { host, port }]) => {
        // Skip if already pinging or already has a result
        if (pingingIPs.has(key) || pingResults.has(key)) {
          return
        }

        setPingingIPs((prev) => new Set(prev).add(key))
        
        try {
          const result = await pingApi.pingServer(host, port)
          setPingResults((prev) => {
            const newMap = new Map(prev)
            newMap.set(key, result.ping)
            return newMap
          })
        } catch (err) {
          console.error(`[ServersPage] Failed to ping ${key}:`, err)
          setPingResults((prev) => {
            const newMap = new Map(prev)
            newMap.set(key, null)
            return newMap
          })
        } finally {
          setPingingIPs((prev) => {
            const newSet = new Set(prev)
            newSet.delete(key)
            return newSet
          })
        }
      })

      await Promise.all(pingPromises)
    }

    pingAllServers()
  }, [servers, pingApi])

  // Get available server groups
  const availableGroups = useMemo(() => {
    const groupMap = new Map<string, string>()
    servers.forEach((server) => {
      if (server.group_id && server.group_name) {
        groupMap.set(server.group_id, server.group_name)
      }
    })
    return Array.from(groupMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [servers])

  // Calculate player count per group (only from online servers)
  const groupPlayerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    servers.forEach((server) => {
      if (server.is_online && server.group_id) {
        const botCount = server.bot_count ?? 0
        const playerCount = server.player_count ?? 0
        const realPlayers = Math.max(0, playerCount - botCount)
        counts[server.group_id] = (counts[server.group_id] || 0) + realPlayers
      }
    })
    return counts
  }, [servers])

  // Get available countries (filtered by selected group if any)
  const availableCountries = useMemo(() => {
    const countrySet = new Set<string>()
    let serversToCheck = servers
    
    // First filter by group if selected
    if (selectedGroup) {
      serversToCheck = serversToCheck.filter(
        (server) => server.group_id === selectedGroup
      )
    }
    
    serversToCheck.forEach((server) => {
      if (server.country) {
        countrySet.add(server.country)
      }
    })
    return Array.from(countrySet).sort()
  }, [servers, selectedGroup])

  // Calculate player count per country (only from online servers, filtered by selected group)
  const countryPlayerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    let serversToCheck = servers
    
    // Filter by group if selected
    if (selectedGroup) {
      serversToCheck = serversToCheck.filter(
        (server) => server.group_id === selectedGroup
      )
    }
    
    serversToCheck.forEach((server) => {
      if (server.is_online && server.country) {
        const botCount = server.bot_count ?? 0
        const playerCount = server.player_count ?? 0
        const realPlayers = Math.max(0, playerCount - botCount)
        counts[server.country] = (counts[server.country] || 0) + realPlayers
      }
    })
    return counts
  }, [servers, selectedGroup])

  // Clear country filter if it's not available in the current group
  useEffect(() => {
    if (selectedCountry && !availableCountries.includes(selectedCountry)) {
      setSelectedCountry(null)
    }
  }, [selectedCountry, availableCountries])

  // Filter by group first, then by country
  const filteredServers = useMemo(() => {
    let filtered = servers
    
    // Filter by group first
    if (selectedGroup) {
      filtered = filtered.filter(
        (server) => server.group_id === selectedGroup
      )
    }
    
    // Then filter by country
    if (selectedCountry) {
      filtered = filtered.filter((server) => server.country === selectedCountry)
    }
    
    return filtered
  }, [servers, selectedGroup, selectedCountry])

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
        case 'ping': {
          const aKey = `${a.host}:${a.port}`
          const bKey = `${b.host}:${b.port}`
          const aPing = pingResults.get(aKey)
          const bPing = pingResults.get(bKey)
          // Treat null as infinity for sorting (failed pings go to end)
          aValue = aPing ?? Infinity
          bValue = bPing ?? Infinity
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
  }, [filteredServers, sortField, sortDirection, pingResults])

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((currentDir) =>
          currentDir === 'asc' ? 'desc' : 'asc'
        )
      } else {
        setSortField(field)
        // Default to DESC for player_count and ping, ASC for others
        setSortDirection(field === 'player_count' || field === 'ping' ? 'desc' : 'asc')
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
          <Badge className="bg-primary text-primary-foreground">
            {totalPlayers} players
          </Badge>
          <Badge variant="outline">{totalServers} servers</Badge>
        </div>
      </div>

      {/* Server Group Selector */}
      {availableGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedGroup === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedGroup(null)}
          >
            All Groups
          </Button>
          {availableGroups.map((group) => {
            const isSelected = selectedGroup === group.id
            const playerCount = groupPlayerCounts[group.id] || 0
            return (
              <Button
                key={group.id}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  // Toggle: if already selected, deselect (set to null)
                  setSelectedGroup(isSelected ? null : group.id)
                }}
              >
                {group.name} ({playerCount})
              </Button>
            )
          })}
        </div>
      )}

      {/* Country Tabs */}
      {availableCountries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCountry === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCountry(null)}
          >
            All Countries
          </Button>
          {availableCountries.map((country) => {
            const isSelected = selectedCountry === country
            const playerCount = countryPlayerCounts[country] || 0
            return (
              <Button
                key={country}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  // Toggle: if already selected, deselect (set to null)
                  setSelectedCountry(isSelected ? null : country)
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
      <div className="flex flex-col gap-4">
        <table className="w-full caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="max-w-[200px]">
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
                  <TableHead>
                    <SortableHeader field="ping">Ping</SortableHeader>
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
                          <TableCell className="max-w-[200px]">
                            <div className="flex items-center gap-2 min-w-0">
                              {server.country && (
                                <span className="text-lg leading-none shrink-0">
                                  {getCountryFlag(server.country)}
                                </span>
                              )}
                              <span className="truncate" title={server.hostname || 'Unknown'}>
                                {server.hostname || 'Unknown'}
                              </span>
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
                            {(() => {
                              const pingKey = `${server.host}:${server.port}`
                              const ping = pingResults.get(pingKey)
                              const isPinging = pingingIPs.has(pingKey)
                              
                              if (isPinging) {
                                return (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Pinging...
                                  </Badge>
                                )
                              }
                              
                              if (ping === null || ping === undefined) {
                                return (
                                  <Badge variant="outline" className="bg-gray-500 text-white">
                                    -
                                  </Badge>
                                )
                              }
                              
                              // Color coding: green < 50ms, yellow < 100ms, orange < 150ms, red >= 150ms
                              const getPingBadgeColor = (pingValue: number) => {
                                if (pingValue < 50) return 'bg-green-500 text-white'
                                if (pingValue < 100) return 'bg-yellow-500 text-white'
                                if (pingValue < 150) return 'bg-orange-500 text-white'
                                return 'bg-red-500 text-white'
                              }
                              
                              return (
                                <Badge className={getPingBadgeColor(ping)}>
                                  {ping}ms
                                </Badge>
                              )
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyAddress(server.host, server.port)
                                }}
                                disabled={!isOnline}
                                title="Copy server address"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSteamConnect(server.host, server.port)
                                }}
                                disabled={!isOnline}
                                title="Connect via Steam"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={6} className="p-0">
                              <div className="p-4">
                                {hasMap && (
                                  <>
                                    <div className="mb-4 flex justify-center">
                                      <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                                        {(() => {
                                          const mapImageUrl = getMapImageUrl(
                                            server.map_name
                                          )
                                          return mapImageUrl ? (
                                            <img
                                              src={mapImageUrl}
                                              alt={server.map_name || ''}
                                              className="h-full w-full object-cover"
                                              onError={(e) => {
                                                e.currentTarget.style.display =
                                                  'none'
                                              }}
                                            />
                                          ) : null
                                        })()}
                                      </div>
                                    </div>
                                    {/* Map name and tier badge */}
                                    <div className="mb-4 flex items-center justify-center gap-3">
                                      <span className="text-lg font-semibold">
                                        {server.map_name}
                                      </span>
                                      {server.map_tier !== null &&
                                        server.map_tier !== undefined &&
                                        server.map_tier !== 0 && (
                                          <Badge
                                            className="text-white"
                                            style={{
                                              backgroundColor: getTierColor(
                                                server.map_tier
                                              ),
                                            }}
                                          >
                                            {formatTier(server.map_tier)}
                                          </Badge>
                                        )}
                                    </div>
                                  </>
                                )}
                                {hasPlayers && (
                                  <div className="space-y-4">
                                    <div className="flex justify-center">
                                      <div className="w-full max-w-4xl">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-10" />
                                              <TableHead>Name</TableHead>
                                              <TableHead>Timer Time</TableHead>
                                              <TableHead>Status</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {server.players?.length === 0 ? (
                                              <TableRow>
                                                <TableCell
                                                  colSpan={4}
                                                  className="text-center text-muted-foreground"
                                                >
                                                  No players
                                                </TableCell>
                                              </TableRow>
                                            ) : (
                                              server.players?.map(
                                                (player, idx) => {
                                                  const playerName =
                                                    player.name || 'Unknown'
                                                  const playerMode = player.mode
                                                  const timerTime =
                                                    player.timer_time
                                                  const playerStatus =
                                                    player.status

                                                  return (
                                                    <TableRow key={idx}>
                                                      <TableCell>
                                                        {player.country && (
                                                          <span className="flex justify-center text-lg leading-none">
                                                            {getCountryFlag(
                                                              player.country
                                                            )}
                                                          </span>
                                                        )}
                                                      </TableCell>
                                                      <TableCell>
                                                        <div className="flex items-center gap-2">
                                                          <span>
                                                            {playerMode &&
                                                              `[${playerMode}] `}
                                                            {playerName}
                                                          </span>
                                                        </div>
                                                      </TableCell>
                                                      <TableCell>
                                                        {formatTimerTime(
                                                          timerTime
                                                        )}
                                                      </TableCell>
                                                      <TableCell>
                                                        <Badge
                                                          variant="outline"
                                                          className="text-xs"
                                                        >
                                                          {playerStatus || '-'}
                                                        </Badge>
                                                      </TableCell>
                                                    </TableRow>
                                                  )
                                                }
                                              )
                                            )}
                                          </TableBody>
                                        </Table>
                                      </div>
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
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No servers found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
        </div>
    </div>
  )
}
