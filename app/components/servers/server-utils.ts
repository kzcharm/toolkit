/**
 * Utility functions for server-related operations
 */

/**
 * Get map image URL from GitHub CDN
 */
export function getMapImageUrl(mapName: string | null): string | null {
  if (!mapName || mapName.trim() === '') {
    return null
  }
  return `https://github.com/KZGlobalTeam/map-images/raw/public/webp/${mapName}.webp`
}

/**
 * Get tier color for tier badges
 */
export function getTierColor(tier: number | null): string {
  if (tier === null || tier === 0) {
    return '#9CA3AF' // gray
  }
  const colors = [
    '#47AA67', // T1
    '#3B876D', // T2
    '#F39C12', // T3
    '#FD7E15', // T4
    '#E84C3D', // T5
    '#A62010', // T6
    '#8B1099', // T7
  ]
  const tierIndex = tier - 1
  return colors[tierIndex] || '#9CA3AF' // gray fallback
}

/**
 * Format tier display (e.g., "T1", "T2", etc.)
 */
export function formatTier(tier: number | null): string {
  if (tier === null || tier === 0) {
    return 'T0'
  }
  return `T${tier}`
}

/**
 * Format timer time (seconds) to readable format (e.g., "1:23:45" or "23:45")
 */
export function formatTimerTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '-'
  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * Get country flag emoji
 * Simple emoji-based approach since we don't have flag-icons library
 */
export function getCountryFlag(country: string | null): string {
  if (!country) return '🌍'
  
  const countryUpper = country.toUpperCase()
  
  // Map common country codes and full names to emoji flags
  const flagMap: Record<string, string> = {
    // Country codes
    CN: '🇨🇳',
    US: '🇺🇸',
    EU: '🇪🇺',
    DE: '🇩🇪',
    FR: '🇫🇷',
    GB: '🇬🇧',
    UK: '🇬🇧',
    RU: '🇷🇺',
    JP: '🇯🇵',
    KR: '🇰🇷',
    BR: '🇧🇷',
    CA: '🇨🇦',
    AU: '🇦🇺',
    NZ: '🇳🇿',
    SG: '🇸🇬',
    HK: '🇭🇰',
    TW: '🇹🇼',
    IN: '🇮🇳',
    FI: '🇫🇮',
    ASIA: '🌏',
    NA: '🌎',
    SA: '🌎',
    OCE: '🌏',
    AF: '🌍',
    ME: '🌍',
    // Full country names
    'CHINA': '🇨🇳',
    'UNITED STATES': '🇺🇸',
    'GERMANY': '🇩🇪',
    'FRANCE': '🇫🇷',
    'UNITED KINGDOM': '🇬🇧',
    'RUSSIA': '🇷🇺',
    'JAPAN': '🇯🇵',
    'SOUTH KOREA': '🇰🇷',
    'BRAZIL': '🇧🇷',
    'CANADA': '🇨🇦',
    'AUSTRALIA': '🇦🇺',
    'NEW ZEALAND': '🇳🇿',
    'SINGAPORE': '🇸🇬',
    'HONG KONG': '🇭🇰',
    'TAIWAN': '🇹🇼',
    'INDIA': '🇮🇳',
    'FINLAND': '🇫🇮',
  }
  
  return flagMap[countryUpper] || '🌍'
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
    document.body.removeChild(textArea)
  }
}
