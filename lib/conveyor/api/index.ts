import { electronAPI } from '@electron-toolkit/preload'
import { AppApi } from './app-api'
import { WindowApi } from './window-api'
import { SettingsApi } from './settings-api'

export const conveyor = {
  app: new AppApi(electronAPI),
  window: new WindowApi(electronAPI),
  settings: new SettingsApi(electronAPI),
}

export type ConveyorApi = typeof conveyor
