# Suppression de l'aide aux victimes interne et ajout d'un annuaire d'associations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer complètement la page d'aide aux victimes interne, le bandeau `VictimHighlight`, le formulaire `VictimForm` et ses styles, et les remplacer par un annuaire d'associations spécialisées (généralistes cyber, mineurs/harcèlement, parents/éducation numérique) sur une page d'orientation qui garde l'URL `/aide-victimes` pour préserver le SEO.

**Architecture:**
- **Conservation SEO** : l'URL `/aide-victimes` reste accessible. C'est une nouvelle page Astro `src/pages/aide-victimes.astro` qui sert d'annuaire d'associations (pas de redirection 301, pas de meta-refresh). Le sitemap, le breadcrumb et les liens internes pointent toujours vers cette URL.
- **Retrait de l'orchestration interne** : suppression du composant `VictimHighlight.astro` (utilisé uniquement sur la home), du composant React `VictimForm.tsx`, de `src/styles/victim-form.css`, et du `kind: 'victime'` dans la route API `/api/contact`.
- **Composant léger de remplacement** : nouveau `src/components/VictimShortNotice.astro` (encart sobre sur la home qui pointe vers la page annuaire). Pas de bandeau rouge agressif : on ne prétend plus offrir d'aide directe.
- **PillarsGrid aligné** : le pilier 2 (lutte contre la cybercriminalité) est recentré sur la sensibilisation/l'orientation, plus l'aide directe.
- **Numéros d'urgence maintenus** : 3018, 17, 3919, 0 805 805 817, PHAROS, 116 006, 119 — ce sont des services publics/étatiques ou des associations nationales, pas de l'aide interne à Biscuits IA.

**Tech Stack:** Astro (statique, `prerender = true`), TypeScript, React (uniquement retiré), composants `.astro`, intégration `astro:content` (intacte).

## Global Constraints

- **Orthographe ASCII française** : tout le site est en français sans accents (`victime`, `harcelement`, `association`, `education`). Les nouvelles entrées (page annuaire, VictimShortNotice, PillarsGrid, articles llms-full) suivent la même convention. Pas d'accents ajoutés, même si la phrase serait plus correcte avec.
- Toutes les pages restent `prerender = true` sauf celles explicitement dynamiques (inchangé).
- Pas de nouvelle dépendance npm.
- Convention kebab-case pour les URLs (`/aide-victimes` conservé) et le français sans accent pour les labels (`Associations d'aide aux victimes`).
- Tout commit de tâche doit inclure un message suivant la convention `refactor: ...` ou `refactor(scope): ...` selon la portée.

---

### Task 1: Cartographier les liens entrants vers `/aide-victimes` (inventaire)

**Files:**
- Read: tous les fichiers listés à l'étape 3 ci-dessous

- [ ] **Step 1:** Exécuter `grep -rn "aide-victimes" src/ public/`.

- [ ] **Step 2:** Vérifier qu'aucun fichier en dehors de `src/` et `public/` ne référence `/aide-victimes` (notamment `docs/`, `scripts/`, `supabase/`, `astro.config.mjs`, `vercel.json`).

- [ ] **Step 3:** Confirmer la liste finale et l'écrire dans le rapport. **Liste attendue** :
  - `src/components/Header.astro:87` (mega-menu desktop)
  - `src/components/Header.astro:151` (mega-menu mobile)
  - `src/components/Footer.astro:22`
  - `src/pages/index.astro:9` (import) et `:43` (usage)
  - `src/pages/anti-pepins.astro:167`
  - `src/pages/piliers/cyber.astro:35` et `:85`
  - `src/pages/public/citoyens.astro:38`, `:89`, `:101`, `:107`, `:138`
  - `src/pages/public/associations.astro:115`
  - `src/pages/llms-full.txt.ts:99-108` (entrée "Aide aux victimes")
  - `public/sitemap.xml:16-20` (entrée sitemap)
  - `src/pages/aide-victimes.astro` (la page elle-même, à réécrire en Task 2)
  - `src/components/VictimHighlight.astro` (à supprimer en Task 4)
  - `src/components/react/VictimForm.tsx` (à supprimer en Task 3)
  - `src/styles/victim-form.css` (à supprimer en Task 3)
  - `src/components/PillarsGrid.astro` (contient une mention "Aide aux victimes" dans le pilier 2, à adapter en Task 13)
  - `src/pages/api/contact.ts` (contient `kind: 'victime'`, à nettoyer en Task 14)

