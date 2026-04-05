# Audit — Biscuits IA

**Date :** 5 avril 2026  
**Périmètre :** Code source complet (Astro 6 + Svelte 5 + Tailwind 4 + Vercel)  
**Statut global :** Bases solides, plusieurs points critiques à corriger avant de considérer le site production-ready.

---

## Table des matières

1. [Analyse de la base de code](#1-analyse-de-la-base-de-code)
2. [Analyse des performances](#2-analyse-des-performances)
3. [Analyse SEO](#3-analyse-seo)
4. [Analyse sécurité](#4-analyse-sécurité)
5. [Identité de l'association — communication du projet](#5-identité-de-lassociation--communication-du-projet)
6. [Conformité légale (droit français et européen)](#6-conformité-légale-droit-français-et-européen)

---

## 1. Analyse de la base de code

### Points positifs

- Architecture Astro claire : séparation layouts / components / pages / content bien respectée.
- Alias `@/` vers `src/` configuré dans `tsconfig.json`, utilisé de manière cohérente partout.
- `src/config.ts` centralise correctement le nom du site, les URLs et la navigation.
- Collection de contenu blog typée via Zod (`src/content.config.ts`).
- Svelte uniquement utilisé là où c'est justifié (composant interactif CookieConsent).

### Problèmes à corriger

#### Données de test / placeholders laissés en production

`src/components/SEO/SchemaOrg.astro` contient des données fictives copiées depuis un template et jamais remplacées :

| Champ | Valeur actuelle (fausse) | Valeur correcte |
|---|---|---|
| `telephone` | `"+33-X-XX-XX-XX-XX"` | `"+33952587543"` |
| `address.streetAddress` | `"Votre adresse"` | `"2 B RUE de la Cueille Mirebalaise, Appt 4"` |
| `address.addressLocality` | `"Votre ville"` | `"Poitiers"` |
| `address.postalCode` | `"XXXXX"` | `"86000"` |
| `geo.latitude/longitude` | `48.8566 / 2.3522` (Paris) | Coordonnées de Poitiers |
| `description` | `"Expert en IA pour entreprises…"` | Description de l'association |
| `slogan` | `"L'expertise IA pour votre entreprise"` | Slogan de l'association |
| `email (ventes)` | `"ventes@biscuits-ia.com"` | À supprimer (association, pas entreprise) |
| `foundingDate` | `"2024"` | Année réelle de création |
| `founders[0].name` | `"Fondateur Biscuits IA"` | `"Alexis Gallard"` |
| `aggregateRating` | `"5"` / `"50 avis"` | À supprimer (faux avis = pratique trompeuse) |
| `sameAs` | URLs facebook/twitter/linkedin fictives | Seuls les réseaux réels (Discord, GitHub) |
| `numberOfEmployees` | `"1-10"` | Remplacer par `numberOfMembers` (c'est une association) |
| `@type` | `"Organization"` | `"NGO"` est plus précis pour une asso Loi 1901 |

Le `SearchAction` du websiteSchema pointe vers `/recherche` — cette page n'existe pas. Supprimer ce bloc.

#### Typo dans la meta description de la homepage

`src/pages/index.astro` : `"Acompagnement pédagogique…"` — il manque un "c" : **"Accompagnement"**.

#### Titre SEO de "Rejoignez-nous" incomplet

`src/pages/rejoignez-nous.astro` : title = `"Rejoignez-nous"` sans mention de la marque. Préférer `"Rejoindre Biscuits IA | Association pour une IA accessible"`.

#### Ressources référencées mais inexistantes

- `/atom.xml` référencé dans `SEOHead.astro` — la page n'existe pas (seule `/rss.xml` existe).
- `/browserconfig.xml` référencé dans SEOHead — absent du dossier `public/`.
- `og-default.webp` utilisé comme fallback OG image — vérifier sa présence dans `public/`.

#### Double preconnect vers GTM

`Layout.astro` et `SEOHead.astro` ajoutent tous les deux des `<link rel="preconnect">` vers `googletagmanager.com`. Dédupliquer pour éviter du HTML redondant.

#### `article:publisher` pointe vers Facebook

`SEOHead.astro` : balise `article:publisher` avec `https://www.facebook.com/biscuitsIA` — si le compte Facebook n'existe pas, cette balise est invalide. Remplacer par l'URL du site ou supprimer.

---

## 2. Analyse des performances

### Points positifs

- CSS critique inliné dans le `<head>` → bon First Contentful Paint.
- GTM chargé uniquement après consentement → bon Total Blocking Time sans consentement.
- `output: 'static'` → génération HTML statique, zéro server-side rendering inutile.
- `build.inlineStylesheets: 'auto'` → petits CSS inlinés automatiquement.
- `client:idle` sur CookieConsent → composant Svelte chargé après TTI.
- `@media (prefers-reduced-motion)` implémenté dans le layout global.

### Points à améliorer

#### Google Fonts — requête potentiellement bloquante

`Layout.astro` charge la police via `fonts.googleapis.com`. Ce chargement peut pénaliser le LCP.

**Recommandations :**
- Ajouter `&display=swap` dans l'URL Google Fonts si absent.
- Pour supprimer la dépendance externe : héberger la police en local via `fontsource` ou `@astrojs/fonts`.

#### Animations Hero non visibles sans JS

Le Hero utilise `opacity-0` avec animations déclenchées via classes JS. Sans JavaScript activé, le H1 reste invisible. Ajouter `animation-fill-mode: forwards` en CSS ou un fallback `<noscript>`.

#### Images hors-écran

Vérifier que les images dans les sections sous la fold utilisent `loading="lazy"`. Astro le gère pour `<Image />` mais pas pour les balises `<img>` HTML natives éventuelles.

---

## 3. Analyse SEO

### Points positifs

- `SEOHead.astro` complet : meta robots, Open Graph, Twitter Cards, hreflang, canonical.
- Sitemap XML généré automatiquement avec filtre sur `/admin`, `/api`, `/login`.
- `robots.txt` généré avec règles différenciées Googlebot / wildcard.
- Schema.org JSON-LD sur toutes les pages.
- Fil RSS fonctionnel (`/rss.xml`).
- Troncature des titres (60 car.) et descriptions (155 car.) dans SEOHead.

### Points à corriger

#### Données structurées invalides (impact direct sur les rich snippets)

Voir section 1 — les données fictives dans `SchemaOrg.astro` risquent de :
- Faire échouer la validation Google Rich Results Test.
- Générer des pénalités pour informations trompeuses (faux avis notamment).

#### `@type: "Organization"` non adapté pour une association

Pour une association Loi 1901, utiliser `"NGO"` (sous-type d'`Organization` dans Schema.org) est plus précis et mieux compris des moteurs de recherche.

#### hreflang fr-CA, fr-BE, fr-CH probablement inutiles

Le site cible une audience francophone en France. Ces balises génèrent des signaux contradictoires si le contenu n'est pas localisé pour ces marchés. Simplifier à `fr` et `fr-FR` uniquement.

#### Fil Atom inexistant référencé dans SEOHead

Balise `<link rel="alternate" type="application/atom+xml">` pointant vers `/atom.xml` qui n'existe pas. Supprimer cette ligne.

#### Pages `/login` et `/register` sans noindex

Le filtre du sitemap exclut ces pages, mais elles n'ont pas de balise `noindex`. Ajouter `noindex: true` dans les props de Layout de ces deux pages.

---

## 4. Analyse sécurité

### Points positifs

- En-têtes de sécurité complets dans `vercel.json` : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS 1 an avec subdomains.
- HTTPS forcé via HSTS.
- GTM conditionnel au consentement → pas de tracking sans accord utilisateur.
- Renouvellement automatique du consentement cookie après 13 mois (conforme CNIL).

### Points à corriger

#### CSP trop permissive — directives dangereuses

Le `Content-Security-Policy` dans `vercel.json` autorise `'unsafe-inline'` et une directive qui permet l'exécution de chaînes de caractères comme du code.

- `'unsafe-inline'` neutralise une grande partie de la protection XSS offerte par la CSP.
- La directive d'exécution dynamique de code est un vecteur d'attaque XSS avancé — à supprimer si possible.

**Recommandations :**
- Auditer si GTM nécessite réellement ces directives permissives (souvent non avec les configurations modernes).
- Remplacer `'unsafe-inline'` par des nonces CSP — Astro et Vercel supportent les nonces.
- Documenter pourquoi ces directives sont maintenues si elles sont indispensables.

#### Pas de vérification CSRF côté frontend

Les formulaires ContactForm et RecruitmentForm soumettent vers un backend Laravel. Vérifier que :
- Le backend Laravel utilise bien ses tokens CSRF.
- Les requêtes fetch côté frontend incluent le token CSRF dans les headers.

#### `Permissions-Policy` incomplète

La politique actuelle couvre `geolocation`, `microphone`, `camera`. Envisager d'ajouter :
```
payment=(), usb=(), serial=(), bluetooth=()
```

#### GTM peut charger des scripts tiers arbitraires

GTM, une fois autorisé, peut injecter n'importe quel script, contournant partiellement la CSP. Auditer régulièrement les tags configurés dans GTM.

---

## 5. Identité de l'association — communication du projet

### Ce qui fonctionne bien

- Les pages `nos-missions`, `pourquoi-biscuits-ia` et `atelier-ia` communiquent clairement et avec un ton authentique la mission : accessibilité de l'IA, gratuité par principe, autonomie des bénéficiaires, lutte contre les arnaques numériques.
- Le ton est humain, sans jargon, adapté au public visé (associations, TPE, collectivités).
- La page `pourquoi-biscuits-ia` structure bien les engagements et le processus de travail.
- Les pages `/combats/` illustrent concrètement les valeurs de l'association.

### Incohérences à corriger

#### Schema.org décrit une entreprise commerciale, pas une association

Le fichier `SchemaOrg.astro` utilise le vocabulaire d'une entreprise de consulting :
- Description : "Expert en Intelligence Artificielle pour entreprises. Formation, consulting et solutions IA sur mesure." — en contradiction totale avec la mission associative.
- Slogan : "L'expertise IA pour votre entreprise".
- Un contact "ventes" impliquant une activité commerciale.
- Un tarif `"priceRange": "€€€"`.
- Des horaires d'ouverture 9h-18h lundi-vendredi.

Ces données sont indexées par Google. Un visiteur qui tombe sur une fiche Knowledge Panel lira "Expert IA pour entreprises" alors que le site affirme être une association gratuite d'intérêt général. C'est une incohérence majeure qui nuit à la crédibilité.

#### Le statut associatif n'est pas visible immédiatement en homepage

La hero section est accrocheuse mais le mot **"association"** n'apparaît pas dans les premières secondes. Un visiteur pourrait croire à un service commercial. Ajouter une mention courte sous le H1 : _"Association Loi 1901 — accès libre et gratuit"_.

#### Footer sans mention du statut juridique

Le footer ne mentionne pas le statut d'association ni le RNA. Ajouter : `Association Loi 1901 · RNA W863012707`.

---

## 6. Conformité légale (droit français et européen)

### Ce qui est en place

- **Mentions légales** : éditeur, hébergeur, propriété intellectuelle, responsabilité, données personnelles, droit applicable — structure conforme à la LCEN (art. 6).
- **Politique de confidentialité** : responsable du traitement identifié, données listées, finalités, base légale RGPD (art. 6(1)(b) et (f)), destinataires, durées de conservation, droits des personnes (accès, rectification, effacement, opposition, limitation, portabilité), transferts hors UE avec CCT, recours CNIL.
- **Politique cookies** : distinction cookies nécessaires / analytiques, consentement requis pour GTM/GA, gestion via CookieConsent, renouvellement 13 mois.
- **Consentement cookie** : opt-in avant chargement de GA et Vercel Speed Insights — conforme aux exigences CNIL.

### CRITIQUE — Obligations légales non remplies

#### SIRET manquant dans les mentions légales

```
SIRET: [TODO: COMPLÉTER AVEC LE NUMÉRO COMPLET À 14 CHIFFRES]
```

La LCEN (art. 6, III) impose la mention du numéro d'immatriculation pour toute personne morale exerçant une activité. Si l'association a un SIRET, son absence constitue une infraction. **À compléter immédiatement.**

#### Délai de réponse aux demandes RGPD non mentionné

Le RGPD (art. 12) exige d'informer les personnes du **délai de réponse d'un mois** (prorogeable de deux mois) à leurs demandes d'exercice des droits. La politique de confidentialité liste les droits mais omet ce délai.

**À ajouter dans la section 8 "Vos droits" :**

> Nous nous engageons à répondre à toute demande dans un délai d'un mois à compter de la réception. Ce délai peut être prorogé de deux mois supplémentaires en cas de demandes complexes ou nombreuses.

#### Droit de définir des directives post-mortem absent

La loi Informatique et Libertés française (art. 85, modifié par la loi n° 2016-1321 pour une République numérique) oblige à informer les personnes de leur droit de définir des **directives relatives au sort de leurs données après leur décès**.

**À ajouter dans la section 8 :**

> **Directives post-mortem :** conformément à la loi Informatique et Libertés, vous pouvez définir des directives relatives à la conservation, l'effacement et la communication de vos données personnelles après votre décès.

#### Retrait du consentement aussi facile que son octroi — formulation absente

Le RGPD (art. 7(3)) exige de rappeler explicitement que le retrait du consentement est **aussi facile** que son octroi. Ajouter cette formule dans la politique cookies et dans le bandeau de consentement.

### Points à améliorer

#### Cookie policy — noms des cookies GA4 incomplets

La politique cookies mentionne `_ga`, `_gid`, `_gat` (héritage de GA Universal). Google Analytics 4 utilise désormais `_ga_XXXXXXXXXX` (avec l'ID de mesure). Mettre à jour la liste avec les noms exacts de vos cookies GA4.

#### Lien vers la politique cookies absent du bandeau de consentement

`CookieConsent.svelte` ne contient pas de lien vers `/legal/cookies` dans le texte du bandeau. Les recommandations CNIL préconisent un accès direct depuis le bandeau. Ajouter un lien `En savoir plus` pointant vers la politique cookies.

#### Adresse IP — précision à apporter dans la politique de confidentialité

Mentionner que l'IP est transmise à Cloudflare et potentiellement à Google Analytics, et que GA4 anonymise les adresses IP par défaut.

---

## Résumé des priorités

| Priorité | Problème | Fichier |
|---|---|---|
| Urgent | SIRET manquant (obligation légale LCEN) | `mentions-legales.astro` |
| Urgent | Données fictives dans Schema.org (faux avis, fausse adresse, coordonnées Paris) | `SchemaOrg.astro` |
| Urgent | Schema.org décrit une entreprise commerciale — contradiction totale avec la mission | `SchemaOrg.astro` |
| Important | Délai de réponse droits RGPD manquant (obligation RGPD art. 12) | `confidentialite.astro` |
| Important | Droit post-mortem manquant (obligation loi IEL art. 85) | `confidentialite.astro` |
| Important | Lien politique cookies absent du bandeau consentement (recommandation CNIL) | `CookieConsent.svelte` |
| Important | CSP avec directives trop permissives | `vercel.json` |
| Important | Statut associatif peu visible en homepage et footer | `index.astro`, `Footer.astro` |
| Mineur | Typo "Acompagnement" dans la meta description | `pages/index.astro` |
| Mineur | `/atom.xml` et `/browserconfig.xml` référencés mais absents | `SEOHead.astro` |
| Mineur | Double preconnect GTM | `Layout.astro` + `SEOHead.astro` |
| Mineur | hreflang fr-CA, fr-BE, fr-CH inutiles | `SEOHead.astro` |
| Mineur | Noms cookies GA4 incomplets dans la politique cookies | `cookies.astro` |
| Mineur | Google Fonts sans `display=swap` explicite | `Layout.astro` |
