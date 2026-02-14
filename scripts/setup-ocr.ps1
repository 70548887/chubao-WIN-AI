# ===========================================
# chubao-WIN-AI OCR dependency setup script
# ===========================================

param(
    [string]$PythonExe = "python",
    [switch]$UpgradePip,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Write-Header {
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  chubao-WIN-AI OCR setup" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Resolve-Python {
    param([string]$CommandName)
    try {
        return (Get-Command $CommandName -ErrorAction Stop).Source
    } catch {
        throw "[ERROR] Python executable not found: $CommandName"
    }
}

function Invoke-Checked {
    param(
        [string]$Executable,
        [string[]]$Arguments
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "[ERROR] Command failed: $Executable $($Arguments -join ' ')"
    }
}

function Probe-OcrDeps {
    param([string]$PythonPath)

    $probeCode = @'
import importlib.util
import json

modules = {
    'paddle': importlib.util.find_spec('paddle') is not None,
    'paddleocr': importlib.util.find_spec('paddleocr') is not None,
    'pywinauto': importlib.util.find_spec('pywinauto') is not None,
    'pyautogui': importlib.util.find_spec('pyautogui') is not None,
    'flask': importlib.util.find_spec('flask') is not None,
    'flask_cors': importlib.util.find_spec('flask_cors') is not None,
}
modules['ocrReady'] = modules['paddle'] and modules['paddleocr']
print(json.dumps(modules))
'@

    $json = & $PythonPath -c $probeCode
    if ($LASTEXITCODE -ne 0) {
        throw "[ERROR] Failed to probe OCR dependencies."
    }

    return ($json | ConvertFrom-Json)
}

Write-Header

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$requirementsPath = Join-Path $projectRoot "sidecars\python-automation\requirements.txt"

if (-not (Test-Path $requirementsPath)) {
    throw "[ERROR] requirements file not found: $requirementsPath"
}

$pythonPath = Resolve-Python -CommandName $PythonExe
Write-Host "[check] python: $pythonPath" -ForegroundColor Gray

if (-not $CheckOnly) {
    if ($UpgradePip) {
        Write-Host "[step] upgrade pip/setuptools/wheel" -ForegroundColor Blue
        Invoke-Checked -Executable $pythonPath -Arguments @("-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel")
    }

    Write-Host "[step] install sidecar requirements" -ForegroundColor Blue
    Invoke-Checked -Executable $pythonPath -Arguments @("-m", "pip", "install", "-r", $requirementsPath)
}

Write-Host "[step] probe OCR dependencies" -ForegroundColor Blue
$probe = Probe-OcrDeps -PythonPath $pythonPath

Write-Host "  paddle: $($probe.paddle)" -ForegroundColor Gray
Write-Host "  paddleocr: $($probe.paddleocr)" -ForegroundColor Gray
Write-Host "  pywinauto: $($probe.pywinauto)" -ForegroundColor Gray
Write-Host "  pyautogui: $($probe.pyautogui)" -ForegroundColor Gray
Write-Host "  flask: $($probe.flask)" -ForegroundColor Gray
Write-Host "  flask_cors: $($probe.flask_cors)" -ForegroundColor Gray

if (-not $probe.ocrReady) {
    Write-Host ""
    Write-Host "[ERROR] OCR dependencies are not ready (paddle/paddleocr)." -ForegroundColor Red
    Write-Host "        Check Python version compatibility and pip output above." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "[done] OCR dependencies are ready." -ForegroundColor Green
