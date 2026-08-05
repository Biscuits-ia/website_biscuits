# Audit professionnel — Biscuits IA

**Date de l'audit :** 5 août 2026

**Périmètre :** dépôt local, artefact de production et contrôles non intrusifs de `https://biscuits-ia.com`

**Révision auditée :** branche `fix/footer-acces-cookies`, commit `1e29bbc`

**Stack applicative cible :** Astro 7 SSR/prérendu, React 19, TypeScript, Supabase et Vercel, avec Cloudflare limité au DNS et au sous-domaine qui l'utilise.
**Niveau d'assurance :** revue statique approfondie + build + tests automatisés + sondes HTTP + Lighthouse. Ce document n'est pas un test d'intrusion.

## Mise à jour de remédiation — 5 août 2026

Les corrections applicables dans le dépôt ont été implémentées après l'audit. Les constats historiques restent détaillés ci-dessous pour conserver la traçabilité ; le présent encadré fait foi pour l'état courant du code.

| Axe | État après correction | Mesures appliquées |
|---|---|---|
| Dépendances | Corrigé | Astro et intégrations mis à niveau, Node `24.x` aligné sur Vercel, `npm audit --omit=dev` à 0 vulnérabilité |
| Rate limiting | Corrigé | Compteur local borné, fenêtre réelle et `Retry-After` exact, sans Redis ni SaaS tiers |
| Sessions | Corrigé | Suppression du verrou global de cinq minutes ; déconnexion exclusivement en POST et locale à la session courante |
| Changement d'e-mail | Corrigé | Réauthentification par mot de passe courant et confirmation du nouvel e-mail via l'utilisateur, sans API Admin |
| CSRF / origine | Corrigé | Toute mutation navigateur exige une origine exacte ; seules les routes serveur-à-serveur explicitement listées y dérogent |
| IndexNow | Corrigé | POST uniquement et secret Bearer `INDEXNOW_SECRET` obligatoire |
| SEO technique | Corrigé | URL canonique sans slash, `noindex` cohérent sur auth/dashboard/API/404, tags exclus du sitemap et tags faibles en `noindex` |
| Sémantique | Corrigé | Un seul `<main>` et un seul `<h1>` sur les gabarits contrôlés ; suppression des H1 MDX dupliqués |
| Performance blog | Amélioré | Première page réellement paginée côté serveur ; HTML de `/blog` ramené à 102 785 octets |
| Service worker | Corrigé | `sw.js` et son chargeur servis avec revalidation obligatoire |
| Qualité / CI | Corrigé | Formatage et audit de dépendances bloquants, tests de structure ajoutés, audit axe bloquant sur les violations sérieuses/critiques |

### Validation finale locale

- `npm run build` : réussi ;
- `npx astro check` : 0 erreur, 0 avertissement, 0 suggestion ;
- `npm run lint` : 0 erreur, 0 avertissement ;
- `npm run format:check` : réussi ;
- `npm audit --omit=dev` : 0 vulnérabilité ;
- Playwright : 24 tests réussis, 3 ignorés car conditionnés à des identifiants Supabase de test ;
- axe-core : 0 violation sur l'accueil, le blog, la FAQ, les piliers et la politique de confidentialité ;
- sitemap : 0 URL de tag ; les pages de tag à faible contenu exposent `noindex, nofollow`.

### Déploiement de la remédiation

- production Vercel déployée le 5 août 2026 : `dpl_EffbKUcx5bhBeYXD5BrRCd4NcJ4y` (`READY`) ;
- domaines rattachés : `biscuits-ia.com`, `www.biscuits-ia.com` et `www.biscuits-ia.fr` ;
- contrôle post-déploiement Vercel : aucune erreur runtime observée sur la fenêtre de validation ;
- contrôle public : accueil et blog en 200, slash final redirigé en 308, routes privées en `noindex`, IndexNow sans jeton en 401 ;
- réserve DNS : le site principal traverse encore le proxy ; il peut être placé en mode « DNS uniquement » sans modifier les nameservers nécessaires au sous-domaine Cloudflare.

### Actions externes encore requises avant production

1. ✅ `INDEXNOW_SECRET` est défini comme secret sensible en production Vercel ; transmettre sa valeur au client autorisé exige une rotation dédiée, car Vercel ne réaffiche pas les variables sensibles.
2. Vérifier `CRON_SECRET`, puis créer des alertes sur les réponses 429.
3. Conserver les nameservers Cloudflare, mais placer les entrées du site principal et de `www` en mode « DNS uniquement » si seul le sous-domaine doit utiliser le proxy.
4. Exécuter les trois scénarios E2E authentifiés avec des comptes Supabase de test isolés et auditer les politiques RLS.
5. Traiter séparément la CSP des pages statiques avec des hashes ou nonces compatibles avec la chaîne de déploiement ; cette mesure nécessite une validation sur l'infrastructure réelle.

## 1. Conclusion exécutive

Le site possède une base technique sérieuse : build reproductible, contrôles d'artefact, scan de secrets, en-têtes de sécurité, CSP stricte sur les routes SSR, polices auto-hébergées et très bonnes performances sur l'accueil. Il n'est toutefois pas encore au niveau attendu pour une exploitation sereine d'espaces authentifiés.

