-- =============================================================================
-- Fix RLS: projects listing visibility
-- Date: 30/04/2026
-- =============================================================================
-- Goal:
-- - Staff (admin/moderator) can read all projects
-- - Benevoles can read only projects where they are member/leader/creator
-- =============================================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_benevole_read" ON public.projects;

CREATE POLICY "projects_benevole_read"
  ON public.projects FOR SELECT
  USING (
    -- Must be at least benevole/moderator/admin
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role IN ('benevole', 'admin', 'moderator')
    )
    AND (
      -- Staff can read all projects
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'moderator')
      )
      OR
      -- Project owner / creator can read
      leader_id = auth.uid()
      OR
      created_by = auth.uid()
      OR
      -- Assigned member can read
      EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = id
          AND pm.user_id = auth.uid()
      )
    )
  );
