export interface Web3FormsResponse {
  success: boolean;
  message: string;
}

export interface Web3FormsPayload {
  access_key: string;
  [key: string]: string | number | boolean;
}

/**
 * Envoie un formulaire via Web3Forms
 * @param payload - Données du formulaire
 * @returns Promesse avec la réponse
 */
export async function submitToWeb3Forms(
  payload: Web3FormsPayload
): Promise<Web3FormsResponse> {
  const ENDPOINT = 'https://api.web3forms.com/submit';
  const TIMEOUT = 15000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Erreur lors de l\'envoi du formulaire');
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('La requête a expiré. Veuillez réessayer.');
      }
      throw error;
    }

    throw new Error('Une erreur inattendue est survenue');
  }
}

export function sanitizeInput(value: string): string {
  if (!value) return '';
  return value.trim().replace(/[<>]/g, '').slice(0, 5000);
}

export function isTooFast(loadTime: number, minDelay = 2000): boolean {
  return Date.now() - loadTime < minDelay;
}

/**
 * Tracking analytics (Google Analytics)
 */
export function trackFormSubmit(formName: string, data: Record<string, any>) {
  if (typeof window !== 'undefined' && 'gtag' in window) {
    (window as any).gtag('event', 'form_submit', {
      form_name: formName,
      ...data,
    });
  }
}