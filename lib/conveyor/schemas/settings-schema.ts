import { z } from 'zod'

const mapInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  filesize: z.number(),
  validated: z.boolean(),
  difficulty: z.number(),
  created_on: z.string(),
  updated_on: z.string(),
  approved_by_steamid64: z.string(),
  workshop_url: z.string().nullable(),
  download_url: z.string().nullable(),
})

const localMapInfoSchema = z.object({
  name: z.string(),
  filesize: z.number().nullable(),
  exists: z.boolean(),
})

const mapDownloadProgressSchema = z.object({
  mapName: z.string(),
  progress: z.number(),
  status: z.enum(['pending', 'downloading', 'completed', 'failed']),
  error: z.string().nullable(),
})

const bulkDownloadProgressSchema = z.object({
  total: z.number(),
  completed: z.number(),
  failed: z.number(),
  maps: z.array(mapDownloadProgressSchema),
  downloading: z.boolean(),
  currentMap: z.string().nullable(),
  downloadSpeed: z.number().nullable(), // bytes per second
})

export const settingsIpcSchema = {
  'settings:detect-csgo-path': {
    args: z.tuple([]),
    return: z.string().nullable(),
  },
  'settings:get-csgo-path': {
    args: z.tuple([]),
    return: z.string().nullable(),
  },
  'settings:set-csgo-path': {
    args: z.tuple([z.string()]),
    return: z.void(),
  },
  'settings:get-theme': {
    args: z.tuple([]),
    return: z.enum(['dark', 'light', 'system']),
  },
  'settings:set-theme': {
    args: z.tuple([z.enum(['dark', 'light', 'system'])]),
    return: z.void(),
  },
  'settings:download-map': {
    args: z.tuple([
      z.object({
        url: z.string().url(),
        mapName: z.string(),
      }),
    ]),
    return: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
  },
  'settings:get-download-progress': {
    args: z.tuple([]),
    return: z.object({
      progress: z.number(),
      downloading: z.boolean(),
    }),
  },
  'settings:fetch-maps-list': {
    args: z.tuple([]),
    return: z.array(mapInfoSchema),
  },
  'settings:check-local-maps': {
    args: z.tuple([]),
    return: z.array(localMapInfoSchema),
  },
  'settings:download-missing-maps': {
    args: z.tuple([z.array(z.string())]),
    return: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
  },
  'settings:get-bulk-download-progress': {
    args: z.tuple([]),
    return: bulkDownloadProgressSchema,
  },
  'settings:download-map-package': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
  },
  'settings:get-package-download-progress': {
    args: z.tuple([]),
    return: z.object({
      progress: z.number(),
      downloading: z.boolean(),
      downloadSpeed: z.number().nullable(),
    }),
  },
  'settings:cancel-package-download': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
    }),
  },
  'settings:clear-maps-cache': {
    args: z.tuple([]),
    return: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
  },
  'settings:save-checked-maps': {
    args: z.tuple([z.array(z.any())]),
    return: z.void(),
  },
  'settings:load-checked-maps': {
    args: z.tuple([]),
    return: z
      .object({
        data: z.array(z.any()),
        timestamp: z.number(),
      })
      .nullable(),
  },
  'settings:get-overlay-enabled': {
    args: z.tuple([]),
    return: z.boolean(),
  },
  'settings:set-overlay-enabled': {
    args: z.tuple([z.boolean()]),
    return: z.void(),
  },
  'settings:get-gsi-auto-start': {
    args: z.tuple([]),
    return: z.boolean(),
  },
  'settings:set-gsi-auto-start': {
    args: z.tuple([z.boolean()]),
    return: z.void(),
  },
}
