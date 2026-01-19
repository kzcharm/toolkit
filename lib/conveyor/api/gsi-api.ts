import { ConveyorApi } from '@/lib/preload/shared'

export class GsiApi extends ConveyorApi {
  startServer = () => this.invoke('gsi:start-server')
  stopServer = () => this.invoke('gsi:stop-server')
  getStatus = () => this.invoke('gsi:get-status')
  getGameState = () => this.invoke('gsi:get-game-state')
  writeConfig = () => this.invoke('gsi:write-config')
  checkCSGORunning = () => this.invoke('gsi:check-csgo-running')
}
