# Rotation des secrets — Procédure

> **Statut (2026-07-09)** : la rotation effective des clés encore en prod est
> bloquée par la disponibilité d'une fenêtre de déploiement manuel. Cette
> procédure documente les étapes pour qu'elles soient reproductibles
> indépendamment de la personne qui les exécute.

## Secrets à rotater

| Secret | Où le générer | Où le mettre |
|---|---|---|
| `PUBLIC_WEB3FORMS_ACCESS_KEY` | <https://web3forms.com> → dashboard → regenerate | `Vercel` → Project Settings → Environment Variables (`Production`) |
| `SUPABASE_SERVICE_ROLE_KEY` | <https://supabase.com/dashboard> → Project Settings → API → Roll new service role JWT | Idem. NE JAMAIS la commiter. |
| `CRON_SECRET` | `openssl rand -hex 32` localement | Idem. Utilisé dans les 2 routes `/api/cron/*`. |
| `HELLOASSO_CLIENT_SECRET` | N/A depuis P4 #43 — HelloAsso retiré. Si un prestataire de paiement le remplace, regénérer selon la doc du nouveau prestataire. |

## Procédure pas-à-pas

### 1. Régénérer le secret

Ouvrir le dashboard du fournisseur, **roll** / **regenerate**. Copier la
nouvelle valeur. **Note** : l'ancienne valeur est invalidée *immédiatement*
pour la plupart des fournisseurs — toutes les requêtes qui l'utilisent
échouent entre le moment du roll et le moment où la nouvelle valeur est
propagée sur Vercel.

### 2. Mettre à jour Vercel

```bash
vercel env rm PUBLIC_WEB3FORMS_ACCESS_KEY production
vercel env add PUBLIC_WEB3FORMS_ACCESS_KEY production
# Coller la nouvelle valeur.
```

Répéter pour `SUPABASE_SERVICE_ROLE_KEY` et `CRON_SECRET`.

### 3. Déployer

```bash
vercel deploy --prod
```

Vercel injecte les nouvelles variables dans la lambda au démarrage. La
rotation est effective à la fin du déploiement.

### 4. Vérifier

```bash
curl -fsS https://biscuits-ia.com/api/cron/aggregate-downloads \
  -H "Authorization: Bearer $CRON_SECRET"
# doit repondre 200, pas 401.
```

### 5. (Une seule fois) Nettoyer l'historique git

Les commits qui ont fui `.env` (cf. audit.md §7.15) ne contenaient que des
`PUBLIC_*` — pas de secret à valeur probante. **Aucune action requise sur
l'historique**. Si jamais un `SERVICE_ROLE` ou `CRON_SECRET` fuit
ultérieurement, c'est une rotation + un `git filter-repo` /
`gitleaks protect` + une rotation des creds Supabase côté serveur.

## Pre-commit local (optionnel)

`gitleaks` n'est **pas** dans `package.json` parce que c'est un binaire
Go, pas un module Node. Pour un scan avant commit :

```bash
# Une fois pour toutes (macOS)
brew install gitleaks

# A chaque commit
gitleaks protect --staged --redact --config .gitleaks.toml
```

La **CI** scanne l'historique complet sur chaque PR (cf.
`.github/workflows/ci.yml`, job `secrets-scan`), donc le pre-commit local
est un confort, pas une nécessité.

## Audit retro-actif

Pour scanner l'historique git existant (one-shot) :

```bash
gitleaks detect --source . --config .gitleaks.toml --redact --verbose
```

À exécuter une fois après adoption de `.gitleaks.toml`. Résultat attendu :
**zéro fuite**. Les commits incriminés par audit.md §7.15 ne contenaient
que des `PUBLIC_*` (pattern `biscuits-web3forms-real-key` ne matche pas
sur des placeholders).