- [ ] **Step 4:** Ne commite rien. Le rapport suffit.

### Task 1b: Retirer le redirect 301 `/aide-victimes` -> `/piliers/cyber` dans vercel.json

**Files:**
- Modify: `vercel.json:321-325`

- [ ] **Step 1:** Supprimer le bloc JSON suivant (lignes 321-325, en comptant bien les virgules pour ne pas casser le tableau) :
  ```json
  ,
  {
    "source": "/aide-victimes",
    "destination": "/piliers/cyber",
    "statusCode": 301
  }
  ```
  Note : si le bloc avant (ligne 316-320) se termine par `,` (ce qui est attendu puisque le bloc suivant est dans le tableau), laisser la virgule ; sinon, l'ajouter au bloc précédent.

- [ ] **Step 2:** Verifier que le JSON est valide : `node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8'))"` doit retourner 0.

- [ ] **Step 3:** Commit :
  ```bash
  git add vercel.json
  git commit -m "fix(vercel): retirer le redirect /aide-victimes pour permettre l'annuaire"
  ```

### Task 1c: Harmoniser public/llms.txt avec la nouvelle page annuaire

**Files:**
- Modify: `public/llms.txt:24, 26, 43`

- [ ] **Step 1:** Ligne 24 : remplacer `- [Mediation numerique](/aide-victimes) : accompagnement gratuit en cas de litige avec un prestataire numerique.` par `- [Annuaire d'associations d'aide aux victimes](/aide-victimes) : France Victimes, e-Enfance, assos specialisees cyber, mineurs et parents.`

- [ ] **Step 2:** Ligne 26 : remplacer `- [Aide aux victimes d'arnaques IA](/aide-victimes) : echange, documentation, orientation vers les autorites competentes.` par `- [Associations specialisees cyber](/aide-victimes) : annuaire des assos qui accompagnent les victimes d'arnaques, harcelement et cybermalveillance.`

- [ ] **Step 3:** Ligne 43 : remplacer `- [Aide aux victimes](https://biscuits-ia.com/aide-victimes) : service de mediation` par `- [Annuaire d'aide aux victimes](https://biscuits-ia.com/aide-victimes) : associations specialisees (France Victimes, e-Enfance, etc.)`.

- [ ] **Step 4:** Optionnel : mettre a jour la date en ligne 4 (`Derniere mise a jour : 2026-06-24.`) a la date du jour.

- [ ] **Step 5:** Commit :
  ```bash
  git add public/llms.txt
  git commit -m "refactor(llms): pointer les 3 liens /aide-victimes vers l'annuaire"
  ```

### Task 2: Remplacer la page d'aide aux victimes par un annuaire d'associations

**Files:**
- Modify: `src/pages/aide-victimes.astro` (réécriture complète)

