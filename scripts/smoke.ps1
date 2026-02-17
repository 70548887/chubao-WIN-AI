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
$frontendPanelsPath = Join-Path $ProjectRoot "src\\components\\SettingsPanel.tsx"
$frontendCompareHookPath = Join-Path $ProjectRoot "src\components\settings\useDiagnosticsCompare.ts"
$frontendCodingHookPath = Join-Path $ProjectRoot "src\components\settings\useCodingProgress.ts"
$frontendDiagnosticsExportHookPath = Join-Path $ProjectRoot "src\components\settings\useDiagnosticsExport.ts"
$frontendAppHealthMetaHookPath = Join-Path $ProjectRoot "src\components\settings\useAppHealthMeta.ts"
$frontendServiceIssueViewHookPath = Join-Path $ProjectRoot "src\components\settings\useServiceIssueView.ts"
$frontendSidecarServicesHookPath = Join-Path $ProjectRoot "src\components\settings\useSidecarServices.ts"
$frontendDiagnosticsExportUtilsPath = Join-Path $ProjectRoot "src\components\settings\diagnosticsExportUtils.ts"
$frontendCodingSectionPath = Join-Path $ProjectRoot "src\components\settings\CodingProgressSection.tsx"
$frontendCompareSectionPath = Join-Path $ProjectRoot "src\components\settings\DiagnosticsCompareSection.tsx"
$frontendCompareUtilsPath = Join-Path $ProjectRoot "src\components\settings\diagnosticsCompareUtils.ts"
$frontendServiceStatusSectionPath = Join-Path $ProjectRoot "src\components\settings\ServiceStatusSection.tsx"
$frontendServiceLogsSectionPath = Join-Path $ProjectRoot "src\components\settings\ServiceLogsSection.tsx"
$frontendStatusRowPath = Join-Path $ProjectRoot "src\components\ServiceStatusRow.tsx"
$frontendServiceTypesPath = Join-Path $ProjectRoot "src\components\settings\serviceTypes.ts"
$rootPackagePath = Join-Path $ProjectRoot "package.json"
$startScriptPath = Join-Path $ProjectRoot "scripts\start.ps1"
$ocrSetupScriptPath = Join-Path $ProjectRoot "scripts\setup-ocr.ps1"
$contractDocPath = Join-Path $ProjectRoot "docs\SIDECAR_STATUS_CONTRACT.md"
$nodeBackendPath = Join-Path $ProjectRoot "sidecars\node-backend\src\index.ts"
$multiAgentRoutesPath = Join-Path $ProjectRoot "sidecars\node-backend\src\routes\multiAgent.ts"
$nodeBackendPackagePath = Join-Path $ProjectRoot "sidecars\node-backend\package.json"
$nodeDevGuardPath = Join-Path $ProjectRoot "sidecars\node-backend\scripts\dev-with-port-guard.mjs"
$runtimePath = Join-Path $ProjectRoot "sidecars\node-backend\src\agent\runtime.ts"
$runtimeSecurityPath = Join-Path $ProjectRoot "sidecars\node-backend\src\agent\security.ts"
$toolsPath = Join-Path $ProjectRoot "sidecars\node-backend\src\tools\index.ts"
$opencodeToolsPath = Join-Path $ProjectRoot "sidecars\node-backend\src\tools\opencode.ts"
$ohmyOpencodeToolsPath = Join-Path $ProjectRoot "sidecars\node-backend\src\tools\ohmyopencode.ts"
$multiAgentCoordinatorPath = Join-Path $ProjectRoot "sidecars\node-backend\src\tools\multiAgentCoordinator.ts"
$skillRegistryPath = Join-Path $ProjectRoot "sidecars\node-backend\src\tools\skillRegistry.ts"
$skillInstallCliPath = Join-Path $ProjectRoot "sidecars\node-backend\src\tools\installSkillCli.ts"
$skillTemplateManifestPath = Join-Path $ProjectRoot "sidecars\node-backend\skills\templates\echo-skill\skill.json"
$skillTemplateModulePath = Join-Path $ProjectRoot "sidecars\node-backend\skills\templates\echo-skill\echo-skill.mjs"

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

    # 4.2) Node tools + sandbox status
    try {
        $toolsStatus = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$NodePort/api/tools"
        if (
            $toolsStatus.success -eq $true `
            -and $null -ne $toolsStatus.tools `
            -and $toolsStatus.sandbox `
            -and $toolsStatus.sandbox.mode `
            -and $toolsStatus.security `
            -and $toolsStatus.security.mode `
            -and $toolsStatus.cli `
            -and $toolsStatus.cli.summary `
            -and $toolsStatus.cli.tools `
            -and $toolsStatus.cli.tools.opencode `
            -and $toolsStatus.cli.tools.ohMyOpencode
        ) {
            Add-Pass "Node /api/tools contract ok"
        } else {
            Add-Failure "Node /api/tools missing required fields"
        }
    } catch {
        Add-Failure "Node /api/tools unreachable: $($_.Exception.Message)"
    }

    # 4.3) Node multi-agent start INVALID_ARGUMENT contract
    try {
        $multiAgentInvalid = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$NodePort/api/multi-agent/start" -Body @{}
        if ($multiAgentInvalid.StatusCode -eq 400 -and $multiAgentInvalid.Body.errorCode -eq "INVALID_ARGUMENT") {
            Add-Pass "Node /api/multi-agent/start invalid argument contract ok"
        } else {
            Add-Failure "Node /api/multi-agent/start invalid argument contract failed (status=$($multiAgentInvalid.StatusCode), errorCode=$($multiAgentInvalid.Body.errorCode))"
        }
    } catch {
        Add-Failure "Node /api/multi-agent/start invalid argument test failed: $($_.Exception.Message)"
    }

    # 4.4) Node multi-agent groups status contract
    try {
        $multiAgentGroups = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$NodePort/api/multi-agent/groups"
        if ($multiAgentGroups.success -eq $true -and $null -ne $multiAgentGroups.groups) {
            Add-Pass "Node /api/multi-agent/groups contract ok"
        } else {
            Add-Failure "Node /api/multi-agent/groups missing required fields"
        }
    } catch {
        Add-Failure "Node /api/multi-agent/groups unreachable: $($_.Exception.Message)"
    }

    # 4.5) Node multi-agent start positive flow (S4-05)
    try {
        $multiAgentStart = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$NodePort/api/multi-agent/start" -Body @{
            tasks = @(
                @{
                    kind = 'task'
                    taskCategory = 'test'
                    taskPrompt = 'Smoke test task for multi-agent system'
                }
            )
        }
        if ($multiAgentStart.StatusCode -eq 200 -and $multiAgentStart.Body.success -eq $true) {
            $groupId = $multiAgentStart.Body.groupId
            if ($groupId -and $multiAgentStart.Body.group -and $multiAgentStart.Body.group.status) {
                Add-Pass "Node /api/multi-agent/start positive flow ok (groupId=$groupId)"
                
                # 4.5.1) Verify group can be queried
                Start-Sleep -Milliseconds 500
                $groupStatus = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$NodePort/api/multi-agent/groups/$groupId"
                if ($groupStatus.success -eq $true -and $groupStatus.group -and $groupStatus.group.id -eq $groupId) {
                    Add-Pass "Node /api/multi-agent/groups/{id} query ok"
                } else {
                    Add-Failure "Node /api/multi-agent/groups/{id} query failed"
                }
                
                # 4.5.2) Cancel the test group
                $cancelResult = Invoke-Json -Method "POST" -Url "http://127.0.0.1:$NodePort/api/multi-agent/groups/$groupId/cancel"
                if ($cancelResult.success -eq $true) {
                    Add-Pass "Node /api/multi-agent/groups/{id}/cancel ok"
                } else {
                    Add-Failure "Node /api/multi-agent/groups/{id}/cancel failed"
                }
            } else {
                Add-Failure "Node /api/multi-agent/start missing groupId or group status"
            }
        } else {
            # Service might be unavailable or forbidden (expected if dependencies not installed or security policy)
            if ($multiAgentStart.StatusCode -eq 503 -or $multiAgentStart.Body.errorCode -eq "SERVICE_UNAVAILABLE") {
                Add-Pass "Node /api/multi-agent/start returns SERVICE_UNAVAILABLE as expected (dependencies not installed)"
            } elseif ($multiAgentStart.StatusCode -eq 403 -or $multiAgentStart.Body.errorCode -eq "FORBIDDEN") {
                Add-Pass "Node /api/multi-agent/start returns FORBIDDEN as expected (security policy)"
            } else {
                Add-Failure "Node /api/multi-agent/start positive flow failed (status=$($multiAgentStart.StatusCode), errorCode=$($multiAgentStart.Body.errorCode))"
            }
        }
    } catch {
        Add-Failure "Node /api/multi-agent/start positive flow test failed: $($_.Exception.Message)"
    }

    # 4.6) Node task queue status contract (S4-05)
    try {
        $taskQueueStatus = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$NodePort/api/tasks"
        if ($taskQueueStatus.success -eq $true -and $null -ne $taskQueueStatus.tasks) {
            Add-Pass "Node /api/tasks contract ok"
        } else {
            Add-Failure "Node /api/tasks missing required fields"
        }
    } catch {
        Add-Failure "Node /api/tasks unreachable: $($_.Exception.Message)"
    }

    # 4.7) Node cron scheduler list contract (S4-05)
    try {
        $cronList = Invoke-Json -Method "GET" -Url "http://127.0.0.1:$NodePort/api/cron"
        if ($cronList.success -eq $true -and $null -ne $cronList.jobs) {
            Add-Pass "Node /api/cron contract ok"
        } else {
            Add-Failure "Node /api/cron missing required fields"
        }
    } catch {
        Add-Failure "Node /api/cron unreachable: $($_.Exception.Message)"
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

    # 5.1) Python hotkey INVALID_ARGUMENT contract
    try {
        $pyHotkeyInvalid = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$PythonPort/api/hotkey" -Body @{}
        if ($pyHotkeyInvalid.StatusCode -eq 400 -and $pyHotkeyInvalid.Body.errorCode -eq "INVALID_ARGUMENT") {
            Add-Pass "Python /api/hotkey invalid argument contract ok"
        } else {
            Add-Failure "Python /api/hotkey invalid argument contract failed (status=$($pyHotkeyInvalid.StatusCode), errorCode=$($pyHotkeyInvalid.Body.errorCode))"
        }
    } catch {
        Add-Failure "Python /api/hotkey invalid argument test failed: $($_.Exception.Message)"
    }

    # 5.2) Python browser navigate INVALID_ARGUMENT contract
    try {
        $pyBrowserNavigateInvalid = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$PythonPort/api/browser/navigate" -Body @{}
        if ($pyBrowserNavigateInvalid.StatusCode -eq 400 -and $pyBrowserNavigateInvalid.Body.errorCode -eq "INVALID_ARGUMENT") {
            Add-Pass "Python /api/browser/navigate invalid argument contract ok"
        } else {
            Add-Failure "Python /api/browser/navigate invalid argument contract failed (status=$($pyBrowserNavigateInvalid.StatusCode), errorCode=$($pyBrowserNavigateInvalid.Body.errorCode))"
        }
    } catch {
        Add-Failure "Python /api/browser/navigate invalid argument test failed: $($_.Exception.Message)"
    }

    # 5.3) Python browser click INVALID_ARGUMENT contract
    try {
        $pyBrowserClickInvalid = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$PythonPort/api/browser/click" -Body @{}
        if ($pyBrowserClickInvalid.StatusCode -eq 400 -and $pyBrowserClickInvalid.Body.errorCode -eq "INVALID_ARGUMENT") {
            Add-Pass "Python /api/browser/click invalid argument contract ok"
        } else {
            Add-Failure "Python /api/browser/click invalid argument contract failed (status=$($pyBrowserClickInvalid.StatusCode), errorCode=$($pyBrowserClickInvalid.Body.errorCode))"
        }
    } catch {
        Add-Failure "Python /api/browser/click invalid argument test failed: $($_.Exception.Message)"
    }

    # 5.4) Python browser form_input INVALID_ARGUMENT contract
    try {
        $pyBrowserFormInputInvalid = Invoke-JsonWithStatus -Method "POST" -Url "http://127.0.0.1:$PythonPort/api/browser/form_input" -Body @{}
        if ($pyBrowserFormInputInvalid.StatusCode -eq 400 -and $pyBrowserFormInputInvalid.Body.errorCode -eq "INVALID_ARGUMENT") {
            Add-Pass "Python /api/browser/form_input invalid argument contract ok"
        } else {
            Add-Failure "Python /api/browser/form_input invalid argument contract failed (status=$($pyBrowserFormInputInvalid.StatusCode), errorCode=$($pyBrowserFormInputInvalid.Body.errorCode))"
        }
    } catch {
        Add-Failure "Python /api/browser/form_input invalid argument test failed: $($_.Exception.Message)"
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
        'fn sidecar_port_inspect',
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

# 7.2) Contract doc alignment (static)
try {
    $docChecks = @(
        'pythonOcrSummary',
        'portConflictSummary',
        'engineInitialized',
        'diagnostics.v1.2',
        'diagnostics.v1.1'
    )

    $missingDoc = @()
    foreach ($p in $docChecks) {
        if (-not (Assert-FileContains -FilePath $contractDocPath -Pattern $p)) {
            $missingDoc += $p
        }
    }

    if ($missingDoc.Count -eq 0) {
        Add-Pass "Contract doc includes OCR/port export summary fields"
    } else {
        Add-Failure "Contract doc missing OCR/port export fields: $($missingDoc -join ', ')"
    }
} catch {
    Add-Failure "Contract doc check failed: $($_.Exception.Message)"
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
        'portInspectBusy',
        'portInspections',
        'onInspectPort',
        'status-port-inspect',
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
        'schemaVersion: DIAGNOSTICS_EXPORT_SCHEMA_CURRENT',
        'const DIAGNOSTICS_EXPORT_SCHEMA_CURRENT = ''diagnostics.v1.2''',
        'const DIAGNOSTICS_EXPORT_SCHEMA_COMPAT = [',
        '''diagnostics.v1.1''',
        'appVersion:',
        'pythonOcrSummary:',
        'portConflictSummary:',
        'buildPortConflictServiceSummary(',
        'comparePortConflictSummary(',
        'getCompareLineClass(',
        "invoke<SidecarPortInspectionPayload>('sidecar_port_inspect'",
        'redactSensitiveData(',
        "invoke<SidecarStatusResponse>('restart_sidecar'",
        "invoke<SidecarLogsResponse>('sidecar_logs'",
        "'sidecar_diagnostics'"
    )

    $missingFrontend = @()
    foreach ($p in $frontendChecks) {
        $foundInApp = Assert-FileContains -FilePath $frontendAppPath -Pattern $p
        $foundInPanels = Assert-FileContains -FilePath $frontendPanelsPath -Pattern $p
        $foundInCompareHook = Assert-FileContains -FilePath $frontendCompareHookPath -Pattern $p
        $foundInCodingHook = Assert-FileContains -FilePath $frontendCodingHookPath -Pattern $p
        $foundInDiagnosticsExportHook = Assert-FileContains -FilePath $frontendDiagnosticsExportHookPath -Pattern $p
        $foundInAppHealthMetaHook = Assert-FileContains -FilePath $frontendAppHealthMetaHookPath -Pattern $p
        $foundInServiceIssueViewHook = Assert-FileContains -FilePath $frontendServiceIssueViewHookPath -Pattern $p
        $foundInSidecarServicesHook = Assert-FileContains -FilePath $frontendSidecarServicesHookPath -Pattern $p
        $foundInDiagnosticsExportUtils = Assert-FileContains -FilePath $frontendDiagnosticsExportUtilsPath -Pattern $p
        $foundInCodingSection = Assert-FileContains -FilePath $frontendCodingSectionPath -Pattern $p
        $foundInCompareSection = Assert-FileContains -FilePath $frontendCompareSectionPath -Pattern $p
        $foundInCompareUtils = Assert-FileContains -FilePath $frontendCompareUtilsPath -Pattern $p
        $foundInServiceStatusSection = Assert-FileContains -FilePath $frontendServiceStatusSectionPath -Pattern $p
        $foundInServiceLogsSection = Assert-FileContains -FilePath $frontendServiceLogsSectionPath -Pattern $p
        $foundInStatusRow = Assert-FileContains -FilePath $frontendStatusRowPath -Pattern $p
        $foundInServiceTypes = Assert-FileContains -FilePath $frontendServiceTypesPath -Pattern $p
        if (-not ($foundInApp -or $foundInPanels -or $foundInCompareHook -or $foundInCodingHook -or $foundInDiagnosticsExportHook -or $foundInAppHealthMetaHook -or $foundInServiceIssueViewHook -or $foundInSidecarServicesHook -or $foundInDiagnosticsExportUtils -or $foundInCodingSection -or $foundInCompareSection -or $foundInCompareUtils -or $foundInServiceStatusSection -or $foundInServiceLogsSection -or $foundInStatusRow -or $foundInServiceTypes)) {
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

    $tauriPortGuardPattern = '"tauri"\s*\{.*?Prepare-PortForStartup\s+-ServiceName\s+"Python Automation"\s+-Port\s+\$pythonPort.*?Prepare-PortForStartup\s+-ServiceName\s+"Node\.js Backend"\s+-Port\s+\$nodePort'
    if (Assert-FileRegex -FilePath $startScriptPath -Pattern $tauriPortGuardPattern) {
        Add-Pass "Launcher tauri mode port pre-cleanup present"
    } else {
        Add-Failure "Launcher tauri mode missing sidecar port pre-cleanup"
    }

    $allPortGuardPattern = '"all"\s*\{.*?Prepare-PortForStartup\s+-ServiceName\s+"Python Automation"\s+-Port\s+\$pythonPort.*?Prepare-PortForStartup\s+-ServiceName\s+"Node\.js Backend"\s+-Port\s+\$nodePort'
    if (Assert-FileRegex -FilePath $startScriptPath -Pattern $allPortGuardPattern) {
        Add-Pass "Launcher all mode port pre-cleanup present"
    } else {
        Add-Failure "Launcher all mode missing sidecar port pre-cleanup"
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
        "app.get('/api/config/model'",
        "app.put('/api/config/model'",
        "app.post('/api/config/model/persist'",
        "app.get('/api/coding/progress'",
        "app.get('/api/tools'",
        "app.post('/api/multi-agent/start'",
        "app.get('/api/multi-agent/groups'",
        "app.get('/api/multi-agent/groups/:groupId'",
        "app.post('/api/multi-agent/groups/:groupId/cancel'",
        'registerMultiAgentRoutes({',
        "'NOT_FOUND'",
        'statusCodeForErrorCode',
        'analyzeCodingProgress({',
        'getSandboxPolicy()',
        'security: agentRuntime.getSecurityPolicy()',
        'const cli = await toolManager.getCliHealth();',
        'cli,',
        "'FORBIDDEN'",
        "app.get('/api/skills'",
        "app.post('/api/skills/install'",
        'await toolManager.initializeSkills();'
    )

    $missingNodePort = @()
    foreach ($p in $nodePortChecks) {
        $inNodeBackend = Assert-FileContains -FilePath $nodeBackendPath -Pattern $p
        $inMultiAgentRoutes = Assert-FileContains -FilePath $multiAgentRoutesPath -Pattern $p
        if (-not ($inNodeBackend -or $inMultiAgentRoutes)) {
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
        'CHUBAO_TOOL_SANDBOX_MODE',
        'CHUBAO_ALLOWED_TOOLS',
        'CHUBAO_BLOCKED_TOOLS',
        'getSandboxPolicy(): ToolSandboxPolicy',
        'not allowed by sandbox policy',
        'this.getAllTools().map(',
        'loadSkillToolsFromRegistry',
        'installSkillFromPath',
        'initializeSkills(): Promise<void>',
        'installSkill(skillPath: string)',
        'getInstalledSkills(): InstalledSkillManifest[]',
        'getSkillWarnings(): string[]',
        "name: 'right_click'",
        "name: 'double_click'",
        "name: 'hover'",
        "name: 'drag'",
        "name: 'browser_launch'",
        "name: 'browser_navigate'",
        "name: 'browser_click'",
        "name: 'browser_type'",
        "name: 'browser_read_page'",
        "name: 'browser_get_text'",
        "name: 'browser_form_input'",
        "name: 'browser_press'",
        "name: 'browser_scroll'",
        "name: 'browser_screenshot'",
        "name: 'browser_close'",
        "name: 'opencode_run'",
        "name: 'opencode_create_project'",
        "name: 'opencode_check_status'",
        "name: 'opencode_list_tasks'",
        "name: 'opencode_check_concurrent_status'",
        "name: 'opencode_cancel_task'",
        "name: 'ohmyopencode_task'",
        "name: 'ohmyopencode_delegate'",
        "name: 'ohmyopencode_list_agents'",
        "name: 'ohmyopencode_check_concurrent_status'",
        "name: 'ohmyopencode_cancel_task'",
        "name: 'multi_agent_start'",
        "name: 'multi_agent_group_status'",
        "name: 'multi_agent_group_cancel'",
        "name: 'multi_agent_group_list'",
        'opencodeRunTool',
        'opencodeCreateProjectTool',
        'opencodeCheckStatusTool',
        'opencodeCancelTaskTool',
        'ohmyOpencodeTaskTool',
        'ohmyOpencodeDelegateTool',
        'ohmyOpencodeListAgentsTool',
        'ohmyOpencodeCheckConcurrentStatusTool',
        'ohmyOpencodeCancelTaskTool',
        'multiAgentStartTool',
        'multiAgentStatusTool',
        'multiAgentCancelTool',
        'multiAgentListTool',
        "from './opencode.js'",
        "from './ohmyopencode.js'",
        "from './multiAgentCoordinator.js'",
        'startMultiAgentGroup',
        'getMultiAgentGroupStatus',
        'cancelMultiAgentGroup',
        'listMultiAgentGroups',
        'CHUBAO_OHMYOPENCODE_BIN',
        'CHUBAO_OPENCODE_TASK_STATE_ENABLED',
        'CHUBAO_OPENCODE_TASK_STATE_PATH',
        'CHUBAO_OPENCODE_TASK_RETENTION_MS',
        'CHUBAO_OPENCODE_MAX_TASKS',
        'CHUBAO_OHMY_TASK_STATE_ENABLED',
        'CHUBAO_OHMY_TASK_STATE_PATH',
        'CHUBAO_MULTI_AGENT_GROUP_STATE_ENABLED',
        'CHUBAO_MULTI_AGENT_GROUP_STATE_PATH',
        'CHUBAO_MULTI_AGENT_MAX_RUNNING_GROUPS',
        'CHUBAO_MULTI_AGENT_MAX_RUNNING_TASKS',
        'multi-agent service unavailable',
        'running group limit reached',
        'running task limit reached',
        'persistOhMyTasks',
        'loadPersistedTasksIfNeeded',
        'persistOpenCodeTasks',
        'loadPersistedOpenCodeTasksIfNeeded',
        'opencode-tasks.v1',
        'persistMultiAgentGroups',
        'loadPersistedGroupsIfNeeded',
        'ohmy-tasks.v1',
        'multi-agent-groups.v1',
        '/api/right_click',
        '/api/double_click',
        '/api/hover',
        '/api/drag',
        '/api/browser/launch',
        '/api/browser/navigate',
        '/api/browser/click',
        '/api/browser/type',
        '/api/browser/read_page',
        '/api/browser/get_text',
        '/api/browser/form_input',
        '/api/browser/press',
        '/api/browser/scroll',
        '/api/browser/screenshot',
        '/api/browser/close',
        'base64: data.result.base64',
        'mediaType: data.result.media_type',
        'probeOpenCodeCli',
        'probeOhMyCli',
        'getCliHealth(): Promise<CliHealthSnapshot>'
    )

    $missingTools = @()
    foreach ($p in $toolChecks) {
        $inToolIndex = Assert-FileContains -FilePath $toolsPath -Pattern $p
        $inOpenCodeTools = Assert-FileContains -FilePath $opencodeToolsPath -Pattern $p
        $inOhMyOpenCodeTools = Assert-FileContains -FilePath $ohmyOpencodeToolsPath -Pattern $p
        $inMultiAgentCoordinator = Assert-FileContains -FilePath $multiAgentCoordinatorPath -Pattern $p
        if (-not ($inToolIndex -or $inOpenCodeTools -or $inOhMyOpenCodeTools -or $inMultiAgentCoordinator)) {
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
    $skillChecks = @(
        'CHUBAO_SKILLS_DIR',
        'chubao.skill.v1',
        'loadSkillToolsFromRegistry',
        'installSkillFromPath',
        'skill:install',
        'npm run skill:install -- ./skills/templates/echo-skill',
        'demo.echo-skill',
        'echo_text'
    )

    $missingSkills = @()
    foreach ($p in $skillChecks) {
        $inRegistry = Assert-FileContains -FilePath $skillRegistryPath -Pattern $p
        $inCli = Assert-FileContains -FilePath $skillInstallCliPath -Pattern $p
        $inNodePkg = Assert-FileContains -FilePath $nodeBackendPackagePath -Pattern $p
        $inTemplateManifest = Assert-FileContains -FilePath $skillTemplateManifestPath -Pattern $p
        $inTemplateModule = Assert-FileContains -FilePath $skillTemplateModulePath -Pattern $p
        if (-not ($inRegistry -or $inCli -or $inNodePkg -or $inTemplateManifest -or $inTemplateModule)) {
            $missingSkills += $p
        }
    }

    if ($missingSkills.Count -eq 0) {
        Add-Pass "Skill module install/registry wiring present"
    } else {
        Add-Failure "Skill module wiring missing: $($missingSkills -join ', ')"
    }
} catch {
    Add-Failure "Skill module wiring check failed: $($_.Exception.Message)"
}

try {
    $runtimeSecurityChecks = @(
        "export type SecurityMode = 'off' | 'warn' | 'enforce'",
        "export class ToolSecurityGuard",
        "return 'enforce';",
        'CHUBAO_SECURITY_MODE',
        'CHUBAO_SECURITY_ALLOW_HIGH_RISK',
        'CHUBAO_SECURITY_ALLOWED_TOOLS',
        'CHUBAO_SECURITY_BLOCKED_TOOLS',
        'CHUBAO_SECURITY_BLOCKED_ARG_PATTERNS',
        'high-risk tool requires CHUBAO_SECURITY_ALLOW_HIGH_RISK=true',
        'path traversal is not allowed',
        'url protocol not allowed'
    )

    $missingRuntimeSecurity = @()
    foreach ($p in $runtimeSecurityChecks) {
        if (-not (Assert-FileContains -FilePath $runtimeSecurityPath -Pattern $p)) {
            $missingRuntimeSecurity += $p
        }
    }

    if ($missingRuntimeSecurity.Count -eq 0) {
        Add-Pass "Agent runtime security guard contract present"
    } else {
        Add-Failure "Agent runtime security guard missing: $($missingRuntimeSecurity -join ', ')"
    }
} catch {
    Add-Failure "Agent runtime security guard check failed: $($_.Exception.Message)"
}

try {
    $runtimeChecks = @(
        "response.stop_reason !== 'tool_use'",
        "type: 'tool_result'",
        "type: 'image'",
        'media_type: mediaType',
        'tool_use_id: toolUse.id',
        'content: toolResultBlocks',
        'buildToolResultContent(toolUse.name, modelResult)',
        'adaptToolArgsForExecution(toolUse.name, safeInput)',
        'adaptToolResultForModel(toolUse.name, result)',
        'extractTextFromBlocks(response.content)',
        'persistModelConfig(',
        'CHUBAO_ENV_AUTO_PERSIST',
        'resolveEnvFilePath()',
        'getPersistableModelConfigEntries()',
        'ToolSecurityGuard',
        'getSecurityPolicy(): ToolSecurityPolicy',
        'this.securityGuard.evaluate(',
        'blocked by security policy'
    )

    $missingRuntime = @()
    foreach ($p in $runtimeChecks) {
        if (-not (Assert-FileContains -FilePath $runtimePath -Pattern $p)) {
            $missingRuntime += $p
        }
    }

    if ($missingRuntime.Count -eq 0) {
        Add-Pass "Agent runtime multi-turn tool loop contract present"
    } else {
        Add-Failure "Agent runtime multi-turn loop contract missing: $($missingRuntime -join ', ')"
    }
} catch {
    Add-Failure "Agent runtime multi-turn loop check failed: $($_.Exception.Message)"
}

Write-Host ""
if ($failures.Count -eq 0) {
    Write-Host "Smoke test passed." -ForegroundColor Green
    exit 0
}

Write-Host "Smoke test failed ($($failures.Count) issue(s))." -ForegroundColor Red
$failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
exit 1
