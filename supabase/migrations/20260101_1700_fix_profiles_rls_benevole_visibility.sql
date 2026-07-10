-- =============================================================================
-- Biscuits IA — Fix RLS profiles : visibilité des profils pour les bénévoles
--
-- Problème : profiles_select_own = USING (id = auth.uid())
--   → un bénévole ne peut lire que son propre profil
--   → sur /projet : leader_id, assignee_id, member profiles → NULL
--
-- Solution : les bénévoles / modérateurs / admins peuvent lire les profils
--   de tous les membres de l'espace bénévole (benevole + moderator + admin),
--   nécessaire pour afficher noms et avatars sur l'espace projet.
--
-- Note 2026-07-10 : 'pm' et 'tech_lead' ont été retirés des IN clauses.
--   Ces rôles ne sont pas dans profiles_role_check → branches mortes.
-- =============================================================================

-- Politique : un bénévole ou supérieur peut lire les profils des collaborateurs
DROP POLICY IF EXISTS "profiles_benevole_read_team" ON public.profiles;

CREATE POLICY "profiles_benevole_read_team"
  ON public.profiles FOR SELECT
  USING (
    -- L'appelant doit être au moins bénévole
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id   = auth.uid()
        AND me.role IN ('benevole', 'moderator', 'admin')
    )
    AND
    -- La cible doit être un collaborateur (pas un simple "user")
    role IN ('benevole', 'moderator', 'admin')
  );

-- Politique : un bénévole peut toujours lire son propre profil (conservée)
-- profiles_select_own est déjà définie dans migration.sql, on ne la touche pas.

-- Politique : membres d'un même projet peuvent se voir mutuellement
-- (couvre le cas où un user standard serait assigné à une tâche)
DROP POLICY IF EXISTS "profiles_project_member_read" ON public.profiles;

CREATE POLICY "profiles_project_member_read"
  ON public.profiles FOR SELECT
  USING (
    -- L'appelant est membre d'au moins un projet commun avec la cible
    EXISTS (
      SELECT 1
      FROM public.project_members pm_caller
      JOIN  public.project_members pm_target
        ON  pm_target.project_id = pm_caller.project_id
      WHERE pm_caller.user_id = auth.uid()
        AND pm_target.user_id = profiles.id
    )
  );
