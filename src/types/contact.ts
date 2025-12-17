export interface ContactFormData {
  name: string;
  email: string;
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

export type ServiceCategory = 'starter-kits' | 'ia' | 'consulting';

export interface ServiceConfig {
  [key: string]: string[];
}

export const SERVICES_CONFIG: Record<ServiceCategory, string[]> = {
  "starter-kits": [
    "StarterKit Next.js Pro",
    "StarterKit Astro Local Business",
    "StarterKit SaaS Supabase Complet",
  ],
  "ia": [
    "Audit IA",
    "Automatisation IA",
    "Chatbot IA",
  ],
  "consulting": [
    "Consulting Technique",
    "Coaching Dev",
    "Architecture & Performance",
  ],
};
