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

<style scoped>
  .cookie-banner {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 48px);
    max-width: 520px;
    background: var(--color-bg-elevated);
    border: var(--brutal-border);
    box-shadow: var(--shadow-xl);
    z-index: 10000;
    padding: 28px;
    animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  
  .cookie-banner-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .cookie-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--spacing-lg);
  }

  .cookie-text h3 {
    margin: 0 0 var(--spacing-sm) 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-extrabold);
    color: var(--color-text);
    letter-spacing: -0.02em;
    text-transform: uppercase;
  }

  .cookie-text p {
    margin: 0;
    margin-bottom: 15px;
    font-size: var(--font-size-sm);
    color: var(--color-gray-100);
    line-height: 1.6;
    font-weight: var(--font-weight-medium);
  }

  .cookie-close {
    background: var(--color-bg);
    border: var(--brutal-border-thin);
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text);
    box-shadow: var(--shadow-sm);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .cookie-close:hover {
    transform: translate(var(--brutal-hover-lift), var(--brutal-hover-lift));
    box-shadow: var(--shadow-md);
    background: var(--color-primary-light);
    color: var(--color-text);
  }

  .cookie-close:active {
    transform: translate(var(--brutal-press-translate), var(--brutal-press-translate));
    box-shadow: var(--shadow-press);
  }

  .cookie-close svg {
    width: 20px;
    height: 20px;
    color: var(--color-text);
  }

  .cookie-actions {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .cookie-btn {
    padding: 12px 20px;
    border: var(--brutal-border);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-extrabold);
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex: 1;
    min-width: 140px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    box-shadow: var(--shadow-lg);
  }

  .cookie-btn svg {
    width: 18px;
    height: 18px;
  }

  .cookie-btn:hover {
    transform: translate(var(--brutal-hover-lift), var(--brutal-hover-lift));
    box-shadow: var(--shadow-glow-hover);
  }

  .cookie-btn:active {
    transform: translate(var(--brutal-press-translate), var(--brutal-press-translate));
    box-shadow: var(--shadow-press);
  }

  .cookie-btn-primary {
    background: var(--color-primary);
    color: var(--color-text);
    border-color: var(--color-border);
  }

  .cookie-btn-primary:hover {
    background: var(--color-primary-dark);
  }

  .cookie-btn-secondary {
    background: var(--color-secondary);
    font-size: 13px;
    color: var(--color-text);
    border-color: var(--color-border);
  }

  .cookie-btn-secondary:hover {
    background: var(--color-secondary);
  }

  .cookie-settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-lg);
    padding-bottom: var(--spacing-md);
    border-bottom: var(--brutal-border-thin);
  }

  .cookie-settings-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-extrabold);
    color: var(--color-text);
    letter-spacing: -0.02em;
    text-transform: uppercase;
  }

  .cookie-preferences {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
  }

  .cookie-pref-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-lg);
    padding: var(--spacing-md);
    background: var(--color-bg);
    border: var(--brutal-border-thin);
    box-shadow: var(--shadow-md);
    transition: all var(--transition-fast);
  }

  .cookie-pref-item:hover {
    transform: translate(-2px, -2px);
    box-shadow: var(--shadow-lg);
  }

  .cookie-pref-text {
    flex: 1;
  }

  .cookie-pref-title {
    margin: 0 0 4px 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--color-text);
    letter-spacing: -0.01em;
  }

  .cookie-pref-desc {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    line-height: 1.5;
    font-weight: var(--font-weight-normal);
  }

  .cookie-toggle {
    width: 50px;
    height: 28px;
    background: var(--color-gray-400);
    position: relative;
    transition: all var(--transition-base);
    border: var(--brutal-border-thin);
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: var(--shadow-sm);
  }

  .cookie-toggle:hover {
    transform: translate(-2px, -2px);
    box-shadow: var(--shadow-md);
  }

  .cookie-toggle:active {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  .cookie-toggle-active {
    background: var(--color-primary);
    box-shadow: var(--shadow-glow);
  }

  .cookie-toggle-thumb {
    width: 18px;
    height: 18px;
    background: var(--color-bg-elevated);
    border: 2px solid var(--color-border);
    position: absolute;
    top: 3px;
    left: 3px;
    transition: all var(--transition-base);
  }

  .cookie-toggle-active .cookie-toggle-thumb {
    transform: translateX(22px);
    background: var(--color-text);
  }

  @media (max-width: 640px) {
    .cookie-banner {
      left: 50%;
      bottom: 16px;
      width: calc(100% - 32px);
      padding: 24px;
    }

    .cookie-text h3 {
      font-size: var(--font-size-lg);
    }

    .cookie-text p {
      font-size: var(--font-size-sm);
    }

    .cookie-actions {
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .cookie-btn {
      width: 100%;
      min-width: unset;
    }

    .cookie-pref-item {
      padding: 12px;
    }
  }
</style>