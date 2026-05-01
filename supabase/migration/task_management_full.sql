-- =============================================================================
-- Biscuits IA — Outil de gestion de tâches multi-corps
-- =============================================================================

-- 1. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE corps_type AS ENUM ('DEV','DB','DESIGN','QA','DATA','PM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE priority_level AS ENUM ('P0','P1','P2','P3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('backlog','todo','in_progress','in_review','testing','blocked','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_type_enum AS ENUM (
    'feature','bug_fix','refactoring','documentation',
    'migration','modeling','optimization','backup',
    'wireframe','prototype','design_system','handoff',
    'test_plan','functional_test','automated_test','release_validation',
    'exploratory_analysis','etl_pipeline','dashboard','ml_model',
    'sprint_planning','retrospective','reporting','stakeholder_management'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. TABLE profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  corps corps_type[] DEFAULT '{}',
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLE sprints
CREATE TABLE IF NOT EXISTS public.sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  goal TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active',
  velocity_target INTEGER DEFAULT 0,
  velocity_actual INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABLE tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  corps corps_type NOT NULL,
  task_type task_type_enum NOT NULL,
  priority priority_level DEFAULT 'P2',
  status task_status DEFAULT 'backlog',
  assignee_id UUID REFERENCES public.profiles(id),
  reporter_id UUID REFERENCES public.profiles(id),
  sprint_id UUID REFERENCES public.sprints(id),
  story_points INTEGER,
  time_estimate_hours NUMERIC(5,1),
  time_spent_hours NUMERIC(5,1) DEFAULT 0,
  due_date DATE,
  acceptance_criteria TEXT[] DEFAULT '{}',
  deliverables TEXT[] DEFAULT '{}',
  definition_of_done TEXT[] DEFAULT '{}',
  dod_completed BOOLEAN[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  blocked_reason TEXT,
  parent_task_id UUID REFERENCES public.tasks(id),
  doc_link TEXT,
  figma_link TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABLE task_dependencies
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, depends_on_id)
);

-- 6. TABLE task_comments
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. TABLE task_history
CREATE TABLE IF NOT EXISTS public.task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES public.profiles(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- 8. TABLE kpi_snapshots
CREATE TABLE IF NOT EXISTS public.kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id UUID REFERENCES public.sprints(id),
  corps corps_type NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  target_value NUMERIC,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- 9. FUNCTION : référence
CREATE OR REPLACE FUNCTION public.generate_task_reference()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  counter INTEGER;
BEGIN
  prefix := NEW.corps::TEXT;
  SELECT COUNT(*) + 1 INTO counter FROM public.tasks WHERE corps = NEW.corps;
  NEW.reference := prefix || '-' || LPAD(counter::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_task_reference ON public.tasks;
CREATE TRIGGER set_task_reference
BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.generate_task_reference();

-- 10. FUNCTION : audit
CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_history(task_id, field_name, old_value, new_value, changed_by)
    VALUES(NEW.id, 'status', OLD.status::TEXT, NEW.status::TEXT, auth.uid());
  END IF;

  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.task_history(task_id, field_name, old_value, new_value, changed_by)
    VALUES(NEW.id, 'assignee_id', OLD.assignee_id::TEXT, NEW.assignee_id::TEXT, auth.uid());
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_history(task_id, field_name, old_value, new_value, changed_by)
    VALUES(NEW.id, 'priority', OLD.priority::TEXT, NEW.priority::TEXT, auth.uid());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_audit ON public.tasks;
CREATE TRIGGER task_audit
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_changes();

-- Index performance
CREATE INDEX IF NOT EXISTS idx_tasks_corps ON public.tasks(corps);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON public.tasks(sprint_id);

-- 11. RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('pm','tech_lead'))
  );

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pm')
  );

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('pm','tech_lead'))
  );

-- 12. REALTIME
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'task_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
  END IF;
END $$;
