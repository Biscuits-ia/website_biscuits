-- =============================================================================
-- Biscuits IA — Seed de démonstration Task Hub
-- Exécuter après task_management_full.sql
-- =============================================================================

-- Sprint de démo
INSERT INTO public.sprints (name, goal, start_date, end_date, status, velocity_target, velocity_actual)
VALUES ('Sprint Demo Avril', 'Mettre en place le Task Hub multi-corps', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE + INTERVAL '7 days', 'active', 32, 18)
ON CONFLICT DO NOTHING;

-- Récupération sprint (si déjà présent)
WITH sprint_ref AS (
  SELECT id FROM public.sprints WHERE name = 'Sprint Demo Avril' ORDER BY created_at DESC LIMIT 1
)
INSERT INTO public.tasks (
  title,
  description,
  corps,
  task_type,
  priority,
  status,
  sprint_id,
  story_points,
  time_estimate_hours,
  time_spent_hours,
  acceptance_criteria,
  deliverables,
  definition_of_done,
  dod_completed,
  tags,
  blocked_reason,
  doc_link,
  figma_link
)
SELECT * FROM (
  VALUES
    (
      'Implémenter endpoint GET /api/tasks/:id',
      'Permettre le rafraîchissement de la page détail sans rechargement complet.',
      'DEV'::corps_type,
      'feature'::task_type_enum,
      'P1'::priority_level,
      'in_progress'::task_status,
      (SELECT id FROM sprint_ref),
      5,
      6.0,
      2.5,
      ARRAY['Réponse JSON valide','Gestion erreurs 404'],
      ARRAY['Endpoint opérationnel','Documentation API interne'],
      ARRAY['Code revu','Tests passants'],
      ARRAY[true,false],
      ARRAY['api','tasks'],
      NULL,
      'https://docs.biscuits-ia.local/task-hub-api',
      NULL
    ),
    (
      'Optimiser indexation table tasks',
      'Ajouter les index nécessaires pour réduire la latence de la vue kanban.',
      'DB'::corps_type,
      'optimization'::task_type_enum,
      'P1'::priority_level,
      'todo'::task_status,
      (SELECT id FROM sprint_ref),
      3,
      4.0,
      0.0,
      ARRAY['Plan d''exécution amélioré'],
      ARRAY['Script SQL d''indexation'],
      ARRAY['Code revu'],
      ARRAY[false],
      ARRAY['sql','performance'],
      NULL,
      NULL,
      NULL
    ),
    (
      'Préparer prototype Kanban mobile',
      'Concevoir une version mobile-first des colonnes pour l''équipe bénévole.',
      'DESIGN'::corps_type,
      'prototype'::task_type_enum,
      'P2'::priority_level,
      'in_review'::task_status,
      (SELECT id FROM sprint_ref),
      2,
      5.0,
      4.0,
      ARRAY['Prototype validé par PM'],
      ARRAY['Maquette Figma'],
      ARRAY['Documentation mise à jour'],
      ARRAY[true],
      ARRAY['ux','kanban'],
      NULL,
      NULL,
      'https://figma.com/file/demo-biscuits-kanban'
    ),
    (
      'Créer plan de test Task Hub',
      'Lister les cas critiques sur création, update, suppression et permissions.',
      'QA'::corps_type,
      'test_plan'::task_type_enum,
      'P1'::priority_level,
      'testing'::task_status,
      (SELECT id FROM sprint_ref),
      3,
      3.0,
      1.5,
      ARRAY['Checklist complète'],
      ARRAY['Plan de test'],
      ARRAY['Code revu'],
      ARRAY[true],
      ARRAY['qa','regression'],
      NULL,
      NULL,
      NULL
    ),
    (
      'Construire dashboard KPI hebdo',
      'Afficher le suivi des métriques par corps avec comparatif cible/réel.',
      'DATA'::corps_type,
      'dashboard'::task_type_enum,
      'P2'::priority_level,
      'blocked'::task_status,
      (SELECT id FROM sprint_ref),
      5,
      8.0,
      2.0,
      ARRAY['KPIs validés métier'],
      ARRAY['Dashboard interne'],
      ARRAY['Code revu'],
      ARRAY[false],
      ARRAY['kpi','bi'],
      'En attente de validation des sources de données',
      NULL,
      NULL
    ),
    (
      'Animer rétrospective de sprint',
      'Préparer les points forts/faibles et les actions d''amélioration.',
      'PM'::corps_type,
      'retrospective'::task_type_enum,
      'P3'::priority_level,
      'done'::task_status,
      (SELECT id FROM sprint_ref),
      1,
      2.0,
      2.0,
      ARRAY['Actions d''amélioration décidées'],
      ARRAY['Compte-rendu rétro'],
      ARRAY['Documentation mise à jour'],
      ARRAY[true],
      ARRAY['pm','sprint'],
      NULL,
      NULL,
      NULL
    )
) AS demo_tasks (
  title,
  description,
  corps,
  task_type,
  priority,
  status,
  sprint_id,
  story_points,
  time_estimate_hours,
  time_spent_hours,
  acceptance_criteria,
  deliverables,
  definition_of_done,
  dod_completed,
  tags,
  blocked_reason,
  doc_link,
  figma_link
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks t WHERE t.title = demo_tasks.title
);

