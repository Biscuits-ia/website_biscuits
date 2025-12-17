export type ServiceCategory =
  | "starter-kits"
  | "ia"
  | "consulting";

export type ServicesList = readonly string[];

export type ServicesConfigType = Record<ServiceCategory, ServicesList>;

export const SERVICES_CONFIG: ServicesConfigType = {
  "starter-kits": [
    "StarterKit Next.js Pro",
    "StarterKit Astro Local Business",
    "StarterKit SaaS Supabase Complet",
  ],
  "ia": [
    "Audit IA",
    "Automatisation IA API",
    "Chatbot IA Professionnel",
  ],
  "consulting": [
    "Consulting Technique",
    "Coaching Développeur",
    "Architecture & Performance",
  ],
} as const;

export const EUROPE_COUNTRIES = [
  "France",
  "Belgique",
  "Luxembourg",
  "Suisse",
  "Italie",
  "Espagne",
  "Portugal",
  "Allemagne",
  "Pays-Bas",
  "Autriche",
  "Irlande",
  "Danemark",
  "Suède",
  "Norvège",
  "Finlande",
  "Islande",
  "Grèce",
  "Croatie",
  "Hongrie",
  "Pologne",
  "Tchéquie",
  "Slovaquie",
  "Slovénie",
  "Estonie",
  "Lettonie",
  "Lituanie",
] as const;

export type EuropeanCountry = typeof EUROPE_COUNTRIES[number];

export interface ContactFormData {
  name: string;
  email: string;
  country: string;
  service: string;
  message: string;
  honey: string;
  timestamp: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof ContactFormData, string>>;
}

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
}

export const sanitizeInput = (value: string): string => {
  return value.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

export const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const validateField = (
  field: keyof Omit<ContactFormData, "honey" | "timestamp">,
  value: string
): string | null => {
  switch (field) {
    case "name":
      if (!value) return "Le nom est obligatoire.";
      if (value.length < 3) return "Le nom est trop court.";
      if (value.length > 50) return "Le nom est trop long.";
      return null;

    case "email":
      if (!value) return "L’email est obligatoire.";
      if (!EMAIL_REGEX.test(value)) return "Format d’email invalide.";
      return null;

    case "country":
      if (!value) return "Le pays est obligatoire.";
      if (!EUROPE_COUNTRIES.includes(value as EuropeanCountry))
        return "Pays non pris en charge pour l’intervention.";
      return null;

    case "service":
      if (!value) return "Veuillez sélectionner un service.";
      return null;

    case "message":
      if (!value) return "Veuillez décrire votre projet.";
      if (value.length < 10) return "Le message est trop court.";
      if (value.length > 1000) return "Le message est trop long.";
      return null;

    default:
      return null;
  }
};

export const validateForm = (
  data: Partial<ContactFormData>
): ValidationResult => {
  const errors: ValidationResult["errors"] = {};

  const fields: (keyof Omit<ContactFormData, "honey" | "timestamp">)[] = [
    "name",
    "email",
    "country",
    "service",
    "message",
  ];

  fields.forEach((field) => {
    const error = validateField(field, (data[field] ?? "") as string);
    if (error) errors[field] = error;
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const checkSpam = (
  honey: string,
  timestamp: number
): SpamCheckResult => {
  if (honey.trim() !== "")
    return { isSpam: true, reason: "Honeypot rempli" };

  const now = Date.now();

  if (now - timestamp < 2000)
    return { isSpam: true, reason: "Saisie trop rapide" };

  return { isSpam: false };
};
