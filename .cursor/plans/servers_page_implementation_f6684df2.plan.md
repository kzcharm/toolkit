---
name: Servers Page Implementation
overview: Create a servers page component that displays server status information with filtering, sorting, and grid/table views using shadcn components and Tailwind CSS, based on the reference gokz-top servers page layout and features.
todos:
  - id: add-ui-components
    content: "Add missing shadcn UI components: Card, Select, Checkbox"
    status: completed
  - id: create-server-utils
    content: Create server utility functions (tier colors, country flags, clipboard)
    status: completed
  - id: create-server-card
    content: Create ServerCard component with map image, badges, and player list
    status: completed
  - id: create-servers-page
    content: Create ServersPage component with filtering, sorting, and grid view
    status: completed
  - id: update-app-navigation
    content: Update app.tsx to include servers page in navigation
    status: completed
---

# Servers Page Implementation Plan

## Overview

Create a servers page component that displays GOKZ server status information with filtering, sorting, and multiple view modes. The page will use shadcn components and Tailwind CSS for styling, following patterns from the reference projects.

## Components to Create/Update

### 1. Add Missing shadcn UI Components

- **Card component** (`app/components/ui/card.tsx`) - For server cards in grid view
- **Select component** (`app/components/ui/select.tsx`) - For country and tier filters
- **Checkbox component** (`app/components/ui/checkbox.tsx`) - For filter toggles (hide full/empty)

### 2. Create Servers Page Component

- **ServersPage component** (`app/components/servers/ServersPage.tsx`)
  - Main page component with header, filters, and view switcher
  - State management for filters (country, tier, hide full/empty)
  - State management for sorting (field and direction)
  - State management for view mode (grid/table)
  - Fetch server data from `https://gokz.top/api/v1/public-servers/status/`
  - Auto-refresh every 5 seconds
  - Client-side filtering and sorting

### 3. Create Server Card Component

- **ServerCard component** (`app/components/servers/ServerCard.tsx`)
  - Display server information in card format
  - Map image with 16:9 aspect ratio
  - Map name and tier badge overlay
  - Country flag and hostname
  - Player count badge (color-coded: green=normal, red=full, blue=empty, gray=offline)
  - Copy address button
  - Player list display
  - Responsive design

### 4. Create Utility Functions

- **Server utilities** (`app/components/servers/server-utils.ts`)
  - `getTierColor(tier: number | null): string` - Get tier color
  - `getTierLabel(tier: number | null): string` - Get tier label (T1, T2, etc.)
  - `getCountryFlag(country: string | null): string` - Get country flag emoji
  - `copyToClipboard(text: string): Promise<void>` - Copy text to clipboard

### 5. Update App Navigation

- **Update app.tsx** (`app/app.tsx`)
  - Add 'servers' to Page type
  - Add Servers button to navigation
  - Add ServersPage to page rendering logic

## Data Structure

Based on the reference implementation, server data structure:

```typescript
interface ServerStatusResponse {
  id: number
  host: string
  port: number
  hostname: string | null
  status: "online" | "offline"
  online: boolean
  info: ServerInfo | null
  players: ServerPlayerInfo[]
  country: string | null
  group_id: number | null
}

interface ServerInfo {
  server_name: string | null
  player_count: number
  max_players: number
  map: string | null
  map_tier: number | null
  // ... other fields
}
```

## Features to Implement

1. **Server Display**

   - Grid view with server cards
   - Map images from `https://github.com/KZGlobalTeam/map-images/raw/public/webp/{mapName}.webp`
   - Tier badges with color coding
   - Player count badges

2. **Filtering**

   - Filter by country (dropdown)
   - Filter by map tier (dropdown)
   - Hide full servers (checkbox)
   - Hide empty servers (checkbox)

3. **Sorting**

   - Sort by player count (default, descending)
   - Sort by hostname (ascending)
   - Sort by IP address (ascending)
   - Sort by map tier (ascending)
   - Toggle sort direction

4. **Actions**

   - Copy server address to clipboard (`connect {host}:{port}`)
   - Display player list on cards

5. **Statistics**

   - Total online players count
   - Total online servers count

## Styling Approach

- Use Tailwind CSS utility classes following the website project patterns
- Use shadcn components for consistent UI
- Responsive grid layout: 1 column on mobile, 2 on tablet, 3-4 on desktop
- Dark mode support via existing theme system
- Card styling with borders, shadows, and hover effects

## API Integration

- Fetch from: `https://gokz.top/api/v1/public-servers/status/?enabled=true&limit=1000`
- Auto-refresh every 5 seconds using `setInterval`
- Handle loading and error states
- Client-side filtering and sorting for better performance

## File Structure

```
app/
  components/
    servers/
      ServersPage.tsx          # Main page component
      ServerCard.tsx            # Server card component
      server-utils.ts           # Utility functions
    ui/
      card.tsx                  # Card component (new)
      select.tsx                # Select component (new)
      checkbox.tsx              # Checkbox component (new)
  app.tsx                       # Updated with servers page
```