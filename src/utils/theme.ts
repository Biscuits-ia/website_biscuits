// src/utils/theme.ts

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme-preference' as const;

/**
 * Récupère le thème préféré de l'utilisateur
 */
export function getPreferredTheme(): Theme {
  // Vérifier localStorage d'abord
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  }
  
  // Sinon, vérifier la préférence système
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches 
      ? 'light' 
      : 'dark';
  }
  
  return 'dark'; // Défaut
}

/**
 * Applique le thème au document
 */
export function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

/**
 * Sauvegarde le thème dans localStorage
 */
export function saveTheme(theme: Theme): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}

/**
 * Toggle entre les thèmes
 */
export function toggleTheme(): Theme {
  const current = getPreferredTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  
  applyTheme(next);
  saveTheme(next);
  
  return next;
}

/**
 * Écoute les changements de préférence système
 */
export function watchSystemTheme(callback: (theme: Theme) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }
  
  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
  
  const handler = (e: MediaQueryListEvent): void => {
    const theme: Theme = e.matches ? 'light' : 'dark';
    callback(theme);
  };
  
  mediaQuery.addEventListener('change', handler);
  
  return () => mediaQuery.removeEventListener('change', handler);
}