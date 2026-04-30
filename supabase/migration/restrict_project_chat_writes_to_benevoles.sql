-- =============================================================================
-- Biscuits IA — Correctif : seuls les bénévoles membres peuvent écrire dans le chat
-- =============================================================================

DROP POLICY IF EXISTS "pm_insert" ON public.project_messages;

CREATE POLICY "pm_insert" ON public.project_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.project_members pm
      JOIN public.profiles p ON p.id = pm.user_id
      WHERE pm.project_id = project_messages.project_id
        AND pm.user_id = auth.uid()
        AND p.role = 'benevole'
    )
  );