-- Dépendances de démo (si les tâches existent)
WITH t AS (
  SELECT id, title FROM public.tasks
  WHERE title IN (
    'Implémenter endpoint GET /api/tasks/:id',
    'Optimiser indexation table tasks',
    'Construire dashboard KPI hebdo'
  )
)
INSERT INTO public.task_dependencies(task_id, depends_on_id)
SELECT kpi.id, db.id
FROM t kpi
JOIN t db ON db.title = 'Optimiser indexation table tasks'
WHERE kpi.title = 'Construire dashboard KPI hebdo'
ON CONFLICT (task_id, depends_on_id) DO NOTHING;

-- Commentaires de démo
WITH fk_ok AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.task_comments'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.tasks'::regclass
  ) AS ok
),
task_ref AS (
  SELECT id
  FROM public.tasks
  WHERE title = 'Implémenter endpoint GET /api/tasks/:id'
  LIMIT 1
),
author_ref AS (
  SELECT id
  FROM public.profiles
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.task_comments (task_id, author_id, content)
SELECT t.id, a.id, 'Point de synchro: progression confirmée.'
FROM fk_ok f
CROSS JOIN task_ref t
CROSS JOIN author_ref a
WHERE f.ok
  AND NOT EXISTS (
  SELECT 1
  FROM public.task_comments c
  WHERE c.task_id = t.id
    AND c.content = 'Point de synchro: progression confirmée.'
);

-- Snapshots KPI de démo
INSERT INTO public.kpi_snapshots (sprint_id, corps, metric_name, metric_value, target_value)
SELECT s.id, x.corps, x.metric_name, x.metric_value, x.target_value
FROM (VALUES
  ('DEV'::corps_type, 'Lead Time', 2.8, 3),
  ('DB'::corps_type, 'Query Time P95', 140, 120),
  ('DESIGN'::corps_type, 'Temps de validation', 1.8, 2),
  ('QA'::corps_type, 'Coverage', 76, 80),
  ('DATA'::corps_type, 'Fraîcheur données', 3, 2),
  ('PM'::corps_type, 'Predictibilité sprint', 82, 85)
) AS x(corps, metric_name, metric_value, target_value)
CROSS JOIN (
  SELECT id FROM public.sprints WHERE name = 'Sprint Demo Avril' ORDER BY created_at DESC LIMIT 1
) s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.kpi_snapshots k
  WHERE k.sprint_id = s.id
    AND k.corps = x.corps
    AND k.metric_name = x.metric_name
);
