# ===========================================
# chubao-WIN-AI 安装脚本
# ===========================================

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  chubao-WIN-AI 环境安装脚本" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[警告] 建议以管理员权限运行此脚本" -ForegroundColor Yellow
}

# 1. 检查 Node.js
Write-Host "[1/6] 检查 Node.js..." -ForegroundColor Green
$nodeVersion = node -v 2>$null
if ($nodeVersion) {
    Write-Host "  Node.js 已安装: $nodeVersion" -ForegroundColor Gray
    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -lt 22) {
        Write-Host "  [警告] 需要 Node.js 22+，请升级" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [错误] Node.js 未安装，请先安装 Node.js 22+" -ForegroundColor Red
    Write-Host "  下载地址: https://nodejs.org/" -ForegroundColor Gray
}

# 2. 检查 Python
Write-Host "[2/6] 检查 Python..." -ForegroundColor Green
$pythonVersion = python --version 2>$null
if ($pythonVersion) {
    Write-Host "  Python 已安装: $pythonVersion" -ForegroundColor Gray
} else {
    Write-Host "  [错误] Python 未安装，请先安装 Python 3.11+" -ForegroundColor Red
    Write-Host "  下载地址: https://python.org/" -ForegroundColor Gray
}

# 3. 检查 Git
Write-Host "[3/6] 检查 Git..." -ForegroundColor Green
$gitVersion = git --version 2>$null
if ($gitVersion) {
    Write-Host "  Git 已安装: $gitVersion" -ForegroundColor Gray
} else {
    Write-Host "  [错误] Git 未安装" -ForegroundColor Red
}

# 4. 安装 Node.js 依赖
Write-Host "[4/6] 安装 Node.js 依赖..." -ForegroundColor Green
if (Test-Path "package.json") {
    npm install
} else {
    Write-Host "  [跳过] package.json 不存在" -ForegroundColor Yellow
}

# 5. 安装 Python 依赖
Write-Host "[5/6] 安装 Python 依赖..." -ForegroundColor Green
if (Test-Path "requirements.txt") {
    pip install -r requirements.txt
} else {
    Write-Host "  [跳过] requirements.txt 不存在" -ForegroundColor Yellow
}

# 6. 创建 .env 文件
Write-Host "[6/6] 配置环境变量..." -ForegroundColor Green
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "  已创建 .env 文件，请编辑填入实际配置" -ForegroundColor Yellow
    }
} else {
    Write-Host "  .env 文件已存在" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步操作:" -ForegroundColor White
Write-Host "  1. 编辑 .env 文件，填入 API 密钥" -ForegroundColor Gray
Write-Host "  2. 运行 .\scripts\start.ps1 启动服务" -ForegroundColor Gray
Write-Host ""
