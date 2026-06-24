const fs = require('fs');
const path = 'src/pages/blog/[...slug].astro';
let s = fs.readFileSync(path, 'utf8');
// articleUrl unused - just remove it
s = s.replace("const _articleUrl = `${siteUrl}/blog/${entry.id}`;\n", "");
fs.writeFileSync(path, s, 'utf8');
console.log('OK h-slug');
