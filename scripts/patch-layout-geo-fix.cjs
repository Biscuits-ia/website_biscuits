const fs = require('fs');
const path = 'src/layouts/Layout.astro';
let s = fs.readFileSync(path, 'utf8');

// 1. Add 'HowTo' to schema type union
s = s.replace(
  "type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage';",
  "type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';"
);

// 2. Add geo prop
const oldPropsTail = "  schema?: {\n    type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';\n    data?: Record<string, unknown>;\n  };\n}";
const newPropsTail = "  schema?: {\n    type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';\n    data?: Record<string, unknown>;\n  };\n  /** Champs GEO (optionnels). Voir composants/Seo/GEO.astro */\n  geo?: {\n    author?: string;\n    authorUrl?: string;\n    contentType?: 'human' | 'human-reviewed' | 'ai-assisted';\n    lastReviewed?: string;\n    expertise?: string;\n  };\n}";
s = s.replace(oldPropsTail, newPropsTail);

// 3. Destructure geo
s = s.replace(
  "const {\n  title,\n  description,\n  canonical,\n  ogImage = '/og-default.webp',\n  ogType = 'website',\n  noindex = false,\n  schema,\n} = Astro.props;",
  "const {\n  title,\n  description,\n  canonical,\n  ogImage = '/og-default.webp',\n  ogType = 'website',\n  noindex = false,\n  schema,\n  geo,\n} = Astro.props;"
);

// 4. Inject <GEO> after the existing slot in BaseHead (the BaseHead already has a <slot />)
//    Actually we should inject GEO as a child of <head> outside BaseHead to avoid double meta.
//    Simplest: inject after the closing > of BaseHead but before the style.
const marker = "  >\n    <!-- Critical CSS inline pour FCP optimal (Lighthouse Performance) -->";
const inject = "  >\n    <GEO\n      author={geo?.author}\n      authorUrl={geo?.authorUrl}\n      contentType={geo?.contentType}\n      lastReviewed={geo?.lastReviewed}\n      expertise={geo?.expertise}\n    />\n    <!-- Critical CSS inline pour FCP optimal (Lighthouse Performance) -->";
s = s.replace(marker, inject);

fs.writeFileSync(path, s, 'utf8');
console.log('OK layout fixed');
