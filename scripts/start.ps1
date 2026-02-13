# ===========================================
# chubao-WIN-AI 启动脚本
# ===========================================

param(
    [ValidateSet("cli", "server", "all")]
    [string]$Mode = "all"
)

$ErrorActionPreference = "Stop"
$processes = @()

function Write-Header {
    param([string]$ModeValue)

    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  chubao-WIN-AI 启动中..." -ForegroundColor Cyan
    Write-Host "  模式: $ModeValue" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Import-DotEnv {
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

function Get-RequiredCommand {
    param(
        [string]$Name,
        [string]$Hint
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "[错误] 未找到命令 '$Name'。$Hint"
    }

    return $command.Source
}

function Start-ServiceProcess {
    param(
        [string]$Name,
        [string]$Executable,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Write-Host "[启动] $Name" -ForegroundColor Green
    $proc = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -PassThru
    Write-Host "  PID: $($proc.Id)" -ForegroundColor Gray
    return $proc
}

function Wait-HttpHealth {
    param(
        [string]$ServiceName,
        [string]$Url,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $Url -TimeoutSec 3
            if ($response.status -eq "ok") {
                Write-Host "[就绪] ${ServiceName}: $Url" -ForegroundColor Green
                return
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    Write-Host "[警告] $ServiceName 健康检查超时: $Url" -ForegroundColor Yellow
}

function Stop-StartedProcesses {
    param([array]$StartedProcesses)

    foreach ($proc in $StartedProcesses) {
        if ($proc -and -not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "[停止] PID $($proc.Id)" -ForegroundColor Gray
        }
    }
}

Write-Header -ModeValue $Mode

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath
$nodeDir = Join-Path $projectRoot "sidecars\node-backend"
$pythonDir = Join-Path $projectRoot "sidecars\python-automation"
$envPath = Join-Path $projectRoot ".env"

Set-Location $projectRoot

if (-not (Test-Path $envPath)) {
    Write-Host "[错误] .env 文件不存在，请先运行 .\scripts\setup.ps1" -ForegroundColor Red
    exit 1
}

Import-DotEnv -Path $envPath

$npmExe = Get-RequiredCommand -Name "npm" -Hint "请先安装 Node.js 22+ 并重启终端。"
$pythonExe = Get-RequiredCommand -Name "python" -Hint "请先安装 Python 3.9+ 并重启终端。"

try {
    if ($Mode -in @("cli", "server")) {
        $nodeProc = Start-ServiceProcess -Name "Node.js 后端" -Executable $npmExe -Arguments @("run", "dev") -WorkingDirectory $nodeDir
        $processes += $nodeProc
        $nodePort = [Environment]::GetEnvironmentVariable("NODE_PORT")
        if (-not $nodePort) {
            $nodePort = "3100"
        }
        $nodePort = [int]$nodePort
        Wait-HttpHealth -ServiceName "Node.js 后端" -Url "http://127.0.0.1:$nodePort/health"
    }

    if ($Mode -eq "server") {
        $pythonProc = Start-ServiceProcess -Name "Python 自动化服务" -Executable $pythonExe -Arguments @("main.py") -WorkingDirectory $pythonDir
        $processes += $pythonProc
        $pythonPort = [Environment]::GetEnvironmentVariable("PYTHON_PORT")
        if (-not $pythonPort) {
            $pythonPort = "3200"
        }
        $pythonPort = [int]$pythonPort
        Wait-HttpHealth -ServiceName "Python 自动化服务" -Url "http://127.0.0.1:$pythonPort/health"
    }

    if ($Mode -eq "all") {
        $tauriProc = Start-ServiceProcess -Name "Tauri 桌面应用" -Executable $npmExe -Arguments @("run", "tauri:dev") -WorkingDirectory $projectRoot
        $processes += $tauriProc

        Write-Host ""
        Write-Host "完整模式已启动。按 Ctrl+C 停止全部服务。" -ForegroundColor Cyan
        Wait-Process -Id $tauriProc.Id
    } else {
        Write-Host ""
        Write-Host "服务已启动。按 Ctrl+C 停止全部服务。" -ForegroundColor Cyan
        while ($true) {
            $alive = $processes | Where-Object { -not $_.HasExited }
            if ($alive.Count -eq 0) {
                Write-Host "[退出] 所有服务进程已结束。" -ForegroundColor Yellow
                break
            }
            Start-Sleep -Seconds 2
        }
    }
} finally {
    Stop-StartedProcesses -StartedProcesses $processes
}
