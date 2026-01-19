# Test script to read CS:GO installation path from Windows Registry

Write-Host "=== Testing CS:GO Path Detection via Registry ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Windows Registry for Steam path
Write-Host "Step 1: Reading Steam path from Registry..." -ForegroundColor Yellow
$steamPath = $null

try {
    $regPath = "HKCU:\Software\Valve\Steam"
    if (Test-Path $regPath) {
        $steamPathValue = Get-ItemProperty -Path $regPath -Name "SteamPath" -ErrorAction Stop
        $steamPath = $steamPathValue.SteamPath
        Write-Host "  [OK] Found Steam path in registry: $steamPath" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Registry key not found: $regPath" -ForegroundColor Red
    }
} catch {
    Write-Host "  [FAIL] Error reading registry: $_" -ForegroundColor Red
}

# Step 2: If registry failed, try common locations
if (-not $steamPath) {
    Write-Host ""
    Write-Host "Step 2: Trying common Steam installation paths..." -ForegroundColor Yellow
    $commonPaths = @(
        "C:\Program Files (x86)\Steam",
        "C:\Program Files\Steam",
        "$env:USERPROFILE\Steam"
    )
    
    foreach ($commonPath in $commonPaths) {
        if (Test-Path $commonPath) {
            $steamPath = $commonPath
            Write-Host "  [OK] Found Steam at common location: $steamPath" -ForegroundColor Green
            break
        }
    }
    
    if (-not $steamPath) {
        Write-Host "  [FAIL] Could not find Steam installation" -ForegroundColor Red
        exit 1
    }
}

# Step 3: Read libraryfolders.vdf
Write-Host ""
Write-Host "Step 3: Reading libraryfolders.vdf..." -ForegroundColor Yellow
$libraryFoldersPath = Join-Path $steamPath "steamapps\libraryfolders.vdf"

if (-not (Test-Path $libraryFoldersPath)) {
    Write-Host "  [FAIL] libraryfolders.vdf not found at: $libraryFoldersPath" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Found libraryfolders.vdf" -ForegroundColor Green

# Step 4: Parse VDF file (simple parsing)
Write-Host ""
Write-Host "Step 4: Parsing library folders..." -ForegroundColor Yellow
$content = Get-Content $libraryFoldersPath -Raw
$libraryFolders = @()

# Simple VDF parsing - look for path entries
# The format is: "path"		"C:\\..."
$lines = $content -split "`n"
foreach ($line in $lines) {
    # Look for lines containing "path" followed by a quoted path
    if ($line -match '"path"\s+"([^"]+)"') {
        $pathValue = $matches[1] -replace '\\\\', '\'
        $libraryFolders += @{
            Id = $libraryFolders.Count
            Path = $pathValue
        }
        Write-Host "  [OK] Found library folder: $pathValue" -ForegroundColor Green
    }
}

if ($libraryFolders.Count -eq 0) {
    Write-Host "  [FAIL] No library folders found" -ForegroundColor Red
    exit 1
}

# Step 5: Search for CS:GO/CS2
Write-Host ""
Write-Host "Step 5: Searching for CS:GO/CS2 installation..." -ForegroundColor Yellow

$foundPaths = @()

foreach ($folder in $libraryFolders) {
    $basePath = $folder.Path
    
    # Check for CS:GO (appid 730)
    $csgoPath = Join-Path $basePath "steamapps\common\Counter-Strike Global Offensive"
    if (Test-Path $csgoPath) {
        Write-Host "  [OK] Found CS:GO at: $csgoPath" -ForegroundColor Green
        
        # Check if it's CS2 (has game/csgo folder)
        $cs2GamePath = Join-Path $csgoPath "game\csgo"
        if (Test-Path $cs2GamePath) {
            Write-Host "    -> CS2 detected! Game path: $cs2GamePath" -ForegroundColor Cyan
            $foundPaths += @{
                Type = "CS2"
                Path = $cs2GamePath
                FullPath = $csgoPath
            }
        } else {
            Write-Host "    -> CS:GO (legacy)" -ForegroundColor Cyan
            $foundPaths += @{
                Type = "CS:GO"
                Path = $csgoPath
                FullPath = $csgoPath
            }
        }
    }
    
    # Check for CS2 directly
    $cs2Path = Join-Path $basePath "steamapps\common\Counter-Strike 2"
    if (Test-Path $cs2Path) {
        Write-Host "  [OK] Found CS2 at: $cs2Path" -ForegroundColor Green
        $cs2GamePath = Join-Path $cs2Path "game\csgo"
        if (Test-Path $cs2GamePath) {
            Write-Host "    -> Game path: $cs2GamePath" -ForegroundColor Cyan
            $foundPaths += @{
                Type = "CS2"
                Path = $cs2GamePath
                FullPath = $cs2Path
            }
        } else {
            $foundPaths += @{
                Type = "CS2"
                Path = $cs2Path
                FullPath = $cs2Path
            }
        }
    }
}

Write-Host ""
Write-Host "=== Results ===" -ForegroundColor Cyan
if ($foundPaths.Count -gt 0) {
    Write-Host "Found $($foundPaths.Count) CS:GO/CS2 installation(s):" -ForegroundColor Green
    foreach ($found in $foundPaths) {
        Write-Host ""
        Write-Host "  Type: $($found.Type)" -ForegroundColor Yellow
        Write-Host "  Recommended Path: $($found.Path)" -ForegroundColor White
        Write-Host "  Full Installation: $($found.FullPath)" -ForegroundColor Gray
        
        # Check if maps folder exists
        $mapsPath = Join-Path $found.Path "maps"
        if (Test-Path $mapsPath) {
            Write-Host "  Maps folder: $mapsPath [EXISTS]" -ForegroundColor Green
        } else {
            Write-Host "  Maps folder: $mapsPath [WILL BE CREATED]" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[FAIL] No CS:GO/CS2 installation found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Searched in:" -ForegroundColor Yellow
    foreach ($folder in $libraryFolders) {
        $searchPath = Join-Path $folder.Path "steamapps\common"
        Write-Host "  - $searchPath" -ForegroundColor Gray
    }
}
