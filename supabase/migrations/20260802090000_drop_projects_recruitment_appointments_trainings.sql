-- =============================================================================
-- Biscuits IA — Migration : suppression des modules Projets, Candidatures,
-- Sessions de recrutement, Rendez-vous, Formations et Ateliers
-- =============================================================================
-- DESTRUCTIF ET IRREVERSIBLE : toutes les donnees de ces modules sont perdues.
-- Verifier qu'une sauvegarde de la base existe avant d'appliquer.
--
-- Ordre : job cron -> vues -> triggers -> fonctions -> tables enfants -> parentes
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Job pg_cron d'expiration des rendez-vous
--    A desinscrire avant de supprimer la fonction qu'il appelle.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire_pending_appointments';
EXCEPTION WHEN OTHERS THEN
  -- pg_cron absent ou job deja supprime.
  NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vues
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.training_sessions_with_seats CASCADE;
DROP VIEW IF EXISTS public.workshop_sessions_with_seats CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fonctions specifiques aux modules supprimes
--    Les triggers associes partent avec le CASCADE (et avec leurs tables).
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.expire_pending_appointments() CASCADE;
DROP FUNCTION IF EXISTS public.set_appointment_expiry() CASCADE;
DROP FUNCTION IF EXISTS public.check_recruitment_session_capacity() CASCADE;
DROP FUNCTION IF EXISTS public.atomic_workshop_register(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_auto_watch_assignee() CASCADE;
DROP FUNCTION IF EXISTS fn_notify_task_assignment() CASCADE;
DROP FUNCTION IF EXISTS fn_notify_task_watchers() CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Module Projets collaboratifs (espace benevole)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.task_watchers    CASCADE;
DROP TABLE IF EXISTS public.task_comments    CASCADE;
DROP TABLE IF EXISTS public.project_messages CASCADE;
DROP TABLE IF EXISTS public.project_tasks    CASCADE;
DROP TABLE IF EXISTS public.project_members  CASCADE;
DROP TABLE IF EXISTS public.projects         CASCADE;

-- Variantes non schema-qualifiees (migration 20260101120000).
DROP TABLE IF EXISTS task_watchers CASCADE;
DROP TABLE IF EXISTS task_comments CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Module Candidatures + Sessions de recrutement
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.recruitment_submissions CASCADE;
DROP TABLE IF EXISTS public.recruitment_sessions    CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Module Rendez-vous
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.volunteer_appointments CASCADE;
DROP TABLE IF EXISTS public.appointment_slots      CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Module Formations
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.training_free_seat_requests CASCADE;
DROP TABLE IF EXISTS public.training_payments           CASCADE;
DROP TABLE IF EXISTS public.training_sponsorships       CASCADE;
DROP TABLE IF EXISTS public.training_registrations      CASCADE;
DROP TABLE IF EXISTS public.training_sessions           CASCADE;
DROP TABLE IF EXISTS public.trainings                   CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Module Ateliers
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.workshop_registrations CASCADE;
DROP TABLE IF EXISTS public.workshop_sessions      CASCADE;
DROP TABLE IF EXISTS public.workshops              CASCADE;
