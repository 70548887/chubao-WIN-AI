# ===========================================
# chubao-WIN-AI Smoke Test Script
# ===========================================

param(
    [int]$NodePort = 3100,
    [int]$PythonPort = 3200,
    [int]$TimeoutSec = 5,
    [string]$ProjectRoot = "",
    [switch]$StaticOnly
)

$ErrorActionPreference = "Stop"
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([string]$Message)
    $failures.Add($Message) | Out-Null
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Add-Pass {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Invoke-Json {
    param(
        [string]$Method,
        [string]$Url,
        [object]$Body = $null,
        [int]$TimeoutSecOverride = 0
    )

    $effectiveTimeout = if ($TimeoutSecOverride -gt 0) { $TimeoutSecOverride } else { $TimeoutSec }
    $params = @{
        Method = $Method
        Uri = $Url
        TimeoutSec = $effectiveTimeout
        ContentType = "application/json"
    }

    if ($null -ne $Body) {
        $params["Body"] = ($Body | ConvertTo-Json -Depth 8)
    }

    return Invoke-RestMethod @params
}

function Invoke-JsonWithStatus {
    param(
        [string]$Method,
        [string]$Url,
        [object]$Body = $null,
        [int]$TimeoutSecOverride = 0
    )

    try {
        $result = Invoke-Json -Method $Method -Url $Url -Body $Body -TimeoutSecOverride $TimeoutSecOverride
        return @{ StatusCode = 200; Body = $result }
    } catch {
        if ($_.Exception.Response -and $_.ErrorDetails.Message) {
            $raw = $_.ErrorDetails.Message
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                return @{ StatusCode = $statusCode; Body = ($raw | ConvertFrom-Json) }
            } catch {
                return @{ StatusCode = $statusCode; Body = @{ parseError = $raw } }
            }
        }
        throw
    }
}

function New-OcrSampleImage {
    param(
        [string]$OutputPath
    )

    Add-Type -AssemblyName System.Drawing
    $bitmap = New-Object System.Drawing.Bitmap 420, 140
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $font = New-Object System.Drawing.Font("Arial", 30, [System.Drawing.FontStyle]::Bold)

    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $graphics.DrawString("CHUBAO OCR TEST", $font, [System.Drawing.Brushes]::Black, 12, 42)
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $font.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Assert-FileContains {
    param(
        [string]$FilePath,
        [string]$Pattern
    )

    if (-not (Test-Path $FilePath)) {
        return $false
    }

    $match = Select-String -Path $FilePath -Pattern $Pattern -SimpleMatch -ErrorAction SilentlyContinue
    return [bool]$match
}

function Assert-FileRegex {
    param(
        [string]$FilePath,
        [string]$Pattern
    )

    if (-not (Test-Path $FilePath)) {
        return $false
    }

    $content = Get-Content -Path $FilePath -Raw -Encoding UTF8
    return [bool]([regex]::IsMatch($content, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline))
}

if (-not $ProjectRoot) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

$tauriMainPath = Join-Path $ProjectRoot "src-tauri\src\main.rs"
$frontendAppPath = Join-Path $ProjectRoot "src\App.tsx"
$rootPackagePath = Join-Path $ProjectRoot "package.json"
$startScriptPath = Join-Path $ProjectRoot "scripts\start.ps1"
$ocrSetupScriptPath = Join-Path $ProjectRoot "scripts\setup-ocr.ps1"
$nodeBackendPath = Join-Path $ProjectRoot "sidecars\node-backend\src\index.ts"
$nodeBackendPackagePath = Join-Path $ProjectRoot "sidecars\node-backend\package.json"
$nodeDevGuardPath = Join-Path $ProjectRoot "sidecars\node-backend\scripts\dev-with-port-guard.mjs"
$runtimePath = Join-Path $ProjectRoot "sidecars\node-backend\src\agent\runtime.ts"
$toolsPath = Join-Path $ProjectRoot "sidecars\node-backend\src\tools\index.ts"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  chubao-WIN-AI Smoke Test" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Node:   http://127.0.0.1:$NodePort" -ForegroundColor Gray
Write-Host "Python: http://127.0.0.1:$PythonPort" -ForegroundColor Gray
Write-Host "Root:   $ProjectRoot" -ForegroundColor Gray
Write-Host "Mode:   $(if ($StaticOnly) { 'static-only' } else { 'full' })" -ForegroundColor Gray
Write-Host ""

if (-not $StaticOnly) {
    # 1) Node health
    try {
        $nodeHealth = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$NodePort/health"
        if ($nodeHealth.status -and $nodeHealth.service -and $nodeHealth.version -and $nodeHealth.uptimeSec -ne $null -and $nodeHealth.deps) {
            Add-Pass "Node /health contract fields present"
        } else {
            Add-Failure "Node /health missing required fields"
        }
    } catch {
        Add-Failure "Node /health unreachable: $($_.Exception.Message)"
    }

    # 2) Python health
    try {
        $pythonHealth = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$PythonPort/health"
        if ($pythonHealth.status -and $pythonHealth.service -and $pythonHealth.version -and $pythonHealth.uptimeSec -ne $null -and $pythonHealth.deps) {
            Add-Pass "Python /health contract fields present"
        } else {
            Add-Failure "Python /health missing required fields"
        }
    } catch {
        Add-Failure "Python /health unreachable: $($_.Exception.Message)"
    }

    # 3) Node INVALID_ARGUMENT contract
    try {
        $nodeInvalid = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$NodePort/api/chat" -Body @{}
        if ($nodeInvalid.StatusCode -eq 400 -and $nodeInvalid.Body.errorCode -eq "INVALID_ARGUMENT") {
            Add-Pass "Node /api/chat invalid argument contract ok"
        } else {
            Add-Failure "Node /api/chat invalid argument contract failed (status=$($nodeInvalid.StatusCode), errorCode=$($nodeInvalid.Body.errorCode))"
        }
    } catch {
        Add-Failure "Node /api/chat invalid argument test failed: $($_.Exception.Message)"
    }

    # 4) Node platforms status
    try {
        $platformStatus = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$NodePort/api/platforms/status"
        if ($platformStatus.success -eq $true -and $platformStatus.platforms) {
            Add-Pass "Node /api/platforms/status contract ok"
        } else {
            Add-Failure "Node /api/platforms/status missing required fields"
        }
    } catch {
        Add-Failure "Node /api/platforms/status unreachable: $($_.Exception.Message)"
    }

    # 4.1) Node coding progress status
    try {
        $codingStatus = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$NodePort/api/coding/progress?sinceDays=7&maxFiles=20"
        if ($codingStatus.success -eq $true -and $codingStatus.progress -and $codingStatus.progress.branch -and $codingStatus.progress.counts) {
            Add-Pass "Node /api/coding/progress contract ok"
        } else {
            Add-Failure "Node /api/coding/progress missing required fields"
        }
    } catch {
        Add-Failure "Node /api/coding/progress unreachable: $($_.Exception.Message)"
    }

    # 5) Python INVALID_ARGUMENT contract
    try {
        $pyInvalid = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$PythonPort/api/window/controls" -Body @{}
        if ($pyInvalid.StatusCode -eq 400 -and $pyInvalid.Body.errorCode -eq "INVALID_ARGUMENT") {
            Add-Pass "Python /api/window/controls invalid argument contract ok"
        } else {
            Add-Failure "Python invalid argument contract failed (status=$($pyInvalid.StatusCode), errorCode=$($pyInvalid.Body.errorCode))"
        }
    } catch {
        Add-Failure "Python invalid argument test failed: $($_.Exception.Message)"
    }

    # 6) Python windows list endpoint
    try {
        $windowsResp = Invoke-JsonWithStatus -Method "GET" -Url "http://127.0.0.1:$PythonPort/api/windows"
        if ($windowsResp.StatusCode -eq 200 -and $windowsResp.Body.success -eq $true) {
            Add-Pass "Python /api/windows responds successfully"
        } else {
            Add-Failure "Python /api/windows returned unexpected response"
        }
    } catch {
        Add-Failure "Python /api/windows test failed: $($_.Exception.Message)"
    }

    # 6.1) Python OCR end-to-end (deterministic image input)
    try {
        $ocrState = ""
        if ($pythonHealth -and $pythonHealth.deps -and $pythonHealth.deps.ocr) {
            $ocrState = "$($pythonHealth.deps.ocr)".ToLowerInvariant()
        }

        if ($ocrState -ne "ok") {
            Add-Pass "Python /api/ocr skipped (deps.ocr=$ocrState)"
        } else {
            $samplePath = Join-Path $ProjectRoot "tmp_smoke_ocr_sample.png"
            try {
                New-OcrSampleImage -OutputPath $samplePath
                $ocrResp = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$PythonPort/api/ocr" -TimeoutSecOverride 420 -Body @{
                    image_path = $samplePath
                }

                if ($ocrResp.StatusCode -ne 200 -or $ocrResp.Body.success -ne $true -or -not $ocrResp.Body.result) {
                    Add-Failure "Python /api/ocr e2e returned unexpected status"
                } else {
                    $texts = @()
                    if ($ocrResp.Body.result.texts) {
                        $texts = @($ocrResp.Body.result.texts | ForEach-Object { "$($_.text)" })
                    }
                    $joined = (($texts -join " ").ToUpperInvariant()).Replace(" ", "")
                    if ($ocrResp.Body.result.count -ge 1 -and $joined.Contains("CHUBAO")) {
                        Add-Pass "Python /api/ocr e2e contract ok"
                    } else {
                        Add-Failure "Python /api/ocr e2e text mismatch: $($texts -join ', ')"
                    }
                }
            } finally {
                Remove-Item -Path $samplePath -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Add-Failure "Python /api/ocr e2e failed: $($_.Exception.Message)"
    }
} else {
    Write-Host "[skip] runtime API checks (static-only mode)" -ForegroundColor Yellow
}

# 7) Tauri command contract (Rust side, static)
try {
    $rustChecks = @(
        'fn ensure_sidecars',
        'fn sidecar_status',
        'fn restart_sidecar',
        'fn sidecar_logs',
        'fn sidecar_diagnostics',
        'fn snapshot_status',
        'managed: bool',
        'let running = managed || healthy;',
        'managed externally; restart denied',
        'spawn_sidecar_supervisor(',
        'tauri::generate_handler!['
    )

    $missing = @()
    foreach ($p in $rustChecks) {
        if (-not (Assert-FileContains -FilePath $tauriMainPath -Pattern $p)) {
            $missing += $p
        }
    }

    if ($missing.Count -eq 0) {
        Add-Pass "Rust side Tauri command contract present"
    } else {
        Add-Failure "Rust side command contract missing: $($missing -join ', ')"
    }
} catch {
    Add-Failure "Rust contract check failed: $($_.Exception.Message)"
}

# 7.1) Tauri behavior contract (Rust side, static)
try {
    $statusQueryPattern = 'fn\s+sidecar_status\([^)]*\)\s*->\s*Result<SidecarStatusPayload,\s*String>\s*\{.*?Ok\(manager\.snapshot_status\(\)\)'
    if (Assert-FileRegex -FilePath $tauriMainPath -Pattern $statusQueryPattern) {
        Add-Pass "Rust sidecar_status uses snapshot query path"
    } else {
        Add-Failure "Rust sidecar_status no longer matches snapshot query path"
    }

    $diagnosticsQueryPattern = 'fn\s+sidecar_diagnostics\([^)]*\)\s*->\s*Result<SidecarDiagnosticsPayload,\s*String>\s*\{.*?Ok\(manager\.diagnostics\(\)\)'
    if (Assert-FileRegex -FilePath $tauriMainPath -Pattern $diagnosticsQueryPattern) {
        Add-Pass "Rust sidecar_diagnostics uses diagnostics query path"
    } else {
        Add-Failure "Rust sidecar_diagnostics no longer matches diagnostics query path"
    }
} catch {
    Add-Failure "Rust behavior contract check failed: $($_.Exception.Message)"
}

# 8) Tauri command usage (Frontend side, static)
try {
    $frontendChecks = @(
        "'ensure_sidecars'",
        'managed: boolean',
        "'managed-external'",
        'issueFilter',
        'issueServiceCount',
        'summaryMode',
        'copyCurrentFilterOnly',
        'codingProgress',
        'codingLoading',
        'codingError',
        'loadCodingProgress',
        'codingIncludeUntracked',
        'codingSinceDays',
        'codingMaxFiles',
        'api/coding/progress',
        'includeLogsExport',
        'exportLogLimit',
        'selectedExportLogServices',
        'copyDiagnosticsSummary',
        'coerceDiagnosticsPayload',
        'buildDiagnosticsDiff',
        'runDiagnosticsCompare',
        'buildCurrentDiffPayload',
        'buildCompareDiffText',
        'copyCompareDiff',
        'exportCompareDiff',
        'exportCompareText',
        'lineCount:',
        'scopeToken',
        'compareTextExporting',
        'compareOnlyChanged',
        'compareGroupFilter',
        'compareFieldQuery',
        'compareActiveTags',
        'compareCopyCurrentFilterOnly',
        'compareHistoryPinnedOnly',
        'compareRecentFilters',
        'visibleCompareHistoryItems',
        'COMPARE_FIELD_PRESET_TAGS',
        'COMPARE_HISTORY_STORAGE_KEY',
        'filterCompareEntries',
        'sortCompareHistoryItems',
        'saveCurrentCompareFilter',
        'applyCompareHistory',
        'removeCompareHistory',
        'clearCompareHistoryUnpinned',
        'clearCompareHistoryAll',
        'window.confirm(',
        'toggleCompareHistoryPin',
        'moveCompareHistoryToTop',
        'compareGroupCollapsed',
        'DIFF_GROUP_LABELS',
        'schemaVersion: ''diagnostics-diff.v1''',
        'className="compare-diff-list"',
        'className="compare-group-header"',
        'className="status-filter compare-search"',
        'className="compare-quick-tags"',
        'className="compare-history"',
        'className="compare-history-header"',
        'className="compare-history-actions"',
        'className="compare-history-action"',
        'className="compare-history-empty"',
        'className={`compare-history-pin',
        'className="compare-history-top"',
        'className="coding-progress-toolbar"',
        'className="coding-progress-panel"',
        'className="coding-progress-files"',
        "invoke<AppHealthPayload>('health')",
        'schemaVersion: ''diagnostics.v1.1''',
        'appVersion:',
        'redactSensitiveData(',
        "invoke<SidecarStatusResponse>('restart_sidecar'",
        "invoke<SidecarLogsResponse>('sidecar_logs'",
        "'sidecar_diagnostics'"
    )

    $missingFrontend = @()
    foreach ($p in $frontendChecks) {
        if (-not (Assert-FileContains -FilePath $frontendAppPath -Pattern $p)) {
            $missingFrontend += $p
        }
    }

    if ($missingFrontend.Count -eq 0) {
        Add-Pass "Frontend side Tauri command usage present"
    } else {
        Add-Failure "Frontend command usage missing: $($missingFrontend -join ', ')"
    }
} catch {
    Add-Failure "Frontend command usage check failed: $($_.Exception.Message)"
}

# 9) Launcher + backend port conflict safeguards (static)
try {
    $launcherChecks = @(
        '[switch]$AutoKillPortConflicts',
        '[switch]$ForceKillPortConflicts',
        '[switch]$SkipPortCleanup',
        'function Get-PortOccupants',
        'function Assert-PortFree',
        'function Prepare-PortForStartup',
        'if ($SkipPortCleanup)',
        '[fix] trying to stop occupant process tree(s)',
        '-AutoKill:$autoKillPortsEnabled',
        '-ForceKill:$forceKillPortsEnabled',
        'Refusing to auto-kill PID',
        'taskkill /PID $procId /T /F'
    )

    $missingLauncher = @()
    foreach ($p in $launcherChecks) {
        if (-not (Assert-FileContains -FilePath $startScriptPath -Pattern $p)) {
            $missingLauncher += $p
        }
    }

    if ($missingLauncher.Count -eq 0) {
        Add-Pass "Launcher port conflict safeguards present"
    } else {
        Add-Failure "Launcher safeguards missing: $($missingLauncher -join ', ')"
    }
} catch {
    Add-Failure "Launcher safeguards check failed: $($_.Exception.Message)"
}

try {
    $ocrSetupChecks = @(
        'setup:ocr',
        'setup-ocr.ps1',
        'pip',
        'requirements.txt',
        'paddle',
        'paddleocr',
        'function Test-OcrDependencies',
        'run: npm run setup:ocr'
    )

    $missingOcrSetup = @()
    foreach ($p in $ocrSetupChecks) {
        $inPackage = Assert-FileContains -FilePath $rootPackagePath -Pattern $p
        $inScript = Assert-FileContains -FilePath $ocrSetupScriptPath -Pattern $p
        $inStart = Assert-FileContains -FilePath $startScriptPath -Pattern $p
        if (-not ($inPackage -or $inScript -or $inStart)) {
            $missingOcrSetup += $p
        }
    }

    if ($missingOcrSetup.Count -eq 0) {
        Add-Pass "OCR dependency setup wiring present"
    } else {
        Add-Failure "OCR setup wiring missing: $($missingOcrSetup -join ', ')"
    }
} catch {
    Add-Failure "OCR setup wiring check failed: $($_.Exception.Message)"
}

try {
    $nodePortChecks = @(
        'const onListenError',
        "error.code === 'EADDRINUSE'",
        'Port ${PORT} is already in use.',
        "server.on('error', onListenError)",
        "app.get('/api/coding/progress'",
        'analyzeCodingProgress({'
    )

    $missingNodePort = @()
    foreach ($p in $nodePortChecks) {
        if (-not (Assert-FileContains -FilePath $nodeBackendPath -Pattern $p)) {
            $missingNodePort += $p
        }
    }

    if ($missingNodePort.Count -eq 0) {
        Add-Pass "Node backend port conflict handling present"
    } else {
        Add-Failure "Node backend port handling missing: $($missingNodePort -join ', ')"
    }
} catch {
    Add-Failure "Node backend port handling check failed: $($_.Exception.Message)"
}

try {
    $nodeDevGuardChecks = @(
        'Get-NetTCPConnection -LocalPort',
        'SKIP_PORT_CLEANUP',
        'FORCE_KILL_PORT_CONFLICTS',
        'taskkill',
        "watch', 'src/index.ts"
    )

    $missingNodeDevGuard = @()
    if (-not (Assert-FileContains -FilePath $nodeBackendPackagePath -Pattern 'dev-with-port-guard.mjs')) {
        $missingNodeDevGuard += 'package dev script -> dev-with-port-guard.mjs'
    }
    foreach ($p in $nodeDevGuardChecks) {
        if (-not (Assert-FileContains -FilePath $nodeDevGuardPath -Pattern $p)) {
            $missingNodeDevGuard += $p
        }
    }

    if ($missingNodeDevGuard.Count -eq 0) {
        Add-Pass "Node backend dev port guard wiring present"
    } else {
        Add-Failure "Node backend dev guard missing: $($missingNodeDevGuard -join ', ')"
    }
} catch {
    Add-Failure "Node backend dev guard check failed: $($_.Exception.Message)"
}

try {
    $toolChecks = @(
        "name: 'get_coding_progress'",
        'codingProgressTool',
        'analyzeCodingProgress(args)',
        'Array.from(this.tools.values()).map('
    )

    $missingTools = @()
    foreach ($p in $toolChecks) {
        if (-not (Assert-FileContains -FilePath $toolsPath -Pattern $p)) {
            $missingTools += $p
        }
    }

    if ($missingTools.Count -eq 0) {
        Add-Pass "Tool manager coding progress contract present"
    } else {
        Add-Failure "Tool manager contract missing: $($missingTools -join ', ')"
    }
} catch {
    Add-Failure "Tool manager contract check failed: $($_.Exception.Message)"
}

try {
    $runtimeChecks = @(
        "'get_coding_progress'",
        'Coding progress (',
        'ahead/behind'
    )

    $missingRuntime = @()
    foreach ($p in $runtimeChecks) {
        if (-not (Assert-FileContains -FilePath $runtimePath -Pattern $p)) {
            $missingRuntime += $p
        }
    }

    if ($missingRuntime.Count -eq 0) {
        Add-Pass "Agent runtime coding progress integration present"
    } else {
        Add-Failure "Agent runtime integration missing: $($missingRuntime -join ', ')"
    }
} catch {
    Add-Failure "Agent runtime integration check failed: $($_.Exception.Message)"
}

Write-Host ""
if ($failures.Count -eq 0) {
    Write-Host "Smoke test passed." -ForegroundColor Green
    exit 0
}

Write-Host "Smoke test failed ($($failures.Count) issue(s))." -ForegroundColor Red
$failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
exit 1
