// Mini static server for serving the dist/ build to test lighthouse.
// Mimics what Vercel would do (basic static files + API routes -> 404 here).
//
// Sends the real Content-Security-Policy header from vercel.json on HTML
// responses. Without it, a technique that silently relies on something the
// CSP blocks (e.g. an inline onload="" attribute, blocked by
// script-src-attr 'none') looks fine here but breaks in production --
// exactly the async-CSS-swap regression this server failed to catch once.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(process.cwd(), 'dist/client');
const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? '127.0.0.1';

function loadCsp() {
  try {
    const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf-8'));
    const rule = vercelConfig.headers.find((h) => h.source === '/(.*)');
    const csp = rule?.headers.find((h) => h.key === 'Content-Security-Policy');
    return csp?.value ?? null;
  } catch {
    return null;
  }
}

const CSP = loadCsp();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function safeJoin(root, urlPath) {
  // resolve and ensure inside root
  const target = path.normalize(path.join(root, urlPath));
  if (!target.startsWith(root)) return null;
  return target;
}

const server = http.createServer((req, res) => {
  try {
    const reqUrl = new url.URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(reqUrl.pathname);
    if (pathname === '/') pathname = '/index.html';

    // Try file
    let filePath = safeJoin(ROOT, pathname);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      serveFile(filePath, req, res);
      return;
    }
    // Try .html
    if (filePath && !path.extname(pathname)) {
      const withHtml = filePath + '.html';
      if (fs.existsSync(withHtml)) { serveFile(withHtml, req, res); return; }
      const withIndex = path.join(filePath, 'index.html');
      if (fs.existsSync(withIndex)) { serveFile(withIndex, req, res); return; }
    }
    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error: ' + e.message);
  }
});

function serveFile(filePath, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  const stat = fs.statSync(filePath);
  // Long cache for _astro
  const isAstro = filePath.includes(path.sep + '_astro' + path.sep);
  const cacheControl = isAstro
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';
  const headers = {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  };
  if (ext === '.html' && CSP) {
    headers['Content-Security-Policy'] = CSP;
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

server.listen(PORT, HOST, () => {
  console.log(`[preview-static] serving ${ROOT} on http://${HOST}:${PORT}`);
});
