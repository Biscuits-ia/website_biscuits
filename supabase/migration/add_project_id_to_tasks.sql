-- Biscuits IA — Liaison entre tasks (Task Hub) et projects
-- Ajoute project_id optionnel sur la table tasks pour regrouper les tâches par projet.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);

-- Lier toutes les tâches existantes au seul projet actif : Biscuits CRM
UPDATE public.tasks
SET project_id = '9f3434b2-8bf8-4988-ab7e-b7e4295f7036'
WHERE project_id IS NULL;

COMMENT ON COLUMN public.tasks.project_id IS 'Projet auquel cette tâche Task Hub est rattachée (optionnel)';
