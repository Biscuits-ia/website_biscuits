<script lang="ts">
  let email = '';
  let status: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let message = '';

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    status = 'loading';

    try {
      // Pass PostHog session ID and distinct ID to the server for correlation
      const posthog = (window as any).posthog;
      const sessionId = posthog?.get_session_id?.() || '';
      const distinctId = posthog?.get_distinct_id?.() || '';

      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PostHog-Session-Id': sessionId,
          'X-PostHog-Distinct-Id': distinctId,
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        status = 'success';
        message = '🎉 Inscription réussie ! Vérifie tes emails.';

        // Track successful newsletter subscription client-side
        posthog?.capture('newsletter_subscribed', {
          email_domain: email.split('@')[1],
        });

        email = '';
      } else {
        status = 'error';
        message = data.error || 'Une erreur est survenue';

        // Track newsletter subscription error
        posthog?.capture('newsletter_subscription_error', {
          error_message: data.error || 'api_error',
          status_code: response.status,
        });
      }
    } catch (error) {
      status = 'error';
      message = 'Erreur réseau. Réessaye plus tard.';

      // Track network error
      (window as any).posthog?.capture('newsletter_subscription_error', {
        error_message: 'network_error',
      });
      (window as any).posthog?.captureException(error);
    }
  };
</script>

<div class="newsletter-container">
  <div class="newsletter-content">
    <div class="newsletter-icon">📬</div>
    <h3 class="newsletter-title">Reste au courant</h3>
    <p class="newsletter-description">
      Reçois un email à chaque nouvel article. Pas de spam, promis ! 🍪
    </p>

    <form on:submit={handleSubmit} class="newsletter-form">
      <input
        type="email"
        bind:value={email}
        placeholder="ton@email.com"
        required
        disabled={status === 'loading'}
        class="newsletter-input"
      />
      <button 
        type="submit" 
        disabled={status === 'loading'}
        class="newsletter-button"
      >
        {status === 'loading' ? 'Inscription...' : "S'inscrire"}
      </button>
    </form>

    {#if message}
      <p class="newsletter-message {status}">
        {message}
      </p>
    {/if}

    <p class="newsletter-privacy">
      Pas de spam. Désabonnement en 1 clic.
    </p>
  </div>
</div>

<style>
  /* Container */
.newsletter-container {
  display: flex;
  justify-content: center;
  padding: var(--spacing-2xl) var(--spacing-md);
}

.newsletter-content {
  width: 100%;
  max-width: 420px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow-md);
  text-align: center;
}

/* Icon */
.newsletter-icon {
  font-size: 2.5rem;
  margin-bottom: var(--spacing-sm);
}

/* Texts */
.newsletter-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin-bottom: var(--spacing-xs);
}

.newsletter-description {
  font-size: var(--font-size-sm);
  color: var(--color-text-light);
  margin-bottom: var(--spacing-lg);
}

/* Form */
.newsletter-form {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.newsletter-input {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  transition: border-color var(--transition-fast),
              box-shadow var(--transition-fast);
}

.newsletter-input::placeholder {
  color: var(--color-text-light);
}

.newsletter-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px oklch(60% 0.11 59 / 0.25);
}

/* Button */
.newsletter-button {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: linear-gradient(
    135deg,
    var(--color-primary),
    var(--color-secondary)
  );
  border: none;
  border-radius: var(--radius-md);
  color: #000;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: transform var(--transition-fast),
              box-shadow var(--transition-fast),
              opacity var(--transition-fast);
}

.newsletter-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow);
}

.newsletter-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Message */
.newsletter-message {
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-sm);
}

.newsletter-message.success {
  color: var(--color-success);
}

.newsletter-message.error {
  color: var(--color-danger);
}

/* Privacy */
.newsletter-privacy {
  margin-top: var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
}

</style>