param(
    [ValidateSet("check", "apply")]
    [string]$Mode = "check",

    [string]$Repo = "",

    [string]$Branch = "main",

    [switch]$IncludeDevelop
)

$ErrorActionPreference = "Stop"

$requiredChecks = @(
    "build-frontend",
    "build-node-backend",
    "unit-core",
    "unit-node-backend",
    "lint-smoke",
    "python-syntax",
    "secret-scan",
    "e2e-windows"
)

function Require-Gh {
    if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
        throw "[ERROR] GitHub CLI (gh) not found. Install gh first."
    }

    & gh auth status 1>$null
    if ($LASTEXITCODE -ne 0) {
        throw "[ERROR] gh auth status failed. Run 'gh auth login' first."
    }
}

function Resolve-RepoName {
    param([string]$RepoArg)

    if ($RepoArg -and $RepoArg.Trim().Length -gt 0) {
        return $RepoArg.Trim()
    }

    $resolved = (& gh repo view --json nameWithOwner --jq ".nameWithOwner").Trim()
    if (-not $resolved) {
        throw "[ERROR] Unable to resolve repository. Pass -Repo owner/name explicitly."
    }
    return $resolved
}

function Get-BranchProtection {
    param(
        [string]$RepoName,
        [string]$BranchName
    )

    try {
        $raw = & gh api "repos/$RepoName/branches/$BranchName/protection"
        if ($LASTEXITCODE -ne 0 -or -not $raw) {
            return $null
        }
        return $raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Test-BranchProtection {
    param([object]$Protection)

    $missing = New-Object System.Collections.Generic.List[string]

    if (-not $Protection) {
        $missing.Add("branch protection not configured") | Out-Null
        return [PSCustomObject]@{ Ok = $false; Missing = $missing }
    }

    $requiredApprovals = [int]($Protection.required_pull_request_reviews.required_approving_review_count)
    if ($requiredApprovals -lt 1) {
        $missing.Add("required approvals < 1") | Out-Null
    }

    if (-not [bool]$Protection.required_pull_request_reviews.require_code_owner_reviews) {
        $missing.Add("code owner review not required") | Out-Null
    }

    if (-not [bool]$Protection.required_pull_request_reviews.dismiss_stale_reviews) {
        $missing.Add("dismiss stale reviews is disabled") | Out-Null
    }

    if (-not [bool]$Protection.enforce_admins.enabled) {
        $missing.Add("admin enforcement disabled") | Out-Null
    }

    if ([bool]$Protection.allow_force_pushes.enabled) {
        $missing.Add("force pushes allowed") | Out-Null
    }

    $configuredChecks = @($Protection.required_status_checks.contexts)
    foreach ($check in $requiredChecks) {
        if ($configuredChecks -notcontains $check) {
            $missing.Add("missing required status check: $check") | Out-Null
        }
    }

    return [PSCustomObject]@{
        Ok = ($missing.Count -eq 0)
        Missing = $missing
    }
}

function Set-BranchProtection {
    param(
        [string]$RepoName,
        [string]$BranchName
    )

    $payload = [ordered]@{
        required_status_checks = [ordered]@{
            strict = $true
            contexts = $requiredChecks
        }
        enforce_admins = $true
        required_pull_request_reviews = [ordered]@{
            dismiss_stale_reviews = $true
            require_code_owner_reviews = $true
            required_approving_review_count = 1
            require_last_push_approval = $false
            bypass_pull_request_allowances = [ordered]@{
                users = @()
                teams = @()
                apps = @()
            }
            dismissal_restrictions = [ordered]@{
                users = @()
                teams = @()
                apps = @()
            }
        }
        restrictions = $null
        required_linear_history = $false
        allow_force_pushes = $false
        allow_deletions = $false
        block_creations = $false
        required_conversation_resolution = $true
        lock_branch = $false
        allow_fork_syncing = $true
    }

    $tempFile = [System.IO.Path]::GetTempFileName()
    try {
        $json = $payload | ConvertTo-Json -Depth 20
        Set-Content -Path $tempFile -Value $json -Encoding utf8

        & gh api --method PUT "repos/$RepoName/branches/$BranchName/protection" --input $tempFile 1>$null
        if ($LASTEXITCODE -ne 0) {
            throw "gh api failed when applying protection to $BranchName"
        }
    } finally {
        Remove-Item -Path $tempFile -ErrorAction SilentlyContinue
    }
}

Require-Gh
$repoName = Resolve-RepoName -RepoArg $Repo

$branches = @($Branch)
if ($IncludeDevelop -and ($branches -notcontains "develop")) {
    $branches += "develop"
}

if ($Mode -eq "check") {
    $failed = $false
    foreach ($branchName in $branches) {
        Write-Host "[check] ${repoName}:$branchName" -ForegroundColor Cyan
        $protection = Get-BranchProtection -RepoName $repoName -BranchName $branchName
        $result = Test-BranchProtection -Protection $protection

        if ($result.Ok) {
            Write-Host "  [OK] guardrails configured" -ForegroundColor Green
            continue
        }

        $failed = $true
        Write-Host "  [WARN] missing guardrails:" -ForegroundColor Yellow
        foreach ($item in $result.Missing) {
            Write-Host "    - $item" -ForegroundColor Yellow
        }
    }

    if ($failed) {
        exit 1
    }

    exit 0
}

foreach ($branchName in $branches) {
    Write-Host "[apply] ${repoName}:$branchName" -ForegroundColor Cyan
    Set-BranchProtection -RepoName $repoName -BranchName $branchName
    Write-Host "  [OK] protection updated" -ForegroundColor Green
}

Write-Host "[done] repository guardrails applied." -ForegroundColor Green
