-- =============================================================================
-- Biscuits IA — Correctif : visibilité + permissions chat (bénévoles membres et admin)
-- =============================================================================

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
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "pm_insert" ON public.project_messages;

CREATE POLICY "pm_insert" ON public.project_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = project_messages.project_id
          AND pm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
      )
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
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );
