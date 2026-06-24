const fs = require('fs');
const path = 'vercel.json';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const marker = '    {\r\n      "source": "/_astro/:path*",\r\n      "headers": [\r\n        {\r\n          "key": "Cache-Control",\r\n          "value": "public, max-age=31536000, immutable"\r\n        }\r\n      ]\r\n    },';

const newBlock = marker + '\r\n    {\r\n      "source": "/(fonts|illustrations|resources|assets)/:path*",\r\n      "headers": [\r\n        {\r\n          "key": "Cache-Control",\r\n          "value": "public, max-age=31536000, immutable"\r\n        }\r\n      ]\r\n    },';

if (!s.includes(marker)) { console.error('MARKER NOT FOUND'); process.exit(1); }
s = s.replace(marker, newBlock);

// Bump blog cache to 3600s
const oldBlog = '    {\r\n      "source": "/blog/:path*",\r\n      "headers": [\r\n        {\r\n          "key": "Cache-Control",\r\n          "value": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"\r\n        }\r\n      ]\r\n    },';
const newBlog = '    {\r\n      "source": "/blog/:path*",\r\n      "headers": [\r\n        {\r\n          "key": "Cache-Control",\r\n          "value": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"\r\n        }\r\n      ]\r\n    },';
if (s.includes(oldBlog)) {
  s = s.replace(oldBlog, newBlog);
  console.log('OK blog cache bumped');
}

fs.writeFileSync(path, s, 'utf8');
console.log('OK vercel cache');
