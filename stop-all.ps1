# Chubao AI - Stop All Services
# Stops all services and cleans up port occupation

Write-Host "🛑 Stopping Chubao AI services..." -ForegroundColor Yellow

# Find and stop Node.js backend (port 3100)
$nodeProcesses = Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess -Unique

if ($nodeProcesses) {
    Write-Host "⏹️  Stopping Node.js backend processes..." -ForegroundColor Cyan
    foreach ($processId in $nodeProcesses) {
        Write-Host "   Killing PID: $processId" -ForegroundColor Gray
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "✅ Node.js backend not running" -ForegroundColor Green
}

# Find and stop Python automation service (port 3200)
$pythonProcesses = Get-NetTCPConnection -LocalPort 3200 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess -Unique

if ($pythonProcesses) {
    Write-Host "⏹️  Stopping Python automation service processes..." -ForegroundColor Cyan
    foreach ($processId in $pythonProcesses) {
        Write-Host "   Killing PID: $processId" -ForegroundColor Gray
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "✅ Python automation service not running" -ForegroundColor Green
}

# Wait for ports to release
Write-Host "⏳ Waiting for ports to release..." -ForegroundColor Gray
Start-Sleep -Seconds 2

# Verify ports are released
$nodeStillRunning = Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue
$pythonStillRunning = Get-NetTCPConnection -LocalPort 3200 -ErrorAction SilentlyContinue

Write-Host ""
if (-not $nodeStillRunning -and -not $pythonStillRunning) {
    Write-Host "✅ All services stopped!" -ForegroundColor Green
    Write-Host "   Ports 3100 and 3200 are now free" -ForegroundColor White
} else {
    Write-Host "⚠️  Some services are still running:" -ForegroundColor Yellow
    if ($nodeStillRunning) { Write-Host "   - Node.js backend (port 3100)" -ForegroundColor Yellow }
    if ($pythonStillRunning) { Write-Host "   - Python automation service (port 3200)" -ForegroundColor Yellow }
    Write-Host "💡 Manual command: taskkill /F /PID <process_id>" -ForegroundColor Gray
}