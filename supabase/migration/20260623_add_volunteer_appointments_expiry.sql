-- =============================================================================
-- Migration : colonne expires_at sur volunteer_appointments
-- Date : 2026-06-23
--
-- Contexte : le cron src/pages/api/appointments/cron/expire.ts fait un UPDATE
-- atomique sur WHERE expires_at < now() AND status = 'pending'. Si la colonne
-- n'existe pas, le cron echoue silencieusement (PostgREST renvoie 400 sur la
-- requete). Cette migration pose la colonne + index + backfill safe.
--
-- IMPORTANT : executer AVANT la migration du cron Vercel.
-- =============================================================================

ALTER TABLE public.volunteer_appointments
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill : pour les RDV 'pending' deja presents, on fixe expires_at a
-- created_at + 30 jours (politique de retention par defaut).
UPDATE public.volunteer_appointments
  SET expires_at = created_at + INTERVAL '30 days'
  WHERE status = 'pending' AND expires_at IS NULL;

-- Index fonctionnel sur expires_at pour accelerer le cron.
CREATE INDEX IF NOT EXISTS idx_volunteer_appt_expires_at
  ON public.volunteer_appointments (expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

-- Trigger : a la creation d'un RDV, pose expires_at a now() + 30 jours.
CREATE OR REPLACE FUNCTION public.set_appointment_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_volunteer_appt_expiry ON public.volunteer_appointments;
CREATE TRIGGER trg_volunteer_appt_expiry
  BEFORE INSERT ON public.volunteer_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_expiry();
