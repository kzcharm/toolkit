import { useState } from 'react'
import SettingsPage from '@/app/components/settings/SettingsPage'
import MapDownloadPage from '@/app/components/maps/MapDownloadPage'
import GOKZOverlayPage from '@/app/components/overlay/GOKZOverlayPage'
import ServersPage from '@/app/components/servers/ServersPage'
import { Button } from '@/app/components/ui/button'
import './styles/app.css'

type Page = 'settings' | 'maps' | 'overlay' | 'servers'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('settings')

  return (
    <div className="flex flex-col h-screen">
      <div className="flex gap-2 p-4 border-b">
        <Button
          variant={currentPage === 'settings' ? 'default' : 'ghost'}
          onClick={() => setCurrentPage('settings')}
        >
          Settings
        </Button>
        <Button
          variant={currentPage === 'maps' ? 'default' : 'ghost'}
          onClick={() => setCurrentPage('maps')}
        >
          Download Maps
        </Button>
        <Button
          variant={currentPage === 'overlay' ? 'default' : 'ghost'}
          onClick={() => setCurrentPage('overlay')}
        >
          GOKZ Overlay
        </Button>
        <Button
          variant={currentPage === 'servers' ? 'default' : 'ghost'}
          onClick={() => setCurrentPage('servers')}
        >
          Servers
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {currentPage === 'settings' && <SettingsPage />}
        {currentPage === 'maps' && <MapDownloadPage />}
        {currentPage === 'overlay' && <GOKZOverlayPage />}
        {currentPage === 'servers' && <ServersPage />}
      </div>
    </div>
  )
}
