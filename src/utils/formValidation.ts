export type ValidationRule = (value: string) => string | null;

export const validationRules: Record<string, ValidationRule> = {
  name: (value: string) => {
    if (!value.trim()) return 'Le nom est obligatoire';
    if (value.length < 2) return 'Le nom doit contenir au moins 2 caractères';
    if (value.length > 100) return 'Le nom ne peut pas dépasser 100 caractères';
    return null;
  },

  email: (value: string) => {
    if (!value.trim()) return 'L\'email est obligatoire';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return 'Email invalide';
    if (value.length > 255) return 'L\'email ne peut pas dépasser 255 caractères';
    return null;
  },

  address: (value: string) => {
    if (!value.trim()) return 'L\'adresse est obligatoire';
    if (value.length < 5) return 'L\'adresse doit contenir au moins 5 caractères';
    if (value.length > 255) return 'L\'adresse ne peut pas dépasser 255 caractères';
    return null;
  },

  message: (value: string) => {
    if (!value.trim()) return 'Le message est obligatoire';
    if (value.length < 20) {
      return 'Le message doit contenir au moins 20 caractères';
    }
    if (value.length > 2000) {
      return 'Le message ne peut pas dépasser 2000 caractères';
    }
    return null;
  },

  budget: (value: string | null | undefined): string | null => {
    if (typeof value !== 'string') return null;
    if (value.trim() === '') return null;
    try {
      if (isNaN(parseFloat(value))) return 'Le budget doit être un nombre';
      if (parseFloat(value) < 0) return 'Le budget ne peut pas être négatif';
      return null;
    } catch (error) {
      console.error('Error validating budget', error);
      return 'Erreur lors de la validation du budget';
    }
  },
};

/**
 * Valide un champ spécifique
 */
export function validateField(field: string, value: string): string | null {
  const rule = validationRules[field];
  if (!rule) return null;
  return rule(value);
}

/**
 * Valide tous les champs d'un formulaire
 */
export function validateForm(
  data: Record<string, string>
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const [field, value] of Object.entries(data)) {
    const error = validateField(field, value);
    if (error) {
      errors[field] = error;
    }
  }

  return errors;
}