- [ ] **Step 1:** Réécrire `src/pages/aide-victimes.astro` en page d'orientation listant les associations. Structure obligatoire (ASCII français, pas d'accents) :
  - Hero : `Vous etes victime, voici qui peut vous aider.`
  - Bloc `Numeros d'urgence` (id=`contacts-urgence`) : 3018, 17, 3919, 0 805 805 817, PHAROS, Pre-plainte en ligne, Cybermalveillance.gouv.fr. Ce sont des services publics, pas de l'aide interne.
  - Section 1 — `Associations generalistes cyber/arnaques` :
    - France Victimes — 116 006 (numero gratuit) — aide generale aux victimes, bureaux dans toute la France
    - INAVEM — federation des associations d'aide aux victimes (130 assos locales)
    - AVEC — Aide aux Victimes d'Escroqueries et de Cybermalveillance
    - Cybermalveillance.gouv.fr — diagnostic et assistance (numero 0 805 805 817)
  - Section 2 — `Specialisees mineurs / harcelement` :
    - e-Enfance / 3018 — cyberharcelement, mineurs (numero gratuit, anonyme, 9h-23h)
    - 119 — Allo Enfance en danger (service public, gratuit 24h/24)
    - Action Innocence — protection de l'enfance sur internet
    - Point de Contact — signalement de contenus illicites
  - Section 3 — `Parents / education numerique` :
    - Internet Sans Crainte (CNIL) — programme national d'education numerique des jeunes
    - CNIL Junior — ressources pedagogiques pour les 7-12 ans
    - e-Enfance — guides parents sur les ecrans et reseaux sociaux
    - Action Innocence — sensibilisation en milieu scolaire
  - Section `Ce que Biscuits IA peut encore faire pour vous` :
    - Anti Pepins (analyse immediate d'un SMS, mail ou lien suspect)
    - Ressources et guides pratiques sur `/ressources`
    - Blog : articles sur la detection des arnaques recentes
    - Contact general `/contact?sujet=orientation-victime` (traite par le formulaire de contact standard, pas un service d'urgence)
  - Bloc RGPD en bas de page (meme ton que la page actuelle : confidentialite, pas de revente, lien vers `/legal/confidentialite`).

- [ ] **Step 2:** Conserver `prerender = true`, le `Layout` avec `Breadcrumb`, le `schema` (type `WebPage`) adapte au nouveau contenu. Le `description` de la meta description : `Annuaire d'associations specialisees dans l'aide aux victimes de cybercriminalite, harcelement en ligne et arnaques. Biscuits IA n'accompagne plus directement les victimes, mais refere les structures competentes.`

- [ ] **Step 3:** Ne pas importer `VictimForm`. Pas de section "process" interne. Pas de section "Demander de l'aide" avec formulaire. Aucun `id` ne doit s'appeler `victime-form` ou similaire.

- [ ] **Step 4:** Commit :
  ```bash
  git add src/pages/aide-victimes.astro
  git commit -m "refactor(aide-victimes): transformer la page en annuaire d'assos specialisees"
  ```

### Task 3: Supprimer le composant React `VictimForm` et ses styles

**Files:**
- Delete: `src/components/react/VictimForm.tsx`
- Delete: `src/styles/victim-form.css`

- [ ] **Step 1:** Supprimer les deux fichiers (PowerShell : `Remove-Item`).

- [ ] **Step 2:** Verifier qu'aucun fichier n'importe `@/styles/victim-form.css` (la suppression du composant supprime le seul import connu).

- [ ] **Step 3:** `grep -rn "VictimForm" src/` doit retourner vide. `grep -rn "victim-form" src/` doit retourner vide.

- [ ] **Step 4:** Commit :
  ```bash
  git add -A
  git commit -m "refactor: supprimer le formulaire VictimForm et ses styles (plus utilise)"
  ```

### Task 4: Remplacer le bandeau `VictimHighlight` par `VictimShortNotice` sur la home

**Files:**
- Create: `src/components/VictimShortNotice.astro`
- Modify: `src/pages/index.astro` (import ligne 9, usage ligne 43)
- Delete: `src/components/VictimHighlight.astro`

- [ ] **Step 1:** Creer `src/components/VictimShortNotice.astro`. Contenu :
  - Bandeau sobre avec fond `--color-bg-alt` (pas de rouge agressif), bordure gauche `4px solid #c0392b` (cohérence visuelle avec l'existant).
  - Titre : `Vous etes victime d'une arnaque ou d'un harcelement en ligne ?`
  - Sous-titre : `Biscuits IA n'accompagne plus les victimes en direct, mais nous avons reference les associations specialisees qui peuvent vous aider.`
  - CTA unique : `<a href="/aide-victimes" class="btn-primary">Voir l'annuaire d'associations</a>`
  - Pas d'autre bouton (pas de tel:3018, on n'est plus le point d'entree d'urgence).
  - Style inline (meme approche que `VictimHighlight.astro` actuel : pas de CSS global, pas de dependance).

- [ ] **Step 2:** Dans `src/pages/index.astro` :
  - Ligne 9 : remplacer `import VictimHighlight from '@/components/VictimHighlight.astro';` par `import VictimShortNotice from '@/components/VictimShortNotice.astro';`
  - Ligne 43 : remplacer `<VictimHighlight />` par `<VictimShortNotice />`

- [ ] **Step 3:** Supprimer `src/components/VictimHighlight.astro`.

- [ ] **Step 4:** `grep -rn "VictimHighlight" src/` doit retourner vide.

- [ ] **Step 5:** Commit :
  ```bash
  git add -A
  git commit -m "refactor(home): remplacer VictimHighlight par un encart d'orientation vers l'annuaire"
  ```

### Task 5: Mettre a jour le `Header` (mega-menu)

**Files:**
- Modify: `src/components/Header.astro:87` (mega-item cyber)
- Modify: `src/components/Header.astro:151` (mega-mobile-link)

- [ ] **Step 1:** Ligne 87, remplacer :
  ```astro
  <a href="/aide-victimes" class="mega-item">
    <strong>Aide aux victimes</strong>
    <span>Procedure pas-a-pas, confidentialite, gratuit.</span>
  </a>
  ```
  par :
  ```astro
  <a href="/aide-victimes" class="mega-item">
    <strong>Associations d'aide aux victimes</strong>
    <span>France Victimes, e-Enfance, assos specialisees cyber et mineurs.</span>
  </a>
  ```

- [ ] **Step 2:** Ligne 151, remplacer `Aide aux victimes` par `Associations d'aide`.

- [ ] **Step 3:** Commit :
  ```bash
  git add src/components/Header.astro
  git commit -m "refactor(header): relabel le mega-menu cyber vers l'annuaire d'assos"
  ```

### Task 6: Mettre a jour le `Footer`

**Files:**
- Modify: `src/components/Footer.astro:22`

- [ ] **Step 1:** Remplacer :
  ```html
  <li><a href="/aide-victimes">Aide aux victimes</a></li>
  ```
  par :
  ```html
  <li><a href="/aide-victimes">Associations d'aide aux victimes</a></li>
  ```

- [ ] **Step 2:** Commit :
  ```bash
  git add src/components/Footer.astro
  git commit -m "refactor(footer): relabel 'Aide aux victimes' -> 'Associations d'aide'"
  ```

### Task 7: Mettre a jour `piliers/cyber.astro`

**Files:**
- Modify: `src/pages/piliers/cyber.astro:30, 32, 35, 43-62, 66-78, 80-89, 13-15, 22`

- [ ] **Step 1:** Schema `Service` (l. 13-15) : remplacer `serviceType: 'Aide aux victimes de cybercriminalite'` par `serviceType: 'Sensibilisation a la cybercriminalite'`. Description adaptee : `Sensibilisation gratuite aux arnaques en ligne, a l'usurpation d'identite, au harponnage, au chantage et aux faux supports. Biscuits IA forme, documente et oriente les publics vers les associations specialisees.`

- [ ] **Step 2:** Meta description (l. 22) : remplacer par `Vous voulez vous proteger des arnaques en ligne ou orienter un proche victime ? Biscuits IA sensibilise, forme et refere les associations specialisees d'aide aux victimes.`

- [ ] **Step 3:** Titre hero (l. 30) : `Lutter contre les arnaques et accompagner les victimes` -> `Lutter contre les arnaques : sensibiliser, outiller, orienter`.

- [ ] **Step 4:** Lead (l. 32) : remplacer par `Notre deuxieme pilier de mission : lutter contre les arnaques en ligne et la pedocriminalite, former les publics aux bons reflexes, et orienter les victimes vers les associations specialisees. La sensibilisation est notre coeur de bataille.`

- [ ] **Step 5:** Ligne 35 : remplacer `<a href="/aide-victimes" class="btn-danger">Je suis victime, j'ai besoin d'aide</a>` par `<a href="/aide-victimes" class="btn-danger">Voir les associations d'aide</a>`.

- [ ] **Step 6:** Section "Comment nous aidons les victimes" (l. 43) : renommer en `Comment nous agissons`. Renommer les 4 cartes :
  - `Ecoute et orientation` -> `Sensibilisation et prevention`
  - `Signalements` -> `Documentation et guides de signalement (PHAROS, 3018)`
  - `Mesures de protection` -> `Ressources : procedures pas-a-pas a telecharger`
  - `Sensibilisation` -> garder (mais reaffirmer le role de prevention)

- [ ] **Step 7:** Section "Les situations que nous traitons" (l. 66-78) : renommer en `Les situations que nous documentons`. Ajouter une ligne d'introduction : `Biscuits IA ne traite plus directement les dossiers. Nous documentons ces situations pour alimenter nos ressources et orienter vers les assos specialisees.` Les 6 sous-listes restent (ce sont des cas reels que les ressources du blog et les guides Anti Pepins couvrent).

- [ ] **Step 8:** CTA final (l. 80-89) :
  - `Besoin d'aide maintenant ?` -> `Vous etes victime ?`
  - Texte : remplacer par `Biscuits IA n'assure plus l'accompagnement direct. Consultez notre annuaire d'associations specialisees ou posez-nous une question par le formulaire de contact. Pour les urgences financieres, appelez votre banque sans delai.`
  - Bouton 1 : `<a href="/aide-victimes" class="btn-danger">Voir l'annuaire d'assos</a>`
  - Bouton 2 : `<a href="/contact?sujet=orientation-victime" class="btn-ghost">Posez une question</a>`

- [ ] **Step 9:** Commit :
  ```bash
  git add src/pages/piliers/cyber.astro
  git commit -m "refactor(piliers/cyber): recentrer la page sur sensibilisation et orientation"
  ```

### Task 8: Mettre a jour `public/citoyens.astro`

**Files:**
- Modify: `src/pages/public/citoyens.astro:14, 21, 38, 85-90, 97-102, 103-108, 133-141`

- [ ] **Step 1:** Schema (l. 14) et meta description (l. 21) : remplacer la mention "aide aux victimes" par `orientation vers les associations specialisees d'aide aux victimes`.

- [ ] **Step 2:** Ligne 38 : `<a href="/aide-victimes" class="btn-ghost">J'ai besoin d'aide</a>` -> `<a href="/aide-victimes" class="btn-ghost">Voir les associations d'aide</a>`.

- [ ] **Step 3:** Carte solution (l. 85-90) `Aide aux victimes` -> renommer en `Associations d'aide aux victimes`. Paragraphe : `Biscuits IA reference les associations specialisees (France Victimes, e-Enfance, etc.) qui peuvent vous accompagner gratuitement. Nous n'assurons plus l'aide directe.` CTA : `<a href="/aide-victimes" class="solution-cta">Voir l'annuaire</a>`.

- [ ] **Step 4:** Carte "Numeros d'urgence" (l. 97-102) : conserver, verifier que l'ancre `/aide-victimes#contacts-urgence` est presente (la nouvelle page a une `id="contacts-urgence"` en Task 2).

- [ ] **Step 5:** Carte "Signaler un contenu illicite" (l. 103-108) : remplacer le CTA `Procedure de signalement` -> `Voir l'annuaire` (vers `/aide-victimes`). Le texte est OK.

- [ ] **Step 6:** CTA final (l. 133-141) :
  - Titre : `Vous etes victime, vous voulez aider un proche ?` -> `Vous voulez aider un proche victime ?`
  - Texte : remplacer par `Consultez notre annuaire d'associations specialisees. Pour toute question sur la prevention ou la sensibilisation, contactez-nous. Pour les urgences, composez directement le 17 ou le 3018.`
  - Bouton 1 : `Acceder a l'aide` -> `Voir l'annuaire d'assos` (vers `/aide-victimes`).
  - Bouton 2 : `Nous ecrire` (vers `/contact?sujet=citoyen`) -> conserver.

- [ ] **Step 7:** Commit :
  ```bash
  git add src/pages/public/citoyens.astro
  git commit -m "refactor(citoyens): relabel et re-pointer les CTA victime vers l'annuaire"
  ```

### Task 9: Mettre a jour `public/associations.astro`

**Files:**
- Modify: `src/pages/public/associations.astro:111-116`

- [ ] **Step 1:** Renommer la carte "Mediation en cas d'arnaque" (l. 111-116) en `Orientation vers les associations d'aide aux victimes`. Paragraphe : `Votre asso, vos benevoles ou vos adherent-e-s sont victimes d'une escroquerie ? Biscuits IA n'assure plus la mediation directe, mais nous referencons les assos specialisees qui peuvent intervenir.` CTA : `<a href="/aide-victimes" class="solution-cta">Voir l'annuaire</a>`.

- [ ] **Step 2:** Commit :
  ```bash
  git add src/pages/public/associations.astro
  git commit -m "refactor(associations): clarifier que Biscuits IA n'assure plus la mediation"
  ```

### Task 10: Mettre a jour `anti-pepins.astro`

**Files:**
- Modify: `src/pages/anti-pepins.astro:167`

- [ ] **Step 1:** Remplacer le `<li>` ligne 167 :
  ```
  <li><a href="/aide-victimes">Vous etes victime d'une arnaque ?</a> Procedure pas-a-pas et formulaire d'aide.</li>
  ```
  par :
  ```
  <li><a href="/aide-victimes">Vous etes victime d'une arnaque ?</a> Consultez l'annuaire des associations specialisees.</li>
  ```

- [ ] **Step 2:** Commit :
  ```bash
  git add src/pages/anti-pepins.astro
  git commit -m "refactor(anti-pepins): pointer vers l'annuaire au lieu du formulaire interne"
  ```

### Task 11: Mettre a jour `llms-full.txt.ts`

**Files:**
- Modify: `src/pages/llms-full.txt.ts:97-108`

- [ ] **Step 1:** Remplacer l'entree complete (l. 97-108) :
  ```ts
  {
    title: 'Aide aux victimes',
    slug: '/aide-victimes',
    summary: 'Service gratuit de mediation numerique et d\'aide aux victimes d\'arnaques.',
    body: `Si vous etes victime d'une arnaque numerique (hameconnage, ransonlogiciel, IA utilisee contre vous, etc.) ou en litige avec un prestataire :
  1. Documentez : captures d'ecran, factures, echanges.
  2. Contactez-nous via le formulaire /contact.
  3. Nous analysons sous 48h ouvrlees.
  4. Si le dossier releve de notre perimetre, nous contactons le prestataire ou vous orientons vers les autorites (CNIL, DGCCRF, police, mediateur).

  Service 100% gratuit. Confidentialite garantie.`,
  },
  ```
  par :
  ```ts
  {
    title: 'Associations d\'aide aux victimes',
    slug: '/aide-victimes',
    summary: 'Annuaire d\'associations specialisees dans l\'aide aux victimes de cybercriminalite, harcelement en ligne et arnaques.',
    body: `Biscuits IA n\'accompagne plus directement les victimes. Nous referencons les associations specialisees :
  - France Victimes (116 006) : aide generale aux victimes, 130 bureaux en France.
  - e-Enfance / 3018 : cyberharcelement et protection des mineurs (9h-23h, gratuit, anonyme).
  - AVEC : Aide aux Victimes d\'Escroqueries et de Cybermalveillance.
  - INAVEM : federation des associations d\'aide aux victimes.
  - 119 : Allo Enfance en danger (24h/24, gratuit).
  - Action Innocence : protection de l\'enfance sur internet.
  - Internet Sans Crainte (CNIL) : education numerique des jeunes.
  Pour une analyse immediate d\'un message suspect, utilisez Anti Pepins (gratuit, anonyme, sans inscription).`,
  },
  ```

- [ ] **Step 2:** Commit :
  ```bash
  git add src/pages/llms-full.txt.ts
  git commit -m "refactor(llms): mettre a jour l'entree aide-victimes avec l'annuaire"
  ```

### Task 12: Mettre a jour `public/sitemap.xml`

**Files:**
- Modify: `public/sitemap.xml:16-20`

- [ ] **Step 1:** L'entree sitemap reste (l'URL `/aide-victimes` est conservee pour le SEO). Mettre a jour `<lastmod>` a la date du jour au format `2026-07-06`.

- [ ] **Step 2:** Commit :
  ```bash
  git add public/sitemap.xml
  git commit -m "chore(sitemap): rafraichir la date de modif de /aide-victimes"
  ```

### Task 13: Adapter `PillarsGrid.astro` (pilier 2) pour coherence

**Files:**
- Modify: `src/components/PillarsGrid.astro:46-58` (entree `id: 'cyber'` du tableau `pillars`)

- [ ] **Step 1:** Mettre a jour l'entree pilier 2 dans le tableau `pillars` :
  - `title: 'Lutte contre la cybercriminalite'` -> `Lutte contre la cybercriminalite et sensibilisation`
  - `description` : remplacer `On lutte contre les arnaques en ligne et la pedocriminalite. On accompagne les victimes d'escroqueries, d'usurpation d'identite et de cybermalveillance.` par `On lutte contre les arnaques en ligne et la pedocriminalite. On sensibilise, forme et oriente les publics vers les associations specialisees d'aide aux victimes.`
  - `bullets` :
    - `Aide aux victimes (escroqueries, hameconnage, deepfakes)` -> `Sensibilisation aux arnaques (escroqueries, hameconnage, deepfakes)`
    - `Signalement des contenus pedocriminels (PHAROS, 3018)` -> conserver tel quel
    - `Sensibilisation et mediation numerique gratuite` -> `Orientation vers les assos specialisees d'aide aux victimes`
  - `cta: 'Demander de l'aide ou signaler'` -> `Decouvrir nos ressources`

- [ ] **Step 2:** Verifier qu'aucune autre entree du tableau `pillars` ne reference `victime` dans `bullets` ou `description`.

- [ ] **Step 3:** Commit :
  ```bash
  git add src/components/PillarsGrid.astro
  git commit -m "refactor(piliers): recentrer le pilier 2 sur la sensibilisation, pas l'aide directe"
  ```

### Task 14: Retirer `kind: 'victime'` de l'API `/api/contact`

**Files:**
- Modify: `src/pages/api/contact.ts:8, 12, 70`

- [ ] **Step 1:** Retirer `'victime'` du type `ContactKind` (l. 8) et de `ALLOWED_KINDS` (l. 12). Le type devient `type ContactKind = 'general' | 'devis-logiciel' | 'signalement' | 'soutenir';` et le tableau `['general', 'devis-logiciel', 'signalement', 'soutenir']`.

- [ ] **Step 2:** Ligne 70 : supprimer le `finalSubject` special pour `kind === 'victime'`. Le ternaire devient : `const finalSubject = subject || 'Demande de contact';` (sans branche conditionnelle sur victime).

- [ ] **Step 3:** Lancer `npx tsc --noEmit` (ou `astro check`) pour verifier qu'aucun consommateur TypeScript ne depend de `kind === 'victime'`. Le resultat doit etre propre (0 erreur).

- [ ] **Step 4:** Commit :
  ```bash
  git add src/pages/api/contact.ts
  git commit -m "refactor(api): retirer kind 'victime' du contact, plus utilise par le front"
  ```

### Task 15: Verification finale

**Files:**
- Bash: `grep -rn "VictimHighlight\|VictimForm\|victim-form" src/ public/`
- Bash: `grep -rn "kind === 'victime'\|kind: 'victime'\|'victime'" src/`
- Bash: `grep -rn "aide-victimes" src/ public/`
- Bash: `npm run build` ou `astro check`

- [ ] **Step 1:** `grep -rn "VictimHighlight" src/` -> vide.
- [ ] **Step 2:** `grep -rn "VictimForm" src/` -> vide.
- [ ] **Step 3:** `grep -rn "victim-form" src/` -> vide.
- [ ] **Step 4:** `grep -rn "aide-victimes" src/ public/` -> uniquement des liens vers `/aide-victimes` (la nouvelle page annuaire). Aucun import casse, aucune mention de l'ancien service interne ("On peut vous aider", "Accompagnement gratuit", "Procedure pas-a-pas" comme promesse interne, etc.).
- [ ] **Step 5:** `grep -rn "kind.*victime\|'victime'" src/pages/api/` -> vide.
- [ ] **Step 6:** `npx astro check` (ou `npm run build`) -> 0 erreur. Si erreur de typage, corriger puis recommencer.
- [ ] **Step 7:** Verifier manuellement les 3 chemins critiques en ouvrant le fichier final :
  - `src/pages/aide-victimes.astro` -> annuaire d'assos, pas de bandeau "On peut vous aider", pas de `<VictimForm>`.
  - `src/pages/index.astro` -> contient `<VictimShortNotice />`, plus de `<VictimHighlight />`.
  - `src/pages/piliers/cyber.astro` -> titre recentre sur sensibilisation, CTA pointe vers `/aide-victimes` avec label "Voir les associations d'aide".
- [ ] **Step 8:** Pas de commit ici. Le ledger de taches est deja tenu par les commits individuels des Tasks 1 a 14.

---

## Self-Review

**1. Spec coverage:**
- "Tout retirer (page + bandeau)" : page transformee en annuaire (URL conservee pour SEO), bandeau `VictimHighlight` supprime et remplace par `VictimShortNotice` minimal. La home n'a plus le bandeau "On peut vous aider" agressif.
- "Generalistes cyber/arnaques + Specialisees mineurs + Parents/education" : 3 sections explicites dans la nouvelle page (Task 2, Step 1).
- "Supprimer le formulaire entierement" : `VictimForm.tsx` et `victim-form.css` supprimes (Task 3), aucun import residuel (Task 15 verification).
- "Retirer 'victime' de l'API" (decision du pre-flight) : Task 14 ajoutee explicitement.
- "Adapter PillarsGrid.astro" (decision du pre-flight) : Task 13 ajoutee explicitement.

**2. Placeholder scan:**
- Pas de "TODO" / "TBD" / "implement later" dans le plan.
- Pas d'etape "ajouter validation" sans code.
- Tous les chemins de fichiers sont absolus depuis la racine du projet.
- Tous les `grep` ont une commande exacte et un resultat attendu.
- Chaque Task contient au moins un commit, et les messages sont specifies verbatim.

**3. Type consistency:**
- `VictimShortNotice.astro` cree en Task 4, importe dans `index.astro` en Task 4 (meme tache, pas de divergence possible).
- La nouvelle page `aide-victimes.astro` n'importe plus `VictimForm` (verifie a Task 2 Step 3).
- La route API `/api/contact` n'accepte plus `'victime'` (Task 14) — pas de consommateur residuel connu (grep a Task 15 Step 5 le confirme).
- L'ancre `contacts-urgence` introduite en Task 2 est referencee en Task 8 (citoyens.astro) — la cible existe.

**4. Plan-level risks:**
- **Modifications de 11 fichiers source** (3 suppressions, 1 creation, 7 modifications) sur 13 taches. C'est un changement large, mais chaque tache est bornee a 1-2 fichiers et un commit isole, ce qui limite le rayon d'explosion en cas d'erreur de sous-agent.
- **Pas de tests automatises** sur ce projet (verifie : pas de `vitest`/`jest`/`playwright` config visible dans `package.json`). La verification finale repose sur `astro check` (typage) + grep (referencement). C'est limite, mais conforme a l'etat du projet.
- **SEO risk** : la page `/aide-victimes` est conservee, donc le referencement Google n'est pas casse. Le contenu change radicalement (de "service gratuit" a "annuaire") mais c'est une decision explicite d'Alexis.
- **Risque residuel** : un sous-agent pourrait ajouter des accents (le projet est en ASCII francais, mais c'est un piege frequent). Le brief de chaque sous-agent doit rappeler la convention.

## Execution

Execute task-by-task with subagent-driven-development. Each task dispatch includes a `task-brief` file (extrait par `scripts/task-brief`), le rapport de tache, et le chemin du package de review (extrait par `scripts/review-package BASE HEAD`).
