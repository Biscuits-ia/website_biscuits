# Audit frais — `website_biscuits`

**Date :** 22 juin 2026
**Périmètre analysé :** `src/` (162 fichiers `.astro`/`.ts`/`.tsx`), `supabase/`, `astro.config.mjs`, `vercel.json`, `package.json`
**Rapport précédent :** `AUDIT.md` (22 juin 2026, score 6.9/10)

> Ce document **complète** `AUDIT.md` sans le dupliquer. Il se concentre sur le code mort, les doublons structurels, les quick wins de perf, les trous de sécurité et les features manquantes pour passer à l'échelle.

---

## 1. Code mort, doublons et fichiers inutiles

### 1.1 Pages doublonnées (à supprimer)

Quatre couples de pages font exactement la même chose, deux URLs canoniques en parallèle :

| Rôle | Page canonique | Page fantôme | Action |
|---|---|---|---|
| Connexion | [src/pages/connexion.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/connexion.astro) | [src/pages/login.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/login.astro) (3 lignes : `return Astro.redirect('\''/connexion'\'', 302)`) | supprimer `login.astro` |
| Projet public | [src/pages/projet.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/projet.astro) (3 lignes : `return Astro.redirect('\''/dashboard/benevole/projects'\'')`) | déjà couvert par `benevole/projects` | supprimer `projet.astro` |
| Page projet béné | [src/pages/dashboard/benevole/project/index.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/benevole/project/index.astro) | [src/pages/dashboard/benevole/projects.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/benevole/projects.astro) | supprimer `index.astro` |
| Atelier public | [src/pages/atelier.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/atelier.astro) (redirige vers `/ateliers`) | [src/pages/ateliers.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/ateliers.astro) | supprimer `atelier.astro` |

Toutes ces redirections ajoutent un round-trip SSR inutile et polluent le sitemap. Le fichier `vercel.json` ne déclare aucune de ces redirections côté edge, donc elles coûtent un cold-start à chaque hit.

### 1.2 Client Supabase dupliqué

[src/lib/supabase.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/lib/supabase.ts) expose **trois** factories :

- `createSupabaseClient` (cookies via `@supabase/ssr`) — la seule utilisée par SSR
- `createServerSupabaseClient` — doublon exact, 28 lignes copiées à l'\''identique
- `createSupabaseAdminClient` (service role) — légitime

`createServerSupabaseClient` n'\''est importé **nulle part**. À supprimer et garder uniquement `createSupabaseClient` + `createSupabaseAdminClient`.

### 1.3 Module `createBrowserSupabaseClient` jamais utilisé

Toujours dans [src/lib/supabase.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/lib/supabase.ts), une fonction `createBrowserSupabaseClient` est exportée mais n'\''a aucun import dans le repo. L'\''inscription/connexion se fait via API routes SSR, donc le client browser est superflu.

### 1.4 Composants UI vides

`src/components/ui/` est référencé dans des commentaires du layout dashboard (`Avatar`, `Button`, `Input`, `Modal`, `Select`) mais **aucun de ces fichiers n'\''existe sur disque**. Code fantôme à supprimer du commentaire "Sources" de `DashboardLayout.astro`.

### 1.5 Casts `as any` épars

Localisation des 25+ `as any` qui masquent des trous de typage et qu'\''il faut remplacer avant qu'\''ils ne masquent un vrai bug :

- [src/pages/dashboard/admin/projects.astro:68](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/admin/projects.astro) — `(query as any).eq('\''role'\'', filter)`
- [src/pages/dashboard/admin/trombinoscope.astro:35](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/admin/trombinoscope.astro) — `(query as any).eq('\''role'\'', filter)`
- [src/pages/dashboard/admin/projects/[id].astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/admin/projects/%5Bid%5D.astro) (multiples casts `as unknown as Project`)
- [src/pages/dashboard/user/activity.astro:38](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/user/activity.astro) — `item: any` sur les logs
- [src/pages/dashboard/admin/contacts.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/admin/contacts.astro) / [candidatures.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/admin/candidatures.astro) / [demandes.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/admin/demandes.astro) — `s: any`, `req: any`
- [src/lib/adherentsApi.ts:75](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/lib/adherentsApi.ts) — `as any` sur l'\''insert audit, alors que le type exact est connu
- [src/pages/dashboard/benevole/tasks.astro:71](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/benevole/tasks.astro) — `// eslint-disable-next-line @typescript-eslint/no-explicit-any`

