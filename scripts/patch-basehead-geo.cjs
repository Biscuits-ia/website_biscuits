const fs = require('fs');
const path = 'src/components/BaseHead.astro';
let s = fs.readFileSync(path, 'utf8');

// Add HowTo to schema union
s = s.replace(
  "type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage';",
  "type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';"
);

fs.writeFileSync(path, s, 'utf8');
console.log('OK BaseHead');