La priorité n'est pas de gagner quelques points Lighthouse. Elle est de corriger quatre risques structurants : les dépendances vulnérables, le rate limiting qui devient presque inopérant sans Upstash, le changement d'e-mail via l'API Admin sans réauthentification, et l'invalidation de toute nouvelle session pendant cinq minutes après une déconnexion.

| Domaine | Maturité | Verdict |
|---|---:|---|
| Sécurité | Risque élevé | Plusieurs défauts confirmés sur l'identité, la session et les dépendances ; durcissement solide mais incomplet |
| SEO | À renforcer | Métadonnées présentes, mais indexation non maîtrisée, taxonomie trop large et structures de titres incohérentes |
| Performance | Bonne | Accueil rapide ; blog et service worker à optimiser |
| Accessibilité | Partielle | Contrastes excellents sur l'échantillon, mais erreurs sémantiques répétées |
| Qualité / exploitation | Moyenne | Build et invariants passent ; formatage, E2E et observabilité restent insuffisants |

**Décision recommandée :** corriger les éléments P0/P1 ci-dessous avant d'étendre les fonctions authentifiées ou d'augmenter le trafic. Aucun risque critique directement exploitable n'a été démontré pendant cet audit. `npm audit` signale néanmoins une dépendance transitive de sévérité critique dans la chaîne de build/déploiement ; elle doit être traitée sans la présenter comme une compromission runtime avérée.

## 2. Résultats vérifiés

| Contrôle | Résultat |
|---|---|
| `npx astro check` | Réussi : 0 erreur, 0 avertissement, 22 suggestions |
| `npm run lint` | Réussi : 0 erreur, 33 avertissements |
| `npm run format:check` | Échec : fichiers non conformes et erreur d'analyse sur `src/pages/dashboard/admin/contacts.astro` |
| `npm run build` | Réussi : 139 pages produites |
| `node scripts/assert-build-invariants.mjs` | Réussi : toutes les assertions passent |
| `npx playwright test` | Échec partiel : 19 réussis, 3 échoués, 3 ignorés |
| Axe WCAG AA sur 5 gabarits | 5/5 réussis, 0 violation détectée dans le périmètre configuré |
| `npm audit --omit=dev` | Échec : 14 vulnérabilités — 1 faible, 4 modérées, 8 hautes, 1 critique |
| Source maps publiques | Aucune `.map` trouvée dans `dist` |

### Mesure Lighthouse de l'accueil

Deux exécutions mobiles en laboratoire ont produit des résultats variables mais globalement très bons :

| Mesure | Résultat observé |
|---|---:|
| Performance | 95–97/100 |
| Accessibilité | 100/100 |
| SEO | 100/100 |
| Bonnes pratiques | 81/100 |
| FCP | 1,1–1,35 s |
| LCP | 1,9–2,55 s |
| TBT | 37–220 ms |
| CLS | 0 |
| Poids transféré, exécution mesurée | environ 210 Ko |

Le score « bonnes pratiques » est réduit par trois usages d'API dépréciées provenant du script Cloudflare `/cdn-cgi/challenge-platform/scripts/jsd/main.js`, pas du bundle applicatif. Lighthouse ne couvre qu'une page et ne remplace ni l'analyse du site entier ni les données réelles CrUX.

## 3. Plan prioritaire

### P0 — 24 à 48 heures

1. Mettre à jour Astro, `@astrojs/rss`, `sanitize-html`, `sharp` et la chaîne transitive concernée, puis reconstruire et retester.
2. Corriger le fallback du rate limiter et vérifier que les secrets Upstash sont bien configurés en production.
3. Remplacer le changement d'e-mail via `auth.admin.updateUserById` par un flux avec réauthentification et confirmation de la nouvelle adresse.
4. Corriger la garde `last_logout_at` pour comparer le moment de déconnexion à l'émission du jeton, et supprimer son `fail-open` sur les routes protégées.

### P1 — 7 jours

1. Propager réellement `noindex` jusqu'à `SEOHead`, supprimer les directives `googlebot`/`bingbot` contradictoires et corriger les pages auth/404.
2. Vérifier la véritable IP vue par Vercel derrière Cloudflare et documenter une chaîne de confiance unique.
3. Supprimer la déconnexion en GET ; utiliser POST avec validation d'origine/CSRF.
4. Déployer une défense CSRF uniforme pour toutes les mutations authentifiées.
5. Garantir un seul `<h1>` et un seul `<main>` par document.
6. Rediriger une variante de trailing slash vers l'URL canonique.

### P2 — 30 jours

1. Consolider les 80 pages de tags, désindexer les pages faibles et revoir le maillage interne.
2. Passer le blog à une pagination statique/côté serveur et charger l'index de recherche à la demande.
3. Servir `sw.js` avec revalidation obligatoire.
4. Rendre le formatage et les tests E2E représentatifs bloquants en CI.
5. Préparer la suppression de `'unsafe-inline'` sur les pages statiques.

## 4. Constats de sécurité détaillés

### SEC-01 — Dépendances avec vulnérabilités connues

