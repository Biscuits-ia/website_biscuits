// src/utils/api.ts

// ✅ Supprimer le slash final pour éviter les doubles slashes
const API_URL = import.meta.env.PUBLIC_API_URL || 'https://biscuits-admin-main-1a6oe6.laravel.cloud';
const REQUEST_TIMEOUT = 15000; // 15 secondes (plus long pour les connexions lentes)

interface ContactData {
  name: string;
  email: string;
  country: string;
  service: string;
  message: string;
  honey?: string;
  timestamp?: number;
}

interface DevisData {
  name: string;
  email: string;
  phone?: string;
  service: string;
  budget?: string;
  message?: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public errors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fonction fetch avec timeout et meilleure gestion d'erreurs
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log('🌐 Requête vers:', url);
    console.log('📦 Options:', {
      method: options.method,
      headers: options.headers,
      body: options.body ? '(données présentes)' : '(pas de body)',
    });

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    console.log('📥 Réponse:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    clearTimeout(timeoutId);
    return response;

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('⏱️ Timeout dépassé');
      throw new ApiError('La requête a expiré. Vérifiez votre connexion.', 408);
    }

    console.error('❌ Erreur réseau:', error);
    throw error;
  }
}

/**
 * Parser la réponse JSON avec gestion d'erreurs
 */
async function parseJsonResponse<T = unknown>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get('content-type');
  
  if (!contentType?.includes('application/json')) {
    console.error('❌ Réponse non-JSON reçue:', contentType);
    const text = await response.text();
    console.error('📄 Contenu:', text.substring(0, 500));
    
    throw new ApiError(
      'Le serveur a renvoyé une réponse invalide.',
      response.status
    );
  }

  try {
    const result: ApiResponse<T> = await response.json();
    console.log('📋 Données parsées:', result);
    return result;
  } catch (error) {
    console.error('❌ Erreur parsing JSON:', error);
    throw new ApiError('Réponse serveur invalide.', response.status);
  }
}

/**
 * Envoyer un contact
 */
export async function submitContact(data: ContactData): Promise<ApiResponse> {
  try {
    // ✅ Ajouter timestamp automatiquement
    const payload: ContactData = {
      ...data,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      honey: data.honey || '', // Honeypot vide par défaut
    };

    console.log('📤 Envoi contact:', {
      name: payload.name,
      email: payload.email,
      service: payload.service,
      hasTimestamp: !!payload.timestamp,
    });

    const response = await fetchWithTimeout(
      `${API_URL}/api/contacts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          // ✅ Pas besoin d'Origin, le navigateur l'ajoute automatiquement
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await parseJsonResponse(response);

    if (!response.ok) {
      // Gestion spécifique des erreurs HTTP
      if (response.status === 429) {
        throw new ApiError(
          'Trop de demandes. Veuillez patienter quelques instants.',
          429
        );
      }

      if (response.status === 422) {
        throw new ApiError(
          result.message || 'Erreur de validation',
          422,
          result.errors
        );
      }

      if (response.status >= 500) {
        throw new ApiError(
          'Erreur serveur. Veuillez réessayer plus tard.',
          response.status
        );
      }

      throw new ApiError(
        result.message || 'Erreur lors de l\'envoi',
        response.status,
        result.errors
      );
    }

    console.log('✅ Contact envoyé avec succès');
    return result;

  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    console.error('❌ Erreur inattendue:', error);
    throw new ApiError('Erreur réseau. Veuillez réessayer.');
  }
}

/**
 * Envoyer un devis
 */
export async function submitDevis(data: DevisData): Promise<ApiResponse> {
  try {
    console.log('📤 Envoi devis:', {
      name: data.name,
      email: data.email,
      service: data.service,
    });

    const response = await fetchWithTimeout(
      `${API_URL}/api/devis`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    const result = await parseJsonResponse(response);

    if (!response.ok) {
      if (response.status === 429) {
        throw new ApiError(
          'Trop de demandes. Veuillez patienter.',
          429
        );
      }

      if (response.status === 422) {
        throw new ApiError(
          result.message || 'Erreur de validation',
          422,
          result.errors
        );
      }

      if (response.status >= 500) {
        throw new ApiError(
          'Erreur serveur. Veuillez réessayer plus tard.',
          response.status
        );
      }

      throw new ApiError(
        result.message || 'Erreur lors de l\'envoi',
        response.status,
        result.errors
      );
    }

    console.log('✅ Devis envoyé avec succès');
    return result;

  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    console.error('❌ Erreur inattendue:', error);
    throw new ApiError('Erreur réseau. Veuillez réessayer.');
  }
}

/**
 * Fonction helper pour vérifier la santé de l'API
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/health`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      5000 // Timeout court pour le health check
    );

    return response.ok;
  } catch (error) {
    console.error('❌ API non disponible:', error);
    return false;
  }
}