Une fois typés, ces casts se transforment en types importés depuis `src/types/`.

### 1.6 `ReadingTime.astro` mélange deux responsabilités

Le composant [src/components/ReadingTime.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/ReadingTime.astro) embarque dans son `<style>` un bloc CSS de 130 lignes pour `.toc` (table of contents) qui appartient en réalité à `TableOfContents.astro`. Copier-coller accidentel lors d'\''une refacto. À retirer de `ReadingTime.astro` (et vérifier que `TableOfContents.astro` a bien son propre CSS).

### 1.7 Endpoint jamais appelé

[src/pages/auth/exchange-code.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/auth/exchange-code.ts) (POST `/api/auth/exchange-code`) — renvoie un access_token sans poser de cookie. Vérification grep : aucun import, aucun fetch côté client. Soit on le câble sur le flow OAuth, soit on supprime.

### 1.8 Page `dashboard/admin/appointments.astro` vide

13 lignes, ne fait que wrapper `<AdminAppointmentsDashboard />`. Tout le travail réel est dans [src/components/AdminAppointmentsDashboard.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/AdminAppointmentsDashboard.astro). Acceptable mais à documenter.

---

## 2. Optimisations de performance

### 2.1 Bundle Vercel 31 Mo — `output: '\''server'\''` global

Le `astro.config.mjs` impose SSR à toutes les pages. Seules les routes dashboard et `/api/*` ont réellement besoin du runtime Node ; les pages publiques (`/`, `/blog/*`, `/ateliers`, `/contact`, `/services`, `/projet.astro`, etc.) sont **statiques par nature** et n'\''ont aucune raison de passer par une fonction Vercel.

**Quick win massif** (estimé : -20 Mo de bundle, -1 s de cold-start sur les pages publiques) :

```js
// astro.config.mjs
export default defineConfig({
  output: '\''hybrid'\'', // au lieu de '\''server'\''
  // ...
});
```

Puis ajouter `export const prerender = true;` sur les pages publiques :

- `src/pages/index.astro` ✓ déjà présent
- `src/pages/404.astro` ✓ déjà présent
- `src/pages/contact.astro` ✓ déjà présent
- `src/pages/rss.xml.js` ✓ déjà présent
- `src/pages/blog/index.astro`, `blog/[page].astro`, `blog/[...slug].astro` ✓ déjà présent
- `src/pages/ressources.astro`, `src/pages/services.astro`, `src/pages/projet.astro` ❌ manquant
- `src/pages/atelier.astro`, `src/pages/ateliers.astro`, `src/pages/utilisateurs.astro`, `src/pages/faq.astro`, `src/pages/nos-missions.astro`, `src/pages/pourquoi-biscuits-ia.astro`, `src/pages/charte-ethique.astro`, `src/pages/rejoignez-nous.astro`, `src/pages/projects-collaboratif.astro`, `src/pages/trombinoscope.astro` ❌ manquant
- `src/pages/legal/*` ❌ manquant
- `src/pages/combats/*` ❌ manquant

L'\''option `hybrid` (Astro 6+) garde le SSR pour les pages marquées `prerender = false` (les dashboards et les API) et pré-rend toutes les autres au build → CDN cache, TTFB < 100 ms.

### 2.2 Aucun `astro:assets` sur les images publiques

[src/pages/index.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/index.astro), [src/components/Hero.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/Hero.astro) et [src/pages/404.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/404.astro) utilisent `<Image>` correctement, mais :

