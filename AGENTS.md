# AGENTS.md — Guide opérationnel pour les agents IA / nouveaux contributeurs

## Ce que ce projet est

Site public + back-office de l'association **Biscuits IA** (Loi 1901). Astro 7 en
mode `output: 'server'` (SSR), déployé sur Vercel, base Supabase (Postgres +
Auth + Storage), paiement HelloAsso (IPN webhook HMAC).

- 5 piliers métier : Accompagnement IA, Lutte cyber, Logiciels pour assos,
  Anti Pepins (service public d'aide aux victimes), Recherche & modèles ouverts.
- Espace bénévoles (Tâches/Projets), Espace associations, Espace admin.
- RGPD strict : c'est une asso "IA éthique", la donnée utilisateur est sensible.

## Invariants de sécurité (règles d'or)

1. **`supabase.auth.getUser()` UNIQUEMENT côté serveur.** Jamais `getSession()`
   pour vérifier un accès : la session est dans un cookie que l'utilisateur
   contrôle. `getUser()` contacte le serveur Auth → non forgeable.
2. **Pas de `signOut()` côté serveur.** La déconnexion est gérée par le client
   (page `/api/account/logout` ne fait que rediriger après `supabase.auth.signOut()`
   client-side). Server-side, on ne touche pas à la session.
3. **CSP nonces via `Astro.locals.nonce` uniquement.** Middleware génère le
   nonce à chaque requête, l'injecte dans `locals`, l'utilise dans les headers
   `script-src` et `style-src`. Tout script inline doit avoir `nonce={Astro.locals.nonce}`.
4. **Pages prerendered : CSP statique depuis `vercel.json`.** Pages SSR :
   middleware injecte nonce + headers dynamiques. Ne PAS modifier la CSP
   dans `vercel.json` sans vérifier toutes les pages prerendered.
5. **Auth helpers centralisés dans `src/lib/auth.ts`.**
   - `requireAuth(ctx)`, `requireRole(ctx, [...])`, `requireAdmin(ctx)`,
     `requireModerator(ctx)`, `requireBenevole(ctx)`, `requireAssociation(ctx)`
     → retournent `{ user, session, supabase, role }` ou un `Response` 302 redirect.
   - Variantes JSON `requireAuthJson`, `requireAdminJson`, `requireBenevoleJson`
     → retournent `Response` 401/403 avec `{ error }`. Utiliser pour les API
     appelées en `fetch()` côté client.
   - `requireAppointmentOwner(supabase, apptId, userId, isAdmin)` → 200/404/403
     pour les endpoints de rendez-vous.
6. **Rate-limit : IP source = `x-vercel-forwarded-for` UNIQUEMENT.**
   Ne JAMAIS faire confiance à `cf-connecting-ip`, `x-real-ip`, ou
   `x-forwarded-for` non-Vercel. Header Vercel signé, le reste ne l'est pas.
7. **Webhook HelloAsso : `verifyWebhookSignature(rawBody, header)` est OBLIGATOIRE**
   avant tout parsing. Voir `src/lib/helloasso.ts`. Sans cette vérif, n'importe
   qui peut insérer des paiements frauduleux en BDD.

## Frontmatter boundaries : où poser la sécurité

```ts
// PAGE prerendered (export const prerender = true)
// → pas de getUser, pas de logique auth.
// → si la page a des éléments personnalisés, les passer en props depuis
//   une route parente SSR, ou via un endpoint /api/... appelé en fetch.

export const prerender = true;

// PAGE SSR (par défaut, pas d'export prerender)
// → frontmatter serveur : requireAuth(Astro) en haut, return result si Response.
const auth = await requireAuth(Astro);
if (auth instanceof Response) return auth;
const { user, supabase } = auth;

// APIROUTE (src/pages/api/.../foo.ts)
// → export const POST: APIRoute = async (Astro) => { ... }
// → utiliser requireX(Astro) ou requireXJson(ctx).
```

## Commandes

```bash
npm run dev       # Astro dev server sur :4321
npm run build     # Build de prod (vérifie types + génère .vercel/output)
npm run preview   # Sert le build en local
npm run lint      # ESLint 10 (flat config, pas de .eslintrc)
npm run format    # Prettier sur src/
npm run typecheck # tsc --noEmit
npm run check     # astro check (typings + accessibilité de base)
```

Pas de tests automatisés (pas de Vitest/Jest configuré). Les tests = `npm run
build` + smoke tests manuels sur les routes critiques.

## Pièges connus

1. **Tailwind v4 : import global unique.** `src/styles/tailwind.css` est importé
   via `src/styles/global.css` (via `@import`). NE PAS le réimporter dans les
   composants — ça duplique les styles.
2. **Middleware s'exécute 1× au build pour les pages prerendered.** Donc
   les en-têtes CSP dynamiques ne s'appliquent pas aux pages `prerender = true`
   → ces pages utilisent la CSP statique de `vercel.json`.
3. **`public/` écrase les fichiers des intégrations Astro.** Si un fichier
   dans `public/` a le même nom qu'un asset d'intégration, c'est le `public/`
   qui gagne. Surprenant mais documenté.
4. **ESLint 10 flat config : pas de `.eslintrc`.** La config est dans
   `eslint.config.js`. Ne pas recréer un `.eslintrc.json` — il est ignoré.
5. **Schéma zod permissif sur le webhook HelloAsso** : on `.passthrough()` car
   HelloAsso fait évoluer son format de payload. Voir `src/pages/api/formations/helloasso/webhook.ts:51-65`.
6. **Templates email en français SANS accents** (ex: "Parrainage enregistre").
   C'est volontaire : compatibilité avec les clients mail anciens. Ne pas
   ré-accentuer.

## Périmètre agents (ce que tu ne dois PAS faire)

- **Modifier les migrations Supabase existantes** (`supabase/migrations/*.sql`).
  Si un changement de schéma est nécessaire, créer une nouvelle migration
  horodatée et la tester en preprod.
- **Toucher aux secrets / RLS** sans validation explicite.
- **Re-installer `lucide-astro`** : on a enlevé le package pour cause de bundle
  size. Les icônes sont soit en SVG inline, soit via `astro-icon`.
- **Recréer `src/pages/legal/confidentialite.astro`** : la page a été
  dépubliée (R.G.P.D. + charte), tout vit maintenant dans `legal/index.astro`.
- **Changer la structure des imports `@/...`** : le tsconfig a un path alias
  pour `@/*` → `src/*`. Les imports relatifs `../../../` sont encore présents
  dans certains fichiers historiques mais la convention cible est `@/`.

## Mémoire projet

Voir `C:\Users\Sweetosky\.claude\projects\...memory\MEMORY.md` pour les notes
spécifiques (audit 2026-07-08, choix d'architecture, etc.).
