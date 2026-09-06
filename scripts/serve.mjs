// שרת סטטי מינימלי ל-app/ — בלי תלויות. שימוש: node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../app/", import.meta.url));
const PORT = Number(process.argv[2]) || 4173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split("?")[0]);
    if (path === "/") path = "/index.html";
    const full = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    if (!full.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
    const body = await readFile(full);
    res.writeHead(200, {
      "content-type": TYPES[extname(full)] || "application/octet-stream",
      "cache-control": "no-cache",
      "service-worker-allowed": "/",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
  }
}).listen(PORT, () => console.log(`Family OS → http://localhost:${PORT}`));