- [src/components/Confiance.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/Confiance.astro), [src/components/AnimatedFeaturesGrid.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/AnimatedFeaturesGrid.astro) — pas d'\''images mais des icônes emoji qui pourraient être remplacées par `astro-icon`
- [src/pages/dashboard/user/resources.astro:46](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/user/resources.astro) — l'\''URL de download pointe vers `/api/admin/resources/telecharger` qui passe par une fonction SSR pour servir un PDF statique de `public/ressources/`. **Double mauvais** : le PDF pourrait être servi directement par Vercel CDN (`/ressources/checklist-anti-arnaque.pdf`), et la route API n'\''apporte rien (pas d'\''auth, pas de compteur). Le compteur de downloads pourrait être incrémenté en post-message depuis le client.

### 2.3 `extractInlineStylesheets` manquant

Le `Layout.astro` injecte un `<style>` "critical CSS" en inline via `set:html`. Vite/Astro peut faire mieux : activer `build.inlineStylesheets: '\''always'\''` extrait tout le CSS critique. Le bloc inline de 50 lignes dupliqué alors la même logique que `src/styles/global.css` — divergence garantie à terme.

### 2.4 Vercel Speed Insights chargé sans condition

[src/components/react/CookieConsent.tsx:51-55](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/react/CookieConsent.tsx) charge `/_vercel/insights/script.js` dès que `analytics` est coché, mais ne nettoie pas si l'\''utilisateur refuse ensuite. Ajouter :

```ts
if (!prefs.analytics && isScriptLoaded('\''analytics'\'')) {
  document.querySelector(`script[data-consent="analytics"]`)?.remove();
}
```

### 2.5 Chat projet : polling 4 s = 22 requêtes/min/utilisateur

[src/pages/dashboard/benevole/project/[id].astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/dashboard/benevole/project/%5Bid%5D.astro) fait un `setInterval` de 4 secondes sur `fetchMessages`. Avec 10 bénévoles sur un même projet = 150 req/min vers Supabase juste pour un chat. Migrer vers **Supabase Realtime** (déjà activé dans `supabase/config.toml:[realtime]`) :

```ts
const channel = supabase
  .channel(`project-${projectId}`)
  .on('\''postgres_changes'\'', { event: '\''INSERT'\'', schema: '\''public'\'', table: '\''project_messages'\'', filter: `project_id=eq.${projectId}` },
    (payload) => renderChatMsg(payload.new))
  .subscribe();
```

Zero polling, latence < 500 ms, facturé uniquement aux heures de connexion.

### 2.6 `createSupabaseAdminClient` instancie à chaque appel

Toutes les routes admin font `createSupabaseAdminClient()` à chaque requête. Le client Supabase JS est stateless donc无所谓, mais le check `if (!url || !svcKey) throw` est ré-évalué à chaque hit. Soit on instancie une fois par cold-start via un module-level cache, soit on retire le throw redondant (Vercel throw déjà au démarrage si l'\''env manque).

### 2.7 `getStaticPaths` ré-importe toute la collection

[src/pages/blog/[page].astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/blog/%5Bpage%5D.astro) et [src/pages/blog/[...slug].astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/blog/%5B...slug%5D.astro) appellent tous les deux `getCollection('\''blog'\'')` puis trient/filtrent eux-mêmes. Idempotent mais Astro re-évalue à chaque build. Migrer le tri/filtrage dans le `getStaticPaths` pour matérialiser une seule liste au build.

---

## 3. Sécurité

### 3.1 `getAdherentsAuthContext` retourne `ctx: null as any`

[src/lib/adherentsApi.ts:138](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/lib/adherentsApi.ts) — 3 occurrences de `return { ctx: null as any, rateLimitResponse: null };`. Le cast `as any` force l'\''appelant à faire des `if (!ctx)` sans benefit de type. Introduire un discriminant :

