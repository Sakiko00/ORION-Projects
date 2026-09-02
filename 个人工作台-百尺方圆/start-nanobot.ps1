# ┌─────────────────────────────────────────────────────────────┐
# │  个人工作台 · Nanobot 启动脚本（Windows PowerShell）          │
# │                                                             │
# │  使用方法:                                                  │
# │  1. 安装 nanobot: uv tool install nanobot-ai                │
# │  2. 配置 API key: 编辑 nanobot/config.json                  │
# │  3. 运行本脚本: .\start-nanobot.ps1                          │
# │  4. 打开工作台: workbench-desktop.html                       │
# └─────────────────────────────────────────────────────────────┘

Write-Host "========================================" -ForegroundColor DarkYellow
Write-Host "  个人工作台 · Nanobot Agent 启动器" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor DarkYellow
Write-Host ""

# nanobot 命令：优先 uv tool 安装，其次 PATH
$nb = $null
$uvToolNb = "$env:APPDATA\uv\tools\nanobot-ai\Scripts\nanobot.exe"
if (Test-Path $uvToolNb) {
    $nb = $uvToolNb
} else {
    $nb = (Get-Command nanobot -ErrorAction SilentlyContinue).Source
}
if (-not $nb) {
    Write-Host "[!] 未检测到 nanobot。正在安装（uv tool install nanobot-ai）..." -ForegroundColor Red
    uv tool install --python 3.11 nanobot-ai
    $nb = "$env:APPDATA\uv\tools\nanobot-ai\Scripts\nanobot.exe"
    if (-not (Test-Path $nb)) {
        Write-Host "[X] 安装失败，请手动运行: uv tool install --python 3.11 nanobot-ai" -ForegroundColor Red
        exit 1
    }
    Write-Host "[√] nanobot 安装完成" -ForegroundColor Green
}

# 切换到工作台目录
$workDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $workDir

Write-Host "[*] 工作目录: $workDir" -ForegroundColor Cyan
Write-Host "[*] 数据目录: $workDir\data" -ForegroundColor Cyan
Write-Host "[*] 配置文件: $workDir\nanobot\config.json" -ForegroundColor Cyan
Write-Host ""

# 检查配置文件
if (-not (Test-Path "nanobot\config.json")) {
    Write-Host "[!] 配置文件不存在: nanobot\config.json" -ForegroundColor Red
    Write-Host "    请先编辑配置并填入 API key" -ForegroundColor Yellow
    exit 1
}

# uv 沙箱会导致 tempfile 失败，显式禁用并设置临时目录
$env:UV_NO_SANDBOX = "1"
$env:TEMP = "$env:LOCALAPPDATA\Temp"
$env:TMP  = "$env:LOCALAPPDATA\Temp"

Write-Host "[*] 启动 nanobot OpenAI 兼容 API..." -ForegroundColor Green
Write-Host "    服务地址: http://127.0.0.1:8765" -ForegroundColor Cyan
Write-Host "    API:      http://127.0.0.1:8765/v1" -ForegroundColor Cyan
Write-Host "    模型:     deepseek/deepseek-chat（可在 config.json 修改）" -ForegroundColor Cyan
Write-Host ""
Write-Host "    按 Ctrl+C 停止服务" -ForegroundColor DarkGray
Write-Host ""

# 启动 nanobot serve（OpenAI 兼容 API server）
& $nb serve -p 8765 -c "nanobot\config.json"
