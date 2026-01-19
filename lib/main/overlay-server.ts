import * as http from 'http'
import * as fs from 'fs-extra'
import * as path from 'path'
import { app } from 'electron'
import { GSIServer } from './gsi-server'

export interface OverlayServer {
  start: (gsiServer: GSIServer, startPort?: number, maxPort?: number) => Promise<number>
  stop: () => void
  getStatus: () => { running: boolean; port: number | null; url: string | null }
}

class OverlayServerImpl implements OverlayServer {
  private server: http.Server | null = null
  private port: number | null = null
  private isRunning = false
  private gsiServer: GSIServer | null = null

  async start(
    gsiServer: GSIServer,
    startPort: number = 4000,
    maxPort: number = 4100
  ): Promise<number> {
    if (this.isRunning && this.port) {
      return this.port
    }

    this.gsiServer = gsiServer

    for (let port = startPort; port <= maxPort; port++) {
      try {
        await this.tryStartServer(port)
        this.port = port
        this.isRunning = true
        return port
      } catch (error) {
        if (port === maxPort) {
          throw new Error(`Could not find available port between ${startPort} and ${maxPort}`)
        }
        // Continue to next port
      }
    }

    throw new Error('Failed to start overlay server')
  }

  private tryStartServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          // Handle CORS
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

          if (req.method === 'OPTIONS') {
            res.writeHead(200)
            res.end()
            return
          }

          const url = new URL(req.url || '/', `http://localhost:${port}`)

