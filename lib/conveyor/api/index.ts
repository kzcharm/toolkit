import { electronAPI } from '@electron-toolkit/preload'
import { AppApi } from './app-api'
import { WindowApi } from './window-api'
import { SettingsApi } from './settings-api'
import { GsiApi } from './gsi-api'
import { OverlayApi } from './overlay-api'
import { PingApi } from './ping-api'

export const conveyor = {
  app: new AppApi(electronAPI),
  window: new WindowApi(electronAPI),
  settings: new SettingsApi(electronAPI),
  gsi: new GsiApi(electronAPI),
  overlay: new OverlayApi(electronAPI),
  ping: new PingApi(electronAPI),
}

export type ConveyorApi = typeof conveyor
