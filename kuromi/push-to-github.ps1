# 一键推送到 GitHub（优先用代理，推送失败自动换代理重试）
# 适用于中国大陆访问 GitHub 不稳定（Could not connect to server / 间歇性通断）
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$base = Split-Path -Parent $here
$ghUser = "wwwangxj"
$repoName = "English-learning.kuromi.1.0"
$url = "https://github.com/${ghUser}/${repoName}.git"

Write-Host "=========================================="
Write-Host "  推送到 GitHub（自动适配代理）"
Write-Host "=========================================="

# 用 git 临时走指定代理测试连通性
function Test-Github([string]$proxy) {
    if ($proxy) {
        git -c http.proxy="$proxy" -c https.proxy="$proxy" ls-remote $url 2>$null
    } else {
        git ls-remote $url 2>$null
    }
    return ($LASTEXITCODE -eq 0)
}

# 1) 收集候选代理并探测可用者
Write-Host "1) 探测可用代理……"
$candidates = @()
try {
    $inet = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
    if ($inet.ProxyEnable -and $inet.ProxyServer) { $candidates += $inet.ProxyServer }
} catch {}
$common = @(
    "127.0.0.1:7890", "127.0.0.1:7897", "127.0.0.1:10808", "127.0.0.1:10809",
    "127.0.0.1:1080", "127.0.0.1:1087", "127.0.0.1:8888", "127.0.0.1:8118",
    "127.0.0.1:8080", "127.0.0.1:2080", "127.0.0.1:33210", "127.0.0.1:9999"
)
foreach ($c in $common) { if ($candidates -notcontains $c) { $candidates += $c } }

$goodProxies = @()
foreach ($raw in $candidates) {
    $proxy = $raw
    if ($raw -match "https=(.+?)(;|$)") { $proxy = $Matches[1] }
    elseif ($raw -match "http=(.+?)(;|$)") { $proxy = $Matches[1] }
    $proxy = $proxy.Trim()
    if ([string]::IsNullOrWhiteSpace($proxy)) { continue }
    $hp = $proxy.Split(":")
    if ($hp.Count -ne 2) { continue }
    $portOpen = Test-NetConnection $hp[0] -Port ([int]$hp[1]) -WarningAction SilentlyContinue -InformationLevel Quiet
    if (-not $portOpen) { continue }
    foreach ($form in @($proxy, "socks5h://$proxy", "http://$proxy")) {
        if (Test-Github $form) {
            $goodProxies += $form
            break
        }
    }
}
if ($goodProxies.Count -gt 0) {
    Write-Host ("   找到可用代理: " + ($goodProxies -join ", "))
} else {
    Write-Host "   未发现本地代理。"
}

# 构建推送尝试顺序：可用代理优先，最后直连兜底
$attempts = @()
foreach ($p in $goodProxies) { $attempts += ("," + $p) }   # 用前导逗号标记"代理"
$attempts += ",DIRECT"                                     # 直连兜底

# 2) 配置身份与远程仓库
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

# 3) 推送：依次尝试每个代理，最后直连
Write-Host ""
Write-Host "3) 开始推送（尝试顺序：代理 → 直连；首次会弹浏览器授权，点授权即可）……"
$ok = $false
$usedProxy = ""
$lastOutput = ""
foreach ($label in $attempts) {
    $isProxy = $label.StartsWith(",")
    $p = if ($isProxy) { $label.Substring(1) } else { "" }
    $desc = if ($isProxy) { "代理 $p" } else { "直连" }
    Write-Host ("   尝试 $desc ……")
    if ($isProxy) {
        $lastOutput = git -C $base -c http.proxy="$p" -c https.proxy="$p" push -u origin main 2>&1
    } else {
        $lastOutput = git -C $base push -u origin main 2>&1
    }
    $lastOutput | ForEach-Object { Write-Host ("      " + $_) }
    if ($LASTEXITCODE -eq 0) {
        $ok = $true
        $usedProxy = $p
        break
    }
}

if (-not $ok) {
    Write-Host ""
    Write-Host "推送失败（已依次尝试所有代理和直连）。" -ForegroundColor Yellow
    Write-Host "  1) 你的代理/VPN 软件（如 Clash、V2Ray）是否已打开？请打开后重跑。"
    Write-Host "  2) 若仍失败，把上面的完整输出发给我。"
    exit 1
}

# 若用了代理，写入 git 全局以便今后直接 push
if ($usedProxy) {
    git config --global http.proxy "$usedProxy"
    git config --global https.proxy "$usedProxy"
    Write-Host ("已保存代理设置: $usedProxy（以后可直接 git push）")
}

Write-Host ""
Write-Host "推送成功！仓库地址: https://github.com/${ghUser}/${repoName}" -ForegroundColor Green
Write-Host ""
Write-Host "Pages 部署后孩子网址：https://${ghUser}.github.io/${repoName}/"
Write-Host "（首次在 Settings->Pages 配置 main 分支 + /(root)，等 1-2 分钟生效）"