          // API endpoint to get GSI data
          if (url.pathname === '/api/gsi-data') {
            if (this.gsiServer) {
              const gameState = this.gsiServer.getGameState()
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(gameState || {}))
            } else {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'GSI server not available' }))
            }
            return
          }

          // Route-based overlay serving
          // /progress or /progress/ -> progression overlay
          if (url.pathname === '/progress' || url.pathname === '/progress/' || url.pathname === '/progress/index.html') {
            const html = await this.getProgressionOverlayHTML()
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(html)
            return
          }

          // /map or /map/ -> map overlay
          if (url.pathname === '/map' || url.pathname === '/map/' || url.pathname === '/map/index.html') {
            const html = await this.getMapOverlayHTML()
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(html)
            return
          }

          // Serve static assets for map overlay
          if (url.pathname.startsWith('/map/assets/')) {
            const filePath = url.pathname.replace('/map/assets/', '')
            const appPath = app.getAppPath()
            let assetPath = path.join(appPath, 'app', 'overlay', 'assets', filePath)

            if (!(await fs.pathExists(assetPath))) {
              assetPath = path.join(__dirname, '../../app/overlay/assets', filePath)
            }

            if (await fs.pathExists(assetPath)) {
              const content = await fs.readFile(assetPath)
              const ext = path.extname(assetPath).toLowerCase()
              const contentType = this.getContentType(ext)
              res.writeHead(200, { 'Content-Type': contentType })
              res.end(content)
              return
            }
          }

          // Serve built React overlay assets (for /overlay/ and /map-overlay/ paths)
          if (url.pathname.startsWith('/overlay/') || url.pathname.startsWith('/map-overlay/')) {
            const appPath = app.getAppPath()
            const distPath = path.join(appPath, 'dist')
            
            // Try dist folder first (production build)
            let assetPath = path.join(distPath, url.pathname.slice(1))
            
            if (!(await fs.pathExists(assetPath))) {
              // Fallback to app folder (development)
              assetPath = path.join(appPath, url.pathname.slice(1))
            }

            if (await fs.pathExists(assetPath) && (await fs.stat(assetPath)).isFile()) {
              const content = await fs.readFile(assetPath)
              const ext = path.extname(assetPath).toLowerCase()
              const contentType = this.getContentType(ext)
              res.writeHead(200, { 'Content-Type': contentType })
              res.end(content)
              return
            }
          }

          // Serve static assets (CSS, JS, etc.) - fallback
          if (url.pathname.startsWith('/')) {
            const filePath = url.pathname.slice(1)
            const appPath = app.getAppPath()
            let assetPath = path.join(appPath, 'app', 'overlay', filePath)

            if (!(await fs.pathExists(assetPath))) {
              assetPath = path.join(__dirname, '../../app/overlay', filePath)
            }

            if (await fs.pathExists(assetPath)) {
              const content = await fs.readFile(assetPath)
              const ext = path.extname(assetPath).toLowerCase()
              const contentType = this.getContentType(ext)
              res.writeHead(200, { 'Content-Type': contentType })
              res.end(content)
              return
            }
          }

          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
        } catch (error) {
          console.error('Overlay server error:', error)
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Internal server error')
        }
      })

      server.listen(port, () => {
        this.server = server
        resolve()
      })

      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`))
        } else {
          reject(error)
        }
      })
    })
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    }
    return types[ext] || 'application/octet-stream'
  }

  private async getProgressionOverlayHTML(): Promise<string> {
    // Return standalone HTML with inline CSS (no dependencies)
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Progress Overlay</title>
  
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }
    
    .container {
      width: 80%;
      max-width: 800px;
      height: 40px;
      margin: 40vh auto 0 auto;
      position: relative;
      background-color: rgba(0, 0, 0, 0.4);
      border: 2px solid rgba(255, 255, 255, 0.15);
      border-radius: 9999px;
      overflow: hidden;
    }
    
    .bar {
      height: 100%;
      background: linear-gradient(to right, #ee657a, #ab3c4c);
      width: 0%;
      transition: width 0.4s ease;
      position: relative;
    }
    
    
    .marker {
      position: absolute;
      top: 50%;
      left: 100%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 5;
      filter: drop-shadow(0 0 4px white);
    }
    
    .marker img {
      height: 48px;
      width: auto;
      object-fit: contain;
    }
    
    .label {
      position: absolute;
      width: 100%;
      top: 0;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: white;
      font-weight: normal;
      text-shadow: 1px 1px 3px black;
      pointer-events: none;
      z-index: 5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="bar" class="bar">
      <div class="marker">
        <img src="https://r2.axekz.com/img/gokz.gif" alt="GOKZ Indicator" />
      </div>
    </div>
    <div id="label" class="label">0%</div>
  </div>

  <script>
    const bar = document.getElementById('bar');
    const label = document.getElementById('label');
    
    const pollGSIData = async () => {
      try {
        const response = await fetch('/api/gsi-data');
        if (response.ok) {
          const data = await response.json();
          const score = data?.player?.match_stats?.score;
          
          if (typeof score === 'number') {
            const adjusted = score / 10;
            const percent = Math.max(0, Math.min(100, adjusted));
            bar.style.width = percent + '%';
            label.textContent = percent.toFixed(1) + '%';
          }
        }
      } catch (error) {
        console.warn('[Overlay] Error fetching GSI data:', error);
      }
    };
    
    // Poll every 100ms for smooth updates
    const interval = setInterval(pollGSIData, 100);
    pollGSIData(); // Initial fetch
  </script>
</body>
</html>`
  }

  private async getMapOverlayHTML(): Promise<string> {
    // Always use standalone HTML with inline JavaScript for immediate functionality
    // The React version requires build step and proper asset serving
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Map Overlay</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;500&display=swap" rel="stylesheet">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      font-family: "Work Sans", sans-serif;
    }
    body {
      background: rgba(0, 0, 0, 0.3);
    }
    .overlay {
      padding: 20px;
      border-radius: 15px;
    }
    .map-name {
      font-size: 34px;
      font-weight: 500;
      padding-right: 1px;
      color: white;
    }
    .record-row {
      padding-left: 10px;
    }
    .tp-record-header, .nub-record-header {
      color: orange;
      font-size: 22px;
      font-weight: 300;
    }
    .tp-record-header {
      margin-left: 19px;
    }
    .pro-record-header {
      color: #1e90ff;
      margin-left: 1px;
      font-size: 22px;
      font-weight: 300;
    }
    .record-time-wr {
      color: #adff2f;
    }
    .record-time-diff {
      color: #ff7f7f;
    }
    .loading-indicator {
      height: 20px;
      margin-left: 5px;
      vertical-align: bottom;
    }
    .record-player-name {
      max-width: 100px;
      display: inline-block;
      white-space: nowrap;
      overflow-x: hidden;
      text-overflow: ellipsis;
      vertical-align: bottom;
    }
    span {
      color: white;
      font-size: 22px;
      font-weight: 300;
      padding-left: 5px;
    }
  </style>
