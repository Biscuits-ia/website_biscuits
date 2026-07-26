-- =============================================================================
-- Biscuits IA — Rattachement des candidatures a un compte
-- Date : 2026-07-26
--
-- Contexte
-- --------
-- Depuis le verrouillage du choix de session aux comptes connectes,
-- /api/recruitment sait qu'UN compte etait authentifie, mais rien ne reliait la
-- candidature a CE compte : l'email saisi restait libre. Un utilisateur
-- connecte pouvait donc reserver une place de session sous l'adresse de
-- quelqu'un d'autre, et l'admin n'avait aucun moyen de distinguer une
-- candidature dont l'identite est verifiee d'une candidature anonyme.
--
-- On ajoute le lien explicite. L'email est desormais impose par le serveur a
-- partir du compte (cf. src/pages/api/recruitment.ts).
--
-- Les candidatures spontanees anonymes restent possibles : user_id NULL.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colonne user_id
-- ─────────────────────────────────────────────────────────────────────────────
-- ON DELETE CASCADE, comme volunteer_appointments.user_id : une candidature
-- rattachee a un compte est une donnee personnelle (nom, email, motivation).
-- La suppression du compte doit l'emporter avec elle (droit a l'effacement).
-- Les candidatures anonymes (user_id NULL) ne sont pas concernees.
ALTER TABLE public.recruitment_submissions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.recruitment_submissions.user_id IS
  'Compte ayant depose la candidature. NULL = candidature spontanee anonyme. Quand non NULL, email est celui du compte (impose cote serveur).';

CREATE INDEX IF NOT EXISTS idx_recruitment_submissions_user_id
  ON public.recruitment_submissions (user_id)
  WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Une seule candidature par compte
-- ─────────────────────────────────────────────────────────────────────────────
-- Contrepartie en base du dedoublonnage applicatif par email : ce dernier est
-- un SELECT suivi d'un INSERT, donc perdant en cas de double soumission
-- concurrente. L'index tranche la course (code 23505 cote appelant).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recruitment_submission_per_user
  ON public.recruitment_submissions (user_id)
  WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS : interdire l'usurpation de user_id
-- ─────────────────────────────────────────────────────────────────────────────
-- L'ancienne policy etait `WITH CHECK (true)` : n'importe qui, avec la cle anon
-- (publique par nature), pouvait INSERT directement sur PostgREST. Sans
-- contrainte, il pouvait desormais attribuer une candidature au compte d'un
-- tiers. On borne : soit anonyme, soit son propre compte.
-- Le service_role (routes API) ignore les RLS, le parcours normal est intact.
DROP POLICY IF EXISTS "recruitment_anon_insert" ON public.recruitment_submissions;
CREATE POLICY "recruitment_anon_insert"
  ON public.recruitment_submissions FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Lecture de sa propre candidature
-- ─────────────────────────────────────────────────────────────────────────────
-- La policy admin existante (`recruitment_admin_select`) reste la seule voie
-- pour tout voir. Celle-ci permet a un utilisateur de relire SA candidature,
-- ce que la colonne user_id rend enfin possible sans exposer les autres.
DROP POLICY IF EXISTS "recruitment_own_select" ON public.recruitment_submissions;
CREATE POLICY "recruitment_own_select"
  ON public.recruitment_submissions FOR SELECT
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- =============================================================================
-- Verification apres application :
--
--   -- Doit echouer (usurpation) avec la cle anon/authenticated :
--   INSERT INTO public.recruitment_submissions (first_name, last_name, email, user_id)
--   VALUES ('X', 'Y', 'x@example.invalid', '00000000-0000-0000-0000-000000000000');
--
--   -- Doit echouer au second appel (23505) :
--   SELECT count(*) FROM public.recruitment_submissions WHERE user_id IS NOT NULL;
-- =============================================================================
