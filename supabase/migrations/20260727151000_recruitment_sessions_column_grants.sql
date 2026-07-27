-- =============================================================================
-- Migration : restreindre au niveau colonne la lecture publique des sessions
-- Date : 2026-07-27
-- =============================================================================
--
-- PROBLEME : public.recruitment_sessions.created_by contient l'uuid du compte
-- admin ayant cree la session. La migration 20260724090000 accordait
-- `GRANT SELECT` sur la TABLE entiere a anon et authenticated : toutes les
-- colonnes, donc created_by, created_at et updated_at compris.
--
-- Tant que la lecture echouait (cf. 20260727150000 : « permission denied for
-- table project_members »), la colonne etait inatteignable en pratique. En
-- reparant la lecture, on l'a rendue joignable : la cle anon est publique par
-- construction -- elle est servie dans le JavaScript du site -- donc n'importe
-- qui peut interroger directement l'API REST et recuperer ces uuid. Le code
-- applicatif, lui, liste ses colonnes une par une (PUBLIC_SESSION_COLUMNS) ;
-- mais un GRANT est le seul verrou reel, la discipline du code n'en est pas un.
--
-- La RLS ne sait pas filtrer des colonnes : elle filtre des LIGNES. Le seul
-- verrou colonne en Postgres est `GRANT SELECT (col_a, col_b)`. C'est le meme
-- patron que 20260709120000 (colonnes de public.associations) et que le
-- `GRANT UPDATE (session_id)` de 20260724090000.
--
-- NOTE : ces grants portent sur les colonnes existant a ce jour. Une migration
-- ulterieure qui supprime une colonne emporte son grant avec elle ; une
-- migration qui AJOUTE une colonne devra decider explicitement si anon et
-- authenticated peuvent la lire -- c'est precisement l'interet d'un grant
-- colonne : le defaut devient « non expose ».
--
-- Les policies conservent leur pouvoir : la lecture reste limitee aux sessions
-- `status = 'open'` (policy recruitment_sessions_public_open_read). Les
-- colonnes `id` et `status` restent lisibles, ce dont dependent l'evaluation de
-- cette policy et les jointures depuis les vues publiques.
-- =============================================================================

REVOKE SELECT ON public.recruitment_sessions FROM anon, authenticated;

GRANT SELECT (
  id,
  title,
  description,
  scheduled_at,
  duration_minutes,
  location,
  max_candidates,
  status
) ON public.recruitment_sessions TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification post-migration
-- ─────────────────────────────────────────────────────────────────────────────
-- Avec la cle anon :
--   GET /rest/v1/recruitment_sessions?select=id,title,status&status=eq.open
--     -> 200 + les sessions ouvertes
--   GET /rest/v1/recruitment_sessions?select=created_by
--     -> 42501 permission denied for column created_by
