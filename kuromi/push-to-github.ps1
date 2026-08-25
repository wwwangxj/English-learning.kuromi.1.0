# 一键推送到 GitHub（含自动配置代理，解决 "Could not connect to server"）
# 用法：右键“使用 PowerShell 运行”或在终端执行本脚本
# 说明：会自动读取系统代理、探测常见代理端口并配置 git，然后推送
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$base = Split-Path -Parent $here
$ghUser = "wwwangxj"
$repoName = "English-learning.kuromi.1.0"
$url = "https://github.com/${ghUser}/${repoName}.git"

Write-Host "=========================================="
Write-Host "  推送到 GitHub（自动适配代理）"
Write-Host "=========================================="

# 用 git 临时走指定代理测试能否连上 GitHub
function Test-Github([string]$proxy) {
    if ($proxy) {
        git -c http.proxy="$proxy" -c https.proxy="$proxy" ls-remote $url 2>$null
    } else {
        git ls-remote $url 2>$null
    }
    return ($LASTEXITCODE -eq 0)
}

Write-Host "1) 尝试直连……"
if (Test-Github "") {
    Write-Host "   直连成功！"
    $useProxy = ""
} else {
    Write-Host "   直连失败（网络被拦）。开始寻找可用代理……"

    # 收集候选代理：系统代理 + 常见本地代理端口
    $candidates = @()
    try {
        $inet = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
        if ($inet.ProxyEnable -and $inet.ProxyServer) {
            $candidates += $inet.ProxyServer
        }
    } catch {}
    $common = @(
        "127.0.0.1:7890", "127.0.0.1:7897", "127.0.0.1:10808", "127.0.0.1:10809",
        "127.0.0.1:1080", "127.0.0.1:1087", "127.0.0.1:8888", "127.0.0.1:8118",
        "127.0.0.1:8080", "127.0.0.1:2080", "127.0.0.1:33210", "127.0.0.1:9999"
    )
    foreach ($c in $common) {
        if ($candidates -notcontains $c) { $candidates += $c }
    }

    $useProxy = ""
    $found = $false
    foreach ($raw in $candidates) {
        # 处理 "http=1.2.3.4:80;https=1.2.3.4:80" 形式，取 https 或 http 值
        $proxy = $raw
        if ($raw -match "https=(.+?)(;|$)") { $proxy = $Matches[1] }
        elseif ($raw -match "http=(.+?)(;|$)") { $proxy = $Matches[1] }
        $proxy = $proxy.Trim()
        if ([string]::IsNullOrWhiteSpace($proxy)) { continue }
        $hp = $proxy.Split(":")
        if ($hp.Count -ne 2) { continue }
        # 快测端口是否开放，避免每个候选都卡 20 秒超时
        $portOpen = Test-NetConnection $hp[0] -Port ([int]$hp[1]) -WarningAction SilentlyContinue -InformationLevel Quiet
        if (-not $portOpen) { Write-Host "   $proxy 端口未开放，跳过"; continue }
        Write-Host "   尝试代理 $proxy ……"
        # git 对 socks 代理需要显式协议前缀，逐一尝试
        foreach ($form in @($proxy, "socks5h://$proxy", "socks5://$proxy", "http://$proxy")) {
            if (Test-Github $form) {
                Write-Host "   可用！代理形式: $form"
                $useProxy = $form
                $found = $true
                break
            }
        }
        if ($found) { break }
    }

    if (-not $useProxy) {
        Write-Host ""
        Write-Host "未找到可用代理，无法连接 GitHub。" -ForegroundColor Red
        Write-Host "请先："
        Write-Host "  1) 打开你的代理/VPN 软件（如 Clash、V2Ray 等）"
        Write-Host "  2) 确认它正在运行，且本地端口已监听"
        Write-Host "  3) 重新运行本脚本"
        Write-Host "如果你知道代理端口（协议常为 socks5 或 http），也可手动设置："
        Write-Host "    git config --global http.proxy http://127.0.0.1:你的端口"
        Write-Host "    git config --global https.proxy http://127.0.0.1:你的端口"
        exit 1
    }
}

# 应用代理到 git 全局（若没有就用系统默认）
if ($useProxy) {
    git config --global http.proxy "$useProxy"
    git config --global https.proxy "$useProxy"
    Write-Host "已设置 git 代理: $useProxy"
} else {
    # 直连能用，清掉可能残留的代理，避免干扰
    git config --global --unset http.proxy 2>$null
    git config --global --unset https.proxy 2>$null
}

Write-Host ""
Write-Host "2) 配置身份与远程仓库……"
git -C $base config user.name $ghUser
git -C $base config user.email "${ghUser}@users.noreply.github.com"
git -C $base branch -M main 2>$null
$hasRemote = git -C $base remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
    git -C $base remote add origin $url
} else {
    git -C $base remote set-url origin $url
}

Write-Host ""
Write-Host "3) 开始推送（首次会弹出浏览器授权，点授权即可）……"
git -C $base push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "推送失败。" -ForegroundColor Yellow
    Write-Host "  原因1：仓库可能还没创建——请打开 https://github.com/new 创建 $repoName（Public，不要勾选任何初始化项），再重跑。"
    Write-Host "  原因2：授权没完成——重跑脚本，浏览器弹出时点授权。"
    Write-Host "  原因3：代理对 git 推送仍拦截——把上面的错误信息发给我。"
    exit 1
}

Write-Host ""
Write-Host "推送成功！仓库地址: https://github.com/${ghUser}/${repoName}" -ForegroundColor Green
Write-Host ""
Write-Host "开启 GitHub Pages（https 下语音功能可用，孩子直接点网址玩）："
Write-Host "  1) 打开 https://github.com/${ghUser}/${repoName}/settings/pages"
Write-Host "  2) Source 选 main 分支，目录选 /kuromi，点 Save"
Write-Host "  3) 等 1-2 分钟，站点地址 https://${ghUser}.github.io/${repoName}/kuromi/"