- **Rule ID :** DEP-001
- **Sévérité :** Haute ; une alerte critique transitive est présente dans la chaîne de build
- **Statut :** Confirmé
- **Emplacement :** `package.json:25`, `package.json:36`, `package.json:38`, `package.json:41-42`, `package-lock.json`
- **Preuve :** `npm audit --omit=dev` remonte 14 alertes. Astro 7.0.0 est concerné par plusieurs avis XSS et un contournement de contrôle d'origine ; le correctif proposé est 7.1.6 sans changement majeur. `@astrojs/rss` 4.0.18 est concerné par une injection XML, `sanitize-html` 2.17.2 par des contournements de validation, `sharp` 0.34.5 par des vulnérabilités héritées de libvips. `tar` 7.5.13 est transitif via `@astrojs/vercel → @vercel/nft → @mapbox/node-pre-gyp`.
- **Impact :** exposition potentielle à du XSS, à des contournements de sanitation, à du déni de service et à des attaques de chaîne de build. La portée réelle dépend des fonctionnalités atteignables et des entrées traitées.
- **Correction recommandée :** passer Astro au minimum à 7.1.6, `@astrojs/rss` au minimum à 4.0.19, mettre à jour `sanitize-html`, tester `sharp` 0.35.3 sur une branche dédiée, régénérer le lockfile avec une installation propre et exécuter l'intégralité des contrôles.
- **Atténuation provisoire :** ne pas traiter de contenu non fiable avec les composants concernés, conserver la CSP SSR stricte et isoler les jobs de build.
- **Note faux positif / portée :** l'alerte critique `tar` est située dans une chaîne d'outillage ; aucune route runtime qui analyse une archive hostile n'a été identifiée. Cela réduit l'exploitabilité en production, pas la nécessité de corriger.
- **Critère de clôture :** `npm audit --omit=dev` sans alerte haute/critique acceptée, build et E2E réussis, revue des changements majeurs de `sharp`.