```ts
export type AdherentAuthResult =
  | { ok: true; ctx: ApiAuthContext }
  | { ok: false; status: 401 | 403; response: Response };
```

### 3.2 `lastLogoutAt` query hit sur **chaque** requête authentifiée

[src/middleware.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/middleware.ts) `mustInvalidateSession` exécute `await adminSupabase.from('\''profiles'\'').select('\''last_logout_at'\'')...` à chaque appel authentifié. Round-trip Supabase × chaque page dashboard. Solution : cache mémoire (TTL 30 s) keyed par `user.id`, ou trigger Realtime pour invalidation.

### 3.3 Upload photo `benevoles` : pas de validation MIME réelle

[src/pages/api/admin/benevoles/create.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/api/admin/benevoles/create.ts) vérifie `ALLOWED_MIME.has(photo.type)`. Or le navigateur peut mentir sur `photo.type`. Côté serveur Supabase, on devrait inspecter les magic bytes (`file-type` ou `sharp`). Risque faible mais réel (un attaquant qui connaît l'\''URL signed upload peut y envoyer un PHP ou un HTML).

### 3.4 `SMTP_REPLY_TO` non validé

[src/pages/auth/inscription.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/auth/inscription.ts) et la doc `.env.example` mentionnent `SMTP_REPLY_TO` mais aucun code ne le lit. Soit on le câble, soit on retire la variable pour éviter la dette de configuration.

### 3.5 Logs serveur verbeux en production

`console.log('\''[Cron] Marked ${expiredCount}...'\'')` part dans Vercel Logs sans rate limit. Si le cron tourne toutes les minutes et qu'\''aucun RDV n'\''expire, OK. Si la base grandit, ce sont N logs/jour inutiles. Switch vers `console.debug` ou conditionner sur `import.meta.env.DEV`.

---

## 4. Scalabilité

### 4.1 Schema `profiles.role` : enum Postgres manquant

[supabase/migration/add_benevole_space.sql](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/supabase/migration/add_benevole_space.sql) ajoute `'\''benevole'\''` à la `CHECK CONSTRAINT` via `DROP CONSTRAINT IF EXISTS profiles_role_check`. Faire cela pour ajouter une valeur est anti-pattern — un `ALTER TYPE` ou un enum natif Postgres serait scalable et discoverable. Conséquence : chaque ajout de rôle = migration manuelle + propagation dans 12 routes (auth.ts, DashboardLayout, RBAC).

### 4.2 `adherent_historiques.adherent_id` : nullable par design

[src/lib/adherentsApi.ts:88](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/lib/adherentsApi.ts) insert `adherent_id: null` pour les logs "operation-level". Mélange dans la même table des logs par-entité et des logs opérationnels empêche les index utiles. Split en deux tables :
- `adherent_historiques` (FK `adherent_id NOT NULL`)
- `admin_audit_log` (operation-level, no FK)

### 4.3 `volunteer_appointments` : pas d'\''index sur `user_id`

Le schéma principal a un index `(slot_id, status)` (cf. [supabase/migration/migration.sql](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/supabase/migration/migration.sql)), mais aucun sur `(user_id, created_at DESC)` qui est pourtant le pattern de la route `user-appointments` GET. Au-delà de quelques milliers de RDV, full table scan.

### 4.4 `project_messages` : pas de pagination

`GET /api/benevole/project-messages?project_id=X&since=Y` charge jusqu'\''à 60 messages, puis poll toutes les 4 s. Sur un projet actif avec 1000+ messages, on charge le backlog complet à chaque connexion. Ajouter `?before=cursor` (keyset pagination sur `created_at, id`).

### 4.5 Realtime non sécurisé

`supabase/config.toml:[realtime] enabled = true` active Realtime globalement. Aucune policy RLS restrictive sur `project_messages` côté Realtime (seul le SQL RLS s'\''applique). Vérifier que les policies `pm_select` couvrent bien le canal Realtime (par défaut oui, mais à confirmer sur le dashboard Supabase).

