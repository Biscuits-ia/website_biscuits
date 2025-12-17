<script lang="ts">
  import { onMount } from 'svelte';

  type CookieCategory = 'necessary' | 'analytics' | 'marketing';
  
  type CookiePreferences = {
    necessary: boolean;
    analytics: boolean;
    marketing: boolean;
  };

  type CookieConsentData = CookiePreferences & {
    date: string;
  };

  export let defaultPreferences: Partial<CookiePreferences> | undefined = undefined;

  let showBanner = false;
  let showSettings = false;
  let preferences: CookiePreferences = {
    necessary: true,
    analytics: defaultPreferences?.analytics ?? false,
    marketing: defaultPreferences?.marketing ?? false,
  };

  onMount(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      const timer = setTimeout(() => showBanner = true, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  });

  const acceptAll = () => {
    const allPreferences: CookiePreferences = {
      necessary: true,
      analytics: true,
      marketing: true,
    };
    savePreferences(allPreferences);
  };

  const acceptNecessary = () => {
    const necessaryOnly: CookiePreferences = {
      necessary: true,
      analytics: false,
      marketing: false,
    };
    savePreferences(necessaryOnly);
  };

  const saveCustomPreferences = () => {
    savePreferences(preferences);
  };

  const savePreferences = (prefs: CookiePreferences) => {
    const consentData: CookieConsentData = {
      ...prefs,
      date: new Date().toISOString(),
    };

    localStorage.setItem('cookie-consent', JSON.stringify(prefs));
    localStorage.setItem('cookie-consent-date', consentData.date);

    // Dispatcher un événement personnalisé pour Astro
    window.dispatchEvent(
      new CustomEvent('cookieConsentUpdated', {
        detail: prefs,
      })
    );

    if (prefs.analytics) {
      console.log('Analytics activé');
    }
    
    if (prefs.marketing) {
      console.log('Marketing activé');
    }

    showBanner = false;
    showSettings = false;
  };

  const togglePreference = (key: CookieCategory) => {
    if (key === 'necessary') return;
    preferences = {
      ...preferences,
      [key]: !preferences[key],
    };
  };
</script>

