-- =============================================================================
-- Biscuits IA — Migration : rétablir SELECT anon sur profiles pour RLS
-- Date : 2026-07-13
-- =============================================================================

-- PROBLÈME
-- --------
-- La migration 20260709120000_fix_privilege_escalation.sql a révoqué UPDATE
-- et INSERT sur profiles. Sans GRANT SELECT explicite, les requests anonymes
-- échouent lors de l'évaluation des policies RLS qui traversent profiles
-- (ex: benevoles_public_read n'est pas le problème, mais get_my_role() dans
--  les policies admin traverse profiles).

-- SOLUTION
-- --------
-- Accorder SELECT sur profiles à anon et authenticated. Cela permet l'évaluation
-- des policies sans autoriser l'écriture (risque déjà corrigé par la migration
-- précédente qui a révoqué UPDATE/INSERT).

GRANT SELECT ON public.profiles TO anon, authenticated;