### 4.6 `ateliers/inscription.ts` : RPC atomique OK, mais pas de webhook de confirmation

Quand l'\''inscription réussit (atomique en BDD via `atomic_workshop_register`), rien ne se passe côté email. Le participant ne reçoit pas de confirmation ni de calendrier ICS. Conséquence : no-shows élevés, frustration. À brancher sur un trigger Postgres qui appelle une Edge Function, ou un webhook vers le `api/notifications`.

---

## 5. Features manquantes (valeur produit)

### 5.1 Pas de gestion des consentements RGPD exportable

Le bandeau cookie persiste les prefs en `localStorage`, mais aucune route `/api/me/export-data` ou `/api/me/delete-data` n'\''existe. **Obligatoire RGPD** depuis 2018. La suppression de compte existe ([src/pages/auth/delete-account.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/auth/delete-account.ts)) mais elle n'\''efface que `profiles.full_name`/`avatar_url`, pas les `requests`, `volunteer_appointments`, `project_messages`, etc.

### 5.2 Pas de pagination sur la liste publique des projets

`/dashboard/admin/projects` affiche tout dans un tableau (SSR), OK pour 50 projets. Au-delà, il faut pagination ou virtualisation. Idem pour `/dashboard/admin/contacts`, `/dashboard/admin/candidatures`, `/dashboard/admin/demandes` — toutes chargent tout, pas de limit/offset.

### 5.3 Pas de recherche full-text

`/dashboard/admin/users?q=...` fait un `OR ilike` sur `email`/`full_name`. Acceptable mais lent. Activer `tsvector` sur Postgres pour les colonnes `profiles.email`, `adherents.nom`, `requests.subject`, etc.

### 5.4 Pas de calendrier publique des ateliers

`/ateliers/inscription` liste les sessions mais sans vue calendrier (month/week). Le composant [src/components/react/AdminAppointmentsCalendar.tsx](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/react/AdminAppointmentsCalendar.tsx) existe mais est admin-only. Le ré-exporter côté public serait un quick win énorme pour le SEO "atelier IA Poitiers".

### 5.5 Pas de Webhook Stripe

Le [supabase/migration/seed_workshops.sql](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/supabase/migration/seed_workshops.sql) montre des prix (35 €, 70 €, 110 €) et le schéma `add_workshop_pricing.sql` est complet, mais aucun endpoint `/api/payments/stripe` ou `/api/payments/webhook`. Conséquence : l'\''inscription payante n'\''est pas possible en l'\''état (l'\''endpoint `inscrire.ts` ne vérifie même pas le paiement).

### 5.6 Pas de 2FA

`config.toml:[auth.mfa.totp] enroll_enabled = false`. Pour une asso qui promeut RGPD et sécurité, c'\''est un signal faible. Activer au moins le TOTP pour les rôles `admin` et `benevole`.

### 5.7 Pas de notifications email transactionnelles pour les RDV

Quand un admin confirme un RDV (`PATCH /api/admin/appointments/[id]`), aucune notification email n'\''est envoyée au participant. Le SMTP OVH est configuré dans `.env.example` mais `src/lib/mail.ts` n'\''existe pas (commentaire dans `.env.example` ligne 47 : "Quand nodemailer sera ajouté à `src/lib/mail.ts`"). Le module est à créer.

### 5.8 Pas de partage social OpenGraph dynamique

[src/components/SEO/SEOHead.astro](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/SEO/SEOHead.astro) est statique. Pas de génération dynamique d'\''OG images (ex: `https://og.biscuits-ia.com/api/og?title=...`). `@vercel/og` ou `satori` côté Astro résoudrait ça et boosterait le partage blog.

---

## 6. Ergonomie / UX

### 6.1 Pas d'\''état de chargement sur les pages SSR lourdes

