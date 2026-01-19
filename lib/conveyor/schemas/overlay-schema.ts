import { z } from 'zod'

export const overlayIpcSchema = {
  'overlay:start-server': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
      port: z.number().nullable(),
      url: z.string().nullable(),
      error: z.string().optional(),
    }),
  },
  'overlay:stop-server': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
    }),
  },
  'overlay:get-status': {
    args: z.tuple([]),
    return: z.object({
      running: z.boolean(),
      port: z.number().nullable(),
      url: z.string().nullable(),
    }),
  },
}
