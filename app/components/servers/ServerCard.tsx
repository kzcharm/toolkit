import { Copy, Play } from 'lucide-react'
import { memo, useMemo } from 'react'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/lib/utils'
import {
  formatTier,
  getCountryFlag,
  getMapImageUrl,
  getTierColor,
} from './server-utils'

export interface ServerStatus {
  server_id: string
  hostname: string
  host: string
  port: number
  map_name: string | null
  player_count: number
  max_players: number
  bot_count: number
  is_online: boolean
  map_tier: number | null
  country: string | null
  group_id: string | null
  group_name: string | null
  players?: PlayerInfo[]
}

export interface PlayerInfo {
  name: string | null
  mode: string | null
  steamid64: string | null
  avatar_hash: string | null
  timer_time: number | null
  status: string | null
  is_paused: boolean | null
}

interface ServerCardProps {
  server: ServerStatus
  onCopyAddress: (host: string, port: number) => void
  onSteamConnect: (host: string, port: number) => void
  onClick?: () => void
}

export const ServerCard = memo(function ServerCard({
  server,
  onCopyAddress,
  onSteamConnect,
  onClick,
}: ServerCardProps) {
  const botCount = server.bot_count ?? 0
  const playerCount = server.player_count ?? 0
  const realPlayers = Math.max(0, playerCount - botCount)
  const maxPlayers = server.max_players ?? 0
  const isFull = maxPlayers > 0 && realPlayers >= maxPlayers
  const isEmpty = realPlayers === 0
  const imgUrl = useMemo(
    () => getMapImageUrl(server.map_name),
    [server.map_name]
  )
  const offline = !server.is_online

  const handleImageClick = (_e: React.MouseEvent) => {
    // Don't expand if user is selecting text
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) {
      return
    }
    onClick?.()
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-white dark:bg-gray-800',
        offline && 'opacity-60'
      )}
    >
      {/* 16:9 Aspect Ratio container */}
      <div
        className={cn(
          'relative aspect-video w-full bg-gray-100 dark:bg-gray-800',
          onClick && 'cursor-pointer transition-opacity hover:opacity-90'
        )}
        onClick={handleImageClick}
      >
        {/* Map image background */}
        {imgUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 hover:scale-105"
            style={{ backgroundImage: `url(${imgUrl})` }}
          />
        )}
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.0) 40%, rgba(0,0,0,0.65) 100%)',
          }}
        />
        {/* Top bar: Map name + Tier badge on left, buttons on right */}
        <div className="absolute left-2 right-2 top-2 flex items-center gap-1">
          {/* Left side: Map name + Tier badge - can shrink */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span
              className="truncate rounded-md bg-[rgba(0,0,0,0.45)] px-2 py-1 text-sm font-semibold text-white cursor-default min-w-0"
              title={server.map_name || '-'}
              onClick={(e) => e.stopPropagation()}
            >
              {server.map_name || '-'}
            </span>
            {server.map_tier !== null &&
              server.map_tier !== undefined &&
              server.map_tier !== 0 && (
                <span
                  className="rounded-md px-2 py-1 text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: getTierColor(server.map_tier) }}
                >
                  {formatTier(server.map_tier)}
                </span>
              )}
          </div>
          {/* Right side: Copy and Play buttons - fixed width */}
          <div className="flex gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                onCopyAddress(server.host, server.port)
              }}
              disabled={offline || !server.host || !server.port}
              className="h-6 w-6 bg-transparent text-white hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-40"
              aria-label="Copy server address"
              title="Copy server address"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                onSteamConnect(server.host, server.port)
              }}
              disabled={offline || !server.host || !server.port}
              className="h-6 w-6 bg-transparent text-white hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-40"
              aria-label="Connect via Steam"
              title="Connect via Steam"
            >
              <Play className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
      {/* Content below image */}
      <div className="p-3">
        {/* Country flag + hostname + player count */}
        <div className="flex items-center gap-2">
          {server.country && (
            <span className="text-lg leading-none">
              {getCountryFlag(server.country)}
            </span>
          )}
          <span
            className="truncate font-semibold cursor-default"
            title={server.hostname || 'Unknown'}
            onClick={(e) => e.stopPropagation()}
          >
            {server.hostname || 'Unknown'}
          </span>
          <Badge
            className={cn(
              'ml-auto shrink-0',
              offline
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
        </div>
        {/* Player list */}
        {server.players && server.players.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {server.players.slice(0, 6).map((player, index) => {
              const playerName: string = (player.name ?? 'Unknown') as string
              const playerMode: string | null = (player.mode ?? null) as
                | string
                | null

              return (
                <div
                  key={index}
                  className="rounded-md bg-muted px-2 py-1 text-xs"
                >
                  {playerMode && (
                    <span className="mr-1 text-muted-foreground">
                      [{playerMode}]
                    </span>
                  )}
                  {playerName}
                </div>
              )
            })}
            {server.players.length > 6 && (
              <div className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                +{server.players.length - 6} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
