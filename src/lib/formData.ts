// src/lib/formData.ts
// Helpers de lecture de FormData partagés entre les API routes.

/** Récupère le premier champ texte d'un FormData (null si File) */
export function getFormString(form: FormData, key: string): string | null {
  const val = form.get(key);
  return val instanceof File ? null : val;
}