{#if showBanner}
  <div
    class="cookie-banner"
    role="dialog"
    aria-labelledby="cookie-banner-title"
    aria-describedby="cookie-banner-description"
  >
    <div class="cookie-banner-content">
      {#if !showSettings}
        <div>
          <div class="cookie-header">
            <div class="cookie-text">
              <h3 id="cookie-banner-title">🍪 Cookies</h3>
              <p id="cookie-banner-description">
                Nous utilisons des cookies pour améliorer votre expérience. Les cookies nécessaires sont requis pour le fonctionnement du site.
              </p>
            </div>
            <button
              on:click={acceptNecessary}
              class="cookie-close"
              aria-label="Refuser les cookies optionnels"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" stroke-width="2" stroke-linecap="round"/>
                <line x1="6" y1="6" x2="18" y2="18" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="cookie-actions">
            <button on:click={() => showSettings = true} class="cookie-btn cookie-btn-secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <circle cx="12" cy="12" r="3" stroke-width="2"/>
                <path d="M12 1v6m0 6v6M23 12h-6m-6 0H1" stroke-width="2" stroke-linecap="round"/>
              </svg>
              Personnaliser
            </button>
            <button on:click={acceptNecessary} class="cookie-btn cookie-btn-secondary">
              Refuser
            </button>
            <button on:click={acceptAll} class="cookie-btn cookie-btn-primary">
              Accepter tout
            </button>
          </div>
        </div>
      {:else}
        <div>
          <div class="cookie-settings-header">
            <h3>Préférences des cookies</h3>
            <button
              on:click={() => showSettings = false}
              class="cookie-close"
              aria-label="Retour"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" stroke-width="2" stroke-linecap="round"/>
                <line x1="6" y1="6" x2="18" y2="18" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="cookie-preferences">
            <!-- Cookies nécessaires -->
            <div class="cookie-pref-item">
              <div class="cookie-pref-text">
                <p class="cookie-pref-title">Cookies nécessaires</p>
                <p class="cookie-pref-desc">Requis pour le fonctionnement du site</p>
              </div>
              <div class="cookie-toggle cookie-toggle-active">
                <div class="cookie-toggle-thumb"></div>
              </div>
            </div>

            <!-- Cookies analytiques -->
            <div class="cookie-pref-item">
              <div class="cookie-pref-text">
                <p class="cookie-pref-title">Cookies analytiques</p>
                <p class="cookie-pref-desc">Nous aident à améliorer le site</p>
              </div>
              <button
                on:click={() => togglePreference('analytics')}
                class="cookie-toggle {preferences.analytics ? 'cookie-toggle-active' : ''}"
                role="switch"
                aria-checked={preferences.analytics}
                aria-label="Activer les cookies analytiques"
              >
                <div class="cookie-toggle-thumb"></div>
              </button>
            </div>

            <!-- Cookies marketing -->
            <div class="cookie-pref-item">
              <div class="cookie-pref-text">
                <p class="cookie-pref-title">Cookies marketing</p>
                <p class="cookie-pref-desc">Publicités personnalisées</p>
              </div>
              <button
                on:click={() => togglePreference('marketing')}
                class="cookie-toggle {preferences.marketing ? 'cookie-toggle-active' : ''}"
                role="switch"
                aria-checked={preferences.marketing}
                aria-label="Activer les cookies marketing"
              >
                <div class="cookie-toggle-thumb"></div>
              </button>
            </div>
          </div>

          <div class="cookie-actions">
            <button on:click={() => showSettings = false} class="cookie-btn cookie-btn-secondary">
              Annuler
            </button>
            <button on:click={saveCustomPreferences} class="cookie-btn cookie-btn-primary">
              Enregistrer
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .cookie-banner {
    position: fixed;
    bottom: 20px;
    left: 20px;
    right: 20px;
    max-width: 500px;
    margin: 0 auto;
    background: var(--color-background);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    padding: 24px;
  }
  
  .cookie-banner-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .cookie-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .cookie-text h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
  }

  .cookie-text p {
    margin: 0;
    font-size: 14px;
    color: oklch(95.514% 0.00011 271.152);
    line-height: 1.5;
  }

  .cookie-close {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-gray-100);
  }

  .cookie-close:hover {
    color: var(--color-gray-500);
  }

  .cookie-close svg {
    width: 30px;
    height: 30px;
  }

  .cookie-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .cookie-btn {
    padding: 10px 16px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cookie-btn svg {
    width: 16px;
    height: 16px;
  }

  .cookie-btn-primary {
    background: #000;
    color: white;
  }

  .cookie-btn-primary:hover {
    background: #333;
  }

  .cookie-btn-secondary {
    background: #f3f4f6;
    color: #000;
  }

  .cookie-btn-secondary:hover {
    background: #e5e7eb;
  }

  .cookie-settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .cookie-settings-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .cookie-preferences {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 16px;
  }

  .cookie-pref-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .cookie-pref-text {
    flex: 1;
  }

  .cookie-pref-title {
    margin: 0 0 4px 0;
    font-size: 14px;
    font-weight: 500;
  }

  .cookie-pref-desc {
    margin: 0;
    font-size: 12px;
    color: oklch(71.547% 0.00008 271.152);
  }

  .cookie-toggle {
    width: 44px;
    height: 24px;
    background: oklch(62.518% 0.0058 248.201);
    border-radius: 12px;
    position: relative;
    transition: background 0.3s;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .cookie-toggle-active {
    background: var(--color-primary);
  }

  .cookie-toggle-thumb {
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.3s;
  }

  .cookie-toggle-active .cookie-toggle-thumb {
    transform: translateX(20px);
  }

  @media (max-width: 640px) {
    .cookie-banner {
      left: 10px;
      right: 10px;
      bottom: 10px;
    }

    .cookie-actions {
      flex-direction: column;
    }

    .cookie-btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>