// ============================================================================
// src/lib/project-detail.ts
// ----------------------------------------------------------------------------
// Chargement et mise en forme des donnees de /dashboard/benevole/project/[id].
//
// Extrait du frontmatter de la page (audit P4 #31), qui melait requetes
// Supabase, types, agregations et libelles d'affichage sur 145 lignes.
//
// La page ne fait plus que : garde d'auth -> loadProjectDetail() -> rendu.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Project {
  id: string; title: string; description: string | null;
  objective: string | null; expected_deliverables: string | null;
  tech_stack: string[]; tools: string[];
  repository_url: string | null; document_url: string | null;
  communication_channel: string | null; estimated_hours: number | null;
  start_date: string | null;
  status: string; priority: string; deadline: string | null;
  created_at: string; leader_id: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  deadline: string | null;
  created_by: string;
  assignee_id: string | null;
}

export interface Member { user_id: string; }

export interface Profile { full_name: string | null; email: string; }

export interface KanbanColumn { key: string; label: string; cls: string; }

export interface MemberOption { id: string; name: string; }

/** Tout ce dont la page et ses composants ont besoin. */
export interface ProjectDetail {
  project:       Project;
  tasks:         Task[];
  members:       Member[];
  profileMap:    Record<string, Profile>;
  columns:       KanbanColumn[];
  tasksByStatus: Record<string, Task[]>;
  memberOptions: MemberOption[];
  leaderName:    string;
  deadlineStr:   string | null;
  isLeader:      boolean;
  isMember:      boolean;
  canEdit:       boolean;
  counts: {
    total: number; todo: number; inProgress: number;
    review: number; done: number; free: number;
  };
}

// ── Libelles et classes CSS ──────────────────────────────────────────────────
// Exportes : les composants les partagent, plutot que de les redefinir chacun.

export const COLUMNS: readonly KanbanColumn[] = [
  { key: 'todo',        label: 'À faire',   cls: 'neutral' },
  { key: 'in_progress', label: 'En cours',  cls: 'info'    },
  { key: 'review',      label: 'Révision',  cls: 'warn'    },
  { key: 'done',        label: 'Terminé',   cls: 'ok'      },
];

export const PRIORITY_CLASS: Record<string, string> = { low: 'neutral', medium: 'info', high: 'err' };
export const PRIORITY_LABEL: Record<string, string> = { low: 'Faible', medium: 'Moyenne', high: 'Haute' };
export const STATUS_LABEL:   Record<string, string> = {
  active: 'Actif', on_hold: 'En pause', completed: 'Terminé', archived: 'Archivé',
};
export const STATUS_CLASS:   Record<string, string> = {
  active: 'ok', on_hold: 'warn', completed: 'info', archived: 'neutral',
};

/** Nom affichable d'un profil, avec repli sur l'email puis sur l'UUID. */
export function displayName(profile: Profile | undefined, fallback = '—'): string {
  return profile?.full_name ?? profile?.email ?? fallback;
}

// ── Chargement ───────────────────────────────────────────────────────────────

/**
 * Charge un projet, ses taches et ses membres, puis derive tout ce que la vue
 * consomme. Retourne `null` si le projet est introuvable : l'appelant redirige.
 *
 * Les profils sont recuperes en une requete separee plutot qu'en embedded join :
 * PostgREST refuse le join quand plusieurs FK pointent vers `profiles`.
 */
export async function loadProjectDetail(
  db: SupabaseClient,
  projectId: string,
  userId: string,
  isStaff: boolean,
): Promise<ProjectDetail | null> {
  const [
    { data: projectRaw, error: projErr },
    { data: tasksRaw, error: tasksErr },
    { data: membersRaw },
  ] = await Promise.all([
    db.from('projects')
      .select(`
        id, title, description, objective, expected_deliverables,
        tech_stack, tools, repository_url, document_url,
        communication_channel, estimated_hours,
        start_date, status, priority, deadline, created_at, leader_id
      `)
      .eq('id', projectId)
      .single(),
    db.from('project_tasks')
      .select('id, title, description, status, priority, deadline, created_by, assignee_id')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false }),
    db.from('project_members')
      .select('user_id')
      .eq('project_id', projectId),
  ]);

  if (projErr || !projectRaw) return null;
  if (tasksErr) console.error('[project-detail] tasks query error:', tasksErr.message, tasksErr.code);

  const project = projectRaw as unknown as Project;
  const tasks   = (tasksRaw ?? []) as unknown as Task[];
  const members = (membersRaw ?? []) as unknown as Member[];

  // ── Profils (leader + assignes + membres), en une seule requete ────────────
  const allProfileIds = [...new Set([
    ...(project.leader_id ? [project.leader_id] : []),
    ...tasks.map((t) => t.assignee_id).filter((id): id is string => !!id),
    ...members.map((m) => m.user_id),
  ])];

  const profileMap: Record<string, Profile> = {};
  if (allProfileIds.length > 0) {
    const { data: profilesRaw } = await db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', allProfileIds);
    for (const p of profilesRaw ?? []) profileMap[p.id] = p;
  }

  // ── Repartition kanban ────────────────────────────────────────────────────
  const columns = [...COLUMNS];
  const tasksByStatus: Record<string, Task[]> = {};
  for (const col of columns) tasksByStatus[col.key] = [];
  for (const t of tasks) {
    // project_tasks.status est deja aligne sur les 4 colonnes kanban.
    const colKey = columns.some((c) => c.key === t.status) ? t.status : 'todo';
    tasksByStatus[colKey].push(t);
  }

  const isLeader = project.leader_id === userId;
  const isMember = members.some((m) => m.user_id === userId);

  return {
    project,
    tasks,
    members,
    profileMap,
    columns,
    tasksByStatus,
    memberOptions: members.map((m) => ({
      id: m.user_id,
      name: displayName(profileMap[m.user_id], m.user_id),
    })),
    leaderName:  project.leader_id ? displayName(profileMap[project.leader_id]) : '—',
    deadlineStr: project.deadline ? new Date(project.deadline).toLocaleDateString('fr-FR') : null,
    isLeader,
    isMember,
    canEdit: isLeader || isStaff,
    counts: {
      total:      tasks.length,
      todo:       tasksByStatus['todo']?.length ?? 0,
      inProgress: tasksByStatus['in_progress']?.length ?? 0,
      review:     tasksByStatus['review']?.length ?? 0,
      done:       tasksByStatus['done']?.length ?? 0,
      free:       tasks.filter((t) => !t.assignee_id).length,
    },
  };
}
