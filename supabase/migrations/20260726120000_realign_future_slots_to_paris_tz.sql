-- =============================================================================
-- Migration : recalage des créneaux FUTURS sur le fuseau Europe/Paris
-- Date : 2026-07-26
--
-- Contexte
-- --------
-- L'ancien formulaire d'ajout de créneau construisait l'instant avec
--   new Date(dateKey + 'T' + heure + ':00.000Z')
-- c'est-à-dire qu'il stockait la saisie de l'admin comme une heure UTC.
-- Un admin qui saisissait "09:00" (en pensant heure de Paris) produisait donc
-- 09:00Z, soit 11:00 réelles à Paris l'été (10:00 l'hiver).
--
-- Le correctif applicatif interprète désormais la saisie comme une heure de
-- Paris et affiche partout en heure de Paris. Sans recalage, les créneaux déjà
-- en base s'afficheraient décalés de +1 h / +2 h par rapport à ce que l'admin
-- avait saisi et à ce que les utilisateurs ont vu au moment de réserver.
--
-- Transformation appliquée
-- ------------------------
--   (start_time AT TIME ZONE 'UTC')            -> timestamp naïf "09:00"
--   (... AT TIME ZONE 'Europe/Paris')          -> timestamptz "09:00 à Paris"
-- soit 09:00Z  ->  07:00Z l'été, 08:00Z l'hiver. Le libellé horaire vu par
-- l'admin est conservé ; c'est l'instant réel qui est corrigé.
--
-- Périmètre : UNIQUEMENT les créneaux à venir.
-- Les créneaux passés ne sont pas réécrits : ce sont des faits (des rendez-vous
-- ont eu lieu), au même titre que `payment_method = 'helloasso'`. Leur affichage
-- restera décalé de 1 à 2 h dans l'historique — c'est assumé.
--
-- ORDRE DE DÉPLOIEMENT — important
-- --------------------------------
-- Cette migration doit être appliquée APRÈS (ou en même temps que) le déploiement
-- du correctif applicatif. `cutoff` ci-dessous protège contre l'inverse : tout
-- créneau créé à partir de cette date est considéré comme déjà correct et n'est
-- pas touché. Si le déploiement est postérieur au 2026-07-26, remonter `cutoff`
-- à la date réelle de mise en production AVANT d'appliquer la migration.
--
-- Pré-visualisation (à exécuter avant, en lecture seule) :
--   SELECT id, title, start_time AS avant,
--          (start_time AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS apres
--     FROM public.appointment_slots
--    WHERE start_time > now()
--      AND created_at < timestamptz '2026-07-26 00:00:00+00'
--    ORDER BY start_time;
-- =============================================================================

DO $$
DECLARE
  -- Date de mise en production du correctif applicatif.
  cutoff   constant timestamptz := timestamptz '2026-07-26 00:00:00+00';
  affected integer;
BEGIN
  WITH shifted AS (
    UPDATE public.appointment_slots
       SET start_time = (start_time AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris',
           end_time   = (end_time   AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris',
           updated_at = now()
     WHERE start_time > now()
       AND created_at < cutoff
    RETURNING id
  )
  SELECT count(*) INTO affected FROM shifted;

  RAISE NOTICE '[migration 20260726120000] % créneaux futurs recalés sur Europe/Paris', affected;
END;
$$;

-- =============================================================================
-- Contrôle post-migration : aucune plage ne doit être invalide ni se chevaucher.
-- Le décalage est uniforme (même offset pour un même jour), donc l'ordre relatif
-- est préservé ; ces requêtes doivent renvoyer 0 ligne.
--
--   SELECT id FROM public.appointment_slots WHERE start_time >= end_time;
--
--   SELECT a.id, b.id
--     FROM public.appointment_slots a
--     JOIN public.appointment_slots b
--       ON a.id <> b.id
--      AND a.start_time < b.end_time
--      AND a.end_time   > b.start_time
--    WHERE a.start_time > now();
--
-- Rollback (si nécessaire, transformation inverse, même filtre) :
--   UPDATE public.appointment_slots
--      SET start_time = (start_time AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC',
--          end_time   = (end_time   AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC'
--    WHERE start_time > now()
--      AND created_at < timestamptz '2026-07-26 00:00:00+00';
-- =============================================================================
