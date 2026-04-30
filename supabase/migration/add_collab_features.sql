-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Collaboration features
-- Commentaires threadés, watchers de tâches, système de notifications
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. task_comments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  content    TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  parent_id  UUID        REFERENCES task_comments(id)          ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON task_comments(task_id);

-- ── 2. task_watchers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_watchers (
  task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

-- ── 3. notifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('mention', 'assignment', 'deadline', 'comment')),
  payload    JSONB       NOT NULL DEFAULT '{}',
  read       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id, read) WHERE read = false;

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE task_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_watchers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;

-- task_comments: lecture pour tous les membres du projet
DROP POLICY IF EXISTS "tc_select" ON task_comments;
CREATE POLICY "tc_select" ON task_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_tasks pt
    JOIN project_members pm ON pm.project_id = pt.project_id
    WHERE pt.id = task_comments.task_id AND pm.user_id = auth.uid()
  ));

-- task_comments: insertion par les membres du projet
DROP POLICY IF EXISTS "tc_insert" ON task_comments;
CREATE POLICY "tc_insert" ON task_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND EXISTS (
      SELECT 1 FROM project_tasks pt
      JOIN project_members pm ON pm.project_id = pt.project_id
      WHERE pt.id = task_id AND pm.user_id = auth.uid()
    )
  );

-- task_comments: suppression par l'auteur ou un admin
DROP POLICY IF EXISTS "tc_delete" ON task_comments;
CREATE POLICY "tc_delete" ON task_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

-- task_watchers: lecture pour les membres du projet
DROP POLICY IF EXISTS "tw_select" ON task_watchers;
CREATE POLICY "tw_select" ON task_watchers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_tasks pt
    JOIN project_members pm ON pm.project_id = pt.project_id
    WHERE pt.id = task_watchers.task_id AND pm.user_id = auth.uid()
  ));

-- task_watchers: chaque utilisateur gère ses propres abonnements
DROP POLICY IF EXISTS "tw_manage" ON task_watchers;
CREATE POLICY "tw_manage" ON task_watchers FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- notifications: propriétaire uniquement
DROP POLICY IF EXISTS "notif_own" ON notifications;
CREATE POLICY "notif_own" ON notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 5. Trigger: notification d'assignation ────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_notify_task_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Ne notifie que si l'assigné change et est non-null
  IF NEW.assignee_id IS NOT NULL AND (OLD.assignee_id IS NULL OR OLD.assignee_id <> NEW.assignee_id) THEN
    -- Évite l'auto-notification
    IF NEW.assignee_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO notifications (user_id, type, payload)
      VALUES (
        NEW.assignee_id,
        'assignment',
        jsonb_build_object(
          'task_id',    NEW.id,
          'task_title', NEW.title,
          'project_id', NEW.project_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_assignment ON project_tasks;
CREATE TRIGGER trg_task_assignment
  AFTER INSERT OR UPDATE OF assignee_id ON project_tasks
  FOR EACH ROW EXECUTE FUNCTION fn_notify_task_assignment();

-- ── 6. Trigger: notification aux watchers lors d'un nouveau commentaire ───────
CREATE OR REPLACE FUNCTION fn_notify_task_watchers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  watcher_id UUID;
BEGIN
  FOR watcher_id IN
    SELECT tw.user_id FROM task_watchers tw WHERE tw.task_id = NEW.task_id
  LOOP
    -- Pas de notification à l'auteur lui-même
    IF watcher_id <> NEW.author_id THEN
      INSERT INTO notifications (user_id, type, payload)
      VALUES (
        watcher_id,
        'comment',
        jsonb_build_object(
          'task_id',    NEW.task_id,
          'comment_id', NEW.id,
          'author_id',  NEW.author_id
        )
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_comment_watchers ON task_comments;
CREATE TRIGGER trg_task_comment_watchers
  AFTER INSERT ON task_comments
  FOR EACH ROW EXECUTE FUNCTION fn_notify_task_watchers();

-- ── 7. Trigger: auto-watch à l'assignation ────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_watch_assignee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL THEN
    INSERT INTO task_watchers (task_id, user_id)
    VALUES (NEW.id, NEW.assignee_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_watch ON project_tasks;
CREATE TRIGGER trg_auto_watch
  AFTER INSERT OR UPDATE OF assignee_id ON project_tasks
  FOR EACH ROW EXECUTE FUNCTION fn_auto_watch_assignee();
