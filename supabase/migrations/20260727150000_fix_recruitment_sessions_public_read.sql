-- =============================================================================
-- Migration : rendre la lecture publique des sessions de recrutement reellement
--             utilisable par les roles anon / authenticated
-- Date : 2026-07-27
-- =============================================================================
--
-- SYMPTOME : toute lecture de public.recruitment_sessions avec la cle anon
-- echoue -- y compris `SELECT id FROM recruitment_sessions LIMIT 1` :
--
--   permission denied for table project_members
--
-- Consequence applicative : chaque page qui lisait les sessions avec le client
-- visiteur (et non le client service_role) recevait ZERO ligne + une erreur, et
-- affichait "Aucune session de recrutement n'est ouverte pour le moment" alors
-- que la session existait bien en base.
--
-- CAUSE : la migration 20260724090000 a cree
--
--   CREATE POLICY "recruitment_sessions_admin_write"
--     ON public.recruitment_sessions FOR ALL
--     USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() ...))
--
-- `FOR ALL` couvre AUSSI le SELECT. Postgres evalue donc, pour toute lecture,
-- une sous-requete sur public.profiles. Or profiles porte la policy
-- `profiles_project_member_read` (migration 20260101170000) qui lit
-- public.project_members, table sur laquelle anon n'a aucun GRANT SELECT. Les
-- privileges des tables citees par un plan sont verifies a l'initialisation de
-- l'executeur, avant tout court-circuit booleen : l'erreur remonte meme quand
-- la policy publique `status = 'open'` suffirait a autoriser la ligne.
--
-- REMEDE : separer les policies d'ecriture (INSERT / UPDATE / DELETE) de la
-- lecture, et resoudre le role de l'appelant via public.get_my_role() --
-- SECURITY DEFINER, lit le JWT (app_metadata.role) -- au lieu d'une
-- sous-requete sur profiles. Le SELECT ne depend plus alors que de la policy
-- publique. C'est exactement le patron deja retenu en 20260709200000 /
-- 20260101170000 pour casser la recursion RLS sur profiles.
--
-- Ce que cette migration NE fait PAS : elle ne touche ni profiles ni
-- project_members. La lecture de public.profiles par anon reste cassee pour la
-- meme raison de fond (policy `profiles_project_member_read`) ; c'est un
-- probleme distinct, a traiter separement.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Remplacer la policy FOR ALL par des policies d'ecriture strictes
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recruitment_sessions_admin_write" ON public.recruitment_sessions;

CREATE POLICY "recruitment_sessions_admin_insert"
  ON public.recruitment_sessions FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'moderator'));

CREATE POLICY "recruitment_sessions_admin_update"
  ON public.recruitment_sessions FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'moderator'))
  WITH CHECK (public.get_my_role() IN ('admin', 'moderator'));

CREATE POLICY "recruitment_sessions_admin_delete"
  ON public.recruitment_sessions FOR DELETE
  USING (public.get_my_role() IN ('admin', 'moderator'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lecture
-- ─────────────────────────────────────────────────────────────────────────────
-- La policy publique existante ne montre que les sessions ouvertes :
--   recruitment_sessions_public_open_read : USING (status = 'open')
-- On la reaffirme (idempotent) et on ajoute la lecture complete pour
-- admin/moderator, que la policy FOR ALL supprimee ci-dessus assurait jusqu'ici
-- (une session `closed`/`cancelled` doit rester visible en back-office meme si
-- le back-office passe aujourd'hui par service_role).
DROP POLICY IF EXISTS "recruitment_sessions_public_open_read" ON public.recruitment_sessions;
CREATE POLICY "recruitment_sessions_public_open_read"
  ON public.recruitment_sessions FOR SELECT
  USING (status = 'open');

DROP POLICY IF EXISTS "recruitment_sessions_admin_read" ON public.recruitment_sessions;
CREATE POLICY "recruitment_sessions_admin_read"
  ON public.recruitment_sessions FOR SELECT
  USING (public.get_my_role() IN ('admin', 'moderator'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification post-migration
-- ─────────────────────────────────────────────────────────────────────────────
-- Avec la cle anon (PostgREST) :
--   GET /rest/v1/recruitment_sessions?select=id,title,status&status=eq.open
-- doit renvoyer 200 + les sessions ouvertes, et non
--   {"code":"42501","message":"permission denied for table project_members"}
