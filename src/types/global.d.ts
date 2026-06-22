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
    /** Injecte le <link rel="preconnect"> vers GTM après consentement. */
    addGTMPreconnectIfConsented?: () => void;
    gtmLoaded?: boolean;
    __SB_URL__: string;
    __SB_KEY__: string;
    __PARTYTOWN_CONFIG?: Record<string, unknown>;
    dataLayer?: unknown[];
    /** Toast global affiché par /components/ui/Toast.astro. */
    showToast?: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
    /** Modale de confirmation affichée par /components/ui/ConfirmDialog.astro. */
    showConfirm?: (opts: ConfirmOptions) => Promise<boolean>;
  }

  export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }

  interface WindowEventMap {
    'cookieConsentUpdated': CustomEvent<{
      analytics: boolean;
    }>;
    'showCookieBanner': Event;
  }
}
export {};