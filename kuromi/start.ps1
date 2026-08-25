# Kuromi 英语闯关 · 一键启动
# 语音（朗读/识别）需要 localhost 环境，此脚本会启动本地服务器并打开浏览器
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$base = Split-Path -Parent $here          # 项目根目录（001）
$port = 8000

# 找空闲端口
$port = 8000
$inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
while ($inUse) { $port++; $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue }

$py = Get-Command python -ErrorAction SilentlyContinue
$node = Get-Command node -ErrorAction SilentlyContinue

if ($py) {
    Write-Host "使用 Python 启动本地服务器: http://localhost:$port/kuromi/"
    Start-Process -FilePath $py.FullName -ArgumentList @("-m", "http.server", $port, "--directory", $base) -WindowStyle Hidden
} elseif ($node) {
    Write-Host "使用 Node.js 启动本地服务器: http://localhost:$port/kuromi/"
    Start-Process -FilePath $node.FullName -ArgumentList @("$here\server.js", $port) -WorkingDirectory $here -WindowStyle Hidden
} else {
    Write-Host "未找到 python 或 node，请安装其一后重试。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

Start-Sleep -Seconds 2
Start-Process "http://localhost:$port/kuromi/"
Write-Host "已打开浏览器。若未自动打开，请手动访问 http://localhost:$port/kuromi/"
