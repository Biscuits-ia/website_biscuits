const API_BASE_URL = import.meta.env.PUBLIC_API_URL || 'https://biscuits-admin-main-1a6oe6.laravel.cloud';
const REQUEST_TIMEOUT = 15000; // 15 secondes
const MAX_RETRIES = 2; // Nombre de tentatives
const RETRY_DELAY = 1000; // Délai initial entre retries (ms)

// Normaliser l'URL (ajouter https:// si manquant)
const normalizeUrl = (url: string): string => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
};

const API_URL = normalizeUrl(API_BASE_URL);

// Mode debug (uniquement en dev)
const IS_DEV = import.meta.env.DEV;
const log = (...args: unknown[]) => IS_DEV && console.log(...args);
const logError = (...args: unknown[]) => console.error(...args);

export interface ContactData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  zip_code?: string;
  country: string;
  service: string;
  message: string;
  honey?: string;
  timestamp?: number;
}

export interface DevisData {
  name: string;
  email: string;
  phone?: string;
  service: string;
  budget?: string;
  message?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

export interface ContactResource {
  id: number;
  name: string;
  email: string;
  service: string;
  status: string;
  created_at: string;
}

// ============================================
// CUSTOM ERRORS
// ============================================

/**
 * Erreur API générique
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public errors?: Record<string, string[]>,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Erreur de validation (422)
 */
export class ValidationError extends ApiError {
  constructor(
    message: string,
    public override errors: Record<string, string[]>
  ) {
    super(message, 422, errors);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /**
   * Obtenir le premier message d'erreur
   */
  getFirstError(): string {
    const firstField = Object.keys(this.errors)[0];
    if (!firstField) return 'Erreur de validation';
    return this.errors[firstField]?.[0] || 'Erreur de validation';
  }

  /**
   * Obtenir toutes les erreurs sous forme de liste
   */
  getAllErrors(): string[] {
    return Object.values(this.errors).flat();
  }
}

/**
 * Erreur rate limit (429)
 */
export class RateLimitError extends ApiError {
  constructor(message: string) {
    super(message, 429);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Erreur réseau
 */
export class NetworkError extends ApiError {
  constructor(message: string, originalError?: unknown) {
    super(message, 0, undefined, originalError);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new NetworkError('La requête a expiré. Vérifiez votre connexion.');
    }
    
    throw error;
  }
}

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
        log(`🔄 Tentative ${attempt + 1}/${retries + 1} après ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetchWithTimeout(url, options);
      const contentType = response.headers.get('content-type');

      // Vérifier que la réponse est du JSON
      if (!contentType?.includes('application/json')) {
        const text = await response.text();
        logError('❌ Réponse non-JSON:', text.substring(0, 200));
        
        throw new ApiError(
          'Le serveur a renvoyé une réponse invalide (HTML au lieu de JSON). Vérifiez que Laravel est bien démarré.',
          response.status,
          undefined,
          text
        );
      }

      const result = await response.json();

      // Erreur HTTP
      if (!response.ok) {
        // 422 : Validation
        if (response.status === 422 && result.errors) {
          throw new ValidationError(
            result.message || 'Erreur de validation',
            result.errors
          );
        }

        // 429 : Rate limit
        if (response.status === 429) {
          throw new RateLimitError(
            result.message || 'Trop de tentatives. Réessayez dans quelques minutes.'
          );
        }

        // Autres erreurs HTTP
        throw new ApiError(
          result.message || `Erreur HTTP ${response.status}`,
          response.status,
          result.errors,
          result
        );
      }

      return result as T;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Ne pas retry sur erreurs définitives
      if (
        error instanceof ValidationError ||
        error instanceof RateLimitError ||
        (error instanceof ApiError && error.status && error.status < 500)
      ) {
        throw error;
      }

      // Dernière tentative échouée
      if (attempt === retries) {
        throw error;
      }

      log(`⚠️ Tentative ${attempt + 1} échouée:`, lastError.message);
    }
  }

  throw lastError || new NetworkError('Échec après plusieurs tentatives');
}

interface RateLimitState {
  submissions: number[];
  windowMs: number;
  maxSubmissions: number;
}

const RATE_LIMITS: Record<string, RateLimitState> = {
  contact: {
    submissions: [],
    windowMs: 60 * 60 * 1000, // 1 heure
    maxSubmissions: 3,
  },
  devis: {
    submissions: [],
    windowMs: 60 * 60 * 1000, // 1 heure
    maxSubmissions: 3,
  },
};

function checkAndRecordRateLimit(key: keyof typeof RATE_LIMITS): void {
  if (typeof localStorage === 'undefined') return;

  const state = RATE_LIMITS[key];
  if (!state) {
    logError('⚠️ Rate limit state non trouvé pour:', key);
    return;
  }

  try {
    const storageKey = `ratelimit_${key}`;
    const now = Date.now();

    // Charger les soumissions depuis localStorage
    const stored = localStorage.getItem(storageKey);
    const submissions: number[] = stored ? JSON.parse(stored) : [];

    // Nettoyer les anciennes soumissions
    const recent = submissions.filter(ts => now - ts < state.windowMs);

    // Vérifier limite
    if (recent.length >= state.maxSubmissions) {
      const oldestSubmission = Math.min(...recent);
      const remainingMs = state.windowMs - (now - oldestSubmission);
      const remainingMin = Math.ceil(remainingMs / 60000);

      throw new RateLimitError(
        `Trop de tentatives. Réessayez dans ${remainingMin} minute(s).`
      );
    }

    // Enregistrer cette soumission
    recent.push(now);
    localStorage.setItem(storageKey, JSON.stringify(recent));
    state.submissions = recent;

  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    // Si localStorage échoue, on continue (fallback safe)
    logError('⚠️ Rate limit localStorage error:', error);
  }
}

export function resetRateLimit(key: keyof typeof RATE_LIMITS): void {
  if (typeof localStorage === 'undefined') return;
  
  const state = RATE_LIMITS[key];
  if (!state) {
    logError('⚠️ Rate limit state non trouvé pour:', key);
    return;
  }
  
  try {
    localStorage.removeItem(`ratelimit_${key}`);
    state.submissions = [];
    log(`✅ Rate limit '${key}' réinitialisé`);
  } catch (error) {
    logError('❌ Erreur réinitialisation rate limit:', error);
  }
}

export async function submitContact(
  data: ContactData
): Promise<ApiResponse<ContactResource>> {
  const startTime = performance.now();
  const endpoint = `${API_URL}/api/contacts`;

  log('📤 Envoi contact vers:', endpoint);
  log('📦 Données:', { ...data, message: data.message.substring(0, 50) + '...' });

  try {
    // Rate limit côté client
    checkAndRecordRateLimit('contact');

    // Validation côté client
    if (!data.name || data.name.length < 2) {
      throw new ValidationError('Validation échouée', {
        name: ['Le nom doit contenir au moins 2 caractères'],
      });
    }

    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new ValidationError('Validation échouée', {
        email: ['L\'email est invalide'],
      });
    }

    if (!data.message || data.message.length < 10) {
      throw new ValidationError('Validation échouée', {
        message: ['Le message doit contenir au moins 10 caractères'],
      });
    }

    // Injection timestamp si manquant
    const payload = {
      ...data,
      timestamp: data.timestamp || Date.now(),
    };

    const result = await fetchWithRetry<ApiResponse<ContactResource>>(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include', // Important pour CORS + cookies
        body: JSON.stringify(payload),
      }
    );

    const duration = performance.now() - startTime;
    log(`✅ Contact créé en ${duration.toFixed(0)}ms:`, result.data);

    return result;

  } catch (error) {
    const duration = performance.now() - startTime;
    logError(`❌ Erreur contact (${duration.toFixed(0)}ms):`, error);
    throw error;
  }
}

export async function submitDevis(
  data: DevisData
): Promise<ApiResponse> {
  const startTime = performance.now();
  const endpoint = `${API_URL}/api/devis`;

  log('📤 Envoi devis vers:', endpoint);
  log('📦 Données:', data);

  try {
    // Rate limit côté client
    checkAndRecordRateLimit('devis');

    // Validation côté client
    if (!data.name || data.name.length < 2) {
      throw new ValidationError('Validation échouée', {
        name: ['Le nom doit contenir au moins 2 caractères'],
      });
    }

    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new ValidationError('Validation échouée', {
        email: ['L\'email est invalide'],
      });
    }

    const result = await fetchWithRetry<ApiResponse>(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      }
    );

    const duration = performance.now() - startTime;
    log(`✅ Devis créé en ${duration.toFixed(0)}ms:`, result);

    return result;

  } catch (error) {
    const duration = performance.now() - startTime;
    logError(`❌ Erreur devis (${duration.toFixed(0)}ms):`, error);
    throw error;
  }
}

export async function testApiConnection(): Promise<boolean> {
  try {
    log('🔍 Test connexion API:', `${API_URL}/api/health`);
    
    const response = await fetchWithTimeout(`${API_URL}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }, 5000);

    const isHealthy = response.ok;
    log(isHealthy ? '✅ API accessible' : '❌ API inaccessible');
    
    return isHealthy;
  } catch (error) {
    logError('❌ API non accessible:', error);
    return false;
  }
}

export function formatApiError(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.getFirstError();
  }

  if (error instanceof RateLimitError) {
    return error.message;
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Une erreur est survenue. Veuillez réessayer.';
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ValidationError || error instanceof RateLimitError) {
    return false;
  }

  if (error instanceof ApiError) {
    return !error.status || error.status >= 500;
  }

  return true;
}

export { API_URL };

export default {
  submitContact,
  submitDevis,
  testApiConnection,
  formatApiError,
  isRetryableError,
  resetRateLimit,
};