</head>
<body>
  <div id="overlay" class="overlay">
    <table>
      <tr>
        <td>
          <span id="mapName" class="map-name">Unknown map</span>
          <img id="mapLoading" class="loading-indicator" src="/map/assets/loading.gif" style="display: none;" alt="Loading" />
          <span id="mapInfo"></span>
        </td>
      </tr>
      <tbody id="records"></tbody>
    </table>
  </div>

  <script>
    const API_BASE_URL = 'https://kztimerglobal.com/api/v2.0';
    const CACHE_LIFETIME = 25;
    const VALID_KZ_MODES = ['KZT', 'SKZ', 'VNL', 'FKZ', 'HKZ'];
    const VALID_KZ_MAP_PREFIXES = ['kz', 'xc', 'bkz', 'skz', 'vnl', 'kzpro'];
    const GLOBAL_MODE_MAP = { KZT: 'kz_timer', SKZ: 'kz_simple', VNL: 'kz_vanilla' };
    const DEFAULT_MODE = 'KZT';
    const DEFAULT_MAP_NAME = 'Unknown map';
    const DATA_FETCH_INTERVAL = 30;

    let mapName = DEFAULT_MAP_NAME;
    let modeName = DEFAULT_MODE;
    let steamId = '';
    let map = null;
    let tpWr = null;
    let tpPb = null;
    let proWr = null;
    let proPb = null;
    let fetchTimer = null;
    let abortController = new AbortController();

    // Cache utilities
    function getCacheEntry(key) {
      const data = sessionStorage.getItem(key);
      if (!data) return null;
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }

    function setCacheEntry(key, value, lifetimeSeconds) {
      sessionStorage.setItem(key, JSON.stringify({
        data: value,
        expires: Math.floor(Date.now() / 1000) + lifetimeSeconds
      }));
    }

    function isExpiredCacheEntry(entry) {
      if (!entry) return true;
      return entry.expires < Math.floor(Date.now() / 1000);
    }

    // Utility functions
    function getMapPrettyName(fullMapName) {
      return fullMapName.split('/').pop() || fullMapName;
    }

    function getMapPrefix(mapName) {
      return mapName.includes('_') ? mapName.split('_')[0] : '';
    }

    function isValidKzMap(mapName) {
      const prefix = getMapPrefix(mapName).toLowerCase();
      return VALID_KZ_MAP_PREFIXES.includes(prefix);
    }

    // Get the full map name for API calls
    // If map name doesn't have a valid prefix, add 'kz_' prefix (most common)
    function getMapNameForAPI(mapName) {
      // If it already has a valid prefix, use it as-is
      if (isValidKzMap(mapName)) {
        return mapName;
      }

      // Default to kz_ prefix if no prefix found (most common)
      return 'kz_' + mapName;
    }

    function getGlobalMode(modeName) {
      return GLOBAL_MODE_MAP[modeName] || null;
    }

    function extractModeFromClan(clan) {
      if (!clan) return null;
      // Match [SKZ], [SKZ Amateur+], [KZT], etc. - extract the 3-letter mode code
      const match = clan.match(/^\\[([A-Z]{3})/);
      return match ? match[1] : null;
    }

    function formatTime(seconds) {
      const fixed = parseFloat(seconds.toFixed(2));
      const h = Math.floor(fixed / 3600);
      const m = Math.floor((fixed % 3600) / 60);
      const s = Math.floor((fixed % 3600) % 60);
      const ms = fixed.toFixed(2).slice(-3);
      const pad = (num) => ('000' + num).slice(-2);
      const result = pad(m) + ':' + pad(s) + '.' + ms;
      return h > 0 ? pad(h) + ':' + result : result;
    }

    // API client
    async function cachedFetch(url, queryParams) {
      // Construct full URL - remove leading slash from path if present
      const urlPath = url.startsWith('/') ? url.slice(1) : url;
      const fullUrl = new URL(API_BASE_URL + '/' + urlPath);
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          fullUrl.searchParams.append(key, String(value));
        });
      }

      const cacheKey = fullUrl.toString();
      const cacheEntry = getCacheEntry(cacheKey);

      if (!isExpiredCacheEntry(cacheEntry)) {
        return cacheEntry.data;
      }

      try {
        const response = await fetch(fullUrl, {
          signal: abortController.signal
        });

        if (!response.ok) {
          return undefined;
        }

        const data = await response.json();
        setCacheEntry(cacheKey, data, CACHE_LIFETIME);
        return data;
      } catch (err) {
        if (err.name === 'AbortError') {
          return undefined;
        }
        console.error('[MapOverlay] API error:', err);
        return null;
      }
    }

    async function getMapByName(mapName) {
      const result = await cachedFetch('maps/name/' + mapName);
      return result === undefined || result === null ? result : result;
    }

    async function getTpWorldRecord(mapName, mode) {
      const result = await cachedFetch('records/top', {
        limit: 1,
        stage: 0,
        tickrate: 128,
        map_name: mapName,
        has_teleports: true,
        modes_list_string: mode
      });
      return Array.isArray(result) ? result : undefined;
    }

    async function getProWorldRecord(mapName, mode) {
      const result = await cachedFetch('records/top', {
        limit: 1,
        stage: 0,
        tickrate: 128,
        map_name: mapName,
        has_teleports: false,
        modes_list_string: mode
      });
      return Array.isArray(result) ? result : undefined;
    }

    async function getTpPersonalBest(mapName, mode, steamId) {
      const result = await cachedFetch('records/top', {
        stage: 0,
        limit: 1,
        tickrate: 128,
        map_name: mapName,
        steamId64: steamId,
        has_teleports: true,
        modes_list_string: mode
      });
      return Array.isArray(result) ? result : undefined;
    }

    async function getProPersonalBest(mapName, mode, steamId) {
      const result = await cachedFetch('records/top', {
        stage: 0,
        limit: 1,
        tickrate: 128,
        map_name: mapName,
        steamId64: steamId,
        has_teleports: false,
        modes_list_string: mode
      });
      return Array.isArray(result) ? result : undefined;
    }

    function resetState(isMapChange) {
      if (fetchTimer) {
        clearTimeout(fetchTimer);
        fetchTimer = null;
      }
      abortController.abort();
      abortController = new AbortController();

      if (isMapChange) {
        map = isValidKzMap(mapName) ? undefined : null;
      }

      const state = isValidKzMap(mapName) && getGlobalMode(modeName) ? undefined : null;
      tpWr = state;
      tpPb = state;
      proWr = state;
      proPb = state;
    }

    function queueDataFetch() {
      if (fetchTimer) {
        clearTimeout(fetchTimer);
      }
      if (DATA_FETCH_INTERVAL) {
        fetchTimer = setTimeout(fetchData, DATA_FETCH_INTERVAL * 1000);
      }
    }

    async function fetchData() {
      // Don't fetch if map name is still the default
      if (mapName === DEFAULT_MAP_NAME || !mapName || mapName.trim() === '') {
        return;
      }

      // Get the API map name (with prefix if needed)
      const apiMapName = getMapNameForAPI(mapName);
      const isKzMap = isValidKzMap(apiMapName);
      
      if (!isKzMap) {
        return;
      }

      console.log('[MapOverlay] Fetching data for map:', apiMapName, '(original:', mapName + ')');

      try {
        const mapData = await getMapByName(apiMapName);
        map = mapData;

        if (mapData === undefined) {
          queueDataFetch();
          return;
        }

        if (!mapData || !mapData.validated) {
          tpWr = null;
          tpPb = null;
          proWr = null;
          proPb = null;
          updateUI();
          return;
        }

        const globalMode = getGlobalMode(modeName);
        if (!globalMode) {
          return;
        }

        const [tpWrResult, proWrResult] = await Promise.all([
          getTpWorldRecord(apiMapName, globalMode),
          getProWorldRecord(apiMapName, globalMode)
        ]);

        tpWr = Array.isArray(tpWrResult) && tpWrResult.length > 0 ? tpWrResult[0] : null;
        proWr = Array.isArray(proWrResult) && proWrResult.length > 0 ? proWrResult[0] : null;

        if (steamId) {
          const [tpPbResult, proPbResult] = await Promise.all([
            tpWr ? getTpPersonalBest(apiMapName, globalMode, steamId) : Promise.resolve(null),
            proWr ? getProPersonalBest(apiMapName, globalMode, steamId) : Promise.resolve(null)
          ]);

          tpPb = Array.isArray(tpPbResult) && tpPbResult.length > 0 ? tpPbResult[0] : null;
          proPb = Array.isArray(proPbResult) && proPbResult.length > 0 ? proPbResult[0] : null;
        } else {
          tpPb = null;
          proPb = null;
        }

        updateUI();
        queueDataFetch();
      } catch (error) {
        console.error('[MapOverlay] Error fetching data:', error);
        queueDataFetch();
      }
    }

    function updateUI() {
      try {
        const mapNameEl = document.getElementById('mapName');
        const mapInfoEl = document.getElementById('mapInfo');
        const mapLoadingEl = document.getElementById('mapLoading');
        const recordsEl = document.getElementById('records');

        if (!mapNameEl || !mapInfoEl || !recordsEl) {
          console.error('[MapOverlay] Missing DOM elements');
          return;
        }

        mapNameEl.textContent = mapName || DEFAULT_MAP_NAME;

        if (map === undefined) {
          if (mapLoadingEl) mapLoadingEl.style.display = 'inline-block';
          if (mapInfoEl) mapInfoEl.textContent = '';
        } else {
          if (mapLoadingEl) mapLoadingEl.style.display = 'none';
          if (map && map.validated) {
            if (mapInfoEl) {
              mapInfoEl.textContent = ' ' + modeName + ' / T' + (map.difficulty || '?');
              mapInfoEl.className = 'text-white text-[22px] font-light pl-[5px]';
            }
          } else if (isValidKzMap(mapName)) {
            if (mapInfoEl) {
              mapInfoEl.textContent = ' ' + modeName + ' / NON GLOBAL';
              mapInfoEl.className = 'text-white text-[22px] font-light pl-[5px]';
            }
          } else {
            if (mapInfoEl) mapInfoEl.textContent = '';
          }
        }

        if (recordsEl) {
          recordsEl.innerHTML = '';
          const preferNubTimes = false;

          if (map && proWr !== null) {
            const row = createRecordRow('PRO', proWr, proPb);
            recordsEl.appendChild(row);
          }

          if (map && tpWr !== null && !preferNubTimes) {
            const row = createRecordRow('TP', tpWr, tpPb);
            recordsEl.appendChild(row);
          }

          if (map && preferNubTimes) {
            const nubWr = (tpWr !== undefined && proWr !== undefined) 
              ? (tpWr && proWr ? (tpWr.time <= proWr.time ? tpWr : proWr) : (tpWr || proWr))
              : undefined;
            const nubPb = (tpPb !== undefined && proPb !== undefined)
              ? (tpPb && proPb ? (tpPb.time <= proPb.time ? tpPb : proPb) : (tpPb || proPb))
              : undefined;
            if (nubWr !== null && nubWr !== undefined) {
              const row = createRecordRow('NUB', nubWr, nubPb);
              recordsEl.appendChild(row);
            }
          }
        }
      } catch (error) {
        console.error('[MapOverlay] Error in updateUI:', error);
      }
    }

    function createRecordRow(label, wr, pb) {
      const tr = document.createElement('tr');
      tr.className = 'record-row';
      const td = document.createElement('td');

      const headerColor = label === 'PRO' ? '#1e90ff' : 'orange';
      const marginLeft = label === 'TP' ? '19px' : label === 'PRO' ? '1px' : '0px';

      let html = '<span style="color: ' + headerColor + '; font-size: 22px; font-weight: 300; margin-left: ' + marginLeft + ';">' + label + ' |</span>';

      if (wr === undefined) {
        html += '<img class="loading-indicator" src="/map/assets/loading.gif" alt="Loading" />';
      } else if (wr) {
        html += '<div style="display: inline; color: white; font-size: 22px; font-weight: 300; padding-left: 5px;">';
        html += formatTime(wr.time) + ' by';
        html += '<span class="record-player-name">' + wr.player_name + '</span>';

        if (pb === undefined) {
          html += '<img class="loading-indicator" src="/map/assets/loading.gif" alt="Loading" />';
        } else if (pb) {
          if (pb.time === wr.time) {
            html += '<span class="record-time-wr"> (WR by me)</span>';
          } else {
            html += '<span class="record-time-diff"> (+' + formatTime(pb.time - wr.time) + ')</span>';
          }
        }
        html += '</div>';
      }

      td.innerHTML = html;
      tr.appendChild(td);
      return tr;
    }

    // Poll GSI data
    async function pollGSIData() {
      try {
        const response = await fetch('/api/gsi-data');
        if (response.ok) {
          const data = await response.json();
          const newSteamId = data?.player?.steamid || data?.provider?.steamid || '';
          if (newSteamId !== steamId) {
            steamId = newSteamId;
          }

          const fullMapName = data?.map?.name;
          if (fullMapName) {
            const prettyName = getMapPrettyName(fullMapName);
            if (prettyName && prettyName !== mapName) {
              console.log('[MapOverlay] Map changed:', fullMapName, '->', prettyName);
              resetState(true);
              mapName = prettyName;
              updateUI(); // Update UI immediately
              fetchData();
            }
          } else {
            // If no map name in GSI, keep current or reset to default
            if (mapName === DEFAULT_MAP_NAME) {
              updateUI();
            }
          }

          const clan = data?.player?.clan;
          const extractedMode = extractModeFromClan(clan);
          const newMode = extractedMode && VALID_KZ_MODES.includes(extractedMode) ? extractedMode : DEFAULT_MODE;
          if (newMode !== modeName) {
            console.log('[MapOverlay] Mode changed:', modeName, '->', newMode);
            resetState(false);
            modeName = newMode;
            fetchData();
          }

          updateUI();
        }
      } catch (error) {
        console.warn('[MapOverlay] Error fetching GSI data:', error);
      }
    }

    // Initialize
    try {
      updateUI();
      const interval = setInterval(pollGSIData, 100);
      pollGSIData();
      fetchData();
    } catch (error) {
      console.error('[MapOverlay] Initialization error:', error);
      // Ensure at least something is visible
      const mapNameEl = document.getElementById('mapName');
      if (mapNameEl) {
        mapNameEl.textContent = 'Map Overlay (Error)';
      }
    }
  </script>
</body>
</html>`
  }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
    this.isRunning = false
    this.port = null
    this.gsiServer = null
  }

  getStatus(): { running: boolean; port: number | null; url: string | null } {
    return {
      running: this.isRunning,
      port: this.port,
      url: this.port ? `http://localhost:${this.port}` : null,
    }
  }
}

// Singleton instance
let overlayServerInstance: OverlayServerImpl | null = null

export function getOverlayServer(): OverlayServer {
  if (!overlayServerInstance) {
    overlayServerInstance = new OverlayServerImpl()
  }
  return overlayServerInstance
}
