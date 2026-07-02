# Memoires de projet - Améliorations Biscuits IA (2026-07-02)

## Positionnement global

### ✅ Refonte du Hero
- **Fichier modifié** : `src/components/Hero.astro`
- **Message change** : "Automatisez vos tâches avec l'IA, spécialement pour les associations"
- **Sous-titre** : "Gagnez 10h/mois sur l'administratif, automatiser les relances, et simplifiez le quotidien de vos bénévoles"
- **CTA** : "Découvrir les outils" et "Essayer gratuitement"

### ✅ SEO Home
- **Fichier modifié** : `src/pages/index.astro`
- **Titre** : "Biscuits IA | IA simple et gratuite pour les associations"
- **Description** : "Association Loi 1901. Nous aidons les associations et collectivités à automatiser leurs tâches grâce à des outils IA simples, gratuits et prêts à l'emploi."

## Pages créées (Priorité 2)

### ✅ Page "Cas d'usage" (`/cas-d-usage`)
- **Fichier** : `src/pages/cas-d-usage.astro`
- **Contenu** : 6 cas concrets avec structure Problème → Solution → Résultat
- **Catégories** : Gain de temps, Finance, Association, Reporting, Inclusion, Sécurité
- **CTA** : "Découvrir mon cas", "Voir nos services"

### ✅ Page "Pourquoi Biscuits IA ?" (`/pourquoi`)
- **Fichier** : `src/pages/pourquoi.astro`
- **Contenu** : Différenciation claire vs agences, SaaS, startups
- **Sections** : 
  - 6 valeurs différenciantes (open, public, modulaire, etc.)
  - Tableau comparatif pratique (coût, données, source, objectif, support)
- **CTA** : "Parler à un membre", "Voir nos services"

### ✅ Page "À qui s'adresse Biscuits IA ?" (`/a-qui.s-adresse`)
- **Fichier** : `src/pages/a-qui.s-adresse.astro`
- **Contenu** : Publics cibles vs non-publics
- **Publics** : Associations, Collectivités, TPE, Seniors/fragiles
- **Section "Ne fait pas"** : Ce qu'on n'est pas (grande entreprise, SaaS, etc.)
- **CTA** : "Discuter de mon projet", "Voir nos services"

## Navigation & structure

### ✅ Header mis à jour
- **Fichier** : `src/components/Header.astro`
- **Ajout** : Menu "Cas d'usage" en navigation principale
- **Ajout dans Ressources** : Liens vers "Cas d'usage", "Pourquoi Biscuits IA ?", "À qui s'adresse ?"

## Navigation simplifiée

### ✅ Page "Nos Missions" (refonte des offres)
- **Fichier** : `src/pages/nos-missions.astro`
- **Structure** : 3 offres principales
  1. **Outils IA** : Assistants, automatisations, génération de documents
  2. **Accompagnement** : Mise en place, formation, aide aux structures
  3. **Ressources** : Guides, templates, cas d'usage

## Collections Astro

### ✅ Configuration actualisée
- **Fichier** : `src/content.config.ts`
- **Ajout** : Collection `pages` pour les pages en markdown

## Résumé des améliorations

| Priorité | Action | Status |
|----------|--------|--------|
| 1 | Clarifier le positionnement | ✅ Fait |
| 1 | Refondre le hero | ✅ Fait |
| 1 | Simplifier les offres (3 blocs) | ✅ Fait |
| 2 | Ajouter cas concrets | ✅ Fait |
| 2 | Améliorer SEO | ✅ Fait |
| 2 | Améliorer CTA | ✅ Fait |
| 3 | Page Pourquoi Biscuits IA | ✅ Fait |
| 3 | Page Ciblage utilisateur | ✅ Fait |

## URL créées

| URL | Description |
|-----|-------------|
| `/` | Home - Hero refondu, SEO amélioré |
| `/cas-d-usage` | 6 cas concrets avec résultats |
| `/pourquoi` | Différenciation vs agences/SaaS |
| `/a-qui.s-adresse` | Publics cibles vs non-publics |
| `/nos-missions` | 3 offres (Outils, Accompagnement, Ressources) |

## Mots-clés SEO ciblés

- "outil IA pour associations"
- "automatiser une association"
- "IA pour collectivités"
- "gain de temps administration association"
- "outils IA gratuits pour associations"
- "assistant IA bénévoles"
- "automatisation tâches administratives association"
- "service IA public associations"
