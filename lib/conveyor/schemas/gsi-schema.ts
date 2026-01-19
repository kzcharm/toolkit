import { z } from 'zod'

// GSI Game State schemas (partial, focusing on what we need to display)
const providerSchema = z.object({
  name: z.string().optional(),
  appid: z.number().optional(),
  version: z.number().optional(),
  steamid: z.string().optional(),
  timestamp: z.number().optional(),
})

const mapSchema = z.object({
  name: z.string().optional(),
  phase: z.string().optional(),
  round: z.number().optional(),
})

const playerStateSchema = z.object({
  health: z.number().optional(),
  armor: z.number().optional(),
  helmet: z.boolean().optional(),
  flashed: z.number().optional(),
  burning: z.number().optional(),
  money: z.number().optional(),
  round_kills: z.number().optional(),
  round_killhs: z.number().optional(),
  round_totaldmg: z.number().optional(),
})

const matchStatsSchema = z.object({
  kills: z.number().optional(),
  assists: z.number().optional(),
  deaths: z.number().optional(),
  mvps: z.number().optional(),
  score: z.number().optional(),
})

const playerSchema = z.object({
  steamid: z.string().optional(),
  name: z.string().optional(),
  observer_slot: z.number().optional(),
  team: z.string().optional(),
  activity: z.string().optional(),
  state: playerStateSchema.optional(),
  match_stats: matchStatsSchema.optional(),
  position: z.string().optional(),
})

const gameStateSchema = z.object({
  provider: providerSchema.optional(),
  map: mapSchema.optional(),
  player: playerSchema.optional(),
  allplayers: z.record(z.string(), playerSchema).optional(),
  round: z
    .object({
      phase: z.string().optional(),
      win_team: z.string().optional(),
      bomb: z.string().optional(),
    })
    .optional(),
  bomb: z
    .object({
      state: z.string().optional(),
      position: z.string().optional(),
      player: z.string().optional(),
    })
    .optional(),
  phase_countdowns: z
    .object({
      phase: z.string().optional(),
      phase_ends_in: z.string().optional(),
    })
    .optional(),
})

export const gsiIpcSchema = {
  'gsi:start-server': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
      port: z.number().nullable(),
      error: z.string().optional(),
    }),
  },
  'gsi:stop-server': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
    }),
  },
  'gsi:get-status': {
    args: z.tuple([]),
    return: z.object({
      running: z.boolean(),
      port: z.number().nullable(),
      lastDataReceived: z.number().nullable(),
    }),
  },
  'gsi:get-game-state': {
    args: z.tuple([]),
    return: gameStateSchema.nullable(),
  },
  'gsi:write-config': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
      message: z.string(),
      port: z.number().nullable(),
    }),
  },
  'gsi:check-csgo-running': {
    args: z.tuple([]),
    return: z.object({
      running: z.boolean(),
      processName: z.string().nullable(),
    }),
  },
}
