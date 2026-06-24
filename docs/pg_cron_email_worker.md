# Worker email — pg_cron (Supabase) au lieu de Vercel Cron

## Pourquoi ce changement ?

Vercel **Hobby** limite les cron jobs à **1 exécution / jour**. Notre
worker d'envoi d'emails (/api/cron/email-outbox) doit tourner toutes
les ~2 minutes pour que les emails transactionnels partent sans délai
visible (confirmations d'inscription, HelloAsso, etc.).

On a donc déplacé la périodicité côté **Supabase** via pg_cron, qui
est gratuit et sans limite de fréquence sur tous les plans Supabase.

## Comment ça marche

`
+--------------------+       net.http_post         +----------------------+
|  pg_cron           |  -------------------------> |  Vercel serverless   |
|  (toutes les 2min) |   Authorization: Bearer X   |  /api/cron/          |
|                    |                              |   email-outbox       |
+--------------------+                              +----------+-----------+
         |                                                    |
         | INSERT (audit)                                     | SELECT pending
         v                                                    v
   public.pg_cron_audit                              public.email_outbox
`

1. pg_cron exécute public.invoke_email_outbox_worker() toutes les
   2 minutes.
2. La fonction lit l'URL et le CRON_SECRET depuis
   public.app_runtime_config (ou ault.secrets).
3. Elle déclenche un POST asynchrone via 
et.http_post() sur
   https://biscuits-ia.com/api/cron/email-outbox.
4. Vercel traite le batch d'emails en attente (max 25 / appel).
5. L'exécution est journalisée dans public.pg_cron_audit + l'API
   réponse dans extensions.net._http_response.

## Setup en prod

### 1. Appliquer la migration

`sh
supabase db push
`

ou copier/coller le contenu de
supabase/migration/20260624_pg_cron_email_outbox.sql dans le SQL
Editor du dashboard Supabase.

### 2. Stocker le CRON_SECRET

Le secret doit être accessible à pg_cron. Deux options :

**Option A — Vault (recommandé, chiffré) :**

`sql
SELECT vault.create_secret(
  '<valeur de CRON_SECRET>',
  'cron_secret',
  'Bearer token pour pg_cron -> /api/cron/email-outbox'
);
`

**Option B — Table de config (dev / preview) :**

`sql
INSERT INTO public.app_runtime_config (key, value)
VALUES ('cron_secret', '<valeur de CRON_SECRET>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
`

⚠️ pp_runtime_config est en RLS admin-only mais reste lisible par
n'importe quel role Postgres via la fonction SECURITY DEFINER.
Ne l'utiliser qu'en dev.

### 3. Vérifier que le job tourne

`sql
-- Voir les jobs pg_cron planifies
SELECT * FROM cron.job WHERE jobname = 'email_outbox_worker';

-- Dernieres executions + status HTTP
SELECT * FROM public.v_pg_cron_email_worker LIMIT 10;

-- Declenchement manuel (pour debug)
SELECT public.invoke_email_outbox_worker();
`

## Modifier la frequence / l'URL a chaud

Pas besoin de re-deployer. Tout est en base :

`sql
-- Changer la frequence
SELECT cron.unschedule('email_outbox_worker');
SELECT cron.schedule('email_outbox_worker', '*/1 * * * *',
  \\ public.invoke_email_outbox_worker();\\$);

-- Changer l'URL (ex : pointer vers une preview Vercel)
UPDATE public.app_runtime_config
SET value = 'https://biscuits-ia-git-feature-x.vercel.app/api/cron/email-outbox',
    updated_at = now()
WHERE key = 'email_worker_url';
`

## Pourquoi c'est compatible Vercel Hobby

- L'entrée crons de ercel.json a été **retirée** : Vercel ne tente
  plus de planifier le job → plus d'erreur Hobby.
- L'endpoint /api/cron/email-outbox reste inchangé (même code,
  même auth Bearer ). Il accepte les requêtes HTTP
  externes — pas de coût Vercel Cron.
- Le worker tourne toutes les 2 min comme avant.

## Couts

- pg_cron : gratuit (Supabase Free / Pro).
- pg_net : gratuit, ~256 KB de bande passante par requête.
- Vercel serverless : ~720 invocations / jour = bien en dessous des
  100 000 invocations gratuites Hobby.

## Fallback

Si pg_cron est down pour une raison quelconque, les emails restent
dans email_outbox (status pending ou ailed) et repartent
automatiquement à la reprise. Pas de perte.

## Suivi en local (CLI)

Deux scripts npm pour verifier que tout tourne, sans ouvrir le dashboard Supabase.

```sh
# Vue densemble (job + outbox + 10 dernieres executions)
npm run cron:status

# Sortie JSON brute (pour piping / scripts)
npm run cron:json | jq
```

Les deux scripts lisent la base via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
(presents dans .env.local). Aucune autre config requise.

Exemple de sortie cron:status :

```
=== pg_cron email worker ===
checked_at : 2026-06-24 14:32:11 UTC

Schedule (cron.job):
  - email_outbox_worker  schedule=*/2 * * * *  active=true

Outbox stats:
  total   = 12
  pending =  3
  sending =  0
  sent    =  8
  failed  =  1
  dead    =  0

Last 10 runs:
  started_at           | http  | to | response (head)
  ---------------------+------+----+-------------------------------
  2026-06-24 14:30:00  | 200  | f  | {"processed":2,"succeeded":2,...
  2026-06-24 14:28:00  | 200  | f  | {"processed":0,"succeeded":0,...
  ...
```

## Logs Vercel

Chaque run log une ligne JSON structuree, exploitable par Vercel log drains.
Le champ source permet de filtrer :

- source=pg_cron : appel automatique depuis Supabase (normal).
- source=manual : appel via curl / Postman / dashboard Vercel.

Exemple de log line :

```json
{"msg":"cron/email-outbox","source":"pg_cron","durationMs":412,
 "processed":3,"succeeded":3,"failed":0,"retried":0,"dead":0}
```

Pour ne voir que les runs pg_cron dans Vercel :

```sh
vercel logs --prod | grep "source.:.pg_cron"
```
