-- =============================================================================
-- Migration : ajout WITH CHECK manquant sur les policies associations
-- Date : 2026-06-23
-- Corrige un trou de securite : un user authentifie pouvait modifier
-- is_verified d une ligne qui ne lui appartenait pas (escalade de privileges).
-- Cf. AUDIT.md, section 2.3.
-- =============================================================================

ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS associations_self_update ON public.associations;
CREATE POLICY associations_self_update
  ON public.associations FOR UPDATE
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
    AND (
      is_verified = (SELECT is_verified FROM public.associations WHERE id = associations.id)
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'moderator')
      )
    )
  );

ALTER TABLE public.association_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS association_projects_update ON public.association_projects;
CREATE POLICY association_projects_update
  ON public.association_projects FOR UPDATE
  USING (
    association_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    association_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

CREATE INDEX IF NOT EXISTS idx_profiles_role_id
  ON public.profiles(role, id)
  WHERE role IN ('admin', 'moderator');