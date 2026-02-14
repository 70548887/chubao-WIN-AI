# ===========================================
# chubao-WIN-AI launcher
# Modes: all, cli, server, verify, tauri, frontend
# ===========================================

param(
    [ValidateSet("all", "cli", "server", "verify", "tauri", "frontend")]
    [string]$Mode = "all",

    [switch]$SkipDepsCheck,

    [switch]$AutoKillPortConflicts,

    [switch]$ForceKillPortConflicts,

    [switch]$SkipPortCleanup
)

$ErrorActionPreference = "Stop"
$processes = @()
$autoKillPortsEnabled = $true
$forceKillPortsEnabled = $true
if ($PSBoundParameters.ContainsKey("AutoKillPortConflicts")) {
    $autoKillPortsEnabled = [bool]$AutoKillPortConflicts
}
if ($PSBoundParameters.ContainsKey("ForceKillPortConflicts")) {
    $forceKillPortsEnabled = [bool]$ForceKillPortConflicts
}

function Write-Header {
    param([string]$ModeValue)

    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  chubao-WIN-AI launcher" -ForegroundColor Cyan
    Write-Host "  mode: $ModeValue" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Test-Dependencies {
    if ($SkipDepsCheck) {
        return
    }

    Write-Host "[check] dependencies" -ForegroundColor Blue

    try {
        $nodeVer = node --version 2>$null
        Write-Host "  [OK] Node.js $nodeVer" -ForegroundColor Green
    } catch {
        throw "[ERROR] Node.js not found. Please install Node.js 22+."
    }

    try {
        $pythonVer = python --version 2>&1
        Write-Host "  [OK] $pythonVer" -ForegroundColor Green
    } catch {
        throw "[ERROR] Python not found. Please install Python 3.9+."
    }

    Write-Host ""
}

function Test-OcrDependencies {
    param([string]$PythonExe)

    Write-Host "[check] OCR runtime dependencies" -ForegroundColor Blue

    $probeCode = @'
import importlib.util
import json

data = {
    'paddle': importlib.util.find_spec('paddle') is not None,
    'paddleocr': importlib.util.find_spec('paddleocr') is not None,
}
data['ocrReady'] = data['paddle'] and data['paddleocr']
print(json.dumps(data))
'@

    try {
        $json = & $PythonExe -c $probeCode 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $json) {
            throw "probe failed"
        }

        $result = $json | ConvertFrom-Json
        if ($result.ocrReady) {
            Write-Host "  [OK] paddle+paddleocr detected" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] paddle/paddleocr not detected; OCR endpoints may return DEPENDENCY_UNAVAILABLE." -ForegroundColor Yellow
            Write-Host "  [HINT] run: npm run setup:ocr" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [WARN] OCR dependency probe failed; run: npm run setup:ocr" -ForegroundColor Yellow
    }

    Write-Host ""
}

function Import-EnvFile {
    param([string]$Path)

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $pair = $line.Split("=", 2)
            if ($pair.Count -eq 2) {
                [Environment]::SetEnvironmentVariable($pair[0].Trim(), $pair[1].Trim(), "Process")
            }
        }
    }
}

function Start-Service {
    param(
        [string]$Name,
        [string]$Executable,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Write-Host "[start] $Name" -ForegroundColor Green
    $proc = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -PassThru
    Write-Host "  PID: $($proc.Id)" -ForegroundColor Gray
    return $proc
}

function Wait-Health {
    param(
        [string]$ServiceName,
        [string]$Url,
        [int]$TimeoutSec = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-RestMethod -Uri $Url -TimeoutSec 3 -ErrorAction Stop
            if ($resp.status -eq "ok" -or $resp.status -eq "degraded") {
                Write-Host "[ready] ${ServiceName}: $Url" -ForegroundColor Green
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    Write-Host "[warn] $ServiceName health timeout: $Url" -ForegroundColor Yellow
    return $false
}

function Get-PortOccupants {
    param([int]$Port)

    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) {
        return @()
    }

    $occupants = @()
    foreach ($listener in ($listeners | Sort-Object OwningProcess -Unique)) {
        $procId = $listener.OwningProcess
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        $cmdLine = ""
        try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue).CommandLine
        } catch {
            $cmdLine = ""
        }

        $occupants += [PSCustomObject]@{
            LocalAddress = $listener.LocalAddress
            LocalPort = $Port
            ProcessId = $procId
            ProcessName = if ($proc) { $proc.ProcessName } else { "unknown" }
            CommandLine = if ($cmdLine) { $cmdLine } else { "" }
        }
    }

    return $occupants
}

