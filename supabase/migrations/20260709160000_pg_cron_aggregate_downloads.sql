-- ============================================================================
-- Migration : Worker aggregate_downloads declenche par pg_cron
-- Date       : 2026-07-09
-- ----------------------------------------------------------------------------
-- Pourquoi : chaque GET sur /api/resources/telecharger insere une ligne
-- dans resource_downloads (le log, append-only). Auparavant, une deuxieme
-- ecriture UPDATE resources.downloads etait faite en synchrone cote user
-- (via rpc('increment_downloads')), ce qui amplifiait l'attaque
-- (1 hit = 1 SELECT + 1 UPDATE + 1 INSERT + 1 signature Storage, voir
-- audit P4 #35).
--
-- Nouvelle architecture (CQRS-lite) :
--   * Cote user : 1 INSERT dans resource_downloads seulement.
--   * Cote cron : un worker agrege periodiquement le log vers
--     resources.downloads via la fonction SQL aggregate_downloads().
--
-- La fonction tourne dans une seule transaction avec un advisory lock, donc
-- est sure meme si deux runs se chevauchent (un doublonnage par 5 min
-- serait une catastrophe de comptage). Idempotente : un rattrapage manuel
-- via psql est possible sans risque.
--
-- Cout      : 0 (pg_cron et pg_net deja actifs sur Supabase).
-- Frequence : */5 minutes, modifiable via UPDATE cron.job.
-- ============================================================================

-- 1. Cursor d'agregation. Stocke la valeur max de created_at deja agregee
--    dans public.app_runtime_config. -infinity = tout agreger au premier run.
INSERT INTO public.app_runtime_config (key, value)
VALUES ('downloads_last_aggregated_at', '-infinity')
ON CONFLICT (key) DO NOTHING;

-- 2. Fonction d'agregation. Lit le cursor, agrege les nouvelles lignes,
--    avance le cursor. Tout est dans une transaction avec advisory lock :
--    un deuxieme worker qui demarre pendant qu'un premier travaille attend
--    la liberation du lock (donc aucun double-count possible).
CREATE OR REPLACE FUNCTION public.aggregate_downloads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cursor_text  text;
  v_cursor_ts    timestamptz;
  v_new_cursor   timestamptz;
  v_total        integer := 0;
  v_row          record;
BEGIN
  -- 2a. Lecture du cursor (timestamp ISO ou '-infinity' pour tout agreger).
  SELECT value INTO v_cursor_text
  FROM public.app_runtime_config
  WHERE key = 'downloads_last_aggregated_at';
  v_cursor_ts := COALESCE(v_cursor_text::timestamptz, '-infinity'::timestamptz);

  -- 2b. Verrou applicatif : bloque les autres workers jusqu'au COMMIT.
  --     La cle (hashtext('aggregate_downloads')) doit rester stable.
  PERFORM pg_advisory_xact_lock(hashtext('aggregate_downloads'));

  -- 2c. Pour chaque ressource avec des nouveaux telechargements depuis
  --     le cursor, on incremente downloads et on collecte le max(created_at).
  SELECT COALESCE(MAX(created_at), v_cursor_ts) INTO v_new_cursor
  FROM public.resource_downloads
  WHERE created_at > v_cursor_ts;

  FOR v_row IN
    SELECT resource_id, COUNT(*) AS delta
    FROM public.resource_downloads
    WHERE created_at > v_cursor_ts
    GROUP BY resource_id
  LOOP
    UPDATE public.resources
    SET downloads = downloads + v_row.delta
    WHERE id = v_row.resource_id;
    v_total := v_total + v_row.delta;
  END LOOP;

  -- 2d. Avance le cursor. Si rien a agreger, on NE recule PAS le cursor
  --     (v_new_cursor == v_cursor_ts dans ce cas, l'UPDATE est un no-op).
  IF v_new_cursor IS NOT NULL AND v_new_cursor > v_cursor_ts THEN
    UPDATE public.app_runtime_config
    SET value = v_new_cursor::text,
        updated_at = now()
    WHERE key = 'downloads_last_aggregated_at';
  END IF;

  RETURN v_total;
END;
$$;
COMMENT ON FUNCTION public.aggregate_downloads()
  IS 'Agrege resource_downloads (log) vers resources.downloads (compteur denormalise). Audit P4 #35. Idempotente, advisory-lock.';

-- 3. Grant execute au service_role (utilise par l'API Vercel).
REVOKE ALL ON FUNCTION public.aggregate_downloads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_downloads() TO service_role;

-- 4. Fonction d'invocation pg_cron : meme pattern que invoke_email_outbox_worker.
--    Fire-and-forget via net.http_post, secret lu depuis vault ou app_runtime_config.
CREATE OR REPLACE FUNCTION public.invoke_aggregate_downloads_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url        text;
  v_secret     text;
  v_request_id bigint;
  v_started_at timestamptz := now();
BEGIN
  SELECT value INTO v_url
  FROM public.app_runtime_config
  WHERE key = 'aggregate_downloads_worker_url';
  IF v_url IS NULL OR v_url = '' THEN
    RAISE WARNING '[pg_cron] aggregate_downloads_worker_url non configure, job ignore';
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;
  EXCEPTION WHEN undefined_function OR undefined_table THEN
    v_secret := NULL;
  END;

  IF v_secret IS NULL OR v_secret = '' THEN
    SELECT value INTO v_secret
    FROM public.app_runtime_config
    WHERE key = 'cron_secret';
  END IF;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING '[pg_cron] CRON_SECRET introuvable, job ignore';
    RETURN;
  END IF;

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret,
      'X-Cron-Source', 'pg_cron'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  BEGIN
    INSERT INTO public.pg_cron_audit (job_name, request_id, target_url, started_at)
    VALUES ('aggregate_downloads_worker', v_request_id, v_url, v_started_at);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END;
$$;
COMMENT ON FUNCTION public.invoke_aggregate_downloads_worker()
  IS 'Job pg_cron : appelle /api/cron/aggregate-downloads avec le CRON_SECRET. Fire-and-forget.';

REVOKE ALL ON FUNCTION public.invoke_aggregate_downloads_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_aggregate_downloads_worker() TO postgres;

-- 5. Config par defaut : URL de prod, intervalle. Modifiable a chaud.
INSERT INTO public.app_runtime_config (key, value)
VALUES
  ('aggregate_downloads_worker_url',  'https://biscuits-ia.com/api/cron/aggregate-downloads'),
  ('aggregate_downloads_worker_interval_minutes', '5')
ON CONFLICT (key) DO NOTHING;

-- 6. Planification : toutes les 5 minutes.
SELECT cron.schedule(
  jobname   => 'aggregate_downloads_worker',
  schedule  => '*/5 * * * *',
  command   => $cmd$ SELECT public.invoke_aggregate_downloads_worker(); $cmd$
);

-- 7. Etend get_pg_cron_jobs() pour lister aussi le nouveau worker
--    (utilise par scripts/cron-status.mjs).
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
AS $$
  SELECT jobid, jobname, schedule, command, active
  FROM cron.job
  WHERE jobname IN ('email_outbox_worker', 'aggregate_downloads_worker', 'expire_pending_appointments')
  ORDER BY jobname;
$$;

REVOKE ALL ON FUNCTION public.get_pg_cron_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pg_cron_jobs() TO service_role;
