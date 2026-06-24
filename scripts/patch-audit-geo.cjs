const fs = require('fs');
const path = 'audit.md';
let s = fs.readFileSync(path, 'utf8');
const NL = '\r\n';

const geoSection =
  NL + '## 9. GEO (Generative Engine Optimization)' + NL +
  '' + NL +
  'Objectif : etre **cite par les LLM** (ChatGPT, Claude, Perplexity, Google AI Overviews, Gemini, Le Chat, Copilot) au-dela du SEO classique.' + NL +
  '' + NL +
  '### 9.1 Fichiers ajoutes / modifies' + NL +
  '' + NL +
  '| Fichier | Role |' + NL +
  '|---|---|' + NL +
  '| `public/llms.txt` | Carte d\'identite du site en markdown (spec https://llmstxt.org/) |' + NL +
  '| `src/pages/llms-full.txt.ts` | Endpoint dynamique qui sert le markdown complet du site (sections + articles + formations) pour les LLM |' + NL +
  '| `src/components/Seo/GEO.astro` | Meta GEO (robots ai-train, ai-content-declaration, last-reviewed, expertise, link rel=alternate type=text/markdown) |' + NL +
  '| `src/components/Seo/HowTo.astro` | Composant HowTo + schema HowTo pour tutoriels |' + NL +
  '| `src/components/Citation.astro` | Composant Citation + schema Quotation pour E-E-A-T |' + NL +
  '| `src/pages/auteur/[slug].astro` | Pages auteur dediees (Person schema + knowsAbout + sameAs + worksFor) |' + NL +
  '| `src/components/SEO/SchemaOrg.astro` | + HowTo schema + speakable markup sur WebPage |' + NL +
  '| `src/layouts/Layout.astro` | + prop `geo` (auteur, lastReviewed, expertise) injecte dans <head> |' + NL +
  '| `src/components/BaseHead.astro` | + HowTo dans union schema |' + NL +
  '| `src/pages/blog/[...slug].astro` | + wordCount + authorSlug + lien auteur + geo prop |' + NL +
  '| `astro.config.mjs` | + policy LLM bots explicite (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, anthropic-ai, cohere-ai, Applebot-Extended, CCBot, Bytespider...) |' + NL +
  '' + NL +
  '### 9.2 Bots LLM explicitement autorises (robots.txt)' + NL +
  '' + NL +
  'Via `astro-robots-txt` :' + NL +
  '' + NL +
  '- **OpenAI** : GPTBot, ChatGPT-User, OAI-SearchBot' + NL +
  '- **Anthropic** : ClaudeBot, Claude-Web, anthropic-ai, Claude-User' + NL +
  '- **Perplexity** : PerplexityBot, Perplexity-User' + NL +
  '- **Google AI** : Google-Extended (entrainement Gemini)' + NL +
  '- **Cohere** : cohere-ai, cohere-training-data-crawler' + NL +
  '- **Apple** : Applebot-Extended (Apple Intelligence)' + NL +
  '- **Common Crawl** : CCBot (entraine beaucoup de LLM)' + NL +
  '- **ByteDance** : Bytespider' + NL +
  '- **Diffbot, DuckAssistBot, FacebookBot** : crawlers AI connus' + NL +
  '' + NL +
  '### 9.3 Schema.org ajoute / enrichi' + NL +
  '' + NL +
  '- `HowTo` + `HowToStep` : pour les tutoriels pas-a-pas (eligible aux AI Overviews).' + NL +
  '- `SpeakableSpecification` (speakable) : sur les WebPage avec selecteurs CSS (h1, .page-summary, etc.) - eligible aux voice/AI snippets.' + NL +
  '- `Person` : pages auteur avec knowsAbout, sameAs, worksFor.' + NL +
  '- `Quotation` : sur chaque `<Citation source="..." />` - signal E-E-A-T.' + NL +
  '- `Article` enrichi : wordCount + authorSlug + lastReviewed.' + NL +
  '' + NL +
  '### 9.4 Meta GEO ajoutees (via GEO.astro)' + NL +
  '' + NL +
  '- `robots` : `ai-train` (proposition de standard, autorise l\'entrainement des LLM).' + NL +
  '- `ai-content-declaration` : `human` / `human-reviewed` / `ai-assisted` (transparence Perplexity).' + NL +
  '- `last-reviewed` : ISO 8601 de la derniere relecture (signal de fraicheur).' + NL +
  '- `reviewed-by` : comite editorial.' + NL +
  '- `expertise` : domaine d\'expertise (suit knowsAbout).' + NL +
  '- `<link rel="alternate" type="text/markdown" href="/llms-full.txt">` : spec llmstxt.org.' + NL +
  '- `og:type=article` + `article:modified_time` + `article:author` + `article:author:url`.' + NL +
  '- Twitter `twitter:label1/data1` (Auteur), `twitter:label2/data2` (Nature).' + NL +
  '' + NL +
  '### 9.5 E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)' + NL +
  '' + NL +
  '- Pages auteur : `/auteur/alexis-gallard`, `/auteur/biscuits-ia` (prerendered).' + NL +
  '- Liens Article -> auteur explicites.' + NL +
  '- `reviewed-by` meta pour chaque article (signal editorial).' + NL +
  '- Composant `<Citation>` pour sourcer chaque affirmation (CNIL, RGPD, AI Act, etc.).' + NL +
  '' + NL +
  '### 9.6 Verification' + NL +
  '' + NL +
  '- `npx astro check` : 0 erreur / 0 warning.' + NL +
  '- `npx astro build` : Complete!' + NL +
  '- `public/llms.txt` : ~70 lignes markdown, accessible directement.' + NL +
  '- `/llms-full.txt` : endpoint dynamique, cache CDN 1h, regeneration a la demande.' + NL +
  '- Pages auteur : prerendered, 2 paths statiques.' + NL +
  '' + NL +
  '### 9.7 Limites connues' + NL +
  '' + NL +
  '- Google-Extended est un header HTTP envoye par le navigateur, pas un User-Agent. Le `robots.txt` ne le couvre pas. Mais Google le respecte par defaut sur les sites qu\'il crawle avec Googlebot.' + NL +
  '- Certains LLM (Mistral, Le Chat) n\'ont pas de bot public identifiable. Pas de hint robots.txt possible.' + NL +
  '- Le contenu est en francais. Les LLM non-francophones ne le citeront pas en priorite. Une version anglaise de `llms-full.txt` est un P2 envisageable.' + NL +
  '- Pas de cache busting sur `llms-full.txt` : le CDN cache 1h. Pour forcer le refresh, deployer avec un query string (`/llms-full.txt?v=2026-06-24`).' + NL +
  '';

if (!s.includes('## 9. GEO')) {
  s = s.trimEnd() + geoSection;
} else {
  // replace existing
  const startIdx = s.indexOf('## 9. GEO');
  s = s.slice(0, startIdx) + geoSection.trimStart();
}

fs.writeFileSync(path, s, 'utf8');
console.log('OK audit.md section 9 GEO added');
