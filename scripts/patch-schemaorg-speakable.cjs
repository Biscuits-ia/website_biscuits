const fs = require('fs');
const path = 'src/components/SEO/SchemaOrg.astro';
let s = fs.readFileSync(path, 'utf8');

// Add HowTo support + speakable on WebPage + spoken intro for FAQ.
// Strategy: enrich the WebPage branch and add a new branch for HowTo.

// 1. Add HowToData type + extend union + Props type
const oldType =
  'type WebPageData = {\n' +
  '  name?: string;\n' +
  '  description?: string;\n' +
  '};';

const newType =
  'type WebPageData = {\n' +
  '  name?: string;\n' +
  '  description?: string;\n' +
  '  /** Selecteur CSS des elements a rendre comme "speakable" pour voice/AI snippets */\n' +
  '  speakableSelectors?: string[];\n' +
  '};' + String.fromCharCode(10) +
  '' + String.fromCharCode(10) +
  'type HowToStepData = {\n' +
  '  name: string;\n' +
  '  text: string;\n' +
  '  image?: string;\n' +
  '  url?: string;\n' +
  '};' + String.fromCharCode(10) +
  '' + String.fromCharCode(10) +
  'type HowToData = {\n' +
  '  name: string;\n' +
  '  description: string;\n' +
  '  totalTime?: string; // ISO 8601 duration, e.g. "PT30M"\n' +
  '  estimatedCost?: { currency: string; value: number | string };\n' +
  '  steps: HowToStepData[];\n' +
  '};';

if (!s.includes(oldType)) { console.error('NOT FOUND oldType'); process.exit(1); }
s = s.replace(oldType, newType);

const oldUnion = 'type SchemaData =\n  | ServiceData\n  | FAQData\n  | ArticleData\n  | CourseData\n  | WebPageData\n  | ProductData;';
const newUnion = 'type SchemaData =\n  | ServiceData\n  | FAQData\n  | ArticleData\n  | CourseData\n  | WebPageData\n  | ProductData\n  | HowToData;';
s = s.replace(oldUnion, newUnion);

const oldProps = "type: 'Organization' | 'NGO' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'Course' | 'Product';";
const newProps = "type: 'Organization' | 'NGO' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'Course' | 'Product' | 'HowTo';";
s = s.replace(oldProps, newProps);

fs.writeFileSync(path, s, 'utf8');
console.log('OK step 1: types added');
