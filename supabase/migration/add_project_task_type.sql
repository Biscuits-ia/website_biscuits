-- =============================================================================
-- Biscuits IA — Ajout du type de tâche pour project_tasks
-- =============================================================================

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS task_type text;

UPDATE public.project_tasks
SET task_type = 'general'
WHERE task_type IS NULL OR btrim(task_type) = '';

ALTER TABLE public.project_tasks
  ALTER COLUMN task_type SET DEFAULT 'general';

ALTER TABLE public.project_tasks
  ALTER COLUMN task_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_tasks_task_type_check'
      AND conrelid = 'public.project_tasks'::regclass
  ) THEN
    ALTER TABLE public.project_tasks
      ADD CONSTRAINT project_tasks_task_type_check
      CHECK (task_type IN ('general', 'dev', 'db', 'design', 'qa', 'ops', 'doc'));
  END IF;
END $$;

COMMENT ON COLUMN public.project_tasks.task_type IS 'general | dev | db | design | qa | ops | doc';
