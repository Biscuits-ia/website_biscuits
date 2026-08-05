export type BlogClusterSlug = 'arnaques-ia' | 'ia-associations' | 'ia-open-source';

export interface BlogClusterSource {
  name: string;
  url: string;
  publisher: string;
}

export interface BlogCluster {
  slug: BlogClusterSlug;
  eyebrow: string;
  title: string;
  shortTitle: string;
  description: string;
  introduction: string;
  audience: string;
  primaryQuery: string;
  articleIds: readonly string[];
  sources: readonly BlogClusterSource[];
}

export const BLOG_CLUSTERS: readonly BlogCluster[] = [
  {
    slug: 'arnaques-ia',
    eyebrow: 'Dossier prévention',
    title: "Arnaques utilisant l'IA : comprendre, détecter et réagir",
    shortTitle: 'Arnaques et cybercriminalité IA',
    description:
      "Guide complet pour reconnaître les arnaques utilisant l'intelligence artificielle, protéger une association et réagir face au phishing, aux deepfakes ou aux faux supports.",
    introduction:
      "L'intelligence artificielle rend les fraudes plus crédibles, mais les bons réflexes restent accessibles. Ce dossier rassemble nos procédures de vérification, nos guides de prévention et les démarches officielles de signalement.",
    audience: 'Associations, bénévoles, collectivités, proches et citoyens',
    primaryQuery: 'arnaques intelligence artificielle',
    articleIds: [
      'detecter-arnaque-ia',
      'kit-protection-association-arnaque-ia',
      'cybersecurite-associations-2026',
      'phishing-nouvelle-generation-ia',
      'arnaque-au-president-ia',
      'deepfakes-ia-clone-vos-proches',
      'deepfakes-reseaux-sociaux-detecter-signaler',
      'ingenierie-sociale-ia-techniques',
      'faux-assistants-ia-malwares',
      'faux-investissements-ia-trading',
      'faux-support-technique-ia-teleassistance',
      'ransomware-sauvegardes-plan-continuite-associations',
      'legislation-arnaques-ia-2026',
      'detecter-contenu-genere-par-ia',
    ],
    sources: [
      {
        name: "Les arnaques utilisant l'intelligence artificielle",
        url: 'https://www.masecurite.interieur.gouv.fr/fr/fiches-pratiques/numerique/arnaques-utilisant-intelligence-artificielle-ia',
        publisher: "Ministère de l'Intérieur",
      },
      {
        name: 'Hypertrucage (deepfake) : se protéger et signaler',
        url: 'https://www.cnil.fr/fr/hypertrucage-deepfake',
        publisher: 'CNIL',
      },
      {
        name: 'Assistance et prévention du risque numérique',
        url: 'https://www.cybermalveillance.gouv.fr/',
        publisher: 'Cybermalveillance.gouv.fr',
      },
    ],
  },
  {
    slug: 'ia-associations',
    eyebrow: 'Dossier pratique',
    title: 'Intelligence artificielle pour les associations : usages, méthode et RGPD',
    shortTitle: 'IA pour les associations',
    description:
      "Méthodes et cas d'usage concrets pour adopter l'IA dans une association : automatisation, rédaction, accessibilité, gouvernance et protection des données.",
    introduction:
      "Une association n'a pas besoin de multiplier les outils pour bénéficier de l'IA. Elle doit partir d'un besoin réel, protéger les données de ses membres et garder une validation humaine. Ce parcours vous accompagne de la première idée à la mise en œuvre.",
    audience: 'Associations, ONG, collectifs, mairies et petites structures',
    primaryQuery: 'intelligence artificielle association',
    articleIds: [
      'ia',
      'automatiser-taches-ia-associations',
      'chatbots-ia-choisir-assistant-association',
      'prompt-engineering',
      'redaction-dossier-subvention-ia',
      'creer-site-web-association-ia-no-code',
      'rgpd-petites-structures',
      'ia-accessibilite-numerique',
      'ia-service-citoyen-mairie',
    ],
    sources: [
      {
        name: 'Dossier intelligence artificielle pour les particuliers et organisations',
        url: 'https://www.cnil.fr/fr/particulier-intelligence-artificielle-ia',
        publisher: 'CNIL',
      },
      {
        name: 'Cadre réglementaire européen sur l’intelligence artificielle',
        url: 'https://digital-strategy.ec.europa.eu/fr/policies/regulatory-framework-ai',
        publisher: 'Commission européenne',
      },
      {
        name: 'Ressources numériques pour les associations',
        url: 'https://www.associations.gouv.fr/',
        publisher: 'Associations.gouv.fr',
      },
    ],
  },
  {
    slug: 'ia-open-source',
    eyebrow: 'Dossier technique',
    title: 'IA open source et locale : choisir, installer et exploiter un modèle',
    shortTitle: 'IA open source et locale',
    description:
      "Guide de l'IA open source pour choisir un modèle, utiliser Ollama, déployer un RAG et conserver la maîtrise des données d'une association ou collectivité.",
    introduction:
      "Les modèles ouverts et exécutés localement permettent de réduire la dépendance aux plateformes, à condition d'évaluer les besoins, le matériel, les licences et la qualité des réponses. Ce dossier relie les choix techniques aux usages de terrain.",
    audience: 'Responsables numériques, bénévoles techniques et collectivités',
    primaryQuery: 'IA open source association',
    articleIds: [
      'ia-open-source-association-biscuits',
      'comparatif-ia-open-source-2026',
      'ollama-heberger-llm-local',
      'materiel-cloud-ia-open-source',
      'llama-4-cas-usage-association',
      'modeles-raisonnement-deepseek-qwq',
      'evaluer-llm-qualite-reponses',
      'rag-documentation-association',
      'mistral-rag-chatbot-mairie',
      'ia-sobriete-numerique-impact-environnemental',
    ],
    sources: [
      {
        name: 'Open Source AI Definition — FAQ',
        url: 'https://opensource.org/ai/faq',
        publisher: 'Open Source Initiative',
      },
      {
        name: 'Documentation officielle Ollama',
        url: 'https://docs.ollama.com/',
        publisher: 'Ollama',
      },
      {
        name: 'Documentation des modèles et API Mistral AI',
        url: 'https://docs.mistral.ai/',
        publisher: 'Mistral AI',
      },
    ],
  },
] as const;

export function getBlogCluster(slug: string): BlogCluster | undefined {
  return BLOG_CLUSTERS.find((cluster) => cluster.slug === slug);
}

export function getBlogClusterForArticle(articleId: string): BlogCluster | undefined {
  return BLOG_CLUSTERS.find((cluster) => cluster.articleIds.includes(articleId));
}

export function getClusterArticleIds(articleId: string, limit = 3): string[] {
  const cluster = getBlogClusterForArticle(articleId);
  if (!cluster) return [];

  const index = cluster.articleIds.indexOf(articleId);
  const ordered = [...cluster.articleIds.slice(index + 1), ...cluster.articleIds.slice(0, index)];
  return ordered.slice(0, limit);
}
