// ============================================================================
// src/pages/llms-full.txt.ts
// ----------------------------------------------------------------------------
// Endpoint dynamique qui sert une representation markdown complete du site
// pour les LLM crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended,
// anthropic-ai, cohere-ai, Applebot-Extended, CCBot, Bytespider...).
// Spec : https://llmstxt.org/
//
// Le format est volontairement du markdown pur (pas de HTML, pas de JSON-LD)
// car les LLM prefèrent le texte brut - moins de bruit, meilleure extraction.
// ============================================================================

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { fetchRoleSecure } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

const SITE = 'https://biscuits-ia.com';

export const prerender = false;

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
1. Accompagnement a l'IA : ateliers, formations, mediation IA.
2. Lutte contre la cybercriminalite : aide aux victimes d'arnaques, mediation numerique.
3. Logiciels libres : developpement d'outils open source pour associations.
4. Anti Pepins : service public de signalement de problemes numeriques.

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
    title: 'Ateliers',
    slug: '/ateliers',
    summary: 'Ateliers IA gratuits ou a prix libre, en ligne et en presentiel.',
    body: `Trois formats :
- Ateliers en ligne (jusqu'a 15 participants, gratuits).
- Ateliers en presentiel a Poitiers et villes partenaires.
- Ateliers a la demande pour les associations et collectivites.

Categories : initiation IA generative, prompting avance, automatisation, ethique, RGPD, creation d'outils.`,
  },
  {
    title: 'Formations',
    slug: '/formations',
    summary: 'Formations certifiantes a prix libre (sliding scale 0 a 350 EUR).',
    body: `Parcours :
- Decouverte (6h, prix libre 0-50 EUR).
- Praticien (24h, 100-200 EUR sliding scale).
- Expert (60h, 200-350 EUR sliding scale).

Paiement de solidarite : si le tarif est un obstacle, demander une exoneration via la page /formations (formulaire dedie).

Les places offertes sont financees par les paiements a tarif plein et par les dons.`,
  },
  {
    title: 'Ressources',
    slug: '/ressources',
    summary: 'Guides PDF, checklists, anti-pepins, mediations - tout gratuit.',
    body: `Bibliotheque open source sous licence CC BY-SA 4.0 :
- Guide "Demarrer avec l'IA generative" (PDF, 30 pages).
- Checklist "Audit ethique d'un outil IA" (PDF, 8 pages).
- Anti-Pepins : 50 problemes numeriques frequents et leur solution.
- Modeles de courrier pour mediation numerique.
- Scripts Python d'audit RGPD (GitHub).`,
  },
  {
    title: 'Associations d\'aide aux victimes',
    slug: '/aide-victimes',
    summary: 'Annuaire d\'associations specialisees dans l\'aide aux victimes de cybercriminalite, harcelement en ligne et arnaques.',
    body: `Biscuits IA n'accompagne plus directement les victimes. Nous referencons les associations specialisees :
  - France Victimes (116 006) : aide generale aux victimes, 130 bureaux en France.
  - e-Enfance / 3018 : cyberharcelement et protection des mineurs (9h-23h, gratuit, anonyme).
  - AVEC : Aide aux Victimes d'Escroqueries et de Cybermalveillance.
  - INAVEM : federation des associations d'aide aux victimes.
  - 119 : Allo Enfance en danger (24h/24, gratuit).
  - Action Innocence : protection de l'enfance sur internet.
  - Internet Sans Crainte (CNIL) : education numerique des jeunes.
  Pour une analyse immediate d'un message suspect, utilisez Anti Pepins (gratuit, anonyme, sans inscription).`,
  },
  {
    title: 'Nous rejoindre',
    slug: '/rejoignez-nous',
    summary: 'Adhesion annuelle 20 EUR, benevolat, dons.',
    body: `Trois facons de nous soutenir :
- Adherent (20 EUR / an) : acces aux formations gratuites, vote a l'AG, newsletter.
- Benevole : participation aux ateliers, mediation, developpement des outils.
- Don : financement des places offertes, des outils libres, des mediations. 66% deductible de l'impot.`,
  },
  {
    title: 'FAQ',
    slug: '/faq',
    summary: 'Questions frequentes sur l\'association.',
    body: `Les questions les plus posees :
- Qui peut rejoindre Biscuits IA ? Associations, collectifs, benevoles, TPE, collectivites.
- Vos ressources sont-elles gratuites ? Oui, guides, checklists, ateliers gratuits ou a prix libre.
- Comment demander un accompagnement ? Via la page Contact ou un rendez-vous en ligne, reponse sous 48h.
- Vos ateliers sont-ils en ligne ou en presentiel ? Les deux. En ligne jusqu'a 15 participants, en presentiel a Poitiers.
- Vous aidez uniquement les associations ? Non : TPE, collectivites, collectifs.
- Comment fonctionne la mediation numerique ? Documentation du cas, contact du prestataire, resolution amiable. Gratuit.
- Vos outils sont-ils open source ? Oui. Tous les outils developpes ou recommandes.`,
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

  // Charger les formations a venir
  let formationsMd = '';
  try {
    const admin = createSupabaseAdminClient();
    const { data: trainings } = await admin
      .from('trainings')
      .select('id, slug, title, short_description, category, level, is_paying, is_published')
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .limit(30);
    if (trainings && trainings.length > 0) {
      formationsMd = '\n## Catalogue des formations publiees\n\n';
      for (const t of trainings) {
        formationsMd += `### ${t.title}\n`;
        formationsMd += `- URL : ${site}/formations/${t.slug}\n`;
        if (t.short_description) formationsMd += `- Description : ${t.short_description}\n`;
        if (t.category) formationsMd += `- Categorie : ${t.category}\n`;
        if (t.level) formationsMd += `- Niveau : ${t.level}\n`;
        formationsMd += `- Type : ${t.is_paying ? 'Payante (sliding scale 0-350 EUR)' : 'Gratuite'}\n\n`;
      }
    }
  } catch (err) {
    console.warn('[llms-full.txt] formations fetch failed:', err);
  }

  // Construire le document
  const lines: string[] = [];
  lines.push('# Biscuits IA - Documentation complete (llms-full.txt)');
  lines.push('> Version markdown complete du site, optimisee pour LLM crawlers.');
  lines.push('> Site principal : https://biscuits-ia.com');
  lines.push('> Derniere generation : ' + new Date().toISOString());
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

  // Formations
  lines.push(formationsMd);

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

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Cache CDN 1h, on regenere a chaque requete apres
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      // Pas d'indexation par les moteurs classiques (ce fichier est pour les LLM)
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
};
