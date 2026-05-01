-- =============================================================================
-- Biscuits IA — RLS tasks : visibilité limitée au périmètre projet
-- Un utilisateur ne voit que les tâches :
--   1. appartenant à un projet dont il est membre (project_members)
--   2. qui lui sont directement assignées (assignee_id)
--   3. ou qu'il a créées/rapportées (reporter_id)
--   4. ou s'il est pm / tech_lead (accès global)
--
-- Dépend de :
--   - task_management_full.sql   (table tasks, enum corps_type, etc.)
--   - add_benevole_space.sql     (table project_members)
--   - add_project_id_to_tasks.sql (colonne tasks.project_id)
-- =============================================================================

-- Politique SELECT : remplace l'ancien USING (true)
DROP POLICY IF EXISTS tasks_select ON public.tasks;

CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    -- 1. pm / tech_lead : accès global
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('pm', 'tech_lead')
    )
    OR
    -- 2. Membre du projet lié à la tâche
    (
      project_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = tasks.project_id
          AND pm.user_id    = auth.uid()
      )
    )
    OR
    -- 3. Tâche assignée directement à l'utilisateur
    assignee_id = auth.uid()
    OR
    -- 4. Tâche créée / rapportée par l'utilisateur
    reporter_id = auth.uid()
    OR
    -- 5. Tâche sans projet (legacy / non rattachée) : visible uniquement
    --    par son assignee ou son reporter (couvert par les cas 3 et 4 ci-dessus)
    --    — on laisse ce cas tombé implicitement dans les règles 3/4.
    false
  );

-- Politique INSERT : inchangée mais on s'assure que l'utilisateur
-- est bien membre du projet cible avant de créer une tâche dedans.
DROP POLICY IF EXISTS tasks_insert ON public.tasks;

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    -- pm / tech_lead peut créer dans n'importe quel projet
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('pm', 'tech_lead')
    )
    OR
    -- Membre du projet cible
    (
      project_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = tasks.project_id
          AND pm.user_id    = auth.uid()
      )
    )
  );

-- Politique UPDATE : inchangée (assignee ou pm)
DROP POLICY IF EXISTS tasks_update ON public.tasks;

CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'pm'
    )
  );

-- Politique DELETE : inchangée (pm / tech_lead)
DROP POLICY IF EXISTS tasks_delete ON public.tasks;

CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('pm', 'tech_lead')
    )
  );
