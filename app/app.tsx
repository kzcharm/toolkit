import { useState } from 'react'
import SettingsPage from '@/app/components/settings/SettingsPage'
import MapDownloadPage from '@/app/components/maps/MapDownloadPage'
import { Button } from '@/app/components/ui/button'
import './styles/app.css'

type Page = 'settings' | 'maps'

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
      </div>
      <div className="flex-1 overflow-auto">
        {currentPage === 'settings' && <SettingsPage />}
        {currentPage === 'maps' && <MapDownloadPage />}
      </div>
    </div>
  )
}
