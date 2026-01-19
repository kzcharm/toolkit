import { useEffect, useState } from 'react'

interface GameState {
  player?: {
    match_stats?: {
      score?: number
    }
  }
}

// Preset color schemes
const COLOR_PRESETS: Record<string, { from: string; to: string }> = {
  red: { from: '#ee657a', to: '#ab3c4c' },
  blue: { from: '#4a90e2', to: '#2e5c8a' },
  green: { from: '#4ade80', to: '#16a34a' },
  purple: { from: '#a855f7', to: '#7c3aed' },
  orange: { from: '#fb923c', to: '#ea580c' },
  yellow: { from: '#fbbf24', to: '#d97706' },
  cyan: { from: '#22d3ee', to: '#0891b2' },
  pink: { from: '#f472b6', to: '#db2777' },
}

export default function ProgressionOverlay() {
  const [percent, setPercent] = useState(0)

  // Read color query parameter
  const urlParams = new URLSearchParams(window.location.search)
  const colorParam = urlParams.get('color') || 'red'
  const colorScheme = COLOR_PRESETS[colorParam] || COLOR_PRESETS.red

  useEffect(() => {
    // Poll GSI data from the overlay server endpoint
    const pollGSIData = async () => {
      try {
        // Get the overlay server URL from the current page URL
        const baseUrl = window.location.origin
        const response = await fetch(`${baseUrl}/api/gsi-data`)
        
        if (response.ok) {
          const data: GameState = await response.json()
          const score = data?.player?.match_stats?.score

          if (typeof score === 'number') {
            const adjusted = score / 10
            const calculatedPercent = Math.max(0, Math.min(100, adjusted))
            setPercent(calculatedPercent)
          }
        }
      } catch (error) {
        console.warn('[Overlay] Error fetching GSI data:', error)
      }
    }

    // Poll every 100ms for smooth updates
    const interval = setInterval(pollGSIData, 100)
    pollGSIData() // Initial fetch

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="w-[80%] max-w-[800px] h-10 mx-auto mt-[40vh] relative bg-black/40 border-2 border-white/15 rounded-full overflow-hidden">
      {/* Progress Bar */}
      <div
        className="h-full transition-all duration-400 ease-out relative"
        style={{ 
          width: `${percent}%`,
          background: `linear-gradient(to right, ${colorScheme.from}, ${colorScheme.to})`
        }}
      >
        {/* Marker - running man GIF */}
        <div className="absolute top-1/2 left-full -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[5] drop-shadow-[0_0_4px_white]">
          <img 
            src="https://r2.axekz.com/img/gokz.gif" 
            alt="GOKZ Indicator" 
            className="h-12 w-auto object-contain"
          />
        </div>
      </div>
      
      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center text-lg text-white font-normal drop-shadow-[1px_1px_3px_rgba(0,0,0,1)] pointer-events-none z-[5]">
        {percent.toFixed(1)}%
      </div>
    </div>
  )
}
