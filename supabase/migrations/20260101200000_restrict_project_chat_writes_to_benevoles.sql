-- =============================================================================
-- Biscuits IA — Correctif : visibilité + permissions chat (bénévoles membres et admin)
-- =============================================================================
--
-- Note (refonte 2026-07-10) : pm_select, pm_insert et pm_delete exigent
-- TOUS que l'appelant soit (membre benevole du projet) OU (admin). Avant
-- cette migration, pm_insert etait plus permissif que pm_select (un user
-- standard membre pouvait ecrire un message qu'il ne pouvait pas relire).
-- On aligne les trois policies sur le meme predicat.

-- Note (2026-07-13) : les 3 OR EXISTS (... role = 'admin') ci-dessous sont
-- remplaces par public.get_my_role() = 'admin' pour eviter SQLSTATE 42P01
-- (et eliminer le cycle RLS profiles <-> project_members, cf. migration
-- 20260709200000_fix_profiles_rls_recursion.sql).
DROP POLICY IF EXISTS "pm_select" ON public.project_messages;

CREATE POLICY "pm_select" ON public.project_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members pm
      JOIN public.profiles p ON p.id = pm.user_id
      WHERE pm.project_id = project_messages.project_id
        AND pm.user_id = auth.uid()
        AND p.role = 'benevole'
    )
    OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "pm_insert" ON public.project_messages;

CREATE POLICY "pm_insert" ON public.project_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1
        FROM public.project_members pm
        JOIN public.profiles p ON p.id = pm.user_id
        WHERE pm.project_id = project_messages.project_id
          AND pm.user_id = auth.uid()
          AND p.role = 'benevole'
      )
      OR public.get_my_role() = 'admin'
    )
  );

DROP POLICY IF EXISTS "pm_delete" ON public.project_messages;

CREATE POLICY "pm_delete" ON public.project_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members pm
      JOIN public.profiles p ON p.id = pm.user_id
      WHERE pm.project_id = project_messages.project_id
        AND pm.user_id = auth.uid()
        AND p.role = 'benevole'
    )
    OR public.get_my_role() = 'admin'
  );