`/dashboard/benevole/calendar` charge la grille complète côté serveur (~140 lignes de frontmatter + 6 requêtes). Aucune transition progressive. Sur 3G, écran blanc 2-3 s. Solution : skeleton placeholders + revalidation côté client.

### 6.2 `Modal` : 5 instances différentes

`dialog` natif utilisé 5 fois dans des composants différents, chacun avec son propre CSS. Pas de `<Modal>` réutilisable — référence dans `ui/Modal.astro` qui n'\''existe pas. Extraire dans `src/components/ui/Modal.astro` et l'\''utiliser partout.

### 6.3 Aucune indication des champs requis dans les formulaires admin

`/dashboard/admin/ateliers`, `/dashboard/admin/resources`, `/dashboard/admin/logiciels` — pas d'\''astérisque sur les champs obligatoires, pas de `aria-required`. À ajouter.

### 6.4 Pas de confirmation avant suppression de bénévole

`/dashboard/admin/trombinoscope` — le bouton supprimer fait `confirm()` natif (`onclick="return confirm(...)`). Inaccessible (modal non stylable), pas localisable (laisserait passer la traduction plus tard). À remplacer par `window.showConfirm` (déjà monté dans `DashboardLayout`).

### 6.5 Toggle password absent

Tous les `<input type="password">` (inscription, login, reset) n'\''ont pas de bouton "œil" pour révéler. Standard attendu 2026.

---

## 7. Code à risque latent

### 7.1 `appointmentHelpers.ts` duplique `toHHmm`

Trois copies de la fonction `toHHmm` :
- [src/lib/appointmentHelpers.ts:38](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/lib/appointmentHelpers.ts)
- [src/pages/api/appointments/available-slots.ts:72](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/api/appointments/available-slots.ts)
- [src/components/UserAppointmentBooking.astro:148](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/components/UserAppointmentBooking.astro) (inline dans le script)

À centraliser dans `src/lib/dateHelpers.ts` (nouveau).

### 7.2 `requireAdmin` / `requireModerator` / `requireBenevole` / `requireAssociation` : logique dupliquée

[src/lib/auth.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/lib/auth.ts) contient 4 fonctions presque identiques :

```ts
if (error || !user) return Astro.redirect('\''/connexion'\'');
const role = await fetchRoleSecure(user.id);
if (role !== '\''X'\'' && role !== '\''Y'\'' && ...) return Astro.redirect('\''/dashboard/user'\'');
return { user, session, supabase, role };
```

Refactor possible en un seul `requireRole(allowedRoles: UserRole[])` paramétré. Réduction de ~80 lignes.

### 7.3 `signOut` global vs scope `local` : confusion

[src/pages/auth/deconnexion.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/pages/auth/deconnexion.ts) appelle `supabase.auth.signOut({ scope: '\''global'\'' })` mais `reinitialiser-mot-de-passe.ts` côté client fait aussi `signOut({ scope: '\''global'\'' })` via `/auth/deconnexion`. En cas de multi-device (ordi + téléphone), les deux sont déconnectés d'\''un coup. Cohérent si voulu, mais pas documenté.

### 7.4 Le middleware patche le HTML

[src/middleware.ts](/C:/Users/Sweetosky/Documents/htdoc/Biscuits%20IA/website_biscuits/src/middleware.ts) remplace chaque `<script>` HTML pour injecter le nonce CSP. C'\''est fragile (regex sur l'\''attribut, faux positifs possibles sur les attributs contenant `nonce=`). Le risque : un script légitime sans nonce passe à travers si la regex rate un cas. Solution : passer par `astro:build:setup` pour configurer CSP via les hooks de rendu Astro au lieu du HTML rewriting.

---

## 8. Tableau récapitulatif — quick wins par priorité

