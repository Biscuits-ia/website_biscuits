-- =============================================================================
-- Biscuits IA — Migration : suppression de la file d'emails transactionnels
-- =============================================================================
-- DESTRUCTIF ET IRREVERSIBLE : l'historique des emails transactionnels est
-- perdu. Verifier qu'une sauvegarde de la base existe avant d'appliquer.
--
-- Contexte : depuis la suppression des modules formations, ateliers et
-- recrutement (migration 20260802090000), plus aucun code n'appelle
-- enqueueEmail(). La file n'a plus de producteur.
--
-- CONSERVE VOLONTAIREMENT — infrastructure partagee avec le worker
-- /api/cron/aggregate-downloads, qui reste actif :
--   * public.app_runtime_config (curseur d'agregation + cle 'cron_secret') ;
--   * le secret vault 'cron_secret' ;
--   * public.pg_cron_audit, dont la DDL vit hors de ce depot : on ne peut pas
--     verifier ici qu'aucun autre job n'y ecrit.
--
-- Ordre : job cron -> vue -> fonctions -> table
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Job pg_cron du worker email
--    A desinscrire avant de supprimer la fonction qu'il appelle.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'email_outbox_worker';
EXCEPTION WHEN OTHERS THEN
  -- pg_cron absent ou job deja supprime.
  NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vue de supervision des executions du worker
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_pg_cron_email_worker CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fonctions specifiques a la file
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.invoke_email_outbox_worker() CASCADE;
DROP FUNCTION IF EXISTS public.get_outbox_stats() CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Table de la file
--    Le trigger trg_email_outbox_updated_at, les index et les policies RLS
--    partent avec le CASCADE.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.email_outbox CASCADE;
