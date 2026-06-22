declare global {
  interface Window {
    /** Google Tag Manager gtag function */
    gtag?: (
      command: 'event' | 'config' | 'set',
      targetOrAction: string,
      params?: Record<string, any>
    ) => void;
    loadGTMIfConsented?: () => void;
    /** Injecte le <link rel="preconnect"> vers GTM apr?s consentement. */
    addGTMPreconnectIfConsented?: () => void;
    gtmLoaded?: boolean;
    dataLayer?: unknown[];
    /** Toast global affich? par /components/ui/Toast.astro. */
    showToast?: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
    /** Modale de confirmation affich?e par /components/ui/ConfirmDialog.astro. */
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