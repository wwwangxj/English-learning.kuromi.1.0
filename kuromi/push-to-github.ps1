# 一键推送到 GitHub
# 用法：右键“使用 PowerShell 运行”或在终端执行本脚本
# 前置：git 已安装；首次推送时 Windows 会弹出浏览器让你登录 GitHub 授权
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$base = Split-Path -Parent $here

Write-Host "=========================================="
Write-Host "  推送到 GitHub（首次会弹出浏览器授权）"
Write-Host "=========================================="

$ghUser = Read-Host "GitHub 用户名 [wwwangxj]"
if ([string]::IsNullOrWhiteSpace($ghUser)) { $ghUser = "wwwangxj" }

$repoName = Read-Host "仓库名 [English-learning.kuromi.1.0]"
if ([string]::IsNullOrWhiteSpace($repoName)) { $repoName = "English-learning.kuromi.1.0" }

$vis = Read-Host "仓库可见性 public / private？[默认 private]"
if ([string]::IsNullOrWhiteSpace($vis)) { $vis = "private" }
$vis = $vis.ToLower()
if (($vis -ne "public") -and ($vis -ne "private")) {
    Write-Host "只能输入 public 或 private" -ForegroundColor Red
    exit 1
}

# 1. 配置提交身份（GitHub 推荐 noreply 邮箱，可保护真实邮箱）
git -C $base config user.name $ghUser
git -C $base config user.email "${ghUser}@users.noreply.github.com"

# 2. 确保分支名为 main
git -C $base branch -M main 2>$null

# 3. 配置远程仓库
$url = "https://github.com/${ghUser}/${repoName}.git"
$hasRemote = git -C $base remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
    git -C $base remote add origin $url
} else {
    git -C $base remote set-url origin $url
}
Write-Host "远程仓库: $url"

# 4. 推送
Write-Host "开始推送……首次会弹出浏览器窗口，登录 GitHub 并授权即可。"
git -C $base push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "推送失败。常见原因与解决：" -ForegroundColor Yellow
    Write-Host "  1) 仓库还没在 GitHub 创建：请打开 https://github.com/new"
    Write-Host "     输入仓库名 ${repoName}，可见性选 ${vis}（不要勾选任何初始化选项），创建后重新运行本脚本。"
    Write-Host "  2) 授权未完成：重新运行本脚本，浏览器弹出时点授权。"
    exit 1
}

Write-Host ""
Write-Host "推送成功！仓库地址: https://github.com/${ghUser}/${repoName}" -ForegroundColor Green

if ($vis -eq "public") {
    Write-Host ""
    Write-Host "开启 GitHub Pages 免费托管（https 下语音功能可用，孩子可直接点网址玩）："
    Write-Host "  1) 打开 https://github.com/${ghUser}/${repoName}/settings/pages"
    Write-Host "  2) Source 选 main 分支，目录选 /(root) 或 /kuromi，点 Save"
    Write-Host "  3) 等 1-2 分钟，站点地址形如 https://${ghUser}.github.io/${repoName}/kuromi/"
    Write-Host "     若目录选 /(root)，首页是 1.0 意象笺，Kuromi 在 /kuromi/ 子路径"
} else {
    Write-Host ""
    Write-Host "提示：私有仓库无法开启 GitHub Pages。想让孩子免服务器直接点网址玩，"
    Write-Host "请把仓库设为 public 后重跑本脚本，再按提示开启 Pages。"
}
