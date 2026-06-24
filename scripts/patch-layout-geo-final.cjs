const fs = require('fs');
const path = 'src/layouts/Layout.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// Step 1: schema union
const oldSchema = "    type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';\n    data?: Record<string, unknown>;\n  };\n}";
const newSchema = "    type: 'Organization' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'HowTo';\n    data?: Record<string, unknown>;\n  };\n  /** Champs GEO (optionnels). Voir composants/Seo/GEO.astro */\n  geo?: {\n    author?: string;\n    authorUrl?: string;\n    contentType?: 'human' | 'human-reviewed' | 'ai-assisted';\n    lastReviewed?: string;\n    expertise?: string;\n  };\n}";
s = s.replace(oldSchema, newSchema);

// Step 2: destructure geo
const oldD = "const {\n  title,\n  description,\n  canonical,\n  ogImage = '/og-default.webp',\n  ogType = 'website',\n  noindex = false,\n  schema,\n} = Astro.props;";
const newD = "const {\n  title,\n  description,\n  canonical,\n  ogImage = '/og-default.webp',\n  ogType = 'website',\n  noindex = false,\n  schema,\n  geo,\n} = Astro.props;";
s = s.replace(oldD, newD);

// Step 3: import GEO
if (!s.includes("import GEO from '@/components/Seo/GEO.astro';")) {
  s = s.replace(
    "import BaseHead from '@/components/BaseHead.astro';\nimport CookieConsent from '@/components/react/CookieConsent.tsx';",
    "import BaseHead from '@/components/BaseHead.astro';\nimport GEO from '@/components/Seo/GEO.astro';\nimport CookieConsent from '@/components/react/CookieConsent.tsx';"
  );
}

// Step 4: inject <GEO> inside <BaseHead> as a child (via the slot)
const marker = "  >\n    <!-- Critical CSS inline pour FCP optimal (Lighthouse Performance) -->";
const inject = "  >\n    <GEO\n      author={geo?.author}\n      authorUrl={geo?.authorUrl}\n      contentType={geo?.contentType}\n      lastReviewed={geo?.lastReviewed}\n      expertise={geo?.expertise}\n    />\n    <!-- Critical CSS inline pour FCP optimal (Lighthouse Performance) -->";
s = s.replace(marker, inject);

fs.writeFileSync(path, s, 'utf8');
console.log('OK final layout');
