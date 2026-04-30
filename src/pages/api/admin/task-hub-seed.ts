import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface SeedTaskInput {
  title: string;
  description: string;
  corps: 'DEV' | 'DB' | 'DESIGN' | 'QA' | 'DATA' | 'PM';
  task_type: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'testing' | 'blocked' | 'done';
  story_points: number;
  time_estimate_hours: number;
  time_spent_hours: number;
  acceptance_criteria: string[];
  deliverables: string[];
  definition_of_done: string[];
  dod_completed: boolean[];
  tags: string[];
  blocked_reason: string | null;
  doc_link: string | null;
  figma_link: string | null;
}

const seedTasks: SeedTaskInput[] = [
  {
    title: 'Implémenter endpoint GET /api/tasks/:id',
    description: 'Permettre le rafraîchissement de la page détail sans rechargement complet.',
    corps: 'DEV', task_type: 'feature', priority: 'P1', status: 'in_progress',
    story_points: 5, time_estimate_hours: 6, time_spent_hours: 2.5,
    acceptance_criteria: ['Réponse JSON valide', 'Gestion erreurs 404'],
    deliverables: ['Endpoint opérationnel', 'Documentation API interne'],
    definition_of_done: ['Code revu', 'Tests passants'], dod_completed: [true, false],
    tags: ['api', 'tasks'], blocked_reason: null,
    doc_link: 'https://docs.biscuits-ia.local/task-hub-api', figma_link: null,
  },
  {
    title: 'Optimiser indexation table tasks',
    description: 'Ajouter les index nécessaires pour réduire la latence de la vue kanban.',
    corps: 'DB', task_type: 'optimization', priority: 'P1', status: 'todo',
    story_points: 3, time_estimate_hours: 4, time_spent_hours: 0,
    acceptance_criteria: ['Plan d\'exécution amélioré'],
    deliverables: ['Script SQL d\'indexation'],
    definition_of_done: ['Code revu'], dod_completed: [false],
    tags: ['sql', 'performance'], blocked_reason: null,
    doc_link: null, figma_link: null,
  },
  {
    title: 'Préparer prototype Kanban mobile',
    description: 'Concevoir une version mobile-first des colonnes pour l\'équipe bénévole.',
    corps: 'DESIGN', task_type: 'prototype', priority: 'P2', status: 'in_review',
    story_points: 2, time_estimate_hours: 5, time_spent_hours: 4,
    acceptance_criteria: ['Prototype validé par PM'],
    deliverables: ['Maquette Figma'],
    definition_of_done: ['Documentation mise à jour'], dod_completed: [true],
    tags: ['ux', 'kanban'], blocked_reason: null,
    doc_link: null, figma_link: 'https://figma.com/file/demo-biscuits-kanban',
  },
  {
    title: 'Créer plan de test Task Hub',
    description: 'Lister les cas critiques sur création, update, suppression et permissions.',
    corps: 'QA', task_type: 'test_plan', priority: 'P1', status: 'testing',
    story_points: 3, time_estimate_hours: 3, time_spent_hours: 1.5,
    acceptance_criteria: ['Checklist complète'], deliverables: ['Plan de test'],
    definition_of_done: ['Code revu'], dod_completed: [true], tags: ['qa', 'regression'],
    blocked_reason: null, doc_link: null, figma_link: null,
  },
  {
    title: 'Construire dashboard KPI hebdo',
    description: 'Afficher le suivi des métriques par corps avec comparatif cible/réel.',
    corps: 'DATA', task_type: 'dashboard', priority: 'P2', status: 'blocked',
    story_points: 5, time_estimate_hours: 8, time_spent_hours: 2,
    acceptance_criteria: ['KPIs validés métier'], deliverables: ['Dashboard interne'],
    definition_of_done: ['Code revu'], dod_completed: [false], tags: ['kpi', 'bi'],
    blocked_reason: 'En attente de validation des sources de données', doc_link: null, figma_link: null,
  },
  {
    title: 'Animer rétrospective de sprint',
    description: 'Préparer les points forts/faibles et les actions d\'amélioration.',
    corps: 'PM', task_type: 'retrospective', priority: 'P3', status: 'done',
    story_points: 1, time_estimate_hours: 2, time_spent_hours: 2,
    acceptance_criteria: ['Actions d\'amélioration décidées'], deliverables: ['Compte-rendu rétro'],
    definition_of_done: ['Documentation mise à jour'], dod_completed: [true], tags: ['pm', 'sprint'],
    blocked_reason: null, doc_link: null, figma_link: null,
  },
];

