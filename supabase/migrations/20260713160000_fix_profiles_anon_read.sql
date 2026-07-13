-- =============================================================================
-- Migration : accorder SELECT sur profiles aux roles anon et authenticated
-- Date : 2026-07-13
-- ============================================================================
--
-- PROBLEME : Lors du prerendu de /trombinoscope (prerender = true), la page
-- charge les benevoles avec le client anonyme. Postgres refuse l'acces avec
-- "permission denied for schema public" meme si benevoles a GRANT SELECT.
--
-- CAUSE : La migration 20260709120000_fix_privilege_escalation.sql a révoqué
-- INSERT/UPDATE sur profiles, mais pas SELECT. Cependant, les GRANT/REVOKE
-- precedents ont pu empecher l'evaluation correcte des policies pour anon.
--
-- REVue : Accorder explicitement SELECT sur profiles aux roles anon et
-- authenticated pour permettre la lecture publique du trombinoscope.
--
-- =============================================================================

-- Accorder SELECT sur profiles pour permettre la lecture publique
GRANT SELECT ON public.profiles TO anon, authenticated;

-- Accorder SELECT sur benevoles ( deja fait dans la migration 20260101110000,
-- mais on reaffirme pour etre sur que les permissions sont en place)
GRANT SELECT ON public.benevoles TO anon, authenticated;

-- Accorder SELECT sur les associations pour eviter les erreurs similaires
GRANT SELECT ON public.associations TO anon, authenticated;

-- Accorder SELECT sur les trainings pour eviter les erreurs similaires
GRANT SELECT ON public.trainings TO anon, authenticated;

-- Accorder SELECT sur les workshops pour eviter les erreurs similaires
GRANT SELECT ON public.workshops TO anon, authenticated;