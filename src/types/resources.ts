// src/types/resources.ts

// ── Types BDD ─────────────────────────────────────────────────────────────────

export interface Resource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
  is_published: boolean;
  downloads: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formate la taille d'un fichier en unité lisible */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`;
}

/** Retourne une icône emoji selon le MIME type */
export function fileIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType === 'application/zip') return '📦';
  if (mimeType.includes('word')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('csv')) return '📊';
  if (mimeType.includes('presentation')) return '📋';
  if (mimeType.startsWith('text/')) return '📃';
  return '📁';
}

/** Retourne le label court du type de fichier */
export function fileTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Vidéo';
  if (mimeType === 'application/zip') return 'Archive';
  if (mimeType.includes('word')) return 'Word';
  if (mimeType.includes('sheet')) return 'Excel';
  if (mimeType.includes('presentation')) return 'PowerPoint';
  if (mimeType.startsWith('text/')) return 'Texte';
  return 'Fichier';
}

/** Catégories prédéfinies — à adapter selon ton projet */
export const RESOURCE_CATEGORIES = [
  'IA générative',
  'Prompt engineering',
  'Outils IA',
  'Éthique & société',
  'Machine learning',
  'Tutoriels',
  'Guides pratiques',
  'Autres',
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];
