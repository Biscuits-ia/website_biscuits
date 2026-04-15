declare global {
  interface Window {
    deleteClient?: (id: number) => Promise<void>;
    deleteContact?: (id: number) => Promise<void>;
    gtag?: (
      command: 'event' | 'config' | 'set',
      targetOrAction: string,
      params?: Record<string, any>
    ) => void;
    loadGTMIfConsented?: () => void;
    __SB_URL__: string;
    __SB_KEY__: string;
  }
}

declare global {
  interface Window {
    /**
     * @param command - Type de commande ('event', 'config', 'set')
     * @param target - ID de tracking ou nom d'événement
     * @param params - Paramètres additionnels
     */
    gtag?: (
      command: 'event' | 'config' | 'set',
      target: string,
      params?: Record<string, any>
    ) => void;
  }

  interface WindowEventMap {
    'cookieConsentUpdated': CustomEvent<{
      analytics: boolean;
    }>;
    'showCookieBanner': Event;
  }
}
export {};