# Authentification Astro + Supabase - Guide Complet

## Architecture du flux d'authentification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INSCRIPTION                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. POST /auth/inscription                                                   │
│    - Crée l'utilisateur avec supabase.auth.signUp()                         │
│    - Supabase envoie email de confirmation                                  │
│    - Retourne { success: true } au client                                   │
│                                                                             │
│ 2. Utilisateur clique lien email → /auth/confirm                            │
│    - token_hash + type=signup OU code= (PKCE)                               │
│    - verifyOtp() ou exchangeCodeForSession()                                │
│    - Définit cookies de session                                             │
│    - Redirige vers /dashboard/user                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONNEXION                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. POST /auth/connexion                                                     │
│    - signInWithPassword() avec email + mot de passe                         │
│    - Supabase retourne session + tokens                                     │
│    - Cookies définis via setAll()                                           │
│    - Retourne { success: true }                                             │
│                                                                             │
│ 2. Client redirige vers /dashboard/user                                     │
│    - Middleware valide la session via getUser()                             │
│    - Rafraîchit le token si nécessaire                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      RÉINITIALISATION MOT DE PASSE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. POST /auth/mot-de-passe-oublie                                           │
│    - resetPasswordForEmail()                                                 │
│    - Supabase envoie email avec code OTP                                     │
│                                                                             │
│ 2. POST /auth/verifier-token-reinitialisation                               │
│    - Vérifie email + token + type=recovery via verifyOtp()                 │
│    - Crée session authentifiée                                              │
│    - Redirige vers /reinitialisation-mot-de-passe                           │
│                                                                             │
│ 3. POST /auth/reinitialiser-mot-de-passe                                    │
│    - Vérifie que utilisateur est authentifié (getUser())                    │
│    - updateUser({ password })                                               │
│    - signOut() pour invalider la session                                    │
│    - Redirige vers /connexion                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Checklist des erreurs classiques avec Supabase Auth

### ❌ Erreurs de configuration

- [ ] **redirectTo mal configuré** : L'URL de redirection doit être dans les Allowed Redirect URLs du dashboard Supabase
- [ ] **SITE non défini** : La variable `SITE` dans `.env` est requise pour générer les URLs de redirection
- [ ] **Clés Supabase inversées** : `SUPABASE_ANON_KEY` pour le client, `SUPABASE_SERVICE_ROLE_KEY` uniquement côté serveur
- [ ] **CORS non configuré** : Ajouter les origins dans Supabase → Authentication → URL Configuration

### ❌ Erreurs de session/cookies

- [ ] **Cookies non propagés en SSR** : Utiliser `setAll()` correctement et retourner une Response avec Status 302 + Location
- [ ] **Token non rafraîchi** : Appeler `getUser()` dans le middleware pour déclencher le refresh
- [ ] **Deux clients Supabase** : Réutiliser `locals.supabase` au lieu de recréer un client
- [ ] **Refresh token expiré** : Gérer les erreurs `getUser()` dans le middleware (session expirée = utilisateur non connecté)

### ❌ Erreurs de flux

- [ ] **Lien de reset pointing vers /auth/callback** : Le reset utilise `token_hash + type`, pas un code PKCE
- [ ] **updateUser sans session valide** : Vérifier `getUser()` avant `updateUser()`
- [ ] **signOut sans scope** : Utiliser `signOut({ scope: 'global' })` pour invalider tous les appareils
- [ ] **Redirection ouverte** : Valider que `next` commence par `/` et ne commence pas par `//` ou `/api/`

### ❌ Erreurs de sécurité

- [ ] **RLS non activé** : Activer RLS sur toutes les tables exposées
- [ ] **service_role exposé** : Jamais dans le code client ou les variables `NEXT_PUBLIC_*`
- [ ] **user_metadata pour l'autorisation** : Utiliser `raw_app_meta_data` ou une table `profiles`
- [ ] **Views sans security_invoker** : Les views bypassent RLS par défaut

## Comment tester correctement les flux

### Test du flux d'inscription

```bash
# 1. Tester l'API d'inscription
curl -X POST http://localhost:4321/auth/inscription \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com&password=TestPassword123"

# Attendre : {"success":true}

# 2. Vérifier dans Supabase Dashboard → Authentication → Users
#    - L'utilisateur existe avec email_confirmed_at = NULL

# 3. Récupérer le lien de confirmation depuis les emails Supabase
#    Dashboard → Authentication → Email Templates → Confirmation

# 4. Simuler le clic sur le lien
#    Extraire token_hash et type de l'URL
curl "http://localhost:4321/auth/confirm?token_hash=XXX&type=signup"

# Attendre : Redirection 302 vers /dashboard/user
# Vérifier : Cookie set-cookie dans la réponse
```

