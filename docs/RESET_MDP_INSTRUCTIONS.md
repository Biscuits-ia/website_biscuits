# Réinitialisation de mot de passe - Instructions de débogage

## Problème actuel

Quand tu cliques sur le lien de réinitialisation, tu es redirigé vers :
```
/connexion?error=confirmation&code=invalid_request#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
```

Cela signifie que **le lien a expiré** ou est **invalide**.

---

## Causes possibles

### 1. Lien expiré (cause la plus probable)

Les tokens de recovery Supabase expirent après **1 heure** par défaut.

**Solution** : Utiliser un lien frais
- Demander un nouveau reset via `/mot-de-passe-oublie`
- Cliquer sur le lien **immédiatement** après réception

---

### 2. Lien mal formé par Supabase

Supabase peut générer des liens avec le hash (`#`) au lieu des query params (`?`) selon la configuration.

**Vérification requise dans Supabase Dashboard** :

1. Aller dans : **Authentication → Email Templates → Recovery email**
2. Vérifier que le template utilise `{{ .ConfirmationURL }}` (et NON `{{ .SiteURL }}/auth/v1/verify...`)

**Template correct à utiliser** :
```html
<h2>Réinitialisation de mot de passe</h2>
<p>Cliquez sur ce lien pour réinitialiser votre mot de passe :</p>
<p><a href="{{ .ConfirmationURL }}">Réinitialiser mon mot de passe</a></p>
<p>Le lien expirera dans 1 heure.</p>
<p>Si vous n'avez pas demandé ce changement, ignorez cet email.</p>
```

---

### 3. Redirect URL non whitelistée

**Vérification** :

1. Aller dans : **Authentication → URL Configuration**
2. Vérifier que ces URLs sont dans "Redirect URLs" :
   ```
   https://biscuits-ia.com/auth/confirm
   http://localhost:4321/auth/confirm
   ```

---

## Comment déboguer

### Étape 1 : Vérifier les logs

Quand tu cliques sur le lien, regarde les logs du serveur Astro :

```bash
# En dev
npm run dev

# En production (Vercel)
vercel logs biscuits-ia
```

Tu devrais voir quelque chose comme :
```
[confirm] Received request: {
  tokenHash: "present",
  type: "recovery",
  code: "missing",
  next: "/reinitialisation-mot-de-passe"
}
```

Si tu vois `tokenHash: "missing"`, le lien n'est pas correctement formaté.

---

### Étape 2 : Tester manuellement avec curl

```bash
# 1. Demander un reset
curl -X POST http://localhost:4321/auth/mot-de-passe-oublie \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=TON_EMAIL@test.com"

# 2. Récupérer le lien depuis l'email (via Supabase Dashboard → Authentication → Emails)

# 3. Extraire token_hash et type de l'URL
# Ex: http://localhost:4321/auth/confirm?token_hash=ABC123&type=recovery&next=/reset

# 4. Tester manuellement
curl -v "http://localhost:4321/auth/confirm?token_hash=ABC123&type=recovery" \
  -c /tmp/cookies.txt

# Attendre : 302 avec Location: /reinitialisation-mot-de-passe
# Vérifier : set-cookie dans la réponse
```

---

### Étape 3 : Vérifier le token dans Supabase

Dans Supabase Dashboard → Authentication → Users :

1. Trouver ton utilisateur
2. Vérifier que `email_confirmed_at` n'est pas NULL
3. Si le token est expiré, il faut en demander un nouveau

---

## Solution rapide pour tester

Si tu veux tester **immédiatement** sans attendre les emails :

```bash
# 1. Générer un lien de recovery manuellement via l'API Admin
# (à exécuter côté serveur avec la clé service_role)

curl -X POST 'https://iaobuhfajccwfeicgymt.supabase.co/rest/v1/functions/v1/generate-link' \
  -H 'Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "ton.email@test.com",
    "type": "recovery"
  }'
```

OU utiliser la CLI Supabase :

```bash
supabase auth reset ton.email@test.com
```

---

## Configuration recommandée dans Supabase

### Authentication → URL Configuration

```
Site URL: https://biscuits-ia.com

Redirect URLs:
  - https://biscuits-ia.com/auth/confirm
  - https://biscuits-ia.com/auth/callback
  - http://localhost:4321/auth/confirm
  - http://localhost:4321/auth/callback
```

### Authentication → Email Templates → Recovery

```html
<h2>Réinitialisation de mot de passe</h2>
<p>
  <a href="{{ .ConfirmationURL }}">
    Réinitialiser mon mot de passe
  </a>
</p>
<p>Ou copiez ce lien : {{ .ConfirmationURL }}</p>
<p>Ce lien expirera dans 1 heure.</p>
```

### Authentication → Settings

```
✓ Enable Email Confirmations
✓ Enable Email Change Confirmations
Token expiry: 1 hour (default)
```

---

## Prochaines étapes

1. **Vérifier le template d'email** dans Supabase Dashboard
2. **Demander un NOUVEAU lien** (l'ancien est expiré)
3. **Tester immédiatement** après réception
4. **Vérifier les logs** du serveur Astro au moment du clic
