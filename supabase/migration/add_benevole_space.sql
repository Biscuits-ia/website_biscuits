-- =============================================================================
-- Biscuits IA — Migration : espace bénévole (gestion de projets)
-- Générée le 30/04/2026
-- =============================================================================
-- Ordre : role update → tables → triggers → indexes → RLS
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ajout du rôle 'benevole' dans profiles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'moderator', 'admin', 'benevole'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Table projects
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  description  text,
  status       text        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  priority     text        NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high')),
  deadline     date,
  leader_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.projects             IS 'Projets gérés par les bénévoles';
COMMENT ON COLUMN public.projects.status      IS 'active | on_hold | completed | archived';
COMMENT ON COLUMN public.projects.priority    IS 'low | medium | high';
COMMENT ON COLUMN public.projects.leader_id   IS 'Chef de projet (bénévole responsable)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Table project_members (bénévoles affectés à un projet)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

COMMENT ON TABLE public.project_members IS 'Membres affectés à chaque projet';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Table project_tasks
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  description  text,
  status       text        NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority     text        NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high')),
  assignee_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  deadline     date,
  position     integer     NOT NULL DEFAULT 0,
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.project_tasks           IS 'Tâches au sein d''un projet (kanban)';
COMMENT ON COLUMN public.project_tasks.status    IS 'todo | in_progress | review | done';
COMMENT ON COLUMN public.project_tasks.position  IS 'Ordre dans la colonne kanban';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Table announcements (annonces internes aux bénévoles)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  content     text        NOT NULL,
  author_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned      boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.announcements IS 'Annonces internes visibles par les bénévoles';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Triggers updated_at (réutilise set_updated_at si déjà créée)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_updated_at      ON public.projects;
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_project_tasks_updated_at ON public.project_tasks;
CREATE TRIGGER trg_project_tasks_updated_at
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Index
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_status_deadline
  ON public.projects (status, deadline);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status
  ON public.project_tasks (project_id, status, position);

CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee
  ON public.project_tasks (assignee_id);

CREATE INDEX IF NOT EXISTS idx_project_members_user
  ON public.project_members (user_id);

CREATE INDEX IF NOT EXISTS idx_announcements_pinned
  ON public.announcements (pinned, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

-- ── projects ────────────────────────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Lecture : bénévoles et admins
DROP POLICY IF EXISTS "projects_benevole_read" ON public.projects;
CREATE POLICY "projects_benevole_read"
  ON public.projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('benevole', 'admin', 'moderator')
    )
  );

-- Insertion : bénévoles et admins
DROP POLICY IF EXISTS "projects_benevole_insert" ON public.projects;
CREATE POLICY "projects_benevole_insert"
  ON public.projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('benevole', 'admin', 'moderator')
    )
  );

-- Mise à jour : leader ou admin
DROP POLICY IF EXISTS "projects_benevole_update" ON public.projects;
CREATE POLICY "projects_benevole_update"
  ON public.projects FOR UPDATE
  USING (
    leader_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Suppression : admin seulement
DROP POLICY IF EXISTS "projects_admin_delete" ON public.projects;
CREATE POLICY "projects_admin_delete"
  ON public.projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── project_members ─────────────────────────────────────────────────────────
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members_benevole_read" ON public.project_members;
CREATE POLICY "project_members_benevole_read"
  ON public.project_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('benevole', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "project_members_admin_write" ON public.project_members;
CREATE POLICY "project_members_admin_write"
  ON public.project_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- ── project_tasks ───────────────────────────────────────────────────────────
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_tasks_benevole_read" ON public.project_tasks;
CREATE POLICY "project_tasks_benevole_read"
  ON public.project_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('benevole', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "project_tasks_benevole_insert" ON public.project_tasks;
CREATE POLICY "project_tasks_benevole_insert"
  ON public.project_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('benevole', 'admin', 'moderator')
    )
  );

-- Mise à jour : créateur, assigné, ou admin
DROP POLICY IF EXISTS "project_tasks_benevole_update" ON public.project_tasks;
CREATE POLICY "project_tasks_benevole_update"
  ON public.project_tasks FOR UPDATE
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "project_tasks_benevole_delete" ON public.project_tasks;
CREATE POLICY "project_tasks_benevole_delete"
  ON public.project_tasks FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- ── announcements ───────────────────────────────────────────────────────────
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_benevole_read" ON public.announcements;
CREATE POLICY "announcements_benevole_read"
  ON public.announcements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('benevole', 'admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "announcements_admin_write" ON public.announcements;
CREATE POLICY "announcements_admin_write"
  ON public.announcements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );
