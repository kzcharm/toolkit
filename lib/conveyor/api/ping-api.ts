import { ConveyorApi } from '@/lib/preload/shared'

export class PingApi extends ConveyorApi {
  pingServer = (host: string, port: number) =>
    this.invoke('pingServer', { host, port })
}
