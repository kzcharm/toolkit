import { z } from 'zod'

export const pingIpcSchema = {
  pingServer: {
    args: z.tuple([
      z.object({
        host: z.string(),
        port: z.number(),
      }),
    ]),
    return: z.object({
      ping: z.number().nullable(), // ping in milliseconds, null if failed
      error: z.string().nullable(), // error message if ping failed
    }),
  },
}
