const fs = require('fs');
const path = 'src/components/SEO/SchemaOrg.astro';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

// 1. Add a HowTo branch BEFORE the Product branch
const howtoBranch =
  '} else if (type === \'HowTo\') {' + NL +
  '  // GEO : schema HowTo pour les tutoriels et guides pas-a-pas.' + NL +
  '  // Eligible aux Google AI Overviews et aux featured snippets en etapes.' + NL +
  '  const howtoData = data as HowToData;' + NL +
  '  specificSchema = {' + NL +
  '    "@context": "https://schema.org",' + NL +
  '    "@type": "HowTo",' + NL +
  '    "@id": Astro.url.href + "#howto",' + NL +
  '    "name": howtoData.name,' + NL +
  '    "description": howtoData.description,' + NL +
  '    "image": {' + NL +
  '      "@type": "ImageObject",' + NL +
  '      "url": siteUrl + "/og-default.webp",' + NL +
  '      "width": 1200,' + NL +
  '      "height": 630' + NL +
  '    },' + NL +
  '    "totalTime": howtoData.totalTime,' + NL +
  '    "estimatedCost": howtoData.estimatedCost ? {' + NL +
  '      "@type": "MonetaryAmount",' + NL +
  '      "currency": howtoData.estimatedCost.currency,' + NL +
  '      "value": howtoData.estimatedCost.value' + NL +
  '    } : undefined,' + NL +
  '    "author": {' + NL +
  '      "@type": "Organization",' + NL +
  '      "@id": siteUrl + "/#organization"' + NL +
  '    },' + NL +
  '    "publisher": {' + NL +
  '      "@id": siteUrl + "/#organization"' + NL +
  '    },' + NL +
  '    "inLanguage": "fr-FR",' + NL +
  '    "step": howtoData.steps.map((step, index) => ({' + NL +
  '      "@type": "HowToStep",' + NL +
  '      "position": index + 1,' + NL +
  '      "name": step.name,' + NL +
  '      "text": step.text,' + NL +
  '      "image": step.image,' + NL +
  '      "url": step.url ? step.url + "#step" + (index + 1) : undefined' + NL +
  '    }))' + NL +
  '  };' + NL;

const productMarker = '} else if (type === \'Product\') {';
if (!s.includes(productMarker)) { console.error('PRODUCT MARKER NOT FOUND'); process.exit(1); }
s = s.replace(productMarker, howtoBranch + productMarker);

// 2. Enrich the WebPage branch with speakable (uses CSS selectors)
const oldWebPage = '  const webPageData = data as WebPageData;' + NL +
  '  specificSchema = {' + NL +
  '    "@context": "https://schema.org",' + NL +
  '    "@type": "WebPage",' + NL +
  '    "@id": Astro.url.href,' + NL +
  '    "url": Astro.url.href,' + NL +
  '    "name": webPageData.name || "Biscuits IA",' + NL +
  '    "description": webPageData.description || "Association Loi 1901 \u00e2\u20ac\u201d \u00e2\u20ac\u201d IA accessible \u00e0 tous.",' + NL +
  '    "isPartOf": {' + NL +
  '      "@id": `${siteUrl}/#website`' + NL +
  '    },' + NL +
  '    "publisher": {' + NL +
  '      "@id": `${siteUrl}/#organization`' + NL +
  '    },' + NL +
  '    "inLanguage": "fr-FR",' + NL +
  '    "dateModified": new Date().toISOString().split(\'T\')[0],' + NL +
  '  };';

const newWebPage = '  const webPageData = data as WebPageData;' + NL +
  '  // GEO : speakable markup sur les pages importantes pour les voice/AI snippets.' + NL +
  '  // Les LLM voix/AI Overview cherchent des balises xpath/css pour extraire la reponse.' + NL +
  '  const speakableSelectors = webPageData.speakableSelectors ?? [".page-summary", "h1", "main > section:first-of-type p:first-of-type"];' + NL +
  '  specificSchema = {' + NL +
  '    "@context": "https://schema.org",' + NL +
  '    "@type": "WebPage",' + NL +
  '    "@id": Astro.url.href,' + NL +
  '    "url": Astro.url.href,' + NL +
  '    "name": webPageData.name || "Biscuits IA",' + NL +
  '    "description": webPageData.description || "Association Loi 1901 \u00e2\u20ac\u201d \u00e2\u20ac\u201d IA accessible \u00e0 tous.",' + NL +
  '    "isPartOf": {' + NL +
  '      "@id": `${siteUrl}/#website`' + NL +
  '    },' + NL +
  '    "publisher": {' + NL +
  '      "@id": `${siteUrl}/#organization`' + NL +
  '    },' + NL +
  '    "inLanguage": "fr-FR",' + NL +
  '    "dateModified": new Date().toISOString().split(\'T\')[0],' + NL +
  '    "speakable": {' + NL +
  '      "@type": "SpeakableSpecification",' + NL +
  '      "cssSelector": speakableSelectors' + NL +
  '    },' + NL +
  '  };';

s = s.replace(oldWebPage, newWebPage);

fs.writeFileSync(path, s, 'utf8');
console.log('OK howto + speakable added');
