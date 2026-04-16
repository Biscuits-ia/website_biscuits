import { useState, useEffect, useCallback } from 'react';
import '@/styles/cookie-consent.css';

type CookieCategory = 'necessary' | 'analytics';

type CookiePreferences = {
  necessary: boolean;
  analytics: boolean;
};

type CookieConsentData = CookiePreferences & {
  date: string;
  version: string;
};

interface CookieConsentProps {
  defaultPreferences?: Partial<CookiePreferences>;
  consentVersion?: string;
}

export default function CookieConsent({
  defaultPreferences,
  consentVersion = '1.0',
}: Readonly<CookieConsentProps>) {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: defaultPreferences?.analytics ?? false,
  });

  const loadAnalytics = useCallback(() => {
    const script = document.createElement('script');
    script.src = '/_vercel/insights/script.js';
    script.async = true;
    script.dataset.consent = 'analytics';
    document.head.appendChild(script);
  }, []);

  const isScriptLoaded = useCallback((type: string): boolean => {
    return !!document.querySelector(`script[data-consent="${type}"]`);
  }, []);

  const cleanupExpiredConsent = useCallback(() => {
    localStorage.removeItem('cookie-consent');
    localStorage.removeItem('cookie-consent-date');
    localStorage.removeItem('cookie-consent-version');
  }, []);

  const savePreferences = useCallback(
    (prefs: CookiePreferences) => {
      const consentData: CookieConsentData = {
        ...prefs,
        date: new Date().toISOString(),
        version: consentVersion,
      };

      localStorage.setItem('cookie-consent', JSON.stringify(prefs));
      localStorage.setItem('cookie-consent-date', consentData.date);
      localStorage.setItem('cookie-consent-version', consentData.version);

      globalThis.dispatchEvent(
        new CustomEvent('cookieConsentUpdated', { detail: consentData })
      );

      if (prefs.analytics && globalThis.window !== undefined) {
        if (typeof (globalThis as any).loadGTMIfConsented === 'function') {
          (globalThis as any).loadGTMIfConsented();
        }
        if (!isScriptLoaded('analytics')) {
          loadAnalytics();
        }
      }

      setShowBanner(false);
      setShowSettings(false);
    },
    [consentVersion, isScriptLoaded, loadAnalytics]
  );

  const acceptAll = useCallback(() => {
    savePreferences({ necessary: true, analytics: true });
  }, [savePreferences]);

  const acceptNecessary = useCallback(() => {
    savePreferences({ necessary: true, analytics: false });
  }, [savePreferences]);

  const saveCustomPreferences = useCallback(() => {
    savePreferences(preferences);
  }, [savePreferences, preferences]);

  const togglePreference = useCallback((key: CookieCategory) => {
    if (key === 'necessary') return;
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    const showBannerFromOutside = () => {
      setShowBanner(true);
      setShowSettings(false);
    };

    (globalThis as any).showCookieBanner = showBannerFromOutside;

    const showBannerHandler = () => {
      setShowBanner(true);
      setShowSettings(false);
    };
    globalThis.addEventListener('showCookieBanner', showBannerHandler);

    const consentStr = localStorage.getItem('cookie-consent');
    const consentDateStr = localStorage.getItem('cookie-consent-date');
    const consentVersionStr = localStorage.getItem('cookie-consent-version');

    if (!consentStr || !consentDateStr) {
      setShowBanner(true);
      return;
    }

    const consentDate = new Date(consentDateStr);
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

    const needsNewConsent =
      consentDate < thirteenMonthsAgo || consentVersionStr !== consentVersion;

    if (needsNewConsent) {
      setShowBanner(true);
      cleanupExpiredConsent();
      return;
    }

    try {
      const consent: CookiePreferences = JSON.parse(consentStr);
      setPreferences((prev) => ({ ...prev, ...consent }));

      if (consent.analytics) {
        loadAnalytics();
      }
    } catch (e) {
      console.error('Erreur lors du chargement des préférences:', e);
      setShowBanner(true);
    }

    return () => {
      globalThis.removeEventListener('showCookieBanner', showBannerHandler);
      delete (globalThis as any).showCookieBanner;
    };
  }, [consentVersion, cleanupExpiredConsent, loadAnalytics]);

  if (!showBanner) return null;

  return (
    <dialog aria-labelledby="cookie-title" open>
      <div className="cookie-banner-content">
        {showSettings ? (
          <div>
            <div className="cookie-settings-header">
              <h3>Préférences des cookies</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="cookie-close"
                aria-label="Retour"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <line
                    x1="18"
                    y1="6"
                    x2="6"
                    y2="18"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line
                    x1="6"
                    y1="6"
                    x2="18"
                    y2="18"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="cookie-preferences">
              <div className="cookie-pref-item">
                <div className="cookie-pref-text">
                  <p className="cookie-pref-title">Cookies nécessaires</p>
                  <p className="cookie-pref-desc">
                    Requis pour le fonctionnement du site (toujours activés)
                  </p>
                </div>
                <div className="cookie-toggle cookie-toggle-active">
                  <div className="cookie-toggle-thumb"></div>
                </div>
              </div>

              <div className="cookie-pref-item">
                <div className="cookie-pref-text">
                  <p className="cookie-pref-title">Cookies analytiques</p>
                  <p className="cookie-pref-desc">
                    Nous aident à comprendre comment vous utilisez le site
                  </p>
                </div>
                <button
                  onClick={() => togglePreference('analytics')}
                  className={`cookie-toggle ${preferences.analytics ? 'cookie-toggle-active' : ''}`}
                  role="switch"
                  aria-checked={preferences.analytics}
                  aria-label="Activer les cookies analytiques"
                >
                  <div className="cookie-toggle-thumb"></div>
                </button>
              </div>
            </div>

            <div className="cookie-actions">
              <button
                onClick={() => setShowSettings(false)}
                className="cookie-btn cookie-btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={saveCustomPreferences}
                className="cookie-btn cookie-btn-primary"
              >
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="cookie-header">
              <div className="cookie-text">
                <h3 id="cookie-banner-title">🍪 Cookies</h3>
                <p id="cookie-banner-description">
                  Nous utilisons des cookies pour améliorer votre expérience. Les
                  cookies nécessaires sont requis pour le fonctionnement du site.
                  Vous pouvez personnaliser vos préférences à tout moment.{' '}
                  <a
                    href="/legal/cookies"
                    style={{ color: 'inherit', textDecoration: 'underline' }}
                  >
                    En savoir plus
                  </a>
                </p>
                <span className="cookie-example">
                  Exemple: session, sécurité, préférences
                </span>
              </div>
              <button
                onClick={acceptNecessary}
                className="cookie-close"
                aria-label="Refuser les cookies optionnels"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <line
                    x1="18"
                    y1="6"
                    x2="6"
                    y2="18"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line
                    x1="6"
                    y1="6"
                    x2="18"
                    y2="18"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="cookie-actions">
              <button
                onClick={() => setShowSettings(true)}
                className="cookie-btn cookie-btn-secondary"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" strokeWidth="2" />
                  <path
                    d="M12 1v6m0 6v6M23 12h-6m-6 0H1"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Personnaliser
              </button>
              <button
                onClick={acceptNecessary}
                className="cookie-btn cookie-btn-secondary"
              >
                Refuser
              </button>
              <button
                onClick={acceptAll}
                className="cookie-btn cookie-btn-primary"
              >
                Accepter tout
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
