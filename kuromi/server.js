/* 零依赖静态服务器：用于本地运行 Kuromi 英语闯关（语音需要 localhost 环境）
 * 用法：node server.js [端口]  默认 8000，站点根目录为项目根目录（本文件所在目录的上一级）
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.argv[2], 10) || 8000;
const ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

http.createServer(function (req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent((req.url || "/").split("?")[0]); }
  catch (e) { res.writeHead(400); res.end("Bad Request"); return; }
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(ROOT, urlPath));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) { res.writeHead(404); res.end("Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, function () {
  console.log("Kuromi 服务器已启动: http://localhost:" + PORT + "/kuromi/");
  console.log("（按 Ctrl+C 停止）");
});
