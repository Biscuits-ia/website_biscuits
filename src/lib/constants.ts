// src/lib/constants.ts — constantes de configuration métiers
import type { CorpsConfig, CorpsType, PriorityLevel, TaskStatus, TaskTypeEnum } from './types';

export const TASK_REFERENCE_PREFIXES: Record<CorpsType, string> = {
  DEV: 'DEV', DB: 'DB', DESIGN: 'DES', QA: 'QA', DATA: 'DATA', PM: 'PM',
};

export const PRIORITY_CONFIG: Record<PriorityLevel, { label: string; color: string; bgColor: string; maxHours: number }> = {
  P0: { label: 'Critique', color: 'text-red-700', bgColor: 'bg-red-100', maxHours: 4 },
  P1: { label: 'Haute', color: 'text-orange-700', bgColor: 'bg-orange-100', maxHours: 12 },
  P2: { label: 'Normale', color: 'text-blue-700', bgColor: 'bg-blue-100', maxHours: 40 },
  P3: { label: 'Basse', color: 'text-gray-700', bgColor: 'bg-gray-100', maxHours: 80 },
};

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; nextStatuses: TaskStatus[] }> = {
  backlog: { label: 'Backlog', color: 'text-slate-700', nextStatuses: ['todo'] },
  todo: { label: 'À faire', color: 'text-sky-700', nextStatuses: ['in_progress', 'blocked'] },
  in_progress: { label: 'En cours', color: 'text-indigo-700', nextStatuses: ['in_review', 'blocked'] },
  in_review: { label: 'En review', color: 'text-violet-700', nextStatuses: ['testing', 'in_progress', 'blocked'] },
  testing: { label: 'Testing', color: 'text-emerald-700', nextStatuses: ['done', 'in_progress', 'blocked'] },
  blocked: { label: 'Bloquée', color: 'text-red-700', nextStatuses: ['todo', 'in_progress'] },
  done: { label: 'Terminée', color: 'text-green-700', nextStatuses: [] },
};

const BASE_DOD = ['Code revu', 'Tests passants', 'Documentation mise à jour'];

export const CORPS_CONFIG: Record<CorpsType, CorpsConfig> = {
  DEV: {
    label: 'Développement', color: 'border-blue-600', bgColor: 'bg-blue-50', textColor: 'text-blue-700', icon: 'code',
    defaultTaskTypes: ['feature', 'bug_fix', 'refactoring', 'documentation'],
    defaultAcceptanceCriteria: {
      feature: ['Feature fonctionnelle', 'Tests unitaires ajoutés'],
      bug_fix: ['Bug reproduit puis corrigé', 'Non-régression validée'],
      refactoring: ['Lisibilité améliorée', 'Perf non dégradée'],
      documentation: ['Guide mis à jour'],
    },
    kpis: [{ name: 'Lead Time', unit: 'jours', target: 3 }, { name: 'Bug Rate', unit: '%', target: 5 }],
  },
  DB: {
    label: 'Base de Données', color: 'border-violet-600', bgColor: 'bg-violet-50', textColor: 'text-violet-700', icon: 'database',
    defaultTaskTypes: ['migration', 'modeling', 'optimization', 'backup'],
    defaultAcceptanceCriteria: {
      migration: ['Migration réversible', 'Rollback validé'],
      modeling: ['Schéma validé', 'Index adaptés'],
      optimization: ['Plan d’exécution amélioré'],
      backup: ['Restore testé'],
    },
    kpis: [{ name: 'Query Time P95', unit: 'ms', target: 120 }, { name: 'Incidents', unit: 'nb', target: 0 }],
  },
  DESIGN: {
    label: 'Design UX/UI', color: 'border-orange-500', bgColor: 'bg-orange-50', textColor: 'text-orange-700', icon: 'palette',
    defaultTaskTypes: ['wireframe', 'prototype', 'design_system', 'handoff'],
    defaultAcceptanceCriteria: {
      wireframe: ['Parcours validé'],
      prototype: ['Prototype cliquable livré'],
      design_system: ['Composants versionnés'],
      handoff: ['Specs complètes fournies'],
    },
    kpis: [{ name: 'Temps de validation', unit: 'jours', target: 2 }],
  },
  QA: {
    label: 'Assurance Qualité', color: 'border-green-600', bgColor: 'bg-green-50', textColor: 'text-green-700', icon: 'flask-conical',
    defaultTaskTypes: ['test_plan', 'functional_test', 'automated_test', 'release_validation'],
    defaultAcceptanceCriteria: {
      test_plan: ['Cas de test complets'],
      functional_test: ['Scénarios critiques validés'],
      automated_test: ['Pipeline vert'],
      release_validation: ['Go/No-Go documenté'],
    },
    kpis: [{ name: 'Coverage', unit: '%', target: 80 }, { name: 'Defect Escape', unit: '%', target: 2 }],
  },
  DATA: {
    label: 'Data', color: 'border-teal-600', bgColor: 'bg-teal-50', textColor: 'text-teal-700', icon: 'line-chart',
    defaultTaskTypes: ['exploratory_analysis', 'etl_pipeline', 'dashboard', 'ml_model'],
    defaultAcceptanceCriteria: {
      exploratory_analysis: ['Hypothèses testées'],
      etl_pipeline: ['Qualité des données monitorée'],
      dashboard: ['KPIs validés métier'],
      ml_model: ['Métriques modèle atteintes'],
    },
    kpis: [{ name: 'Fraîcheur données', unit: 'h', target: 2 }],
  },
  PM: {
    label: 'Project Management', color: 'border-red-600', bgColor: 'bg-red-50', textColor: 'text-red-700', icon: 'briefcase',
    defaultTaskTypes: ['sprint_planning', 'retrospective', 'reporting', 'stakeholder_management'],
    defaultAcceptanceCriteria: {
      sprint_planning: ['Objectif sprint validé'],
      retrospective: ['Actions d’amélioration décidées'],
      reporting: ['Rapport diffusé'],
      stakeholder_management: ['Comités tenus'],
    },
    kpis: [{ name: 'Predictibilité sprint', unit: '%', target: 85 }],
  },
};

export const ALL_TASK_TYPES: TaskTypeEnum[] = [
  'feature','bug_fix','refactoring','documentation','migration','modeling','optimization','backup',
  'wireframe','prototype','design_system','handoff','test_plan','functional_test','automated_test','release_validation',
  'exploratory_analysis','etl_pipeline','dashboard','ml_model','sprint_planning','retrospective','reporting','stakeholder_management',
];

export const DEFAULT_DOD_BY_CORPS: Record<CorpsType, string[]> = {
  DEV: [...BASE_DOD], DB: [...BASE_DOD], DESIGN: [...BASE_DOD], QA: [...BASE_DOD], DATA: [...BASE_DOD], PM: [...BASE_DOD],
};
