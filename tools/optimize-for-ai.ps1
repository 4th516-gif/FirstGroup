# ============================================================
#  Windows PC Optimization for AI Usage (Claude + Cursor)
#  Run in PowerShell as Administrator:
#    Right-click PowerShell → "Run as Administrator"
#    Then: .\optimize-for-ai.ps1
# ============================================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Windows AI Performance Optimizer     " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Set High Performance Power Plan ──────────────────────
Write-Host "[1/8] Setting High Performance power plan..." -ForegroundColor Yellow
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null
if ($LASTEXITCODE -ne 0) {
    # Create it if it doesn't exist
    powercfg /duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null
    powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null
}
Write-Host "  Done." -ForegroundColor Green

# ── 2. Clear Temp Files ──────────────────────────────────────
Write-Host "[2/8] Clearing temp files..." -ForegroundColor Yellow
$tempPaths = @(
    $env:TEMP,
    $env:TMP,
    "C:\Windows\Temp",
    "$env:LOCALAPPDATA\Temp"
)
$freed = 0
foreach ($path in $tempPaths) {
    if (Test-Path $path) {
        $size = (Get-ChildItem $path -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $freed += $size
        Get-ChildItem $path -Recurse -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
}
$freedMB = [math]::Round($freed / 1MB, 1)
Write-Host "  Freed approximately $freedMB MB." -ForegroundColor Green

# ── 3. Clear Chrome Cache (used for Claude web + Cursor auth)
Write-Host "[3/8] Clearing Chrome cache..." -ForegroundColor Yellow
$chromeCachePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"
if (Test-Path $chromeCachePath) {
    Remove-Item "$chromeCachePath\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Chrome cache cleared." -ForegroundColor Green
} else {
    Write-Host "  Chrome cache not found — skipping." -ForegroundColor Gray
}
# Also clear Edge cache (used as fallback browser)
$edgeCachePath = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"
if (Test-Path $edgeCachePath) {
    Remove-Item "$edgeCachePath\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Edge cache cleared." -ForegroundColor Green
}

# ── 4. Disable Visual Effects for Performance ────────────────
Write-Host "[4/8] Optimizing Windows visual effects for performance..." -ForegroundColor Yellow
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects"
if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
Set-ItemProperty -Path $regPath -Name "VisualFXSetting" -Value 2  # "Adjust for best performance"
Write-Host "  Done." -ForegroundColor Green

# ── 5. Free RAM (flush standby memory) ──────────────────────
Write-Host "[5/8] Freeing standby memory..." -ForegroundColor Yellow
$before = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)
# Force garbage collection via .NET
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()
$after = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)
Write-Host "  Free RAM before: $before GB | after: $after GB" -ForegroundColor Green

# ── 6. Disable Background Apps ──────────────────────────────
Write-Host "[6/8] Disabling background app refresh..." -ForegroundColor Yellow
$bgAppsKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications"
if (-not (Test-Path $bgAppsKey)) { New-Item -Path $bgAppsKey -Force | Out-Null }
Set-ItemProperty -Path $bgAppsKey -Name "GlobalUserDisabled" -Value 1
Write-Host "  Done." -ForegroundColor Green

# ── 7. Optimize Network for Low Latency (better AI responses)
Write-Host "[7/8] Optimizing network settings for low latency..." -ForegroundColor Yellow
# Disable auto-tuning (can cause jitter on some connections)
netsh int tcp set global autotuninglevel=normal 2>$null
# Disable Nagle's algorithm (reduces AI chat latency)
$tcpKey = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"
Get-ChildItem $tcpKey | ForEach-Object {
    Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -ErrorAction SilentlyContinue
}
Write-Host "  Done." -ForegroundColor Green

# ── 8. Set Cursor and Code Editors to High Priority ─────────
Write-Host "[8/8] Boosting process priority for Cursor/VS Code..." -ForegroundColor Yellow
$aiApps = @("Cursor", "Code", "node", "chrome")
foreach ($app in $aiApps) {
    $procs = Get-Process -Name $app -ErrorAction SilentlyContinue
    foreach ($proc in $procs) {
        $proc.PriorityClass = "AboveNormal"
        Write-Host "  Set $($proc.Name) (PID $($proc.Id)) to AboveNormal priority." -ForegroundColor Gray
    }
}
Write-Host "  Done." -ForegroundColor Green

# ── Summary ──────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Optimization complete!               " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "What was done:" -ForegroundColor White
Write-Host "  Power plan    → High Performance" -ForegroundColor Gray
Write-Host "  Temp files    → Cleared (~$freedMB MB)" -ForegroundColor Gray
Write-Host "  Browser cache → Cleared (Chrome + Edge)" -ForegroundColor Gray
Write-Host "  Visual FX     → Set to performance mode" -ForegroundColor Gray
Write-Host "  Background    → Apps refreshing disabled" -ForegroundColor Gray
Write-Host "  Network       → Low-latency mode enabled" -ForegroundColor Gray
Write-Host "  Cursor/Code   → AboveNormal CPU priority" -ForegroundColor Gray
Write-Host ""
Write-Host "TIP: Run this before a heavy coding session with Claude or Cursor." -ForegroundColor Cyan
Write-Host ""
