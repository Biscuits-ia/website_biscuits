const fs = require('fs');
const path = 'src/layouts/Layout.astro';
let s = fs.readFileSync(path, 'utf8');

// 1. Add GEO import after the existing BaseHead import
const oldImport = "import BaseHead from '@/components/BaseHead.astro';\nimport CookieConsent from '@/components/react/CookieConsent.tsx';";
const newImport = "import BaseHead from '@/components/BaseHead.astro';\nimport GEO from '@/components/Seo/GEO.astro';\nimport CookieConsent from '@/components/react/CookieConsent.tsx';";
s = s.replace(oldImport, newImport);

// 2. Extend Props to accept GEO fields
const oldProps = "  schema?: {\n    type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage';\n    data?: Record<string, unknown>;\n  };\n}";
const newProps = "  schema?: {\n    type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';\n    data?: Record<string, unknown>;\n  };\n  /** Champs GEO (optionnels). Voir composants/Seo/GEO.astro */\n  geo?: {\n    author?: string;\n    authorUrl?: string;\n    contentType?: 'human' | 'human-reviewed' | 'ai-assisted';\n    lastReviewed?: string;\n    expertise?: string;\n  };\n}";
s = s.replace(oldProps, newProps);

// 3. Destructure geo from props
const oldDestructure = "const {\n  title,\n  description,\n  canonical,\n  ogImage = '/og-default.webp',\n  ogType = 'website',\n  noindex = false,\n  schema,\n} = Astro.props;";
const newDestructure = "const {\n  title,\n  description,\n  canonical,\n  ogImage = '/og-default.webp',\n  ogType = 'website',\n  noindex = false,\n  schema,\n  geo,\n} = Astro.props;";
s = s.replace(oldDestructure, newDestructure);

// 4. Inject <GEO .../> after <BaseHead ...> closing
const marker = '  >\n    <!-- Critical CSS inline pour FCP optimal (Lighthouse Performance) -->';
const inject = '  >\n    <GEO\n      author={geo?.author}\n      authorUrl={geo?.authorUrl}\n      contentType={geo?.contentType}\n      lastReviewed={geo?.lastReviewed}\n      expertise={geo?.expertise}\n    />\n    <!-- Critical CSS inline pour FCP optimal (Lighthouse Performance) -->';
s = s.replace(marker, inject);

fs.writeFileSync(path, s, 'utf8');
console.log('OK Layout GEO');
