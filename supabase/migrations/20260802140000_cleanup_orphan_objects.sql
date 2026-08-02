-- =============================================================================
-- Biscuits IA — Migration : nettoyage des objets orphelins
-- =============================================================================
-- DESTRUCTIF : la table public.reports et la colonne profiles.reports_count
-- sont supprimees avec leurs donnees. Verifier qu'une sauvegarde existe.
--
-- Trois nettoyages, tous consecutifs aux suppressions de modules
-- (migrations 20260802090000 et 20260802120000) ou a du code mort ancien.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Policy profiles_project_member_read
--    Definie en 20260101170000, elle interroge public.project_members, table
--    supprimee en 20260802090000. Le DROP TABLE ... CASCADE l'a normalement
--    emportee ; ce DROP explicite est une securite idempotente. Si elle
--    survivait, toute lecture de public.profiles echouerait -- c'est-a-dire
--    l'authentification entiere.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_project_member_read" ON public.profiles;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Module signalements (public.reports)
--    Aucune reference dans le code applicatif : ni lecture, ni ecriture.
--    La table n'a donc ni producteur ni consommateur, et le compteur
--    denormalise profiles.reports_count qu'elle alimente n'est affiche
--    nulle part.
--    Ordre : triggers -> table -> fonction -> colonne denormalisee.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_report_inserted ON public.reports;
DROP TRIGGER IF EXISTS on_report_deleted  ON public.reports;

DROP TABLE    IF EXISTS public.reports CASCADE;
DROP FUNCTION IF EXISTS public.update_reports_count() CASCADE;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS reports_count;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Note : public.set_updated_at et public.update_updated_at_column font
--    exactement la meme chose (NEW.updated_at = now()). Les deux restent
--    en place : des triggers actifs referencent chacune d'elles et les
--    consolider demanderait de recreer tous les triggers concernes, pour un
--    gain nul a l'execution. Consigne dans audit.md.
-- ─────────────────────────────────────────────────────────────────────────────
