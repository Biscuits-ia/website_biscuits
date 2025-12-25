const API_URL = import.meta.env.PUBLIC_API_URL || 'https://biscuits-admin-main-1a6oe6.laravel.cloud';
const REQUEST_TIMEOUT = 2000; // 2 secondes

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
  honey?: string;
  timestamp?: number;
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

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // ✅ Mesure de performance
  const startTime = performance.now();

  try {
    console.log('🌐 Requête vers:', url);
    console.log('⏱️ Timeout configuré:', timeout + 'ms');

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // ✅ Log du temps de réponse
    const duration = performance.now() - startTime;
    console.log(`⏱️ Temps de réponse: ${duration.toFixed(0)}ms`);
    
    if (duration > 2000) {
      console.warn(`🐌 Requête lente détectée: ${duration.toFixed(0)}ms`);
    }

    console.log('📥 Réponse:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      duration: `${duration.toFixed(0)}ms`,
    });

    return response;

  } catch (error) {
    clearTimeout(timeoutId);
    
    const duration = performance.now() - startTime;
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`⏱️ Timeout après ${duration.toFixed(0)}ms`);
      throw new ApiError('La requête a expiré. Le serveur met trop de temps à répondre.', 408);
    }

    console.error('❌ Erreur réseau:', error);
    console.error(`⏱️ Échec après ${duration.toFixed(0)}ms`);
    throw error;
  }
}

async function parseJsonResponse<T = unknown>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get('content-type');
  
  if (!contentType?.includes('application/json')) {
    console.error('❌ Réponse non-JSON reçue:', contentType);
    const text = await response.text();
    console.error('📄 Contenu (premiers 500 chars):', text.substring(0, 500));
    
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

export async function submitContact(data: ContactData): Promise<ApiResponse> {
  const startTime = performance.now();

  try {
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
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await parseJsonResponse(response);

    if (!response.ok) {
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

    const totalDuration = performance.now() - startTime;
    console.log(`✅ Contact envoyé avec succès en ${totalDuration.toFixed(0)}ms`);
    
    return result;

  } catch (error) {
    const totalDuration = performance.now() - startTime;
    console.error(`❌ Erreur après ${totalDuration.toFixed(0)}ms`);
    
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
  const startTime = performance.now();

  try {
    // ✅ Le honey et timestamp sont déjà dans data depuis le formulaire
    const payload = {
      ...data,
      honey: data.honey || '', // Utiliser celui du form, sinon vide
      timestamp: data.timestamp || Math.floor(Date.now() / 1000), // Utiliser celui du form, sinon maintenant
    };

    console.log('📤 Envoi devis:', {
      name: payload.name,
      email: payload.email,
      service: payload.service,
      hasHoney: 'honey' in payload,
      hasTimestamp: 'timestamp' in payload,
    });

    const response = await fetchWithTimeout(
      `${API_URL}/api/devis`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
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

    const totalDuration = performance.now() - startTime;
    console.log(`✅ Devis envoyé avec succès en ${totalDuration.toFixed(0)}ms`);
    
    return result;

  } catch (error) {
    const totalDuration = performance.now() - startTime;
    console.error(`❌ Erreur après ${totalDuration.toFixed(0)}ms`);
    
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
  const startTime = performance.now();
  
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/health`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      3000 // Timeout court pour le health check
    );

    const duration = performance.now() - startTime;
    console.log(`🏥 Health check: ${response.ok ? 'OK' : 'FAIL'} (${duration.toFixed(0)}ms)`);

    return response.ok;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ API non disponible (${duration.toFixed(0)}ms):`, error);
    return false;
  }
}