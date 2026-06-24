const fs = require('fs');
const path = 'astro.config.mjs';
let s = fs.readFileSync(path, 'utf8');

// Insert a new policy block for LLM crawlers BEFORE the `icon(),` line
// We will add explicit Allow for known LLM bots with a comment explaining
// why we want them to crawl (GEO - Generative Engine Optimization).
// See https://llmstxt.org/ and https://darkvisitors.com/

const llmPolicy =
  "        // P0 GEO : politique explicite pour les crawlers LLM (GPTBot, ClaudeBot,\n" +
  "        // PerplexityBot, Google-Extended, anthropic-ai, cohere-ai, Applebot-Extended,\n" +
  "        // CCBot, Bytespider). On les AUTORISE explicitement avec crawlDelay\n" +
  "        // pour qu'ils puissent indexer le contenu en markdown (llms.txt + llms-full.txt)\n" +
  "        // et le schema JSON-LD. Cf. https://llmstxt.org/ et audit.md section 9.\n" +
  "        {\n" +
  "          userAgent: [\n" +
  "            'GPTBot',\n" +
  "            'ChatGPT-User',\n" +
  "            'ClaudeBot',\n" +
  "            'Claude-Web',\n" +
  "            'PerplexityBot',\n" +
  "            'Perplexity-User',\n" +
  "            'Google-Extended', // Google AI training (Gemini) - independant de Googlebot search\n" +
  "            'anthropic-ai',\n" +
  "            'Claude-User',\n" +
  "            'cohere-ai',\n" +
  "            'cohere-training-data-crawler',\n" +
  "            'Applebot-Extended', // Apple Intelligence\n" +
  "            'CCBot', // Common Crawl (entraine beaucoup de LLM)\n" +
  "            'Bytespider', // ByteDance / TikTok AI\n" +
  "            'Diffbot',\n" +
  "            'DuckAssistBot',\n" +
  "            'FacebookBot',\n" +
  "            'OAI-SearchBot',\n" +
  "          ],n" +
  "          allow: '/',\n" +
  "          disallow: [\n" +
  "            '/admin',\n" +
  "            '/api',\n" +
  "            '/auth',\n" +
  "            '/dashboard',\n" +
  "            '/connexion',\n" +
  "            '/inscription',\n" +
  "            '/mot-de-passe-oublie',\n" +
  "            '/reinitialisation-mot-de-passe',\n" +
  "            '/verifier-code-inscription',\n" +
  "            '/verifier-code-reinitialisation',\n" +
  "          ],\n" +
  "          crawlDelay: 2,\n" +
  "        },\n";

// Look for the line that has the existing Googlebot block's closing `},` and insert after.
const marker = "          crawlDelay: 0.5,\n" +
  "        },\n" +
  "      ],\n" +
  "    }),\n";

if (!s.includes(marker)) { console.error('MARKER NOT FOUND'); process.exit(1); }
const newB = "          crawlDelay: 0.5,\n" +
  "        },\n" +
  llmPolicy +
  "      ],\n" +
  "    }),\n";
s = s.replace(marker, newB);
fs.writeFileSync(path, s, 'utf8');
console.log('OK astro.config LLM policy added');
