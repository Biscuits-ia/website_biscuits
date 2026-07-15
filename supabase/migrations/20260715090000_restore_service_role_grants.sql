-- =============================================================================
-- Migration : restaurer les privileges de service_role sur le schema public
-- Date : 2026-07-15
-- =============================================================================
--
-- PROBLEME : En prod, fetchRoleSecure() (client service_role) echoue avec
-- "permission denied for schema public". Toutes les operations applicatives
-- passant par createSupabaseAdminClient() sont cassees.
--
-- CAUSE : Le schema public a perdu ses ACL par defaut Supabase (probablement
-- un DROP SCHEMA public CASCADE + recreation). Etat constate en prod :
--   nspacl = {postgres=UC,anon=U,authenticated=U}   -- service_role absent
--   pg_default_acl : aucune entree pour le schema public
--   service_role : SELECT possible sur 0 des 48 tables de public
-- Les migrations 20251231000000 (L1032) et 20260101080000 (L424) n'ont
-- re-accorde USAGE qu'a anon/authenticated, jamais a service_role.
--
-- REMEDE : restaurer l'etat Supabase par defaut pour service_role uniquement.
-- service_role est le role de confiance cote serveur (bypass RLS) : GRANT ALL
-- est l'etat nominal Supabase. anon et authenticated ne sont PAS touches --
-- les verrous de la migration 20260709120000 (privilege escalation) restent
-- intacts.
-- =============================================================================

-- 1. Acces au schema lui-meme (la cause directe de l'erreur).
GRANT USAGE ON SCHEMA public TO service_role;

-- 2. Objets existants.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 3. Objets futurs : sans cela, chaque nouvelle table creee par une migration
-- (executee en tant que postgres) serait invisible pour service_role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification post-migration
-- ─────────────────────────────────────────────────────────────────────────────
-- Doit retourner usage_public = true et select_profiles = true :
--   SELECT has_schema_privilege('service_role','public','USAGE') AS usage_public,
--          has_table_privilege('service_role','public.profiles','SELECT') AS select_profiles;
