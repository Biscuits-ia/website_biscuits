declare global {
  interface Window {
    deleteClient?: (id: number) => Promise<void>;
    deleteContact?: (id: number) => Promise<void>;
    /** Google Tag Manager gtag function */
    gtag?: (
      command: 'event' | 'config' | 'set',
      targetOrAction: string,
      params?: Record<string, any>
    ) => void;
    loadGTMIfConsented?: () => void;
    gtmLoaded?: boolean;
    __SB_URL__: string;
    __SB_KEY__: string;
    __TURNSTILE_SITE_KEY?: string;
    __PARTYTOWN_CONFIG?: Record<string, unknown>;
    dataLayer?: unknown[];
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => void;
    };
  }

  interface WindowEventMap {
    'cookieConsentUpdated': CustomEvent<{
      analytics: boolean;
    }>;
    'showCookieBanner': Event;
    'turnstileReady': Event;
  }
}
export {};