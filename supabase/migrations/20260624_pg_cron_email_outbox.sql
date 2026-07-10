-- ============================================================================
-- Migration : Worker email_outbox declenche par pg_cron
-- Date       : 2026-06-24
-- ----------------------------------------------------------------------------
-- Pourquoi : Vercel Hobby limite les cron jobs a 1 execution / jour, mais
-- l'email_outbox doit ete vide toutes les ~2 min pour que les emails
-- transactionnels partent sans delai visible.
--
-- Solution : on deplace la periodicite cote Supabase via pg_cron (autorise
-- sur le plan Free). Le job appelle net.http_post() sur l'endpoint Vercel
-- /api/cron/email-outbox avec le CRON_SECRET dans le header Authorization.
--
-- Cout      : 0 (pg_cron et pg_net sont gratuits sur Supabase).
-- Frequence : */2 minutes, modifiable en editant la table cron.job.
-- ============================================================================

-- 1. Extensions requises (idempotent, deja actives sur la majorite des
--    projets Supabase, mais on les declare explicitement pour la portabilite).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- 2. Table de configuration runtime (URL cible, secret, etc.).
CREATE TABLE IF NOT EXISTS public.app_runtime_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.app_runtime_config IS
  'Petite table de configuration cle/valeur lue au runtime par pg_cron (URL cron, secrets, etc).';

INSERT INTO public.app_runtime_config (key, value)
VALUES
  ('email_worker_url',  'https://biscuits-ia.com/api/cron/email-outbox'),
  ('email_worker_interval_minutes', '2'),
  -- La cle 'cron_secret' est vide ici : la fonction invoke_email_outbox_worker()
  -- la cherche en priorite dans vault.decrypted_secrets (crypte, role-only) puis
  -- dans cette table (fallback dev/preview). Pour un deploiement de prod propre,
  -- poser le secret dans vault via Supabase Studio > Database > Vault Secrets
  -- (name=cron_secret, secret=<CRON_SECRET>), et laisser cette ligne vide.
  -- Cf. AUDIT-MIGRATIONS, finding B4.
  ('cron_secret', '')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_runtime_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_runtime_config_admin_read" ON public.app_runtime_config;
CREATE POLICY "app_runtime_config_admin_read"
  ON public.app_runtime_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 3. Fonction appelee par pg_cron. Fire-and-forget : on lance le POST
--    asynchrone via net.http_post et on n'attend pas la reponse (le worker
--    peut prendre plusieurs secondes sur un gros batch).
CREATE OR REPLACE FUNCTION public.invoke_email_outbox_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS \$\$
DECLARE
  v_url        text;
  v_secret     text;
  v_request_id bigint;
  v_started_at timestamptz := now();
BEGIN
  -- URL cible (modifiable a chaud via UPDATE public.app_runtime_config).
  SELECT value INTO v_url FROM public.app_runtime_config WHERE key = 'email_worker_url';
  IF v_url IS NULL OR v_url = '' THEN
    RAISE WARNING '[pg_cron] email_worker_url non configure, job ignore';
    RETURN;
  END IF;

  -- Secret : vault.secrets d'abord (chiffre, role-only), app_runtime_config
  -- en fallback (utile en dev / preview).
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;
  EXCEPTION WHEN undefined_function OR undefined_table THEN
    v_secret := NULL;
  END;

  IF v_secret IS NULL OR v_secret = '' THEN
    SELECT value INTO v_secret FROM public.app_runtime_config WHERE key = 'cron_secret';
  END IF;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING '[pg_cron] CRON_SECRET introuvable (ni vault ni app_runtime_config), job ignore';
    RETURN;
  END IF;

  -- Envoi HTTP asynchrone.
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization',  'Bearer ' || v_secret,
      'X-Cron-Source',  'pg_cron'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  -- Audit best-effort.
  BEGIN
    INSERT INTO public.pg_cron_audit (job_name, request_id, target_url, started_at)
    VALUES ('email_outbox_worker', v_request_id, v_url, v_started_at);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END;
\$\$;
COMMENT ON FUNCTION public.invoke_email_outbox_worker()
  IS 'Job pg_cron : appelle /api/cron/email-outbox avec le CRON_SECRET. Fire-and-forget.';

-- 4. Table d'audit des executions pg_cron.
CREATE TABLE IF NOT EXISTS public.pg_cron_audit (
  id          bigserial PRIMARY KEY,
  job_name    text NOT NULL,
  request_id  bigint,
  target_url  text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
COMMENT ON TABLE public.pg_cron_audit IS
  'Audit des appels HTTP emis par les jobs pg_cron (cf. fonction invoke_email_outbox_worker).';
CREATE INDEX IF NOT EXISTS idx_pg_cron_audit_job_started
  ON public.pg_cron_audit (job_name, started_at DESC);

ALTER TABLE public.pg_cron_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pg_cron_audit_admin_read" ON public.pg_cron_audit;
CREATE POLICY "pg_cron_audit_admin_read"
  ON public.pg_cron_audit FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 5. Grant execute au role postgres (utilise par pg_cron).
REVOKE ALL ON FUNCTION public.invoke_email_outbox_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_email_outbox_worker() TO postgres;

-- 6. Planification : toutes les 2 minutes (UTC).
--    Quote $cmd$...$cmd$ (et non $$, qui collisionne avec le $$ d'ouverture
--    de la fonction invoke_email_outbox_worker declaree plus haut).
SELECT cron.schedule(
  jobname   => 'email_outbox_worker',
  schedule  => '*/2 * * * *',
  command   => $cmd$ SELECT public.invoke_email_outbox_worker(); $cmd$
);

-- 7. Vue de monitoring : 100 dernieres executions avec status HTTP.
CREATE OR REPLACE VIEW public.v_pg_cron_email_worker AS
SELECT
  a.id,
  a.started_at,
  a.finished_at,
  a.target_url,
  a.request_id,
  resp.status_code,
  resp.timed_out,
  LEFT(resp.body::text, 500) AS response_body
FROM public.pg_cron_audit a
LEFT JOIN extensions.net._http_response resp ON resp.id = a.request_id
WHERE a.job_name = 'email_outbox_worker'
ORDER BY a.started_at DESC
LIMIT 100;
COMMENT ON VIEW public.v_pg_cron_email_worker IS
  '100 dernieres executions du worker email via pg_cron. Joint net._http_response pour le status HTTP.';

GRANT SELECT ON public.v_pg_cron_email_worker TO authenticated;

-- 8. RPC utilitaire : liste les jobs pg_cron lies a l'app.
--    Pratique pour le script 
pm run cron:status (lecture cote client
--    Node, pas besoin de psql).
CREATE OR REPLACE FUNCTION public.get_pg_cron_jobs()
RETURNS TABLE (
  jobid    bigint,
  jobname  text,
  schedule text,
  command  text,
  active   boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = cron, public
AS \$\$
  SELECT jobid, jobname, schedule, command, active
  FROM cron.job
  WHERE jobname IN ('email_outbox_worker')
  ORDER BY jobname;
\$\$;
COMMENT ON FUNCTION public.get_pg_cron_jobs()
  IS 'Liste les jobs pg_cron de l''app. Utilise par scripts/cron-status.mjs.';

REVOKE ALL ON FUNCTION public.get_pg_cron_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pg_cron_jobs() TO service_role;

-- 20260709_1600_pg_cron_aggregate_downloads.sql recree la fonction ci-dessus
-- avec un WHERE IN etendu a aggregate_downloads_worker (CREATE OR REPLACE).
