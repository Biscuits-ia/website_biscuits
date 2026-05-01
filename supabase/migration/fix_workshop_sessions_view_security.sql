-- =============================================================================
-- Migration : Corrige la sécurité de la vue workshop_sessions_with_seats
-- Date : 2026-05-01
-- =============================================================================
-- Objectif : exécuter la vue avec les permissions de l'utilisateur appelant
-- (security invoker) plutôt que celles du créateur de la vue.

ALTER VIEW IF EXISTS public.workshop_sessions_with_seats
  SET (security_invoker = true);