const seedKpis = [
  { corps: 'DEV', metric_name: 'Lead Time', metric_value: 2.8, target_value: 3 },
  { corps: 'DB', metric_name: 'Query Time P95', metric_value: 140, target_value: 120 },
  { corps: 'DESIGN', metric_name: 'Temps de validation', metric_value: 1.8, target_value: 2 },
  { corps: 'QA', metric_name: 'Coverage', metric_value: 76, target_value: 80 },
  { corps: 'DATA', metric_name: 'Fraîcheur données', metric_value: 3, target_value: 2 },
  { corps: 'PM', metric_name: 'Predictibilité sprint', metric_value: 82, target_value: 85 },
] as const;

async function ensureDemoSprint(admin: ReturnType<typeof createSupabaseAdminClient>): Promise<{ sprintId: string; error?: string }> {
  const { data: existingSprint } = await admin
    .from('sprints')
    .select('id')
    .eq('name', 'Sprint Demo Avril')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSprint?.id) return { sprintId: existingSprint.id };

  const { data: sprint, error } = await admin
    .from('sprints')
    .insert({
      name: 'Sprint Demo Avril',
      goal: 'Mettre en place le Task Hub multi-corps',
      start_date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      status: 'active',
      velocity_target: 32,
      velocity_actual: 18,
    })
    .select('id')
    .single();

  if (error || !sprint) {
    console.error('[api/admin/task-hub-seed] sprint insert error:', error?.message);
    return { sprintId: '', error: 'Impossible de créer le sprint de démonstration.' };
  }

  return { sprintId: sprint.id };
}

async function seedTasksData(admin: ReturnType<typeof createSupabaseAdminClient>, sprintId: string): Promise<number> {
  let insertedTasks = 0;

  for (const t of seedTasks) {
    const { data: exists } = await admin
      .from('tasks')
      .select('id')
      .eq('title', t.title)
      .limit(1)
      .maybeSingle();

    if (exists?.id) continue;

    const { error } = await admin.from('tasks').insert({ ...t, sprint_id: sprintId });
    if (!error) insertedTasks += 1;
  }

  return insertedTasks;
}

async function getSeededTaskMap(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data: allSeeded } = await admin
    .from('tasks')
    .select('id, title')
    .in('title', seedTasks.map((t) => t.title));
  return new Map((allSeeded ?? []).map((row) => [row.title, row.id]));
}

async function seedDependencyAndComment(admin: ReturnType<typeof createSupabaseAdminClient>, mapByTitle: Map<string, string>) {
  const kpiTaskId = mapByTitle.get('Construire dashboard KPI hebdo');
  const dbTaskId = mapByTitle.get('Optimiser indexation table tasks');
  if (kpiTaskId && dbTaskId) {
    await admin.from('task_dependencies').upsert({ task_id: kpiTaskId, depends_on_id: dbTaskId }, { onConflict: 'task_id,depends_on_id' });
  }

  const devTaskId = mapByTitle.get('Implémenter endpoint GET /api/tasks/:id');
  if (!devTaskId) return;

  const { data: author } = await admin
    .from('profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!author?.id) return;

  const { data: commentExists } = await admin
    .from('task_comments')
    .select('id')
    .eq('task_id', devTaskId)
    .eq('content', 'Point de synchro: progression confirmée.')
    .limit(1)
    .maybeSingle();

  if (!commentExists?.id) {
    await admin.from('task_comments').insert({
      task_id: devTaskId,
      author_id: author.id,
      content: 'Point de synchro: progression confirmée.',
    });
  }
}

async function seedKpiSnapshots(admin: ReturnType<typeof createSupabaseAdminClient>, sprintId: string) {
  for (const kpi of seedKpis) {
    const { data: existingKpi } = await admin
      .from('kpi_snapshots')
      .select('id')
      .eq('sprint_id', sprintId)
      .eq('corps', kpi.corps)
      .eq('metric_name', kpi.metric_name)
      .limit(1)
      .maybeSingle();

    if (!existingKpi?.id) {
      await admin.from('kpi_snapshots').insert({ sprint_id: sprintId, ...kpi });
    }
  }
}

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro as any);
  if (auth instanceof Response) return auth;

  const admin = createSupabaseAdminClient();

  const sprintResult = await ensureDemoSprint(admin);
  if (sprintResult.error) return json({ error: sprintResult.error }, 500);

  const sprintId = sprintResult.sprintId;
  const insertedTasks = await seedTasksData(admin, sprintId);
  const mapByTitle = await getSeededTaskMap(admin);
  await seedDependencyAndComment(admin, mapByTitle);
  await seedKpiSnapshots(admin, sprintId);

  return json({ ok: true, sprintId, insertedTasks });
};
