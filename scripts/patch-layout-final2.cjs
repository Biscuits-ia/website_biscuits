const fs = require('fs');
const path = 'src/layouts/Layout.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// Use exact byte sequences (CRLF)
const oldProps = "  schema?: {\r\n    type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';\r\n    data?: Record<string, unknown>;\r\n  };\r\n}";
const newProps = "  schema?: {\r\n    type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';\r\n    data?: Record<string, unknown>;\r\n  };\r\n  /** Champs GEO (optionnels). Voir composants/Seo/GEO.astro */\r\n  geo?: {\r\n    author?: string;\r\n    authorUrl?: string;\r\n    contentType?: 'human' | 'human-reviewed' | 'ai-assisted';\r\n    lastReviewed?: string;\r\n    expertise?: string;\r\n  };\r\n}";
const c1 = s.split(oldProps).length - 1;
console.log('props matches:', c1);
s = s.split(oldProps).join(newProps);

const oldD = "const {\r\n  title,\r\n  description,\r\n  canonical,\r\n  ogImage = '/og-default.webp',\r\n  ogType = 'website',\r\n  noindex = false,\r\n  schema,\r\n} = Astro.props;";
const newD = "const {\r\n  title,\r\n  description,\r\n  canonical,\r\n  ogImage = '/og-default.webp',\r\n  ogType = 'website',\r\n  noindex = false,\r\n  schema,\r\n  geo,\r\n} = Astro.props;";
const c2 = s.split(oldD).length - 1;
console.log('destructure matches:', c2);
s = s.split(oldD).join(newD);

fs.writeFileSync(path, s, 'utf8');
console.log('OK final2');
