-- =============================================================================
-- Biscuits IA — Migration : chat temps réel par projet
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.project_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  content    text        NOT NULL
               CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_messages IS 'Messages du chat par projet (membres + staff)';

CREATE INDEX IF NOT EXISTS idx_project_messages_lookup
  ON public.project_messages (project_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

-- Membres du projet + staff peuvent lire
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
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Membres + staff peuvent insérer leur propre message
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
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

-- Auteur ou staff peut supprimer
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
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