### Test du flux de connexion

```bash
# 1. Se connecter
curl -X POST http://localhost:4321/auth/connexion \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com&password=TestPassword123" \
  -c cookies.txt

# Attendre : {"success":true}
# Vérifier : cookies.txt contient les cookies de session

# 2. Accéder à une page protégée
curl http://localhost:4321/dashboard/user \
  -b cookies.txt \
  -v

# Attendre : Status 200, HTML de la page
```

### Test du flux de reset de mot de passe (OTP)

```bash
# 1. Demander un reset
curl -X POST http://localhost:4321/auth/mot-de-passe-oublie \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com"

# Attendre : {"success":true,"message":"Email envoyé..."}

# 2. Récupérer le code OTP dans l'email Supabase
#    Dashboard → Authentication → Email Templates → Recovery

# 3. Vérifier le code OTP (crée la session)
curl -X POST http://localhost:4321/auth/verifier-token-reinitialisation \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@example.com" \
  -d "token=123456" \
  -c cookies.txt

# Attendre : {"success":true}
# Vérifier : cookies.txt contient la session

# 4. Changer le mot de passe
curl -X POST http://localhost:4321/auth/reinitialiser-mot-de-passe \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "password=NouveauMotDePasse123" \
  -b cookies.txt

# Attendre : {"success":true}
# Vérifier : cookies.txt ne contient plus de session valide
```

## Configuration requise

### Variables d'environnement (.env)

```env
# Obligatoires
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG... (clé anon publique)
SUPABASE_SERVICE_ROLE_KEY=eyJhbG... (clé service_role SECRETE)
SITE=https://your-domain.com

# Optionnel (Turnstile)
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

### URLs autorisées dans Supabase Dashboard

Aller dans : Supabase Dashboard → Authentication → URL Configuration

```
Site URL: https://biscuits-ia.com
Redirect URLs:
  - https://biscuits-ia.com/auth/callback
  - https://biscuits-ia.com/auth/confirm
  - http://localhost:4321/auth/callback (dev)
  - http://localhost:4321/auth/confirm (dev)
```

### Templates d'emails personnalisés

Supabase Dashboard → Authentication → Email Templates

**Confirmation d'inscription :**
```html
<h2>Confirmez votre email</h2>
<p>Merci de vous être inscrit à Biscuits IA !</p>
<p>
  <a href="{{ .ConfirmationURL }}">
    Confirmer mon email
  </a>
</p>
<p>Ou copiez ce lien : {{ .ConfirmationURL }}</p>
```

**Réinitialisation de mot de passe :**
```html
<h2>Réinitialisation de mot de passe</h2>
<p>Utilisez ce code : <strong>{{ .Token }}</strong></p>
<p>Ce code expire dans 1 heure.</p>
<p>Si vous n'avez pas demandé ce changement, ignorez cet email.</p>
```

## Dépannage

### "Invalid redirect URL"

**Cause** : L'URL de redirection n'est pas dans la whitelist Supabase.

**Solution** :
1. Dashboard → Authentication → URL Configuration
2. Ajouter l'URL dans "Redirect URLs"
3. Attendre 1-2 minutes pour la propagation

### "Session expired" après clic sur lien

**Cause** : Le token a expiré ou n'a pas été échangé correctement.

**Solution** :
1. Vérifier que `/auth/confirm` appelle bien `verifyOtp()` ou `exchangeCodeForSession()`
2. Vérifier que les cookies sont définis avec `setAll()`
3. Retourner une Response 302 avec Location au lieu de `redirect()`

### "Email already registered"

**Cause** : L'email existe déjà dans Supabase.

**Solution** :
1. Gérer l'erreur dans `/auth/inscription` (déjà fait)
2. Proposer la connexion plutôt que de bloquer

### Cookies non définis en production

**Cause** : `secure: true` requis pour HTTPS, domaine incorrect.

**Solution** :
1. Vérifier `secure: import.meta.env.PROD` dans `supabase.ts`
2. Ajouter `domain: '.biscuits-ia.com'` en production
3. Vérifier que le middleware s'exécute sur toutes les routes

## Bonnes pratiques

1. **Toujours valider `next`** : Empêcher les redirections ouvertes
2. **Logger les erreurs** : `console.error` avec le code d'erreur Supabase
3. **Messages utilisateur génériques** : Ne pas exposer les erreurs internes
4. **signOut({ scope: 'global' })** : Pour invalider tous les appareils
5. **RLS activé par défaut** : Même pour les tables "publiques"
6. **Tests réguliers des flux** : Automatiser avec des scripts curl
