const fs = require('fs');
const path = 'src/components/SEO/SchemaOrg.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const oldType = 'type WebPageData = {' + NL +
  '  name?: string;' + NL +
  '  description?: string;' + NL +
  '};';

const newType = 'type WebPageData = {' + NL +
  '  name?: string;' + NL +
  '  description?: string;' + NL +
  '  /** Selecteur CSS des elements a rendre comme speakable pour voice/AI snippets */' + NL +
  '  speakableSelectors?: string[];' + NL +
  '};' + NL +
  '' + NL +
  'type HowToStepData = {' + NL +
  '  name: string;' + NL +
  '  text: string;' + NL +
  '  image?: string;' + NL +
  '  url?: string;' + NL +
  '};' + NL +
  '' + NL +
  'type HowToData = {' + NL +
  '  name: string;' + NL +
  '  description: string;' + NL +
  '  /** Duree totale au format ISO 8601, ex. "PT30M" pour 30 min */' + NL +
  '  totalTime?: string;' + NL +
  '  estimatedCost?: { currency: string; value: number | string };' + NL +
  '  steps: HowToStepData[];' + NL +
  '};';

if (!s.includes(oldType)) { console.error('NOT FOUND'); process.exit(1); }
s = s.replace(oldType, newType);

const oldUnion = 'type SchemaData =';
const newUnion = 'type SchemaData =';
// Use larger match
const oldUnionFull = 'type SchemaData =\n  | ServiceData\n  | FAQData\n  | ArticleData\n  | CourseData\n  | WebPageData\n  | ProductData;';
const newUnionFull = 'type SchemaData =\n  | ServiceData\n  | FAQData\n  | ArticleData\n  | CourseData\n  | WebPageData\n  | ProductData\n  | HowToData;';
if (!s.includes(oldUnionFull)) {
  // fallback: search for | ProductData;
  const alt = s.split('| ProductData;');
  if (alt.length > 1) {
    s = alt.join('| ProductData\n  | HowToData;');
  } else { console.error('UNION NOT FOUND'); process.exit(1); }
} else {
  s = s.replace(oldUnionFull, newUnionFull);
}

const oldProps = "type: 'Organization' | 'NGO' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'Course' | 'Product';";
const newProps = "type: 'Organization' | 'NGO' | 'Service' | 'FAQPage' | 'Article' | 'WebPage' | 'Course' | 'Product' | 'HowTo';";
s = s.replace(oldProps, newProps);

fs.writeFileSync(path, s, 'utf8');
console.log('OK types');
