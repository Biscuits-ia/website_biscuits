<script lang="ts">
  let email = '';
  let status: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let message = '';

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    status = 'loading';

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        status = 'success';
        message = '🎉 Inscription réussie ! Vérifie tes emails.';
        email = '';
      } else {
        status = 'error';
        message = data.error || 'Une erreur est survenue';
      }
    } catch (error) {
      status = 'error';
      message = 'Erreur réseau. Réessaye plus tard.';
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