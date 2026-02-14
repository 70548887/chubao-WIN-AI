# ===========================================
# Parallel development launcher
# Opens multiple PowerShell terminals and runs
# oh-my-opencode lanes concurrently.
# ===========================================

param(
    [switch]$PreviewOnly,
    [string]$RepoRoot = "",
    [string]$SingleModel = "openai/gpt-5.3-codex"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $RepoRoot = (Resolve-Path $RepoRoot).Path
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "[ERROR] npx not found. Install Node.js first."
}

function Escape-SingleQuoted {
    param([string]$Value)
    return ($Value -replace "'", "''")
}

function Start-DevLane {
    param(
        [string]$Title,
        [string]$Role,
        [string]$Model,
        [string]$Workdir,
        [string]$Agent,
        [string]$TaskGoal,
        [bool]$Preview
    )

    if (-not (Test-Path $Workdir)) {
        throw "[ERROR] lane workdir not found: $Workdir"
    }

    $safeTitle = Escape-SingleQuoted $Title
    $safeRole = Escape-SingleQuoted $Role
    $safeModel = Escape-SingleQuoted $Model
    $safeAgent = Escape-SingleQuoted $Agent
    $safeWorkdir = Escape-SingleQuoted $Workdir
    $safeTaskGoal = Escape-SingleQuoted $TaskGoal

    $prompt = "ulw: role=$Role; model=$Model; task-goal=$TaskGoal. keep changes scoped, run validation commands, and report file paths with outcomes."
    $safePrompt = Escape-SingleQuoted $prompt

    $commandScript = @"
`$Host.UI.RawUI.WindowTitle = '$safeTitle'
Set-Location '$safeWorkdir'
Write-Host '[$safeTitle] workdir: $safeWorkdir' -ForegroundColor Cyan
Write-Host '[$safeTitle] role: $safeRole' -ForegroundColor Cyan
Write-Host '[$safeTitle] model: $safeModel' -ForegroundColor Cyan
Write-Host '[$safeTitle] goal: $safeTaskGoal' -ForegroundColor Cyan
Remove-Item Env:OPENCODE_SERVER_USERNAME -ErrorAction SilentlyContinue
Remove-Item Env:OPENCODE_SERVER_PASSWORD -ErrorAction SilentlyContinue
`$env:OPENCODE_MODEL = '$safeModel'
`$env:CHUBAO_OPENCODE_MODEL = '$safeModel'
`$laneAgent = '$safeAgent'
`$lanePrompt = '$safePrompt'
`$cmdArgs = @('--yes', 'oh-my-opencode', 'run', '--agent', `$laneAgent, '--directory', '.', `$lanePrompt)
Write-Host "[$safeTitle] command: npx `$(`$cmdArgs -join ' ')" -ForegroundColor DarkGray
"@

    if (-not $Preview) {
        $commandScript = $commandScript + "`n& npx @cmdArgs"
        $commandScript = $commandScript + "`n`$exitCode = `$LASTEXITCODE"
        $commandScript = $commandScript + "`nif (`$exitCode -ne 0) { Write-Host '[${safeTitle}] command failed with exit code: ' `$exitCode -ForegroundColor Red } else { Write-Host '[${safeTitle}] command completed successfully.' -ForegroundColor Green }"
    }

    Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $commandScript
    ) -WorkingDirectory $Workdir | Out-Null
}

$lanes = @(
    @{
        Title = "Lane-Backend"
        Role = "Backend Engineer"
        Model = $SingleModel
        Workdir = (Join-Path $RepoRoot "sidecars/node-backend")
        Agent = "Hephaestus"
        TaskGoal = "Complete S4-03 and S4-07 backend tasks: stabilize CLI probes, improve node-backend tests, and wire CI checks"
    },
    @{
        Title = "Lane-Frontend"
        Role = "Frontend Engineer"
        Model = $SingleModel
        Workdir = (Join-Path $RepoRoot "src")
        Agent = "Hephaestus"
        TaskGoal = "Complete S4-04: show /api/tools CLI health status and failure reasons in Settings UI"
    },
    @{
        Title = "Lane-QA"
        Role = "QA and Debug"
        Model = $SingleModel
        Workdir = $RepoRoot
        Agent = "Hephaestus"
        TaskGoal = "Run test, smoke, and verify flows; produce root-cause analysis and regression verdict"
    },
    @{
        Title = "Lane-Docs"
        Role = "Docs and Release"
        Model = $SingleModel
        Workdir = (Join-Path $RepoRoot "docs")
        Agent = "Hephaestus"
        TaskGoal = "Sync sprint board, add runbook and acceptance commands, and align docs with repo state"
    }
)

foreach ($lane in $lanes) {
    Start-DevLane -Title $lane.Title -Role $lane.Role -Model $lane.Model -Workdir $lane.Workdir -Agent $lane.Agent -TaskGoal $lane.TaskGoal -Preview:$PreviewOnly
}

if ($PreviewOnly) {
    Write-Host "[ok] launched 4 preview terminals (commands not executed)." -ForegroundColor Yellow
} else {
    Write-Host "[ok] launched 4 parallel dev terminals." -ForegroundColor Green
}
