-- =============================================================================
-- Migration : job pg_cron pour l'expiration des RDV pending
-- Date : 2026-06-23
--
-- Contexte : Vercel Hobby interdit les crons sub-quotidiens. On délégue
-- l'expiration à pg_cron côté Supabase : gratuit, indépendant de Vercel,
-- fréquence libre.
--
-- Stratégie : la table volunteer_appointments à déjà la colonne expires_at
-- (cf. migration 20260623_add_volunteer_appointments_expiry.sql) et un
-- index fonctionnel idx_volunteer_appt_expires_at.
--
-- Plan d’exécution : toutes les 5 minutes, on marque 'expired' les RDV
-- 'pending' dont expires_at < now(). C'est l'équivalent de l'ancien cron
-- Vercel /api/appointments/cron/expire.
-- =============================================================================

-- 0. Extension pg_cron (disponible par défaut sur Supabase).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Fonction SQL sécurisée : met à jour les RDV expires en une seule
-- requête atomique (mêmes garanties que l'ancien handler Vercel).
-- SECURITY DEFINER pour pouvoir UPDATE même si le RLS bloque.
CREATE OR REPLACE FUNCTION public.expire_pending_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  WITH expired AS (
    UPDATE public.volunteer_appointments
    SET status = 'expired',
        updated_at = now()
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO affected FROM expired;

  IF affected > 0 THEN
    RAISE LOG '[pg_cron] expired % pending appointments', affected;
  END IF;

  RETURN affected;
END;
$$;

-- 2. Grant EXECUTE au role postgres (propriétaire de pg_cron).
-- pg_cron exécute les jobs avec les privilèges de postgres par défaut.
REVOKE ALL ON FUNCTION public.expire_pending_appointments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_pending_appointments() TO postgres;

-- 3. Planifie le job : toutes les 5 minutes. Idempotent.
-- unschedule d'abord pour permettre la ré-exécution de la migration.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire_pending_appointments';
EXCEPTION WHEN OTHERS THEN
  -- Premier run : le job n'existe pas encore.
  NULL;
END;
$$;

SELECT cron.schedule(
  'expire_pending_appointments',
  '*/5 * * * *',
  $cron$SELECT public.expire_pending_appointments();$cron$
);