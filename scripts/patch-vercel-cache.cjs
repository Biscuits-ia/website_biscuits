const fs = require('fs');
const path = 'vercel.json';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// Lighthouse "Use efficient cache lifetimes" - 6 KiB savings comes from the
// /blog/:path* + other static pages that lack long-term CDN cache. Let me extend
// the cache lifetime for static pages from 300s to 3600s + add stale-while-revalidate.

// Also add a /illustrations cache policy.
const old = '      "source": "/blog/:path*",';
const c = s.split(old).length - 1;
console.log('blog cache matches:', c);
// Strategy: add a new top-level cache block with broader coverage for static asset-like pages.
// Insert after the /_astro block.
const marker =
  '    {' + NL +
  '      "source": "/_astro/:path*",' + NL +
  '      "headers": [' + NL +
  '        {' + NL +
  '          "key": "Cache-Control",' + NL +
  '          "value": "public, max-age=31536000, immutable"' + NL +
  '        }' + NL +
  '      ]' + NL +
  '    },';

const newBlock =
  marker + NL +
  '    {' + NL +
  '      "source": "/(fonts|illustrations|resources|assets)/:path*",' + NL +
  '      "headers": [' + NL +
  '        {' + NL +
  '          "key": "Cache-Control",' + NL +
  '          "value": "public, max-age=31536000, immutable"' + NL +
  '        }' + NL +
  '      ]' + NL +
  '    },';

if (!s.includes(marker)) { console.error('MARKER NOT FOUND'); process.exit(1); }
s = s.replace(marker, newBlock);

// Increase blog cache from 300s to 3600s
const oldBlog = '    {' + NL +
  '      "source": "/blog/:path*",' + NL +
  '      "headers": [' + NL +
  '        {' + NL +
  '          "key": "Cache-Control",' + NL +
  '          "value": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"' + NL +
  '        }' + NL +
  '      ]' + NL +
  '    },';

const newBlog = '    {' + NL +
  '      "source": "/blog/:path*",' + NL +
  '      "headers": [' + NL +
  '        {' + NL +
  '          "key": "Cache-Control",' + NL +
  '          "value": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"' + NL +
  '        }' + NL +
  '      ]' + NL +
  '    },';

if (s.includes(oldBlog)) {
  s = s.replace(oldBlog, newBlog);
  console.log('OK blog cache bumped to 3600s');
} else {
  console.log('blog cache: pattern not found, skipping');
}

fs.writeFileSync(path, s, 'utf8');
console.log('OK vercel cache');
