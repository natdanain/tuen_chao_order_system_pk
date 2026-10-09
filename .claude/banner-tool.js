// Local helper for editing docs/brand/banner.webp in the browser:
// serves docs/ and accepts POST /__save (image body) which overwrites the banner.
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "docs");
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".webp":"image/webp", ".png":"image/png", ".css":"text/css" };
http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__save") {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const out = path.join(root, "brand", "banner.webp");
      fs.writeFileSync(out, Buffer.concat(chunks));
      res.end("saved " + Buffer.concat(chunks).length);
    });
    return;
  }
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader("Content-Type", types[path.extname(p)] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(p).pipe(res);
}).listen(5174);
