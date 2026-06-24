const fs = require('fs');
const path = 'vercel.json';
let s = fs.readFileSync(path, 'utf8');
const NL = '\n';

// _astro block uses 6 spaces indent (not 4). Match exactly.
const marker = '      {\n        "source": "/_astro/:path*",\n        "headers": [\n          {\n            "key": "Cache-Control",\n            "value": "public, max-age=31536000, immutable"\n          }\n        ]\n      },';

const newBlock = marker + '\n      {\n        "source": "/(fonts|illustrations|resources|assets)/:path*",\n        "headers": [\n          {\n            "key": "Cache-Control",\n            "value": "public, max-age=31536000, immutable"\n          }\n        ]\n      },';

if (!s.includes(marker)) { console.error('MARKER NOT FOUND'); process.exit(1); }
s = s.replace(marker, newBlock);

// Bump blog cache to 3600s
const oldBlog = '      {\n        "source": "/blog/:path*",\n        "headers": [\n          {\n            "key": "Cache-Control",\n            "value": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"\n          }\n        ]\n      },';
const newBlog = '      {\n        "source": "/blog/:path*",\n        "headers": [\n          {\n            "key": "Cache-Control",\n            "value": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"\n          }\n        ]\n      },';
if (s.includes(oldBlog)) {
  s = s.replace(oldBlog, newBlog);
  console.log('OK blog cache bumped to 3600s');
}

fs.writeFileSync(path, s, 'utf8');
console.log('OK vercel cache');
