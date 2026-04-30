// src/lib/types.ts — types métiers de l'outil de gestion de tâches
import type { SupabaseClient } from '@supabase/supabase-js';

export type CorpsType = 'DEV' | 'DB' | 'DESIGN' | 'QA' | 'DATA' | 'PM';
export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'testing' | 'blocked' | 'done';
export type TaskTypeEnum =
  | 'feature' | 'bug_fix' | 'refactoring' | 'documentation'
  | 'migration' | 'modeling' | 'optimization' | 'backup'
  | 'wireframe' | 'prototype' | 'design_system' | 'handoff'
  | 'test_plan' | 'functional_test' | 'automated_test' | 'release_validation'
  | 'exploratory_analysis' | 'etl_pipeline' | 'dashboard' | 'ml_model'
  | 'sprint_planning' | 'retrospective' | 'reporting' | 'stakeholder_management';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  corps: CorpsType[];
  role: 'pm' | 'tech_lead' | 'member' | string;
  created_at: string;
  updated_at: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: 'planning' | 'active' | 'completed' | string;
  velocity_target: number;
  velocity_actual: number;
  created_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  corps: CorpsType;
  task_type: TaskTypeEnum;
  priority: PriorityLevel;
  status: TaskStatus;
  assignee_id: string | null;
  reporter_id: string | null;
  sprint_id: string | null;
  story_points: number | null;
  time_estimate_hours: number | null;
  time_spent_hours: number | null;
  due_date: string | null;
  acceptance_criteria: string[];
  deliverables: string[];
  definition_of_done: string[];
  dod_completed: boolean[];
  tags: string[];
  blocked_reason: string | null;
  parent_task_id: string | null;
  doc_link: string | null;
  figma_link: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithRelations extends Task {
  assignee?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null;
  reporter?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null;
  sprint?: Pick<Sprint, 'id' | 'name' | 'status'> | null;
}

export interface TaskFormData {
  title: string;
  description: string;
  corps: CorpsType;
  task_type: TaskTypeEnum;
  priority: PriorityLevel;
  status: TaskStatus;
  assignee_id: string | null;
  sprint_id: string | null;
  story_points: number | null;
  time_estimate_hours: number | null;
  due_date: string | null;
  acceptance_criteria: string[];
  deliverables: string[];
  definition_of_done: string[];
  tags: string[];
  doc_link: string | null;
  figma_link: string | null;
}

export interface KpiSnapshot {
  id: string;
  sprint_id: string | null;
  corps: CorpsType;
  metric_name: string;
  metric_value: number;
  target_value: number | null;
  recorded_at: string;
}

export interface CorpsConfig {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  icon: string;
  defaultTaskTypes: TaskTypeEnum[];
  defaultAcceptanceCriteria: Record<string, string[]>;
  kpis: Array<{ name: string; unit: string; target: number }>;
}

export type Database = {
  public: {
    Tables: {
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      sprints: { Row: Sprint; Insert: Partial<Sprint>; Update: Partial<Sprint> };
      kpi_snapshots: { Row: KpiSnapshot; Insert: Partial<KpiSnapshot>; Update: Partial<KpiSnapshot> };
    };
  };
};

export type AppSupabaseClient = SupabaseClient<Database>;
