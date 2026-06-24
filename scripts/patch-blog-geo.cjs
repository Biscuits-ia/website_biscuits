const fs = require('fs');
const path = 'src/pages/blog/[...slug].astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// 1. Compute wordCount from body
const bodyMarker = "const body = entry.body ?? '';";
const newBody = "const body = entry.body ?? '';\n\n" +
  "// GEO : wordCount + estimated reading time (signal E-E-A-T et eligible aux AI Overviews).\n" +
  "const wordCount = body.split(/\\s+/).filter(Boolean).length;\n" +
  "const readingTimeMin = Math.max(1, Math.ceil(wordCount / 220));\n" +
  "// Date de derniere relecture. Le comite editorial relit avant publication.\n" +
  "const lastReviewedDate = entry.data.pubDate.toISOString();\n" +
  "// GEO : slug auteur (Alexis -> alexis-gallard, sinon collectif).\n" +
  "const authorSlug = ((entry.data.author || 'Biscuits IA').toLowerCase().includes('alexis')) ? 'alexis-gallard' : 'biscuits-ia';";
s = s.replace(bodyMarker, newBody);

// 2. Enrich articleSchema with wordCount + lastReviewed + authorSlug
const oldSchema = "const articleSchema = {\n  type: 'Article' as const,\n  data: {\n    title: seoTitle,\n    headline: seoTitle,\n    description: seoDescription,\n    image: ogImage,\n    datePublished: entry.data.pubDate.toISOString(),\n    dateModified: entry.data.pubDate.toISOString(),\n    author: entry.data.author || 'Biscuits IA',\n    category: 'Intelligence Artificielle',\n    keywords: entryTags,\n  },\n};";

const newSchema = "const articleSchema = {\n  type: 'Article' as const,\n  data: {\n    title: seoTitle,\n    headline: seoTitle,\n    description: seoDescription,\n    image: ogImage,\n    datePublished: entry.data.pubDate.toISOString(),\n    dateModified: entry.data.pubDate.toISOString(),\n    author: entry.data.author || 'Biscuits IA',\n    authorSlug,\n    category: 'Intelligence Artificielle',\n    keywords: entryTags,\n    wordCount,\n  },\n};";
s = s.replace(oldSchema, newSchema);

// 3. Add geo prop to the Layout call
const oldLayout = "<Layout\n  title={seoTitle}\n  description={seoDescription}\n  canonical={`/blog/${entry.id}`}\n  ogType=\"article\"\n  ogImage={ogImage}\n  schema={articleSchema}\n>";

const newLayout = "<Layout\n  title={seoTitle}\n  description={seoDescription}\n  canonical={`/blog/${entry.id}`}\n  ogType=\"article\"\n  ogImage={ogImage}\n  schema={articleSchema}\n  geo={{\n    author: entry.data.author || 'Biscuits IA',\n    authorUrl: `/auteur/${authorSlug}`,\n    contentType: 'human-reviewed',\n    lastReviewed: lastReviewedDate,\n    expertise: entryTags[0] || 'intelligence-artificielle',\n  }}\n>";
s = s.replace(oldLayout, newLayout);

fs.writeFileSync(path, s, 'utf8');
console.log('OK blog/[...slug] GEO enrichi');
