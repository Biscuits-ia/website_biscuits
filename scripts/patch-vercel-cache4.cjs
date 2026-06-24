const fs = require('fs');
const path = 'vercel.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

// Insert a new cache block for static asset-like paths after /_astro
const idx = data.headers.findIndex((h) => h.source === '/_astro/:path*');
if (idx < 0) { console.error('NOT FOUND'); process.exit(1); }

data.headers.splice(idx + 1, 0, {
  source: '/(fonts|illustrations|resources|assets)/:path*',
  headers: [
    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
  ],
});

// Bump /blog cache
const blogIdx = data.headers.findIndex((h) => h.source === '/blog/:path*');
if (blogIdx >= 0) {
  const blog = data.headers[blogIdx];
  const cacheHeader = blog.headers.find((h) => h.key === 'Cache-Control');
  if (cacheHeader) {
    cacheHeader.value = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
  }
}

fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('OK vercel cache updated via JSON');
