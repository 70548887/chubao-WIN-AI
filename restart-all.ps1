# Chubao AI - Restart All Services
# Stops all services then restarts them

Write-Host "🔄 Restarting Chubao AI services..." -ForegroundColor Magenta

# Stop all services first
Write-Host "⏹️  Stopping existing services..." -ForegroundColor Yellow
& "$PSScriptRoot\stop-all.ps1"

# Wait for complete shutdown
Start-Sleep -Seconds 3

# Start all services
Write-Host "▶️  Starting all services..." -ForegroundColor Green
& "$PSScriptRoot\start-all.ps1"