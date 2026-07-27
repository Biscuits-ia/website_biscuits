# Silos SEO — design

Date : 2026-07-27
Statut : validé, prêt pour plan d'implémentation

## Contexte et problème

Le site compte ~130 URLs publiques dont la structure reflète l'organisation
interne de l'association (5 « piliers ») plutôt que les requêtes des
utilisateurs. Conséquence : plusieurs URLs se disputent le même mot-clé.

| Mot-clé cible | URLs concurrentes actuelles |
| --- | --- |
| IA pour association | `/piliers/ia`, `/nos-missions`, `/combats/ia-utile` |
| logiciel association | `/logiciels`, `/piliers/logiciels` |
| arnaque / message suspect | `/anti-pepins`, `/piliers/anti-pepins`, `/aide-victimes` |

Quand deux pages visent la même requête, Google en choisit une arbitrairement et
l'autorité se répartit entre les deux : les deux sous-performent
(cannibalisation). L'autorité interne est en outre diluée sur 130 URLs sans
hiérarchie thématique lisible.

**Objectif** : regrouper le contenu public en trois silos thématiques, une seule
URL canonique par mot-clé, avec un maillage interne qui concentre l'autorité sur
les pages de tête de chaque silo.

**Hors périmètre** : aucun changement de design ni de composant UI ; les pages
réutilisent les classes CSS existantes. Aucun outil interactif n'est développé
dans ce lot (`detecteur-arnaque` et `analyseur-sms` sont des guides éditoriaux
qui convertissent vers l'outil Anti Pepins existant).

## Décisions structurantes

Quatre arbitrages pris en amont, chacun avec sa raison :

1. **Migration, pas cohabitation.** Les silos remplacent les pages en doublon,
   qui sont redirigées en 301. Créer les silos « en plus » aurait ajouté 11 URLs
   concurrentes aux existantes — l'inverse de l'objectif.
2. **Pages de contenu uniquement.** Un vrai analyseur de SMS impliquerait un
   endpoint, un rate-limit et une décision RGPD (le message collé est une donnée
   personnelle). Reporté à un lot ultérieur.
3. **`/anti-pepins` conservée.** C'est la page produit d'un outil, pas un article.
   Le silo `/anti-arnaque/` la référence comme cible de conversion.
4. **`/piliers` conservé** comme hub institutionnel, avec `/piliers/cyber` et
   `/piliers/recherche` qui n'ont pas de silo. « Recherche & modèles ouverts »
   n'a pas de volume de recherche : mauvais candidat pour un silo SEO.

## Architecture

### Arborescence des routes

```
src/pages/
├── intelligence-artificielle/
│   ├── index.astro                       ← absorbe le contenu de /piliers/ia
│   ├── formation-ia-association.astro
│   ├── outils-ia-gratuits.astro
│   └── automatisation-ia.astro
├── anti-arnaque/
│   ├── index.astro                       ← absorbe /piliers/anti-pepins
│   ├── detecteur-arnaque.astro
│   ├── analyseur-sms.astro
│   └── phishing.astro
└── logiciels-associations/
    ├── index.astro                       ← absorbe /logiciels + /piliers/logiciels
    ├── logiciel-association.astro
    └── logiciel-libre-association.astro
```

`/blog/` reste inchangé et sert de réservoir de liens entrants vers les hubs.

Les 11 pages sont `export const prerender = true` : contenu statique, aucun appel
Supabase. Elles relèvent donc de la CSP statique de `vercel.json` et non du nonce
injecté par le middleware (cf. AGENTS.md, invariant 4).

### Redirections 301

À ajouter au tableau `redirects` existant de `vercel.json`, au format déjà en
place (`{ source, destination, statusCode: 301 }`) :

| Source | Destination |
| --- | --- |
| `/piliers/ia` | `/intelligence-artificielle` |
| `/piliers/anti-pepins` | `/anti-arnaque` |
| `/piliers/logiciels` | `/logiciels-associations` |
| `/logiciels` | `/logiciels-associations` |

Les quatre fichiers sources sont supprimés et leur contenu migre dans le hub
correspondant. Une 301 vers une page qui ne reprend pas le contenu redirigé perd
le bénéfice de la redirection.

**Explicitement conservées, non redirigées** :

- `/anti-pepins` — page produit de l'outil d'analyse
- `/formations`, `/formations/[slug]/`, `/formations/[slug]/inscription`,
  `/formations/parrainer` — catalogue Supabase et tunnel d'inscription
- `/ateliers`, `/aide-victimes`, `/piliers`, `/piliers/cyber`, `/piliers/recherche`

### Maillage interne

C'est la partie qui produit l'effet SEO ; l'arborescence d'URLs seule n'apporte
rien. Trois règles, appliquées sans exception :

1. **Page enfant** → lie vers son hub (fil d'Ariane + un lien contextuel dans le
   corps) et vers ses pages sœurs du même silo. **Jamais** de lien direct vers
   l'enfant d'un autre silo : le lien passe par le hub. C'est ce qui empêche
   l'autorité de fuir d'un silo à l'autre.
2. **Hub** → lie vers ses 3 enfants, vers 3 à 5 articles de blog du même thème,
   et vers sa page de conversion (`/formations`, `/anti-pepins` ou `/contact`).
3. **Article de blog** → un lien contextuel remontant vers le hub de son thème,
   placé dans le corps du texte (pas en pied de page).

Répartition thématique des 33 articles existants :

- **IA** — `automatiser-taches-ia-associations`, `rag-documentation-association`,
  `ollama-heberger-llm-local`, `comparatif-ia-open-source-2026`,
  `prompt-engineering`, `mistral-rag-chatbot-mairie`,
  `chatbots-ia-choisir-assistant-association`, `evaluer-llm-qualite-reponses`,
  `modeles-raisonnement-deepseek-qwq`, `redaction-dossier-subvention-ia`
- **anti-arnaque** — `detecter-arnaque-ia`, `phishing-nouvelle-generation-ia`,
  `arnaque-au-president-ia`, `faux-support-technique-ia-teleassistance`,
  `ingenierie-sociale-ia-techniques`, `deepfakes-ia-clone-vos-proches`,
  `deepfakes-reseaux-sociaux-detecter-signaler`, `faux-assistants-ia-malwares`,
  `faux-investissements-ia-trading`, `legislation-arnaques-ia-2026`,
  `kit-protection-association-arnaque-ia`, `detecter-contenu-genere-par-ia`
- **logiciels** — `ia-open-source-association-biscuits`,
  `creer-site-web-association-ia-no-code`, `llama-4-cas-usage-association`,
  `materiel-cloud-ia-open-source`

Les articles restants (`cybersecurite-associations-2026`, `rgpd-petites-structures`,
`ransomware-sauvegardes-plan-continuite-associations`, `ia-accessibilite-numerique`,
`ia-sobriete-numerique-impact-environnemental`, `ia-service-citoyen-mairie`, `ia`)
relèvent des piliers cyber/recherche et ne sont pas rattachés à un silo.

### Données structurées

Réutilisation des composants existants, aucun nouveau composant :
`src/components/SEO/SchemaOrg.astro` accepte déjà
`Organization | NGO | Service | FAQPage | Article | WebPage | Course | Product | HowTo | ContactPage`.

- Hubs → `Service`
- `detecteur-arnaque`, `analyseur-sms`, `phishing` → `HowTo`, via
  `src/components/SEO/HowTo.astro` (éligible aux rich results Google)
- Enfants IA et logiciels → `FAQPage` sur le bloc FAQ de fin de page

Le fil d'Ariane émet déjà un `BreadcrumbList` automatiquement
(`src/components/Breadcrumb.astro`) : rien à ajouter côté schéma.

## Fichiers d'infrastructure modifiés

| Fichier | Modification |
| --- | --- |
| `vercel.json` | +4 entrées dans `redirects` |
| `astro.config.mjs` | règles `serialize()` du sitemap pour les nouveaux chemins ; suppression des règles devenues mortes pour les 4 chemins redirigés |
| `src/components/Breadcrumb.astro` | +11 entrées dans `defaultLabels` |
| `src/components/Header.astro` | 8 `href` (lignes ~54, 57, 108, 111, 129, 132, 174, 176, 177) |
| `src/components/Footer.astro` | 2 `href` (lignes ~34, 36) |
| `public/llms.txt` | ajout des 11 URLs |
| `src/components/PillarsGrid.astro`, `src/pages/public/associations.astro` | liens vers les chemins redirigés |

Priorités de sitemap retenues : hubs `0.9 / weekly`, enfants `0.8 / weekly` —
alignées sur le traitement actuel de `/piliers` (0.9) et du blog (0.8).

## Contenu éditorial

1000 à 1500 mots par page, ton et structure calqués sur `/piliers/ia` dans son
état actuel. Chaque page comporte : un H1 portant le mot-clé cible, une
introduction répondant à l'intention de recherche, 3 à 5 sections H2, un bloc FAQ
et un appel à l'action vers la page de conversion du silo.

**Zéro nouveau composant, zéro nouvelle classe CSS.** Les pages réutilisent les
classes déjà présentes : `pilier-hero`, `container`, `grid`, `card`,
`btn-primary`, `btn-ghost`, `eyebrow`, `lead`, `content`.

Livraison **silo par silo** — IA d'abord, complet et relu, puis anti-arnaque,
puis logiciels — pour valider le format avant de le répliquer.

## Vérification

1. `npm run build` — vérifie les types, génère le sitemap et applique les
   redirections. Doit passer sans erreur.
2. Contrôler que `dist/` contient les 11 pages et que `sitemap-0.xml` les liste
   avec les priorités attendues.
3. Vérifier l'absence de lien mort vers les 4 chemins supprimés :
   `grep -rnE 'href="/(logiciels|piliers/(ia|logiciels|anti-pepins))"' src`
   ne doit rien renvoyer.
4. `npm run preview`, puis vérifier manuellement qu'un appel à `/logiciels` et
   `/piliers/ia` renvoie bien un 301 vers la nouvelle URL.
5. `npm run lint` et `npm run check`.
6. Après déploiement : soumettre les nouvelles URLs via `/api/indexnow`
   (endpoint déjà présent) et surveiller la Search Console sur les 4 URLs
   redirigées.

## Risques

- **Perte de trafic transitoire** sur les 4 URLs redirigées, le temps que Google
  traite les 301 (typiquement quelques semaines). Attendu et réversible.
- **Liens externes existants** vers `/logiciels` ou `/piliers/ia` : couverts par
  les 301, aucune action supplémentaire.
- **Volume rédactionnel** : ~14 000 mots au total. La livraison par silo limite
  le risque de produire 11 pages au mauvais format.
