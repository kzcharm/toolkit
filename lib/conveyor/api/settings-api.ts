import { ConveyorApi } from '@/lib/preload/shared'

export class SettingsApi extends ConveyorApi {
  detectCSGOPath = () => this.invoke('settings:detect-csgo-path')
  getCSGOPath = () => this.invoke('settings:get-csgo-path')
  setCSGOPath = (path: string) => this.invoke('settings:set-csgo-path', path)
  getTheme = () => this.invoke('settings:get-theme')
  setTheme = (theme: 'dark' | 'light' | 'system') => this.invoke('settings:set-theme', theme)
  downloadMap = (url: string, mapName: string) =>
    this.invoke('settings:download-map', { url, mapName })
  getDownloadProgress = () => this.invoke('settings:get-download-progress')
  fetchMapsList = () => this.invoke('settings:fetch-maps-list')
  checkLocalMaps = () => this.invoke('settings:check-local-maps')
  downloadMissingMaps = (mapNames: string[]) => this.invoke('settings:download-missing-maps', mapNames)
  getBulkDownloadProgress = () => this.invoke('settings:get-bulk-download-progress')
  downloadMapPackage = () => this.invoke('settings:download-map-package')
  getPackageDownloadProgress = () => this.invoke('settings:get-package-download-progress')
  cancelPackageDownload = () => this.invoke('settings:cancel-package-download')
  clearMapsCache = () => this.invoke('settings:clear-maps-cache')
  saveCheckedMaps = (mapsData: unknown[]) => this.invoke('settings:save-checked-maps', mapsData)
  loadCheckedMaps = () => this.invoke('settings:load-checked-maps')
}
