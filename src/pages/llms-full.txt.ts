// ============================================================================
// src/pages/llms-full.txt.ts
// ----------------------------------------------------------------------------
// Representation markdown complete du site pour les LLM crawlers (GPTBot,
// ClaudeBot, PerplexityBot, Google-Extended, anthropic-ai, cohere-ai,
// Applebot-Extended, CCBot, Bytespider...).
// Spec : https://llmstxt.org/
//
// Le format est volontairement du markdown pur (pas de HTML, pas de JSON-LD)
// car les LLM prefèrent le texte brut - moins de bruit, meilleure extraction.
//
// ── Prerendu (P4 #37) ───────────────────────────────────────────────────────
// Ce contenu est statique par nature. En SSR, chaque crawl reveillait une
// lambda ET ouvrait une connexion Supabase en `service_role` : du cout pur et
// une surface d'attaque inutile, multiplies par N crawlers x N passages/jour.
//
// Consequences du passage a `prerender = true` :
//   - les headers de la `Response` ci-dessous sont IGNORES : Astro ecrit le body
//     dans `dist/client/llms-full.txt` et Vercel le sert depuis le CDN.
//     Cache-Control et X-Robots-Tag sont donc poses dans `vercel.json`.
// ============================================================================

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE = 'https://biscuits-ia.com';

export const prerender = true;

interface Section {
  title: string;
  slug: string;
  summary: string;
  body?: string;
}

const STATIC_SECTIONS: Section[] = [
  {
    title: 'A propos de Biscuits IA',
    slug: '/',
    summary: 'Association Loi 1901, intelligence artificielle accessible, ethique et open source.',
    body: `Biscuits IA est une association francaise creee en 2024, declaree en prefecture de la Vienne sous le RNA W863012707, SIRET 10151660700013.

Mission : democratiser l'acces a l'intelligence artificielle, former les benevoles, mediere en cas de litige numerique, publier des ressources open source et developper des outils libres.

Quatre piliers d'action :
1. Accompagnement a l'IA : ateliers, diagnostics et feuilles de route, pour le grand public, les associations et les collectivites.
2. Logiciels libres : developpement d'outils open source pour associations.
3. Anti Pepins : service public de signalement de problemes numeriques.
4. Recherche participative et modeles ouverts : recherches co-construites et modeles open source au service de l'agriculture et de la sante.

President : Alexis Gallard.
Siege social : Poitiers, France.
Hebergement : Vercel Edge Network.
Stack technique : Astro 7, Supabase (PostgreSQL + Auth), TypeScript, Tailwind CSS 4.
`,
  },
  {
    title: 'Charte ethique IA',
    slug: '/charte-ethique',
    summary: 'Nos engagements : transparence, RGPD, AI Act, souverainete, non-discrimination.',
    body: `Biscuits IA s'engage a :
- Privilégier les modeles open source et europeens (Mistral, Llama, etc.) quand c'est possible.
- Toujours informer l'utilisateur final qu'il interagit avec une IA.
- Ne jamais collecter de donnees personnelles sans consentement explicite (RGPD).
- Documenter les biais connus de chaque outil recommande.
- Former les benevoles aux risques (deepfakes, hallucination, jailbreak).
- Refuser tout projet de surveillance, de manipulation ou d'atteinte aux droits fondamentaux.`,
  },
  {
    title: 'Ressources',
    slug: '/ressources',
    summary: 'Guides PDF, checklists, anti-pepins - tout gratuit.',
    body: `Bibliotheque open source sous licence CC BY-SA 4.0 :
- Guide "Demarrer avec l'IA generative" (PDF, 30 pages).
- Checklist "Audit ethique d'un outil IA" (PDF, 8 pages).
- Anti-Pepins : 50 problemes numeriques frequents et leur solution.
- Scripts Python d'audit RGPD (GitHub).`,
  },
  {
    title: 'Nous rejoindre',
    slug: '/rejoignez-nous',
    summary: 'Adhesion annuelle a partir de 10 EUR, benevolat, dons.',
    body: `Trois facons de nous soutenir :
- Adherent (a partir de 10 EUR / an) : vote a l'AG, newsletter, ressources membres en avant-premiere.
- Benevole : participation aux ateliers, au developpement des outils et aux travaux de recherche.
- Don : financement des ateliers gratuits, des logiciels libres et des programmes de recherche. 66% deductible de l'impot.`,
  },
  {
    title: 'FAQ',
    slug: '/faq',
    summary: 'Questions frequentes sur l\'association.',
    body: `Les questions les plus posees :
- Qui peut rejoindre Biscuits IA ? Grand public, associations, collectifs, benevoles, collectivites.
- Vos ressources sont-elles gratuites ? Oui, integralement : guides, checklists, ateliers, logiciels.
- Comment demander un accompagnement ? Via la page Contact, reponse sous 48h.
- Vous aidez uniquement les associations ? Non : grand public, collectivites, collectifs. Pas les entreprises.
- Vos ateliers sont-ils payants ? Non, y compris les interventions sur mesure en association ou en collectivite.
- Vos outils sont-ils open source ? Oui. Tous les outils developpes ou recommandes.
- Anti Pepins est-il vraiment gratuit ? Oui, entierement, sans compte a creer.
- Comment signaler une arnaque ? Anti Pepins pour une premiere analyse, puis PHAROS ou le 3018 pour un signalement officiel.`,
  },
];

