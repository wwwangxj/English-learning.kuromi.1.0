# 上传到 GitHub 并开启 Pages 托管（图文步骤）

目标：把项目传到你的 GitHub（用户名 `wwwangxj`，公开仓库 `English-learning.kuromi.1.0`），
并开启 **GitHub Pages** 免费托管——之后孩子直接点网址就能玩，https 环境下语音（朗读/识别）全部可用。

## 第 1 步：在 GitHub 网页创建空仓库（1 分钟）

1. 打开 <https://github.com/new>
2. Repository name 填：`English-learning.kuromi.1.0`
3. 可见性选 **Public**（公开）
4. **不要**勾选 "Add a README"、"Add .gitignore" 等任何初始化选项（保持空仓库）
5. 点 **Create repository**

> 如果这一步不做，推送会报错 "repository not found"，做完再重试即可。

## 第 2 步：一键推送（你的电脑上运行，1 分钟）

在**你自己电脑**上（不是聊天窗口里）打开 PowerShell，运行：

```powershell
cd D:\数据\deepseekharness\001\kuromi
powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1
```

或者直接：文件资源管理器进入 `kuromi` 文件夹 → 右键 `push-to-github.ps1` → "使用 PowerShell 运行"。

脚本会：
1. 询问（默认值已填好，直接回车即可）：用户名 `wwwangxj`、仓库名 `English-learning.kuromi.1.0`、可见性 `public`
2. 配置提交身份（GitHub 推荐的无隐私邮箱）
3. **弹出浏览器让你登录 GitHub 授权**（第一次才需要）——点授权即可，这是安全的标准流程
4. 推送完成后打印开启 Pages 的步骤

> 为什么必须在你电脑上运行：推送需要 GitHub 登录授权（浏览器弹窗），这一步只能由你自己完成，任何第三方（包括我）都无法替你登录。

## 第 3 步：开启 GitHub Pages（1 分钟）

1. 打开 <https://github.com/wwwangxj/English-learning.kuromi.1.0/settings/pages>
2. Source 选 **Deploy from a branch** → 分支 `main` → 目录选 **`/kuromi`**（这样站点首页直接就是 Kuromi 闯关页；选 `/(root)` 则首页是 1.0 意象笺，Kuromi 在子路径）
3. 点 **Save**
4. 等 1–2 分钟，站点地址：`https://wwwangxj.github.io/English-learning.kuromi.1.0/`
   （如果目录选的是 `/(root)`，Kuromi 地址是 `.../English-learning.kuromi.1.0/kuromi/`）

## 之后

- 修改了代码想更新网站：在项目目录运行 `git add -A && git commit -m "更新" && git push`，Pages 会自动重新发布。
- 想用自定义域名（如 `kuromi.xxx.com`）：在 Pages 设置里配置，然后去域名商加 CNAME 记录。

## 注意事项

- **版权**：库洛米（Kuromi）是三丽鸥（Sanrio）的版权角色。本项目中的形象为致敬风格的原创 SVG，仅作个人/家庭学习用途。公开仓库已建议在说明中注明"非官方粉丝作品"，请勿用于商业用途。
- **进度数据**：孩子玩的数据存在浏览器 localStorage（每台设备独立）。换设备/清浏览器会丢失，可用"设置 → 导出进度"备份。
- **语音识别**：Pages 的 https 下，Chrome/Edge 的语音识别与朗读均可用，但需要浏览器允许麦克风权限（首次会询问，点允许）。
