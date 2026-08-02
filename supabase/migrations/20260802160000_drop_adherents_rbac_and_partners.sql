-- =============================================================================
-- Biscuits IA — Migration : suppression des modules adherents/RBAC et partners
-- =============================================================================
-- DESTRUCTIF ET IRREVERSIBLE : le fichier adherents, son historique, les
-- groupes, les tags et la liste des partenaires sont perdus.
-- Verifier qu'une sauvegarde de la base existe avant d'appliquer.
--
-- Motif : aucun de ces deux modules n'a de consommateur.
--
--   * adherents / RBAC : 6 routes API (/api/adherents, /api/groupes) et
--     src/lib/adherentsApi.ts existaient, mais AUCUNE page ni composant ne les
--     appelait. Il n'y avait pas non plus d'ecran d'administration pour
--     alimenter le fichier. Le module etait une API sans client.
--
--   * partners : table, 2 routes (/api/partenaires) et un type, sans aucun
--     consommateur dans le depot ni ecran d'administration.
--
-- A NE PAS CONFONDRE avec le systeme de roles applicatif, qui reste en place :
-- l'autorisation passe par profiles.role et public.get_my_role() (lue depuis
-- le JWT). Les tables roles / utilisateur_roles supprimees ici appartenaient
-- au RBAC du module adherents, jamais branche sur l'authentification.
--
-- Ordre : tables de liaison -> tables principales -> fonction -> type
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Module adherents / RBAC — tables de liaison d'abord (FK)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.adherent_tags        CASCADE;
DROP TABLE IF EXISTS public.adherent_groupes     CASCADE;
DROP TABLE IF EXISTS public.adherent_historiques CASCADE;
DROP TABLE IF EXISTS public.utilisateur_roles    CASCADE;

DROP TABLE IF EXISTS public.adherents CASCADE;
DROP TABLE IF EXISTS public.groupes   CASCADE;
DROP TABLE IF EXISTS public.tags      CASCADE;
DROP TABLE IF EXISTS public.roles     CASCADE;

-- Trigger d'audit du fichier adherents : part avec les tables via CASCADE,
-- la fonction reste a supprimer explicitement.
DROP FUNCTION IF EXISTS public.log_adherent_changes() CASCADE;

-- Enum de statut d'adhesion, sans autre usage.
DROP TYPE IF EXISTS public.adherent_statut;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Module partners
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.partners CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Note : public.set_updated_at n'est PAS supprimee.
--    Elle etait definie deux fois -- dans 20251231000000_initial_schema.sql
--    (L1002) et dans la migration adherents supprimee avec ce lot -- et de
--    nombreux triggers encore actifs la referencent.
-- ─────────────────────────────────────────────────────────────────────────────