function Assert-PortFree {
    param(
        [string]$ServiceName,
        [int]$Port,
        [switch]$AutoKill,
        [switch]$ForceKill
    )

    $occupants = @(Get-PortOccupants -Port $Port)
    if ($occupants.Count -eq 0) {
        return
    }

    Write-Host "[error] $ServiceName port $Port is already in use." -ForegroundColor Red
    foreach ($item in $occupants) {
        Write-Host "  PID $($item.ProcessId) $($item.ProcessName) @ $($item.LocalAddress):$($item.LocalPort)" -ForegroundColor Yellow
        if ($item.CommandLine) {
            Write-Host "    $($item.CommandLine)" -ForegroundColor DarkGray
        }
    }

    if ($AutoKill) {
        Write-Host "[fix] trying to stop occupant process tree(s) for port $Port..." -ForegroundColor Yellow
        foreach ($item in $occupants) {
            $procId = $item.ProcessId
            if ($procId -eq $PID) {
                continue
            }

            $safeAutoKill = @("node", "python")
            $name = ($item.ProcessName | ForEach-Object { $_.ToLowerInvariant() })
            if (-not $ForceKill -and -not ($safeAutoKill -contains $name)) {
                throw "[ERROR] Refusing to auto-kill PID $procId ($($item.ProcessName)) on port $Port. Re-run with -ForceKillPortConflicts to allow killing non-node/python process."
            }

            & taskkill /PID $procId /T /F 1>$null 2>$null
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "  [killed] PID $procId ($($item.ProcessName))" -ForegroundColor Gray
        }

        Start-Sleep -Milliseconds 500
        $remaining = @(Get-PortOccupants -Port $Port)
        if ($remaining.Count -eq 0) {
            Write-Host "[ok] $ServiceName port $Port has been released." -ForegroundColor Green
            return
        }

        Write-Host "[error] failed to release port $Port after auto-kill." -ForegroundColor Red
        foreach ($item in $remaining) {
            Write-Host "  PID $($item.ProcessId) $($item.ProcessName) @ $($item.LocalAddress):$($item.LocalPort)" -ForegroundColor Yellow
            if ($item.CommandLine) {
                Write-Host "    $($item.CommandLine)" -ForegroundColor DarkGray
            }
        }
        throw "[ERROR] Port $Port remains occupied after auto-kill."
    }

    throw "[ERROR] Port $Port is occupied. Stop the process above or set a different port."
}

function Prepare-PortForStartup {
    param(
        [string]$ServiceName,
        [int]$Port
    )

    if ($SkipPortCleanup) {
        Assert-PortFree -ServiceName $ServiceName -Port $Port
        return
    }

    # Default behavior: release conflicting ports before startup to avoid EADDRINUSE.
    Assert-PortFree -ServiceName $ServiceName -Port $Port -AutoKill:$autoKillPortsEnabled -ForceKill:$forceKillPortsEnabled
}

function Stop-Processes {
    param([array]$StartedProcesses)

    foreach ($proc in $StartedProcesses) {
        if (-not $proc) {
            continue
        }

        $procId = $proc.Id
        $running = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($running) {
            # npm run dev may spawn child node/tsx processes; stop the full tree.
            & taskkill /PID $procId /T /F 1>$null 2>$null
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "[stop] PID $procId (process tree)" -ForegroundColor Gray
        }
    }
}

function Run-Smoke {
    param(
        [string]$ProjectRoot,
        [int]$NodePort,
        [int]$PythonPort
    )

    $smokeScript = Join-Path $ProjectRoot "scripts\smoke.ps1"
    if (-not (Test-Path $smokeScript)) {
        throw "[ERROR] smoke script not found: $smokeScript"
    }

    Write-Host ""
    Write-Host "[verify] running smoke tests..." -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File $smokeScript -NodePort $NodePort -PythonPort $PythonPort
    if ($LASTEXITCODE -ne 0) {
        throw "[ERROR] smoke failed with exit code: $LASTEXITCODE"
    }
}

function Run-PythonTests {
    param(
        [string]$ProjectRoot,
        [string]$PythonExe
    )

    $testScript = Join-Path $ProjectRoot "sidecars\python-automation\tests\test_ocr_service.py"
    if (-not (Test-Path $testScript)) {
        Write-Host "[warn] python tests not found, skip: $testScript" -ForegroundColor Yellow
        return
    }

    Write-Host "[verify] running python unit tests..." -ForegroundColor Cyan
    & $PythonExe $testScript
    if ($LASTEXITCODE -ne 0) {
        throw "[ERROR] python tests failed with exit code: $LASTEXITCODE"
    }
}

function Run-CoreTests {
    param(
        [string]$ProjectRoot,
        [string]$NpmExe
    )

    Write-Host "[verify] running frontend core unit tests..." -ForegroundColor Cyan
    & $NpmExe run test:core --prefix $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        throw "[ERROR] frontend core tests failed with exit code: $LASTEXITCODE"
    }
}

function Run-NodeBackendTests {
    param(
        [string]$ProjectRoot,
        [string]$NpmExe
    )

    Write-Host "[verify] running node backend tests..." -ForegroundColor Cyan
    & $NpmExe run test:node-backend --prefix $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
        throw "[ERROR] node backend tests failed with exit code: $LASTEXITCODE"
    }
}

Write-Header -ModeValue $Mode

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$nodeDir = Join-Path $projectRoot "sidecars\node-backend"
$pythonDir = Join-Path $projectRoot "sidecars\python-automation"
$envFile = Join-Path $projectRoot ".env"

Set-Location $projectRoot

if (-not (Test-Path $envFile)) {
    throw "[ERROR] .env not found. Copy .env.example and configure it first."
}

