# Chubao AI - Start All Services
# Launches: Node.js backend + Python automation service

Write-Host "🚀 Starting Chubao AI services..." -ForegroundColor Green

# Check if already running
$nodePort = Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue
$pythonPort = Get-NetTCPConnection -LocalPort 3200 -ErrorAction SilentlyContinue

if ($nodePort) {
    Write-Host "⚠️  Node.js backend (port 3100) already running (PID: $($nodePort.OwningProcess))" -ForegroundColor Yellow
} else {
    Write-Host "▶️  Starting Node.js backend..." -ForegroundColor Cyan
    Set-Location "$PSScriptRoot\sidecars\node-backend"
    Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "tsx", "src/index.ts"
    Start-Sleep -Seconds 3
}

if ($pythonPort) {
    Write-Host "⚠️  Python automation service (port 3200) already running (PID: $($pythonPort.OwningProcess))" -ForegroundColor Yellow
} else {
    Write-Host "▶️  Starting Python automation service..." -ForegroundColor Cyan
    Set-Location "$PSScriptRoot\sidecars\python-automation"
    Start-Process -NoNewWindow -FilePath "python" -ArgumentList "main.py"
    Start-Sleep -Seconds 2
}

# Verify ports
Start-Sleep -Seconds 3
$nodeCheck = Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue
$pythonCheck = Get-NetTCPConnection -LocalPort 3200 -ErrorAction SilentlyContinue

Write-Host ""
if ($nodeCheck -and $pythonCheck) {
    Write-Host "✅ All services started successfully!" -ForegroundColor Green
    Write-Host "   Node.js backend: http://localhost:3100" -ForegroundColor White
    Write-Host "   Python automation: http://localhost:3200" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 Use stop-all.ps1 to stop all services" -ForegroundColor Yellow
} else {
    Write-Host "❌ Some services failed to start:" -ForegroundColor Red
    if (-not $nodeCheck) { Write-Host "   - Node.js backend not started" -ForegroundColor Red }
    if (-not $pythonCheck) { Write-Host "   - Python automation service not started" -ForegroundColor Red }
}

Set-Location $PSScriptRoot