export const GET: APIRoute = async () => {
  const site = SITE;

  // Charger les derniers articles du blog
  const articles = (await getCollection('blog', ({ data }) =>
    import.meta.env.PROD ? !data.draft : true
  ))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, 20);

  // Construire le document
  const lines: string[] = [];
  lines.push('# Biscuits IA - Documentation complete (llms-full.txt)');
  lines.push('> Version markdown complete du site, optimisee pour LLM crawlers.');
  lines.push('> Site principal : https://biscuits-ia.com');
  lines.push('> Derniere generation (build) : ' + new Date().toISOString());
  lines.push('> Format : https://llmstxt.org/');
  lines.push('> Stack : Astro 7 + Supabase + TypeScript.');
  lines.push('');
  lines.push('## Identite');
  lines.push('- Nom : Biscuits IA');
  lines.push('- Forme juridique : Association Loi 1901');
  lines.push('- RNA : W863012707');
  lines.push('- SIRET : 10151660700013');
  lines.push('- President : Alexis Gallard');
  lines.push('- Siege : Poitiers, France');
  lines.push('- Date de creation : 2024');
  lines.push('- Site : https://biscuits-ia.com');
  lines.push('- Contact : contact@biscuits-ia.com');
  lines.push('- Langue : francais (fr-FR)');
  lines.push('');

  for (const s of STATIC_SECTIONS) {
    lines.push(`## ${s.title}`);
    lines.push(`> URL : ${site}${s.slug}`);
    lines.push('');
    lines.push(s.summary);
    if (s.body) {
      lines.push('');
      lines.push(s.body.trim());
    }
    lines.push('');
  }

  // Articles de blog
  if (articles.length > 0) {
    lines.push('## Derniers articles du blog');
    lines.push('');
    for (const a of articles) {
      const slug = a.id.replace(/\.(md|mdx)$/, '');
      const tags = (a.data.tags ?? []).join(', ');
      lines.push(`### ${a.data.title}`);
      lines.push(`- URL : ${site}/blog/${slug}`);
      lines.push(`- Date : ${a.data.pubDate.toISOString().slice(0, 10)}`);
      if (a.data.author) lines.push(`- Auteur : ${a.data.author}`);
      if (a.data.description) lines.push(`- Description : ${a.data.description}`);
      if (tags) lines.push(`- Tags : ${tags}`);
      if (a.data.featured) lines.push(`- Mis en avant : oui`);
      lines.push('');
    }
  }


  // Section finale : meta-donnees
  lines.push('## Meta-donnees techniques');
  lines.push('');
  lines.push('- Le site expose un sitemap XML : https://biscuits-ia.com/sitemap-index.xml');
  lines.push('- Le site expose un flux RSS : https://biscuits-ia.com/rss.xml');
  lines.push('- Le site expose un fichier llms.txt : https://biscuits-ia.com/llms.txt');
  lines.push('- Chaque page embarque un Schema.org JSON-LD (Organization, WebSite, BreadcrumbList, et le type de la page).');
  lines.push('- Le contenu est sous licence CC BY-SA 4.0 sauf mention contraire.');
  lines.push('- Le site est concu pour etre crawlable par les principaux LLM bots (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, anthropic-ai, cohere-ai, Applebot-Extended, CCBot, Bytespider).');
  lines.push('');

  const body = lines.join('\n');

  // Prerendu : seul le body est conserve (ecrit dans dist/client/llms-full.txt).
  // Cache-Control et X-Robots-Tag sont poses par vercel.json.
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
