import { ConveyorApi } from '@/lib/preload/shared'

export class OverlayApi extends ConveyorApi {
  startServer = () => this.invoke('overlay:start-server')
  stopServer = () => this.invoke('overlay:stop-server')
  getStatus = () => this.invoke('overlay:get-status')
}