Import-EnvFile -Path $envFile
Test-Dependencies

$npm = (Get-Command "npm" -ErrorAction Stop).Source
$python = (Get-Command "python" -ErrorAction Stop).Source
if (-not $SkipDepsCheck) {
    Test-OcrDependencies -PythonExe $python
}

$nodePortRaw = [Environment]::GetEnvironmentVariable("NODE_PORT")
$pythonPortRaw = [Environment]::GetEnvironmentVariable("PYTHON_PORT")
$nodePort = if ($nodePortRaw) { [int]$nodePortRaw } else { 3100 }
$pythonPort = if ($pythonPortRaw) { [int]$pythonPortRaw } else { 3200 }

try {
    switch ($Mode) {
        "cli" {
            Prepare-PortForStartup -ServiceName "Node.js Backend" -Port $nodePort

            $nodeProc = Start-Service -Name "Node.js Backend" -Executable $npm -Arguments @("run", "dev") -WorkingDirectory $nodeDir
            $processes += $nodeProc
            Wait-Health -ServiceName "Node.js" -Url "http://127.0.0.1:$nodePort/health" | Out-Null
            Write-Host ""
            Write-Host "Node service is running. Press Ctrl+C to stop." -ForegroundColor Yellow
            Wait-Process -Id $nodeProc.Id
        }

        "server" {
            Prepare-PortForStartup -ServiceName "Python Automation" -Port $pythonPort
            Prepare-PortForStartup -ServiceName "Node.js Backend" -Port $nodePort

            $pyProc = Start-Service -Name "Python Automation" -Executable $python -Arguments @("main.py") -WorkingDirectory $pythonDir
            $processes += $pyProc
            Wait-Health -ServiceName "Python" -Url "http://127.0.0.1:$pythonPort/health" | Out-Null

            $nodeProc = Start-Service -Name "Node.js Backend" -Executable $npm -Arguments @("run", "dev") -WorkingDirectory $nodeDir
            $processes += $nodeProc
            Wait-Health -ServiceName "Node.js" -Url "http://127.0.0.1:$nodePort/health" | Out-Null

            Write-Host ""
            Write-Host "Services are running. Press Ctrl+C to stop." -ForegroundColor Yellow
            while ($true) {
                $alive = $processes | Where-Object { -not $_.HasExited }
                if ($alive.Count -eq 0) {
                    Write-Host "[exit] all services are stopped." -ForegroundColor Yellow
                    break
                }
                Start-Sleep -Seconds 2
            }
        }

        "verify" {
            Prepare-PortForStartup -ServiceName "Python Automation" -Port $pythonPort
            Prepare-PortForStartup -ServiceName "Node.js Backend" -Port $nodePort

            $pyProc = Start-Service -Name "Python Automation" -Executable $python -Arguments @("main.py") -WorkingDirectory $pythonDir
            $processes += $pyProc
            Wait-Health -ServiceName "Python" -Url "http://127.0.0.1:$pythonPort/health" | Out-Null

            $nodeProc = Start-Service -Name "Node.js Backend" -Executable $npm -Arguments @("run", "dev") -WorkingDirectory $nodeDir
            $processes += $nodeProc
            Wait-Health -ServiceName "Node.js" -Url "http://127.0.0.1:$nodePort/health" | Out-Null

            Run-Smoke -ProjectRoot $projectRoot -NodePort $nodePort -PythonPort $pythonPort
            Run-CoreTests -ProjectRoot $projectRoot -NpmExe $npm
            Run-NodeBackendTests -ProjectRoot $projectRoot -NpmExe $npm
            Run-PythonTests -ProjectRoot $projectRoot -PythonExe $python
            Write-Host ""
            Write-Host "[done] verify passed." -ForegroundColor Green
        }

        "frontend" {
            $frontendProc = Start-Service -Name "Frontend" -Executable $npm -Arguments @("run", "dev") -WorkingDirectory $projectRoot
            $processes += $frontendProc
            Wait-Process -Id $frontendProc.Id
        }

        "tauri" {
            # Tauri mode also relies on sidecars; release well-known ports first
            # to avoid EADDRINUSE when previously leaked dev processes exist.
            Prepare-PortForStartup -ServiceName "Python Automation" -Port $pythonPort
            Prepare-PortForStartup -ServiceName "Node.js Backend" -Port $nodePort

            $tauriProc = Start-Service -Name "Tauri App" -Executable $npm -Arguments @("run", "tauri:dev") -WorkingDirectory $projectRoot
            $processes += $tauriProc
            Wait-Process -Id $tauriProc.Id
        }

        "all" {
            # all is same as tauri; src-tauri manages sidecar lifecycle.
            Prepare-PortForStartup -ServiceName "Python Automation" -Port $pythonPort
            Prepare-PortForStartup -ServiceName "Node.js Backend" -Port $nodePort

            $tauriProc = Start-Service -Name "Tauri App" -Executable $npm -Arguments @("run", "tauri:dev") -WorkingDirectory $projectRoot
            $processes += $tauriProc
            Wait-Process -Id $tauriProc.Id
        }
    }
} finally {
    Stop-Processes -StartedProcesses $processes
}