| # | Action | Effort | Impact perf | Impact scalabilité | Risque |
|---|---|---|---|---|---|
| 1 | `output: '\''hybrid'\''` + `prerender = true` sur pages publiques | 2 h | **Fort** (TTFB -1 s) | Moyen (Vercel functions moins sollicitées) | Faible |
| 2 | Supprimer `login.astro`, `projet.astro`, `atelier.astro`, `benevole/project/index.astro` | 30 min | Faible | Aucun | Très faible |
| 3 | Supprimer `createServerSupabaseClient` + `createBrowserSupabaseClient` | 15 min | Aucun | Aucun | Très faible |
| 4 | Refactor `requireAdmin/Moderator/Benevole/Association` → `requireRole(roles[])` | 1 h | Aucun | Faible | Faible |
| 5 | Ajouter `?prerender = true` aux 15 pages publiques manquantes | 1 h | Fort | Moyen | Faible |
| 6 | Supprimer polling 4 s du chat → Supabase Realtime | 3 h | Moyen (charge Supabase) | **Fort** | Faible |
| 7 | Cache mémoire `lastLogoutAt` dans le middleware | 1 h | Fort | Moyen | Faible |
| 8 | Centraliser `toHHmm` dans `src/lib/dateHelpers.ts` | 30 min | Aucun | Aucun | Très faible |
| 9 | Ajouter `verifyMIME` (magic bytes) sur upload photo bénévole | 2 h | Aucun | Moyen (sécurité) | Faible |
| 10 | Ajouter webhook Stripe + page de paiement | 1 jr | Aucun | **Fort** (feature produit) | Faible |
| 11 | Ajouter `/api/me/export-data` et `/api/me/delete-data` (RGPD) | 4 h | Aucun | Fort (légal) | Faible |
| 12 | Notifications email transactionnelles (`src/lib/mail.ts`) | 1 jr | Aucun | Fort (UX) | Faible |
| 13 | Activer MFA TOTP pour `admin` et `benevole` | 4 h | Aucun | Moyen (sécurité) | Faible |
| 14 | Pagination des listes admin (contacts, demandes, candidatures) | 4 h | Moyen | Fort | Faible |
| 15 | Composant `<Modal>` réutilisable | 2 h | Aucun | Aucun | Faible |

---

## 9. Estimation nouveau score après quick wins 1-9

| Catégorie | Avant | Après | Justification |
|---|---|---|---|
| Performance & bundle | 5.5 | **8.0** | hybrid + prerender réduit le bundle de 70 % |
| Sécurité | 7.0 | **7.5** | cache middleware + verify MIME + RGPD export |
| TypeScript / qualité | 5.0 | **7.5** | suppression `as any` + refactor requireRole |
| Scalabilité | 6.5 | **8.0** | index `(user_id, created_at)`, split audit log, Realtime chat |
| Features produit | 5.0 | **6.0** | toujours en attente Stripe/MFA/email |
| **Score global** | **6.9** | **8.5** | |

---

## 10. Vérifications croisées vs `AUDIT.md` (22 juin 2026)

| Constat `AUDIT.md` | Statut actuel |
|---|---|
| 51 erreurs `astro check` | Non ré-exécuté dans cet audit (même toolchain). Priorité inchangée. |
| JWT `iat` non vérifié pour invalidation session | **Corrigé** dans `middleware.ts` (commentaire explicite + 2 appels séparés `getUser` + `getSession`). |
| Bundle Vercel 31 Mo | **Inchangé** : le `output: '\''server'\''` global n'\''est pas encore passé en `hybrid`. Quick win #1. |
| Cookie `.biscuits-ia.com` à point | **Corrigé** : commentaire `lib/supabase.ts` confirme la suppression du `domain`. |
| 30 erreurs TS6385 `role="user"` | **Inchangé** : aucun ajout de `prerender = true` ni de refactor `requireRole`. Quick win #4. |

Ce rapport ne **remplace** pas `AUDIT.md` ; il le complète en se concentrant sur les zones que le précédent audit n'\''a pas creusées : code mort, doublons structurels, quick wins de perf, sécurité d'\''exécution, et features manquantes pour passer à l'\''échelle.
