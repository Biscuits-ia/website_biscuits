// ─── Shared validation constants ──────────────────────────────────────
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_NAME = 100;
export const MAX_EMAIL = 255;
export const MAX_SUBJECT = 150;
export const MIN_MESSAGE = 20;
export const MAX_MESSAGE = 2000;

/**
 * Politique mot de passe — source de vérité unique.
 * CNIL recommande ≥ 8 ; on exige aussi une longueur max pour éviter les abus.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Valide un mot de passe selon la politique du site.
 * Retourne null si OK, sinon un message d'erreur localisable.
 */
export function validatePassword(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return 'Le mot de passe est requis.';
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} caractères.`;
  }
  return null;
}

/** Valide une URL et s'assure qu'elle utilise http(s) uniquement. */
export function validateHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}