Avis principaux : [Astro view transitions XSS](https://github.com/advisories/GHSA-4g3v-8h47-v7g6), [Astro spread attributes XSS](https://github.com/advisories/GHSA-f48w-9m4c-m7f5), [RSS XML injection](https://github.com/advisories/GHSA-8j5q-mfj2-5q9q), [sanitize-html URI validation](https://github.com/advisories/GHSA-vccv-cmxp-4j9h).

### SEC-02 — Fallback de rate limiting limité à une seconde

- **Rule ID :** RATE-001
- **Sévérité :** Haute
- **Statut :** Confirmé dans le code ; configuration Upstash de production non vérifiée
- **Emplacement :** `src/lib/rateLimit.ts:61-83`, `src/lib/rateLimit.ts:94-105`, `src/lib/rateLimit.ts:137-187`
- **Preuve :** `l1Check()` reçoit `windowMs` mais fixe toujours `resetAt` à `now + 1_000`. Sans Upstash ou pendant une erreur Redis, la fonction retourne `null` et laisse passer. La configuration locale auditée ne contient pas les deux variables Upstash.
- **Impact :** une limite annoncée à 5 requêtes par minute devient en pratique un simple plafond de rafale d'une seconde. Brute force, credential stuffing, spam et abus d'API redeviennent possibles à débit soutenu.
- **Correction recommandée :** utiliser `windowMs` dans le store L1, ajouter un nombre maximal d'entrées et une stratégie de nettoyage, choisir un mode dégradé strict pour l'authentification, et faire échouer le démarrage de production si les secrets Upstash requis manquent.
- **Atténuation provisoire :** règle Cloudflare WAF/rate limiting sur les routes `/auth/*` et `/api/*`, alertes sur les erreurs Upstash.
- **Note faux positif / portée :** si Upstash est correctement configuré et disponible, la limite distribuée s'applique. Le défaut réapparaît toutefois à chaque absence ou panne du service.
- **Critère de clôture :** tests unitaires avec fenêtre simulée, test d'indisponibilité Redis et observation de réponses 429 sur toute la fenêtre attendue.

### SEC-03 — Changement d'e-mail via l'API Admin sans réauthentification

- **Rule ID :** ID-001
- **Sévérité :** Haute
- **Statut :** Confirmé
- **Emplacement :** `src/pages/auth/update-profile.ts:72-90`
- **Preuve :** une session valide peut appeler `auth.admin.updateUserById(user.id, { email })`. Le flux ne vérifie ni le mot de passe courant, ni un facteur récent, ni une confirmation envoyée aux anciennes et nouvelles adresses.
- **Impact :** une session volée peut modifier l'identifiant de récupération et consolider une prise de contrôle. L'utilisation de la clé service contourne le flux utilisateur normal de Supabase.
- **Correction recommandée :** exiger une authentification récente, utiliser le flux utilisateur de changement d'e-mail avec double confirmation, notifier l'ancienne adresse et journaliser l'événement.
- **Atténuation provisoire :** désactiver la modification d'e-mail dans le profil ou demander le mot de passe courant avant toute mutation.
- **Note faux positif / portée :** l'attaquant doit déjà disposer d'une session authentifiée. Ce prérequis est normal dans le modèle de menace des opérations sensibles.
- **Critère de clôture :** tests démontrant qu'une session ancienne ou sans mot de passe récent ne peut pas changer l'adresse, et que l'adresse ne bascule qu'après confirmation.

### SEC-04 — Invalidation de session après déconnexion incorrecte et `fail-open`

- **Rule ID :** AUTH-SESSION-001
- **Sévérité :** Haute pour la disponibilité des comptes ; Moyenne pour la sécurité du mode dégradé
- **Statut :** Confirmé
- **Emplacement :** `src/middleware.ts:179-215`, `src/pages/auth/deconnexion.ts:3-11`
- **Preuve :** les commentaires annoncent une comparaison entre l'`iat` du jeton et `last_logout_at`, mais le middleware invalide toute session si la déconnexion date de moins de cinq minutes. Une reconnexion immédiate produit donc une nouvelle session encore rejetée. En cas d'exception, la garde retourne `ok`.
- **Impact :** verrouillage temporaire reproductible après déconnexion ; en cas de panne de dépendance, une session que la garde ne peut pas évaluer peut être acceptée.
- **Correction recommandée :** comparer `last_logout_at` à l'instant d'émission vérifié du jeton ou adopter la révocation native documentée ; retourner `unauthenticated`/503 sur les routes protégées quand le contrôle critique échoue.
- **Atténuation provisoire :** réduire la fenêtre et afficher une erreur explicite plutôt qu'une boucle de redirection.
- **Note faux positif / portée :** le verrouillage n'apparaît que si `last_logout_at` est effectivement présent dans `profiles`, mais la route de déconnexion l'écrit systématiquement pour un utilisateur connu.
- **Critère de clôture :** scénario E2E « connexion → déconnexion → reconnexion immédiate → dashboard 200 » et test de panne du store de révocation.

### SEC-05 — Déconnexion avec effet de bord en GET

- **Rule ID :** CSRF-LOGOUT-001
- **Sévérité :** Moyenne
- **Statut :** Confirmé
- **Emplacement :** `src/pages/auth/deconnexion.ts:16-53`, `src/middleware.ts:139-143`
- **Preuve :** `GET` pointe vers le même handler que `POST`, écrit `last_logout_at` et appelle `signOut({ scope: 'global' })`. Les méthodes GET sont exclues de la garde CSRF.
- **Impact :** un lien, une image ou une prélecture externe peut déconnecter un utilisateur sur tous ses appareils et déclencher le verrouillage de cinq minutes.
- **Correction recommandée :** supprimer l'export GET, réserver l'action à POST, valider `Origin`/jeton CSRF et éviter le `signOut` global par défaut.
- **Atténuation provisoire :** interdire la prélecture de cette URL et demander une confirmation utilisateur.
- **Note faux positif / portée :** il s'agit d'un logout CSRF, donc d'un impact principalement disponibilité/expérience ; il ne donne pas directement accès au compte.
- **Critère de clôture :** GET retourne 405 et un POST sans preuve d'origine retourne 403.

### SEC-06 — Protection CSRF incomplète pour les mutations authentifiées

- **Rule ID :** CSRF-001
- **Sévérité :** Moyenne
- **Statut :** Défense présente mais couverture incomplète
- **Emplacement :** `src/middleware.ts:119-144`, `src/middleware.ts:316-321`
- **Preuve :** seules les mutations portant exactement `Sec-Fetch-Site: cross-site` sont bloquées. Les requêtes sans en-tête, `same-site` et `none` sont admises afin de préserver webhooks et appels serveur ; aucun jeton CSRF uniforme n'est utilisé.
- **Impact :** l'isolation dépend entièrement du comportement du navigateur et du contrôle des sous-domaines. Une compromission same-site ou une route mutante hors modèle peut contourner l'intention de l'utilisateur.
- **Correction recommandée :** séparer les webhooks sur des routes signées, valider strictement `Origin` pour les formulaires cookie-auth et ajouter un jeton CSRF pour les opérations sensibles.
- **Atténuation provisoire :** conserver `SameSite=Lax`, refuser les types de contenu inattendus et auditer toutes les mutations.
- **Note faux positif / portée :** les navigateurs modernes fournissent généralement `Sec-Fetch-Site`, ce qui bloque le scénario cross-site classique. Le constat porte sur la profondeur de défense, pas sur une exploitation universelle démontrée.
- **Critère de clôture :** matrice automatisée couvrant origin correcte, origin hostile, en-tête absent, sous-domaine et requête serveur signée.

Référence : [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

### SEC-07 — CSP statique autorisant les scripts inline

- **Rule ID :** CSP-001
- **Sévérité :** Moyenne
- **Statut :** Confirmé et déjà documenté dans la configuration
- **Emplacement :** `vercel.json:27-28`, `astro.config.mjs:194-241`, `src/middleware.ts:236-286`
- **Preuve :** les pages prérendues reçoivent `script-src 'self' 'unsafe-inline'` et `script-src-elem 'self' 'unsafe-inline'`. Les routes SSR utilisent en revanche un nonce et `strict-dynamic`. L'artefact contient 559 attributs `style` inline qui bloquent également le durcissement CSS.
- **Impact :** la CSP des pages statiques limite l'encadrement et les objets, mais apporte une protection XSS nettement plus faible qu'une politique par nonce/hash.
- **Correction recommandée :** supprimer progressivement les styles inline, convertir les scripts `is:inline`, décider du comportement Cloudflare Bot Fight Mode, puis activer la CSP Astro à hashes sur le contenu prérendu.
- **Atténuation provisoire :** conserver `script-src-attr 'none'`, éviter toute donnée non fiable dans `set:html`/`innerHTML` et maintenir la sanitation.
- **Note faux positif / portée :** aucun XSS applicatif direct n'a été démontré dans le moteur de recherche du blog ; ses champs éditoriaux sont échappés avant `innerHTML`. Le risque est une réduction de défense en profondeur.
- **Critère de clôture :** CSP sans `'unsafe-inline'` pour les scripts en production et test navigateur sans violation inattendue.

### SEC-08 — Chaîne de confiance IP incohérente avec l'infrastructure réelle

- **Rule ID :** PROXY-001
- **Sévérité :** Moyenne, potentiellement Haute selon la valeur réellement transmise
- **Statut :** Conditionnel à vérifier en production
- **Emplacement :** `src/lib/http.ts:5-42`, configuration Cloudflare/Vercel externe
- **Preuve :** le code affirme que le site n'est pas derrière Cloudflare et ne lit que `x-vercel-forwarded-for`. Les réponses publiques contiennent simultanément `Server: cloudflare`, `CF-Ray` et `X-Vercel-Id`.
- **Impact :** si Vercel voit l'IP de l'edge Cloudflare plutôt que celle du visiteur, plusieurs utilisateurs partagent la même clé de quota et peuvent se bloquer mutuellement. Si une origine reste accessible directement ou si la chaîne n'écrase pas les en-têtes comme prévu, une clé peut être contournable.
- **Correction recommandée :** journaliser temporairement des empreintes non réversibles des en-têtes proxy, vérifier le chemin Cloudflare → Vercel, verrouiller l'origine et définir une seule source IP de confiance.
- **Atténuation provisoire :** appliquer les limites à la fois chez Cloudflare et dans l'application, avec des clés complémentaires compte/IP.
- **Note faux positif / portée :** la présence de Cloudflare ne prouve pas que l'IP applicative est erronée ; seule une observation côté fonction Vercel peut trancher.
- **Critère de clôture :** test avec deux réseaux clients montrant deux clés distinctes, test d'en-tête forgé et documentation d'architecture mise à jour.

### SEC-09 — Endpoints auxiliaires trop permissifs et erreurs trop détaillées

- **Rule ID :** API-001
- **Sévérité :** Faible
- **Statut :** Confirmé
- **Emplacement :** `src/pages/api/indexnow.ts:44-73`, `src/pages/api/change-password.ts:99-113`, `src/pages/auth/create-association.ts:13-28`
- **Preuve :** IndexNow est déclenchable en GET sans secret et renvoie le message d'exception ; le changement de mot de passe renvoie une erreur amont concaténée ; plusieurs champs association n'ont pas de longueur maximale.
- **Impact :** appels externes inutiles, fuite mineure de détails et consommation de ressources/stockage.
- **Correction recommandée :** protéger IndexNow par un secret de cron, POST uniquement et réponse générique ; mapper les erreurs Supabase ; valider schéma, type et taille de tous les champs.
- **Atténuation provisoire :** quotas WAF et journalisation des appels.
- **Note faux positif / portée :** le middleware applique déjà un quota générique ; le risque reste limité si l'endpoint IndexNow ne trouve aucun sitemap au runtime.
- **Critère de clôture :** GET 405, POST non signé 401/403, erreurs externes absentes des réponses et tests de bornes.

## 5. Audit SEO

### SEO-01 — `noindex` déclaré mais non transmis

**Sévérité : Haute.** `Layout.astro:17-45` déclare `noindex`, mais l'omet lors de la déstructuration et ne le transmet pas à `BaseHead` (`Layout.astro:92-102`). `BaseHead.astro:40-65` ne possède pas cette propriété. Enfin, `SEOHead.astro:109-115` peut produire un `robots noindex`, tout en forçant toujours `googlebot` et `bingbot` à `index, follow`.

La production confirme le défaut : `/connexion` et `/404/` renvoient `index, follow`. Le `robots.txt` interdit déjà les pages auth, mais un moteur bloqué par `robots.txt` ne peut pas lire une future balise `noindex` ; Google le documente explicitement dans ses [spécifications robots meta](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

**Recommandation :** ajouter `noindex` aux Props de bout en bout, rendre les directives par bot cohérentes, poser `X-Robots-Tag: noindex, nofollow` sur les routes SSR privées et revoir la combinaison avec `robots.txt`.

### SEO-02 — Explosion de pages de tags à faible valeur

**Sévérité : Haute.** Le build contient 80 pages de tags pour seulement 33 articles. Répartition observée : 56 tags avec un seul article, 9 avec deux, 7 avec trois. `src/pages/blog/tag/[tag].astro:27-57` génère une page pour chaque tag sans seuil éditorial, et toutes sont indexables et présentes dans le sitemap.

Il ne s'agit pas d'une « pénalité thin content » automatique. Le problème est la dilution du maillage, la multiplication de pages très proches et le gaspillage du budget de crawl.

**Recommandation :** définir une taxonomie contrôlée, fusionner synonymes/variantes, rendre indexables uniquement les thèmes stratégiques disposant d'un contenu distinct, mettre les autres en `noindex,follow` ou les rediriger, et les retirer du sitemap.

### SEO-03 — Hiérarchie sémantique incohérente

**Sévérité : Moyenne.** L'analyse des 139 HTML générés montre :

- `/blog` sans `<h1>` ;
- 28 pages d'articles avec deux `<h1>` : le template en rend un à `src/pages/blog/[...slug].astro:163` et le MDX commence aussi par un titre niveau 1 ;
- des pages avec deux `<main>`, par exemple les tags (`src/pages/blog/tag/[tag].astro:134`) et plusieurs pages légales (`src/pages/legal/politique-de-confidentialite.astro:18`), imbriqués dans le `<main>` de `Layout.astro:121` ;
- un identifiant `main-content` dupliqué sur les pages de tags.

**Recommandation :** le layout doit posséder l'unique `<main>` ; les pages imbriquées utilisent `<div>` ou `<section>`. Ajouter un `<h1>` au blog et retirer les `#` des fichiers MDX lorsque le template rend déjà le titre.

### SEO-04 — Deux variantes d'URL répondent 200

**Sévérité : Moyenne.** En production, `/blog` et `/blog/` renvoient le même HTML (150 981 octets, même empreinte), tout comme `/blog/ia` et `/blog/ia/`. Le canonical sans slash aide à consolider, mais les caches divergent : la variante sans slash reçoit le cache long configuré, la variante slash reçoit `max-age=0, must-revalidate`.

**Recommandation :** choisir une politique globale (`trailingSlash: 'never'` ou `'always'`) et rediriger en 308 l'autre variante avant cache. Tester pages, sitemap, canonical et liens internes.

### SEO-05 — Titres et descriptions tronqués dans le code

**Sévérité : Moyenne.** `src/components/SEO/SEOHead.astro:33-41` coupe physiquement le titre à 65 caractères et la description à 160 avec `...`, puis réutilise la valeur amputée pour Open Graph et Twitter.

**Impact :** perte de mots porteurs de sens et aperçus sociaux artificiellement tronqués. Les moteurs choisissent déjà leur découpe selon l'appareil et la requête.

**Recommandation :** valider les longueurs au moment éditorial, conserver le texte complet dans le HTML et utiliser des champs sociaux dédiés si nécessaire.

### SEO-06 — Faux signal de fraîcheur dans les données structurées

**Sévérité : Faible à Moyenne.** `src/components/SEO/SchemaOrg.astro:295-309` fixe `dateModified` à la date de chaque build pour toutes les pages WebPage, même sans modification éditoriale.

**Recommandation :** prendre la date Git/frontmatter/CMS réelle, ou omettre le champ lorsqu'elle n'est pas connue. Ajouter une validation JSON-LD sur un échantillon de gabarits.

### Points SEO positifs

- titres, descriptions et canonical présents sur les 139 pages générées ;
- sitemap et `robots.txt` générés et validés par les invariants de build ;
- données structurées échappées avec une fonction dédiée ;
- pages article reliées par leurs URLs, flux RSS présent et documentation `llms.txt` générée ;
- images statiques inspectées avec attribut `alt` et dimensions.

## 6. Performance et optimisation

### PERF-01 — Index du blog trop volumineux

**Sévérité : Moyenne.** `/blog` pèse 150 981 octets HTML brut, soit la plus grosse page générée. Les 33 articles sont sérialisés dans `allArticlesForSearch` (`src/pages/blog/index.astro:62-74`) et la pagination est entièrement cliente (`src/pages/blog/index.astro:267-405`). Seuls cinq articles sont affichés par page, mais l'ensemble des données et du code est livré immédiatement.

**Recommandation :** créer des URLs de pagination statiques ou serveur, conserver des liens crawlables, et charger un index JSON compact uniquement au focus de la recherche. Mesurer après correction le HTML, le JS, le LCP et l'INP.

### PERF-02 — Service worker mis en cache 30 jours

**Sévérité : Moyenne.** `vercel.json:105-110` sert `/sw.js` avec `public, max-age=2592000`, confirmé en production. Un service worker est un composant de contrôle et de mise à jour, pas un asset versionné immuable.

**Recommandation :** utiliser `Cache-Control: no-cache, max-age=0, must-revalidate` pour `sw.js` et conserver le cache immutable uniquement pour les assets nommés par hash. Tester une mise à jour de version de bout en bout.

### PERF-03 — Coût de génération et de crawl

**Sévérité : Moyenne.** Les 139 fichiers HTML représentent environ 7,88 Mo non compressés, moyenne 56,7 Ko. Une part significative vient des 80 pages de tags et des schémas Organization/Website répétés.

**Recommandation :** réduire le nombre de pages de tags, limiter les graphes JSON-LD aux nœuds utiles et suivre la taille d'artefact en CI avec un budget.

### PERF-04 — Bundle et configuration de minification à clarifier

**Sévérité : Faible.** Le plus gros JS généré mesure 185 260 octets non compressés. Lighthouse ne signale pas de JS/CSS inutilisé significatif sur l'accueil. En revanche, le build avertit que les options `esbuild` sont ignorées quand OXC est actif ; `drop: ['debugger']`, `treeShaking` et `legalComments` ne sont donc pas garanties comme le commentaire l'annonce (`astro.config.mjs:252-269`).

**Recommandation :** conserver une seule chaîne de minification, configurer l'équivalent OXC ou retirer la configuration morte, puis ajouter une assertion sur les `debugger` dans l'artefact.

### Points performance positifs

- Lighthouse Performance 95–97 sur l'accueil, CLS nul ;
- CSS critique sous le seuil de 8 Ko et chargement asynchrone vérifiés par invariant ;
- polices Inter auto-hébergées et préchargées ;
- assets Astro hashés avec cache immutable ;
- aucune source map publique détectée ;
- service worker excluant les routes auth, dashboard et API de son cache de pages.

## 7. Accessibilité, qualité et bonnes pratiques

### A11Y-01 — Les contrôles actuels ne couvrent pas la structure complète

**Sévérité : Moyenne.** Les cinq scans Axe réussissent, mais le test vise surtout les règles WCAG A/AA et filtre les impacts bloquants ; en CI, il est explicitement non bloquant (`tests/e2e/a11y-contrast.spec.ts:21-28`, `103-120`). Lighthouse 100 sur l'accueil ne détecte pas les deux `<main>` des autres gabarits ni le double `<h1>` éditorial.

**Recommandation :** ajouter des assertions sitewide : exactement un `<main>`, exactement un `<h1>`, IDs uniques, libellés/formulaires, navigation clavier et focus. Faire échouer la CI sur toute nouvelle violation sérieuse/critique après création d'une baseline explicite.

### QA-01 — Suite E2E obsolète

**Sévérité : Moyenne.** Le run complet échoue sur trois URLs supprimées : `/legal/cgv`, `/legal/parrainage`, `/legal/exoneration`. `tests/e2e/legal-pages.spec.ts:25-34` les attend toujours. Les commentaires du test décrivent également un ancien `<h1>` global qui n'existe plus.

**Recommandation :** dériver la liste depuis les routes ou une fixture centrale, décider si ces URLs doivent être redirigées ou rester 404, puis rendre le run E2E complet bloquant.

### QA-02 — Formatage non fiable et dette de warnings

**Sévérité : Moyenne.** `npm run format:check` échoue et n'est pas exécuté dans le job `verify`. ESLint passe avec 33 avertissements, dont le paramètre `windowMs` inutilisé qui signale précisément le défaut SEC-02. Astro remonte 22 suggestions et des dépréciations de configuration de contenu.

**Recommandation :** corriger le parseur/formatage, ajouter `format:check` en CI, définir un budget de warnings décroissant et convertir les avertissements de sécurité en erreurs.

### QA-03 — Couverture insuffisante des chemins sensibles

**Sévérité : Moyenne.** Aucun test unitaire ciblé ne couvre le rate limiter, la révocation, les mutations de profil, les rôles/RBAC ou la dégradation Upstash/Supabase. La CI exécute le build, les invariants, le lint, un test de contraste et gitleaks, mais pas la suite E2E complète.

**Recommandation :** prioriser les tests de sécurité et de session avant d'augmenter la couverture cosmétique. Ajouter des tests de contrat pour les statuts 401/403/405/429 et des scénarios multi-session.

### Bonnes pratiques déjà en place

- authentification serveur fondée majoritairement sur `getUser()` et helpers de rôle centralisés ;
- cookies Supabase `HttpOnly`, `Secure` en production et `SameSite=Lax` ;
- contrôles de type, taille et signature magique sur les uploads ;
- en-têtes HSTS, anti-framing, `nosniff`, Permissions Policy et Referrer Policy ;
- nonce CSP sur les routes SSR ;
- échappement défensif des îlots JSON/JSON-LD ;
- gitleaks sur l'historique complet et fichiers `.env` ignorés ;
- invariants exécutés sur l'artefact réellement produit.

## 8. Feuille de route 30/60/90 jours

### Jours 0–30 — Réduction du risque

- traiter SEC-01 à SEC-06 ;
- corriger l'indexation, les H1/main et les redirections slash ;
- remettre la suite E2E et Prettier au vert ;
- ajouter alertes 429/401/403, erreurs Upstash et changements d'identité ;
- mesurer l'IP côté fonction derrière Cloudflare sans journaliser de donnée personnelle brute.

### Jours 31–60 — Performance et crawl

- refondre taxonomie et pagination du blog ;
- corriger le cache du service worker ;
- mettre en place budgets HTML/JS et tests sur plusieurs gabarits ;
- nettoyer les configurations Astro/OXC obsolètes et les 33 warnings ESLint.

### Jours 61–90 — Durcissement continu

- migrer la CSP statique vers hashes/nonces ;
- étendre les tests d'autorisation et de dégradation ;
- centraliser validation des entrées et réponses d'erreur ;
- lancer un test d'intrusion authentifié ciblé sur Supabase/RLS, uploads, rôles admin/modérateur et workflows multi-session ;
- intégrer des données terrain Core Web Vitals via CrUX/RUM avec consentement conforme.

## 9. Critères de réussite globaux

L'audit pourra être considéré comme clôturé lorsque :

1. aucun avis haute/critique non accepté n'est présent dans les dépendances de production ;
2. les quatre scénarios P0 disposent de tests automatisés ;
3. toutes les pages indexables ont un canonical unique, un `<h1>`, un `<main>` et une valeur éditoriale démontrable ;
4. les pages non indexables émettent une directive cohérente visible des crawlers ;
5. toutes les variantes slash redirigent vers une URL unique ;
6. build, typecheck, lint, format, invariants et E2E sont verts en CI ;
7. `sw.js` se met à jour immédiatement après déploiement ;
8. la chaîne Cloudflare → Vercel → application et la source d'IP de confiance sont documentées et testées.

## 10. Limites de l'audit

- Aucun compte admin, modérateur, bénévole ou association n'a été utilisé ; les parcours authentifiés n'ont pas été testés de bout en bout.
- Les politiques Supabase RLS, les fonctions SQL, les sauvegardes et la configuration des projets Supabase/Vercel/Cloudflare n'étaient pas accessibles.
- Aucun DAST intrusif, scan de ports, fuzzing agressif, tentative de contournement WAF ou exploitation n'a été réalisé.
- Lighthouse est une mesure laboratoire ponctuelle ; aucune donnée utilisateur réelle Core Web Vitals n'a été analysée.
- Les variables d'environnement ont été contrôlées uniquement par présence, sans afficher ni valider leurs valeurs. Upstash et les secrets cron n'étaient pas présents dans l'environnement local ; cela ne prouve pas leur absence en production.
- Les sondes live reflètent l'état observé le 5 août 2026 et peuvent évoluer indépendamment du commit local.

## 11. Addendum SEO et validation de production — 5 août 2026

Cet addendum remplace les constats SEO historiques lorsqu'ils décrivent un état antérieur à la remédiation.

### Corrections livrées

- ajout de l'endpoint conventionnel `https://biscuits-ia.com/sitemap.xml`, sous forme d'index XML vers `sitemap-0.xml` ;
- mise à jour de `robots.txt`, du `<link rel="sitemap">`, de `llms.txt` et de `llms-full.txt` vers l'URL conventionnelle ;
- maintien de `sitemap-index.xml` pour compatibilité, sans l'inclure comme page à indexer ;
- cache explicite d'une heure avec revalidation pour les fichiers robots et sitemap ;
- correction de la redirection `www.biscuits-ia.com`, auparavant envoyée vers le domaine `.fr` non résolu : elle renvoie désormais un `308` vers `https://biscuits-ia.com/` ;
- suppression de deux liens internes vers `/atelier` qui provoquaient une redirection vers `/services` ;
- correction du double `<h1>` et des octets NUL dans l'article `kit-protection-association-arnaque-ia` ;
- ajout d'un invariant de build interdisant les octets NUL dans les sources et les artefacts texte.

### Preuves après déploiement

| Contrôle | Résultat |
|---|---|
| Déploiement Vercel | `dpl_EhwSV2McJcnkpKQSqHLH55twXrCD`, état `READY`, cible production |
| Alias principal | `https://biscuits-ia.com` |
| `robots.txt` | HTTP 200, `text/plain`, référence `https://biscuits-ia.com/sitemap.xml` |
| `sitemap.xml` | HTTP 200, `application/xml`, référence `sitemap-0.xml` |
| `sitemap-index.xml` et `sitemap-0.xml` | HTTP 200, `application/xml` |
| RSS, `llms.txt`, `llms-full.txt` | HTTP 200 avec types MIME cohérents |
| Crawl complet du sitemap | 68 URL, 68 réponses HTTP 200, aucun `noindex`, aucun canonical divergent |
| Domaine `www` | HTTP 308 vers le domaine canonique |
| Article corrigé | exactement un `<h1>` |
| Logs Vercel après contrôle | aucune erreur remontée sur le déploiement |

### Points externes restant à traiter

- `biscuits-ia.fr` et `www.biscuits-ia.fr` utilisent les DNS d'o2switch mais ne résolvent pas correctement. La zone DNS doit être corrigée chez o2switch avant d'en faire un alias ou une redirection fiable.
- Cloudflare ajoute sa politique « Managed Content » au début de `robots.txt`. La recherche classique reste autorisée, mais certaines règles de robots IA contredisent celles de l'application. La politique Cloudflare doit être alignée avec la stratégie éditoriale voulue.
- Après stabilisation, soumettre `https://biscuits-ia.com/sitemap.xml` dans Google Search Console et Bing Webmaster Tools, puis surveiller les pages découvertes, indexées et exclues.

---

**Action SEO issue de cette étape :** corriger le DNS `.fr` chez o2switch, puis versionner et pousser les changements locaux afin que le dépôt Git reste la source de vérité du déploiement.

## 12. Retrait d'Upstash et périmètre Cloudflare — 5 août 2026

- les dépendances directes `@upstash/ratelimit` et `@upstash/redis` ont été supprimées ;
- `npm ls @upstash/redis @upstash/ratelimit` ne retourne aucun paquet installé ;
- les variables `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` ont été retirées du modèle d'environnement et sont absentes du projet Vercel ;
- le rate limiting fonctionne désormais avec une Map locale bornée, sans appel réseau ni mode de panne lié à Redis ;
- le code actif et la configuration Astro ne dépendent pas de Cloudflare ; son usage est limité à l'infrastructure DNS et au sous-domaine concerné ;
- la source IP applicative reste exclusivement celle imposée par Vercel.
- la version sans Upstash a été déployée en production sous `dpl_GxciJJrB3cHUtJUiLBGtFWb9aamf` (`READY`) ; l'accueil répond en 200, une API protégée en 401 et le sitemap en 200, sans erreur runtime observée.

### Configuration réseau à conserver

Un sous-domaine utilise volontairement Cloudflare. Les nameservers `demi.ns.cloudflare.com` et `marvin.ns.cloudflare.com` doivent donc être conservés. Cela n'impose pas que le site principal traverse le proxy : Cloudflare peut rester le fournisseur DNS de toute la zone tout en appliquant le proxy uniquement au sous-domaine qui en a besoin.

**Configuration recommandée :** conserver le proxy actif sur le sous-domaine concerné ; placer les entrées de `biscuits-ia.com` et `www` en mode « DNS uniquement » lorsqu'elles pointent vers Vercel ; conserver les enregistrements MX/SPF/DKIM/DMARC et ne pas modifier les nameservers du domaine.
