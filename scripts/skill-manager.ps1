#Requires -Version 5.1
<#
.SYNOPSIS
    触宝AI 技能管理器
.DESCRIPTION
    管理技能的安装、更新、删除和列表
.EXAMPLE
    .\skill-manager.ps1 list
    .\skill-manager.ps1 install <skill-name>
    .\skill-manager.ps1 remove <skill-name>
    .\skill-manager.ps1 reload
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("list", "install", "remove", "reload", "info", "search")]
    [string]$Command = "list",

    [Parameter(Position = 1)]
    [string]$Name,

    [Parameter()]
    [string]$ApiUrl = "http://localhost:3100"
)

$ErrorActionPreference = "Stop"

function Write-Header($text) {
    Write-Host "`n┌─────────────────────────────────────┐" -ForegroundColor Cyan
    Write-Host "│  $text" -NoNewline -ForegroundColor Cyan
    $padding = 35 - $text.Length
    if ($padding -gt 0) {
        Write-Host (" " * $padding) -NoNewline -ForegroundColor Cyan
    }
    Write-Host "│" -ForegroundColor Cyan
    Write-Host "└─────────────────────────────────────┘" -ForegroundColor Cyan
}

function Write-Skill($skill) {
    $emoji = $skill.emoji
    $name = $skill.name
    $version = $skill.version
    $desc = $skill.description
    $tags = $skill.tags -join ", "
    
    Write-Host "  $emoji " -NoNewline
    Write-Host "$name " -NoNewline -ForegroundColor Yellow
    Write-Host "v$version" -ForegroundColor Gray
    Write-Host "     $desc" -ForegroundColor White
    if ($tags) {
        Write-Host "     Tags: $tags" -ForegroundColor DarkGray
    }
    Write-Host ""
}

function Get-SkillsList {
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/skills" -Method GET
        if ($response.success) {
            return $response.data
        }
        throw $response.error
    }
    catch {
        Write-Error "无法获取技能列表: $_"
        exit 1
    }
}

function Show-SkillList {
    Write-Header "已安装技能"
    
    $data = Get-SkillsList
    $skills = $data.skills
    
    if ($skills.Count -eq 0) {
        Write-Host "  暂无技能" -ForegroundColor Gray
    }
    else {
        foreach ($skill in $skills) {
            Write-Skill $skill
        }
    }
    
    Write-Host "  总计: $($data.total) 个技能" -ForegroundColor Green
    
    if ($data.stats.mostUsed) {
        Write-Host "  最常用: $($data.stats.mostUsed.name) (使用 $($data.stats.mostUsed.useCount) 次)" -ForegroundColor Cyan
    }
}

function Show-SkillInfo($skillName) {
    if (-not $skillName) {
        Write-Error "请指定技能名称"
        exit 1
    }
    
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/skills/$skillName" -Method GET
        if ($response.success) {
            $skill = $response.data
            Write-Header "技能详情: $skillName"
            Write-Host "  名称: " -NoNewline
            Write-Host $skill.name -ForegroundColor Yellow
            Write-Host "  版本: " -NoNewline
            Write-Host $skill.version -ForegroundColor Gray
            Write-Host "  作者: " -NoNewline
            Write-Host $skill.author -ForegroundColor Gray
            Write-Host "  标签: " -NoNewline
            Write-Host ($skill.tags -join ", ") -ForegroundColor Cyan
            Write-Host "  路径: " -NoNewline
            Write-Host $skill.sourcePath -ForegroundColor DarkGray
            Write-Host "`n  说明:" -ForegroundColor White
            Write-Host "  $skill.description" -ForegroundColor Gray
            Write-Host "`n  使用指南:" -ForegroundColor White
            # 显示前 20 行说明
            $lines = $skill.instructions -split "`n" | Select-Object -First 20
            foreach ($line in $lines) {
                Write-Host "    $line" -ForegroundColor DarkGray
            }
        }
        else {
            Write-Error "技能 '$skillName' 不存在"
        }
    }
    catch {
        Write-Error "获取技能信息失败: $_"
    }
}

function Install-Skill($skillName) {
    if (-not $skillName) {
        Write-Error "请指定要安装的技能名称"
        exit 1
    }
    
    Write-Header "安装技能: $skillName"
    Write-Host "  正在安装..." -ForegroundColor Yellow
    
    try {
        $body = @{ name = $skillName; source = "remote" } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/skills/install" -Method POST -Body $body -ContentType "application/json"
        if ($response.success) {
            Write-Host "  ✓ $skillName 安装成功!" -ForegroundColor Green
        }
        else {
            Write-Error "安装失败: $($response.error)"
        }
    }
    catch {
        Write-Error "安装失败: $_"
    }
}

function Remove-Skill($skillName) {
    if (-not $skillName) {
        Write-Error "请指定要删除的技能名称"
        exit 1
    }
    
    $confirm = Read-Host "确定要删除技能 '$skillName' 吗? (y/N)"
    if ($confirm -ne "y") {
        Write-Host "  已取消" -ForegroundColor Gray
        return
    }
    
    Write-Header "删除技能: $skillName"
    
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/skills/$skillName" -Method DELETE
        if ($response.success) {
            Write-Host "  ✓ $skillName 已删除" -ForegroundColor Green
        }
        else {
            Write-Error "删除失败: $($response.error)"
        }
    }
    catch {
        Write-Error "删除失败: $_"
    }
}

function Reload-Skills {
    Write-Header "重新加载技能"
    Write-Host "  正在重新加载..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/skills/reload" -Method POST
        if ($response.success) {
            Write-Host "  ✓ 已重新加载 $($response.data.total) 个技能" -ForegroundColor Green
        }
        else {
            Write-Error "重新加载失败: $($response.error)"
        }
    }
    catch {
        Write-Error "重新加载失败: $_"
    }
}

function Search-Skills($query) {
    if (-not $query) {
        Write-Error "请指定搜索关键词"
        exit 1
    }
    
    Write-Header "搜索技能: $query"
    
    $data = Get-SkillsList
    $results = $data.skills | Where-Object { 
        $_.name -like "*$query*" -or 
        $_.description -like "*$query*" -or
        $_.tags -contains $query
    }
    
    if ($results.Count -eq 0) {
        Write-Host "  未找到匹配的技能" -ForegroundColor Gray
    }
    else {
        foreach ($skill in $results) {
            Write-Skill $skill
        }
        Write-Host "  找到 $($results.Count) 个匹配技能" -ForegroundColor Green
    }
}

# 主逻辑
switch ($Command) {
    "list" { Show-SkillList }
    "info" { Show-SkillInfo $Name }
    "install" { Install-Skill $Name }
    "remove" { Remove-Skill $Name }
    "reload" { Reload-Skills }
    "search" { Search-Skills $Name }
    default { Show-SkillList }
}

Write-Host ""
