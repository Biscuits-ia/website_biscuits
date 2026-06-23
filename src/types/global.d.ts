declare global {
  interface Window {
    /** Google Tag Manager gtag function */
    gtag?: (
      command: 'event' | 'config' | 'set',
      targetOrAction: string,
      params?: Record<string, any>
    ) => void;
    loadGTMIfConsented?: () => void;
    /** Injecte le <link rel="preconnect"> vers GTM apres consentement. */
    addGTMPreconnectIfConsented?: () => void;
    gtmLoaded?: boolean;
    dataLayer?: unknown[];
    /**
     * Kill-switch global analytics.
     * Mis a true par le Layout via la variable d'env PUBLIC_ANALYTICS_DISABLED.
     * BaseHead et CookieConsent consultent ce flag AVANT toute injection
     * de <script> GTM / Vercel Insights.
     */
    __ANALYTICS_DISABLED__?: boolean;
    /**
     * Active les logs de debug cote client pour les loaders analytics.
     * Defaut : false (production silencieuse, comme attendu cote RGPD).
     */
    __GTM_DEBUG__?: boolean;
    /** Toast global affiche par /components/ui/Toast.astro. */
    showToast?: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
    /** Modale de confirmation affichee par /components/ui/ConfirmDialog.astro. */
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