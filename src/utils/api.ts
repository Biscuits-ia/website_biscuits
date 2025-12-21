// src/utils/api.ts

const API_URL = 'https://biscuits-admin-main-1a6oe6.laravel.cloud/';
const REQUEST_TIMEOUT = 10000; // 10 secondes

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
 * Fonction fetch avec timeout
 */
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
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Envoyer un contact
 */
export async function submitContact(data: ContactData): Promise<ApiResponse> {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/api/contacts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    const result: ApiResponse = await response.json();

    if (!response.ok) {
      throw new ApiError(
        result.message || 'Erreur lors de l\'envoi',
        response.status,
        result.errors
      );
    }

    return result;

  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('La requête a expiré. Vérifiez votre connexion.', 408);
    }

    console.error('Erreur API contact:', error);
    throw new ApiError('Erreur réseau. Veuillez réessayer.');
  }
}

/**
 * Envoyer un devis
 */
export async function submitDevis(data: DevisData): Promise<ApiResponse> {
  try {
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

    const result: ApiResponse = await response.json();

    if (!response.ok) {
      throw new ApiError(
        result.message || 'Erreur lors de l\'envoi',
        response.status,
        result.errors
      );
    }

    return result;

  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('La requête a expiré.', 408);
    }

    console.error('Erreur API devis:', error);
    throw new ApiError('Erreur réseau.');
  }
}