// ─── Shared validation constants ──────────────────────────────────────
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_NAME = 100;
export const MAX_EMAIL = 255;
export const MAX_SUBJECT = 150;
export const MIN_MESSAGE = 20;
export const MAX_MESSAGE = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
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
