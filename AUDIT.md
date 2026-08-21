# Audit — Biscuits IA

**Date :** 2026-08-21
**Branche :** `fix/connexion-trailing-slash` (base `main`, HEAD `08db436`)
**Périmètre :** middleware, gardes d'authentification, 24 routes API, 16 pages dashboard,
configuration CSP, dépendances.

**Vérifications automatiques au moment de l'audit :**

| Commande | Résultat |
| --- | --- |
| `npm run check` (astro check, 153 fichiers) | 0 erreur, 0 warning, 0 hint |
| `npm run lint` (eslint 10) | aucune sortie (clean) |
| `npm audit --omit=dev` | 1 vulnérabilité high (transitive, dev-only — cf. S6) |

**Ordre de traitement recommandé :** S1 → B4 → B1 → B2 → S3.
S1 est le seul point exploitable à distance sans compte.

---

## Table des matières

- [Sécurité](#sécurité)
- [Bugs](#bugs)
- [Performance](#performance)
- [Ce qui est solide](#ce-qui-est-solide)

---

## Sécurité

### S1 — Open redirect après connexion — **priorité haute**

**Fichier :** `src/pages/connexion.astro:158-159`

```js
const url = new URL(window.location.href);
const redirectTarget = url.searchParams.get('redirect') || '/dashboard';
window.location.href = redirectTarget;
```

Aucune validation de la cible. `https://biscuits-ia.com/connexion?redirect=https://evil.tld`
envoie la victime chez l'attaquant **après une connexion réussie et légitime** : vrai domaine,
vrai formulaire, vrais identifiants saisis, puis page pirate. C'est la chaîne de phishing la
plus efficace qui soit, parce que la victime a déjà validé tous les signaux de confiance.

Facteur aggravant : un `grep` sur l'intégralité de `src/` ne trouve **aucun** endroit qui pose
`?redirect=`. Le paramètre n'a donc pas d'usage légitime dans l'application — il est
intégralement fourni par l'extérieur.

Note sur `javascript:` : une affectation `location.href = 'javascript:...'` serait bloquée par
le CSP nonce des routes SSR (`/connexion` est bien SSR). La redirection HTTP vers un domaine
tiers, elle, n'est bloquée par rien.

**Correctif :** le repo contient déjà la fonction adéquate — `getSafeNext()` dans
`src/pages/auth/confirm.ts:5`, qui rejette tout ce qui ne commence pas par `/`, ainsi que `//`
et les préfixes `/api/` et `/auth/`. La réutiliser côté client.

---

### S2 — CSP des pages prérendues sans protection XSS — moyenne

**Fichier :** `vercel.json:26`

```
script-src 'self' 'unsafe-inline'; script-src-elem 'self' 'unsafe-inline'
```

S'applique aux ~43 pages `prerender = true` (accueil, blog, legal, piliers, combats, public…).
Ces pages ne passent jamais par le middleware : Vercel les sert depuis le CDN, la lambda ne
s'exécute pas à la requête. Leur CSP ne peut donc pas être à nonce.

La situation est connue et documentée en détail dans `astro.config.mjs` (bloc « CSP : pourquoi
`security.csp` n'est PAS activé »), avec un chemin de migration en 4 étapes. Elle reste le plus
gros écart de posture du projet : le CSP statique durcit `object-src` / `base-uri` /
`form-action` / `frame-ancestors`, mais ne protège pas contre le XSS.

Contexte aggravant — `src/pages/blog/index.astro:452-465` reconstruit les cartes d'articles via
`innerHTML`. `title`, `description`, `author` et `tags` passent par `escapeHtml()`, mais
**`article.url`, `article.id` et `article.pubDateISO` sont interpolés bruts** :

```js
<article class="article-card" data-article-id="${article.id}">
  <time datetime="${article.pubDateISO}">
  <a href="${article.url}" class="card-title-link">
```

La source est le contenu MDX du repo, donc le risque pratique est nul aujourd'hui. Mais il n'y a
aucune défense en profondeur : la sûreté repose entièrement sur la confiance envers le contenu.

---

### S3 — Host header injection sur la réinitialisation de mot de passe — moyenne

**Fichier :** `src/pages/auth/mot-de-passe-oublie.ts:28-31, 44-51`

```ts
function getForwardedOrigin(request: Request): string | null {
  const proto = request.headers.get('x-forwarded-proto');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  ...
}

const candidates = [
  getForwardedOrigin(request),          // <-- premier
  normalizeOrigin(import.meta.env.SITE),
  normalizeOrigin(site),
  ...
];
```

`getForwardedOrigin()` est le **premier** candidat retenu, et il lit `x-forwarded-host` puis
`host` — deux en-têtes influençables par l'appelant. Le `redirectTo` du mail de réinitialisation
en découle directement (`${origin}/auth/confirm?type=recovery`).

C'est le schéma classique du *password reset poisoning* : l'attaquant déclenche un reset sur
l'adresse de la victime avec un `Host` forgé, et le lien du mail pointe vers son propre domaine.

**Atténuation existante :** Supabase valide `redirectTo` contre l'allowlist de redirect
configurée dans le dashboard. Un `evil.tld` serait rejeté (l'erreur retombe sur le message
« Configuration incorrecte. Contactez le support. » via `getErrorMessage`).

**Correctif :** inverser l'ordre — `SITE` / `VERCEL_PROJECT_PRODUCTION_URL` en premier, et ne
consulter le forwarded qu'en dev (le bloc `import.meta.env.DEV` en tête de fonction couvre déjà
ce besoin).

---

### S4 — `validateHttpUrl()` écrit mais jamais appelé

**Fichiers :**
- `src/lib/validation.ts:44` — helper défini, **zéro import dans tout le projet**
- `src/pages/api/admin/logiciels/creer.ts:47-51` et `modifier.ts` — stockage brut
- `src/pages/dashboard/user/logiciels.astro:103, 119, 129` — rendu

```ts
// creer.ts — aucune validation de schéma d'URL
logo_url: sanitize(form.get('logo_url'), 500),
download_url: sanitize(form.get('download_url'), 500),
website_url: sanitize(form.get('website_url'), 500),
```

```astro
<!-- user/logiciels.astro -->
<img src={sw.logo_url} alt={`Logo ${sw.name}`} class="software-logo" />
<a href={sw.website_url} ...>
<a href={sw.download_url} ...>
```

`sanitize()` ne fait que `trim` + troncature — aucun contrôle de protocole. Le
`<input type="url">` du formulaire admin (`admin/logiciels.astro:245, 249`) est une validation
**côté client uniquement**, contournable par une requête directe.

**Atténuation existante :** `javascript:` en `href` est bloqué par le CSP nonce des routes SSR
(les pages dashboard sont SSR). Le risque devient réel dès qu'un `'unsafe-inline'` réapparaît
dans `script-src`, ou si ces données sont un jour rendues sur une page prérendue (dont le CSP
contient déjà `'unsafe-inline'`, cf. S2).

**Correctif :** appeler `validateHttpUrl()` dans `creer.ts` et `modifier.ts`. Le helper existe,
il fait exactement ce qu'il faut (rejet de tout ce qui n'est pas `http:` / `https:`).

---

### S5 — Open redirect mineur sur l'acceptation légale — faible

**Fichier :** `src/pages/api/legal/accept.ts:104-107`

```ts
const referer = request.headers.get('referer') ?? '/';
return new Response(null, { status: 303, headers: { Location: referer } });
```

`Referer` non validé, repris tel quel en `Location`.

**Atténuation :** le contrôle d'origine du middleware (`isInvalidMutationOrigin`,
`src/middleware.ts:118-130`) exige `origin === expectedOrigin` sur toute méthode mutante hors
routes serveur-à-serveur. Une soumission cross-site est donc bloquée en 403 avant d'atteindre le
handler. Reste à corriger par principe (valider que `referer` est same-origin, sinon `/`).

---

### S6 — `nanoid` — GHSA-2v37-7h3g-55p8 (high) — faible

Chaîne : `eslint-plugin-astro@1.7.0` → `postcss@8.5.25` → `nanoid@3.3.17` (< 3.3.18).

Dépendance de **développement**, absente du bundle de production. `npm audit fix` résout.

```bash
npm audit fix
```

---

### S7 — Rate-limit fail-open sans IP — note

**Fichier :** `src/middleware.ts:47-48`

```ts
const ip = getClientIpOrNull(context.request, context.clientAddress);
if (!ip) return null;   // pas d'IP -> pas de rate-limit
```

Sur Vercel, `x-vercel-forwarded-for` est toujours posé par la plateforme, donc le cas ne se
produit pas en production. À garder en tête en cas de changement d'hébergeur : le comportement
par défaut est « laisser passer ».

---

## Bugs

### B1 — `apple-touch-icon.png` supprimé, toujours référencé 3 fois

Le fichier est absent de `public/` (suppression non commitée, visible en `D
public/apple-touch-icon.png`), mais reste référencé dans :

- `src/components/BaseHead.astro:125` — `<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />`
- `public/site.webmanifest:8` — entrée `icons[].src`
- `vercel.json:70` — règle `Cache-Control`

Conséquence : 404 sur l'icône d'écran d'accueil iOS, et une icône manquante dans le manifest PWA.

**Correctif :** soit restaurer le fichier (`git checkout -- public/apple-touch-icon.png`), soit
retirer les 3 références. Le repo contient déjà `icon-192.png` et `icon-512.png` si l'on veut
consolider.

---

### B2 — Accumulation d'espaces et placeholder mort dans les textareas admin

**Fichiers :** `src/pages/dashboard/admin/demandes.astro:208-213`,
`src/pages/dashboard/admin/contacts.astro:237-244`

```astro
<textarea
  name="admin_reply"
  rows="3"
  placeholder="Votre réponse visible par l'utilisateur…"
  class="admin-textarea"
>
  {req.admin_reply ?? ''}
</textarea>
```

Le contenu réel de l'élément vaut `"\n" + 20 espaces + valeur + "\n" + espaces`. La spécification
HTML ne retire qu'**un seul** saut de ligne en tête — le reste part dans le `value` du champ.

Côté serveur, aucun `trim` :

```ts
// src/pages/api/admin/demandes/repondre.ts:16
const adminReply = (form.get('admin_reply') as string | null)?.slice(0, 5000) ?? null;
// src/pages/api/admin/contacts/update.ts:15
const adminNotes = (form.get('admin_notes') as string | null)?.slice(0, 2000) ?? null;
```

Deux conséquences :

1. **Accrétion** — chaque aller-retour de sauvegarde ajoute un bloc d'indentation à la valeur
   stockée. Au bout de N sauvegardes, la réponse traîne N blocs de blancs, jusqu'à ce que
   `slice()` finisse par tronquer du texte utile.
2. **Placeholder mort** — le contenu n'étant jamais réellement vide (il contient des blancs), le
   `placeholder` ne s'affiche jamais, même sur une demande sans réponse.

**Correctif :** coller la valeur au tag (`>{req.admin_reply ?? ''}</textarea>`) **et** ajouter
`.trim()` côté serveur dans les deux routes.

---

### B3 — `?limit=abc` provoque un 500

**Fichier :** `src/pages/api/notifications.ts:38`

```ts
const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '20', 10), 50);
```

`Number.parseInt('abc', 10)` → `NaN` ; `Math.min(NaN, 50)` → `NaN` ; `.limit(NaN)` produit
`?limit=NaN` côté PostgREST, qui refuse la requête. La route retombe alors sur
`jsonError('Erreur serveur.', 500)`.

Même problème avec une valeur négative (`?limit=-5` → `.limit(-5)`).

**Correctif :** clamper explicitement.

```ts
const raw = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 50) : 20;
```

---

### B4 — `/api/indexnow` renvoie systématiquement 502 en production

**Fichier :** `src/pages/api/indexnow.ts:22-38`

```ts
const candidates = [
  'dist/client/sitemap-0.xml',
  'dist/sitemap-0.xml',
  '.vercel/output/static/sitemap-0.xml',
];
for (const c of candidates) {
  const xml = fs.readFileSync(path.resolve(c), 'utf8');
  ...
}
return [];
```

La lecture se fait sur le **filesystem au runtime**. Sur Vercel, le bundle de la fonction ne
contient pas `dist/` (ce sont des artefacts de build, servis par le CDN, pas embarqués dans la
lambda). Les 3 candidats échouent donc tous, `getSitemapUrls()` retourne `[]`, et le handler
sort en :

```ts
if (!urls.length) {
  return new Response(JSON.stringify({ error: 'sitemap_empty' }), { status: 502, ... });
}
```

L'endpoint est inopérant en production — aucune URL n'est jamais poussée vers IndexNow.

**Correctif :** récupérer le sitemap par HTTP plutôt que par le filesystem.

```ts
const res = await fetch(`${SITE_URL}/sitemap-0.xml`);
const xml = await res.text();
return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
```

---

### B5 — Aller-retour DB au résultat jeté

**Fichier :** `src/pages/dashboard/admin/logs.astro:41`

```ts
// Comptage par niveau
await supabase.rpc('log_level_counts');
```

Le résultat n'est affecté à rien et n'est utilisé nulle part dans le template. Un RPC par
chargement de page pour rien.

**Correctif :** soit câbler le résultat dans l'UI (l'intention d'origine, d'après le
commentaire), soit supprimer la ligne.

---

### B6 — Piège latent sur la migration des clés Supabase

**Fichiers :** `src/pages/auth/inscription.ts:41`, `src/pages/auth/update-password.ts:10`,
`src/pages/auth/update-profile.ts:10`

Ces trois routes ouvrent sur le même garde-fou :

```ts
if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) {
  return jsonError('Configuration Supabase manquante (SUPABASE_URL/SUPABASE_ANON_KEY).', 500);
}
```

Or `resolvePublishableKey()` (`src/lib/supabase.ts:29-45`) accepte **soit**
`PUBLIC_SUPABASE_PUBLISHABLE_KEY`, **soit** `SUPABASE_ANON_KEY`, et `resolveSupabaseUrl()` accepte
`PUBLIC_SUPABASE_URL` ou `SUPABASE_URL`.

Le jour où la migration vers les publishable keys est terminée et où `SUPABASE_ANON_KEY` est
retirée de l'environnement, ces 3 routes renverront 500 « Configuration Supabase manquante »
pendant que tout le reste de l'application continuera de fonctionner normalement. Le
`.env.example` invite explicitement à cette migration (« Laissez vide tant que la migration n'est
pas faite »).

Même remarque pour `src/pages/api/change-password.ts:18` qui lit `import.meta.env.SUPABASE_URL`
en direct au lieu de passer par `resolveSupabaseUrl()`.

**Correctif :** utiliser les resolvers de `src/lib/supabase.ts` partout, ou supprimer ces gardes
préliminaires (les resolvers jettent déjà une erreur explicite).

---

### B7 — Commentaires morts dans le middleware

**Fichier :** `src/middleware.ts:23-34` et `:125`

```
// ─── Cache logout (30 s, borne) ───
//   1. purge des entrees expirees, au plus une fois par CLEANUP_INTERVAL_MS ;
//   2. plafond dur LOGOUT_CACHE_MAX : au-dela, on evince la plus ancienne
// ─── Routes publiques ───
// ─── Lecture last_logout_at (cache 30 s) ───
```

Ces blocs décrivent un cache de logout, une constante `LOGOUT_CACHE_MAX` et une lecture
`last_logout_at` qui **n'existent plus** dans le fichier. De même pour la section « Routes
publiques », vide. Un lecteur y cherchera du code absent.

**Correctif :** supprimer ces blocs.

---

## Performance

### P1 — Le polling de notifications ne se met pas en pause

**Fichier :** `src/layouts/DashboardLayout.astro:617`

```ts
setInterval(fetchNotifications, 60_000);
```

Aucun `visibilitychange`, aucun `document.hidden`. Chaque tick coûte 1 appel réseau vers Supabase
Auth (`getUser()` dans `src/pages/api/notifications.ts:26`) **plus** 1 requête DB. Soit 60
allers-retours par heure et par onglet ouvert, y compris minimisé ou en arrière-plan pendant la
nuit.

**Correctif :** suspendre l'intervalle sur `document.hidden`, et relancer un `fetch` immédiat au
retour de visibilité.

---

### P2 — 5 allers-retours séquentiels sur la page contacts

**Fichier :** `src/pages/dashboard/admin/contacts.astro:23-49`

1 requête de liste, puis **4 requêtes `count: exact` distinctes** (`new`, `read`, `replied`,
`archived`), toutes `await` en série.

**Correctif :** `Promise.all` sur les 4 comptages (gain immédiat, changement minimal), ou une
seule requête groupée / vue SQL.

---

### P3 — Pas de pagination sur contacts et demandes

`contacts.astro:21` et `demandes.astro` plafonnent à `LIST_CAP = 200` avec un `+ 1` pour détecter
la troncature — le commentaire en place reconnaît déjà que « la vraie correction reste la
pagination ». Le gabarit existe dans `logs.astro`, `users.astro` et `user/activity.astro`.

---

### P4 — Deux appels d'authentification par requête protégée

`src/lib/auth.ts:161-172` — chaque `requireX()` enchaîne :

1. `supabase.auth.getUser()` — appel **réseau** vers Supabase Auth (validation JWT) ;
2. `fetchRoleSecure(user.id)` — requête DB avec le client `service_role`.

Sur chaque page dashboard et chaque route API gardée. Un *custom access token hook* Supabase
plaçant `role` dans les claims du JWT supprimerait le second appel.

À noter : `DashboardLayout.astro:37` accepte déjà un `authResult` passé par la page pour éviter un
second `requireAuth` — le motif est bon et appliqué partout.

---

### P5 — `select('*')` sur 8 emplacements

`src/pages/api/me/export-data.ts:38`, `dashboard/admin/contacts.astro:26`,
`dashboard/admin/logiciels.astro:30`, `dashboard/admin/resources.astro:25`,
`dashboard/association/index.astro:16,22`, `dashboard/user/demandes.astro:32`,
`dashboard/user/logiciels.astro:30`.

`logs.astro` et `users.astro` montrent déjà le bon motif (colonnes explicites).
Pour `export-data.ts`, le `select('*')` est en revanche **volontaire et correct** : c'est un
export RGPD Art. 15, il doit tout renvoyer.

---

### P6 — Wildcards `ilike` non filtrés dans la recherche admin

**Fichier :** `src/pages/dashboard/admin/users.astro:25`

```ts
const search = (Astro.url.searchParams.get('q') ?? '').replace(/[,.()[\]]/g, '');
...
if (search) query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
```

Le nettoyage retire les caractères de structure PostgREST (`,`, `.`, `()`, `[]`) — c'est le point
important et il est traité. Mais `%` et `_` passent : `?q=%%%%%%` force un scan complet sur
`profiles`. Route admin uniquement, impact faible.

---

## Ce qui est solide

Relevé pour éviter des régressions lors des corrections ci-dessus.

- **Gardes d'authentification sur 100 % des surfaces protégées** — vérifié fichier par fichier :
  les 16 pages `dashboard/` et les 11 routes `api/admin/` appellent toutes un `requireX()` en
  première instruction. Les routes non gardées par `requireX` (`notifications`, `me/*`,
  `demandes/creer`, `legal/accept`, `change-password`) font toutes leur propre
  `getUser()` + 401.

- **Type marqué `AuthRedirect`** (`src/lib/auth.ts:47-49`) — `AuthRedirect extends Response` avec
  un champ fantôme `__authRedirectBrand`. Coût runtime nul (jamais émis en JS), mais TypeScript
  refuse `result.user` tant que le narrowing `instanceof Response` n'a pas eu lieu. Complété par
  la règle ESLint maison `eslint-rules/require-auth-narrow.cjs`. Toute une classe d'oublis de
  garde devient impossible à compiler.

- **`src/lib/jsonLd.ts`** — échappe `<`, `>`, `&`, U+2028 et U+2029 avant insertion dans un
  `<script type="application/ld+json">`. Le piège classique (`JSON.stringify` n'échappe pas
  `</script>`) est traité, et documenté.

- **Liste de notifications construite en API DOM** (`DashboardLayout.astro:513-560`) — `textContent`
  et `dataset`, jamais `innerHTML`, sur des données saisies par des bénévoles. La sûreté vient de
  l'API choisie, pas de la vigilance du prochain contributeur.

- **Upload de ressources** (`api/admin/resources/upload.ts`) — allowlist MIME, vérification des
  *magic bytes* contre le type déclaré, `image/svg+xml` explicitement retiré (avec la
  justification), plafond 50 Mo, rollback du fichier si l'insert BDD échoue.

- **`src/lib/secrets.ts`** — comparaison à temps constant (SHA-256 + `timingSafeEqual`) sur
  `CRON_SECRET` et `INDEXNOW_SECRET`. Le hachage préalable règle proprement la contrainte de
  longueur égale de `timingSafeEqual`.

- **Garde CSRF du middleware** (`src/middleware.ts:105-130`) — `Origin` exact **et**
  `Sec-Fetch-Site`, sur toute méthode mutante, avec une liste explicite de routes
  serveur-à-serveur exemptées (qui vérifient leur propre Bearer).

- **Cookies de session** — `httpOnly`, `secure` en prod, `SameSite=lax`, `path=/`, plus
  propagation des en-têtes `no-cache` de `@supabase/ssr` vers la réponse finale
  (`supabase.ts:138-145` + `middleware.ts:250-255`) pour empêcher un CDN de mettre en cache une
  réponse porteuse de cookie.

- **Discipline `getUser()` / jamais `getSession()`** — respectée dans l'intégralité du code
  serveur, avec la justification (rotation des refresh tokens) documentée en tête de
  `src/lib/supabase.ts` et `src/middleware.ts`.

- **IP de rate-limit** — `src/lib/http.ts` ne lit que `x-vercel-forwarded-for` puis
  `clientAddress`. Les en-têtes librement forgeables (`cf-connecting-ip`, `x-forwarded-for`) ont
  été retirés, y compris pour le hash d'IP de la trace juridique (`api/legal/accept.ts`).
