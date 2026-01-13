/**
 * Utilitaire Web3Forms
 * Configuration centralisée pour l'envoi de formulaires
 */

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

  console.log('🌐 === submitToWeb3Forms appelé ===');
  console.log('📍 Endpoint:', ENDPOINT);
  console.log('📦 Payload reçu:', payload);
  console.log('🔑 Access key:', payload.access_key?.substring(0, 8) + '...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('⏱️ TIMEOUT atteint');
    controller.abort();
  }, TIMEOUT);

  try {
    console.log('📤 Envoi de la requête fetch...');
    
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
    
    console.log('📥 Réponse reçue');
    console.log('   Status:', response.status);
    console.log('   OK:', response.ok);
    console.log('   Headers:', Object.fromEntries(response.headers.entries()));

    const result = await response.json();
    console.log('📄 Body parsé:', result);

    if (!response.ok) {
      console.error('❌ Response not OK');
      console.error('   Status:', response.status);
      console.error('   Result:', result);
      throw new Error(result.message || 'Erreur lors de l\'envoi du formulaire');
    }

    console.log('✅ Succès Web3Forms');
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    
    console.error('💥 Erreur dans submitToWeb3Forms:');
    
    if (error instanceof Error) {
      console.error('   Type:', error.constructor.name);
      console.error('   Message:', error.message);
      
      if (error.name === 'AbortError') {
        console.error('   Cause: TIMEOUT');
        throw new Error('La requête a expiré. Veuillez réessayer.');
      }
      throw error;
    }

    console.error('   Erreur inconnue:', error);
    throw new Error('Une erreur inattendue est survenue');
  }
}

/**
 * Sanitize les entrées utilisateur
 */
export function sanitizeInput(value: string): string {
  if (!value) return '';
  return value.trim().replace(/[<>]/g, '').slice(0, 5000);
}

/**
 * Vérifie si la soumission est trop rapide (anti-bot)
 */
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