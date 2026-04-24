# Réinitialisation de mot de passe - Flux OTP manuel

Le projet utilise maintenant un flux de réinitialisation par code OTP saisi manuellement :

1. L'utilisateur demande un reset sur /mot-de-passe-oublie
2. Supabase envoie un email contenant un code
3. L'utilisateur saisit email + code sur /verifier-code-reinitialisation
4. Le serveur vérifie via verifyOtp(type=recovery)
5. L'utilisateur accède à /reinitialisation-mot-de-passe

---

## Configuration Supabase obligatoire

### 1. Template Recovery email (OTP manuel)

Aller dans : Authentication -> Email Templates -> Recovery email

Utiliser ce template HTML (prêt à coller) :

```html
<h2>Réinitialisation de votre mot de passe</h2>
<p>Bonjour,</p>
<p>Utilisez ce code pour réinitialiser votre mot de passe :</p>

<p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 20px 0;">
  {{ .Token }}
</p>

<p>Ce code expire dans 1 heure.</p>
<p>Entrez-le sur la page de vérification du site Biscuits IA.</p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
```

### 2. URL Configuration

**Vérification** :

1. Aller dans : Authentication -> URL Configuration
2. Vérifier que ces URLs sont dans "Redirect URLs" :
   ```
   https://biscuits-ia.com/auth/confirm
  https://biscuits-ia.com/reinitialisation-mot-de-passe
   http://localhost:4321/auth/confirm
  http://localhost:4321/reinitialisation-mot-de-passe
   ```

---

## Comment déboguer

### Étape 1 : Demander un code

```bash
curl -X POST http://localhost:4321/auth/mot-de-passe-oublie \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=TON_EMAIL@test.com"
```

Attendu :

```json
{"success":true,"message":"Email envoyé. Vérifiez votre boîte de réception pour récupérer le code."}
```

### Étape 2 : Vérifier le code OTP

```bash
curl -X POST http://localhost:4321/auth/verifier-token-reinitialisation \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=TON_EMAIL@test.com" \
  -d "token=123456"
```

Attendu :

```json
{"success":true}
```

### Étape 3 : Mettre à jour le mot de passe

Le POST de changement de mot de passe doit être fait avec la session (cookies) obtenue après verifyOtp.

### Étape 4 : Vérifier les logs

Regarder les logs Astro au moment de la vérification OTP :

```bash
# En dev
npm run dev

# En production (Vercel)
vercel logs biscuits-ia
```

Tu devrais voir quelque chose comme :
```
[reset-password] verifyOtp error: ...
```

En cas de succès, pas d'erreur et l'utilisateur est redirigé vers /reinitialisation-mot-de-passe.

---

### Étape 5 : Vérifier le token dans Supabase

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

## Récap configuration recommandée

### Authentication → URL Configuration

```
Site URL: https://biscuits-ia.com

Redirect URLs:
  - https://biscuits-ia.com/auth/confirm
  - https://biscuits-ia.com/auth/callback
  - https://biscuits-ia.com/reinitialisation-mot-de-passe
  - http://localhost:4321/auth/confirm
  - http://localhost:4321/auth/callback
  - http://localhost:4321/reinitialisation-mot-de-passe
```

### Authentication -> Email Templates -> Recovery

```html
<h2>Réinitialisation de mot de passe</h2>
<p>Utilisez ce code : <strong>{{ .Token }}</strong></p>
<p>Ce code expirera dans 1 heure.</p>
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
