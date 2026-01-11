<script lang="ts">
  // Form state
  let name = '';
  let email = '';
  let country = '';
  let service = '';
  let message = '';
  let honey = '';
  
  // UI state
  let errors: Record<string, string> = {};
  let isSubmitting = false;
  let isSuccess = false;
  let generalError = '';
  
  // Timestamp for spam detection
  const formLoadTime = Date.now();
  
  // Services config
  const SERVICES = {
    'starter-kits': [
      'StarterKit Next.js Pro',
      'StarterKit Astro Local Business',
      'StarterKit SaaS Supabase Complet'
    ],
    'ia': [
      'Audit IA',
      'Automatisation IA',
      'Chatbot IA'
    ],
    'consulting': [
      'Consulting Technique',
      'Coaching Dev',
      'Architecture & Performance'
    ]
  };
  
  const COUNTRIES = [
    'France', 'Belgique', 'Luxembourg', 'Suisse', 
    'Allemagne', 'Canada', 'Autre'
  ];
  
  // Validation
  function validateField(field: string, value: string): string | null {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Le nom est requis';
        if (value.length < 2) return 'Le nom est trop court';
        if (value.length > 100) return 'Le nom est trop long';
        return null;
        
      case 'email':
        if (!value.trim()) return 'L\'email est requis';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Email invalide';
        }
        return null;
        
      case 'country':
        if (!value) return 'Le pays est requis';
        return null;
        
      case 'service':
        if (!value) return 'Veuillez sélectionner un service';
        return null;
        
      case 'message':
        if (!value.trim()) return 'Le message est requis';
        if (value.length < 20) return 'Le message doit contenir au moins 20 caractères';
        if (value.length > 2000) return 'Le message est trop long';
        return null;
        
      default:
        return null;
    }
  }
  
  // Real-time validation
  function handleBlur(field: string, value: string) {
    const error = validateField(field, value);
    if (error) {
      errors[field] = error;
    } else {
      delete errors[field];
    }
    errors = errors; // Trigger reactivity
  }
  
  // Clear error on input
  function handleInput(field: string) {
    if (errors[field]) {
      delete errors[field];
      errors = errors;
    }
  }
  
  // Form submission
  async function handleSubmit(e: Event) {
    e.preventDefault();
    
    console.log('🚀 Form submission started');
    
    // Reset states
    errors = {};
    generalError = '';
    isSuccess = false;
    
    // Validate all fields
    const fields = { name, email, country, service, message };
    let hasErrors = false;
    
    for (const [field, value] of Object.entries(fields)) {
      const error = validateField(field, value);
      if (error) {
        errors[field] = error;
        hasErrors = true;
        console.log(`❌ Validation error on ${field}:`, error);
      }
    }
    
    if (hasErrors) {
      console.log('❌ Form has validation errors');
      const firstError = Object.keys(errors)[0];
      if (firstError) {
        document.getElementById(firstError)?.focus();
      }
      return;
    }
    
    // Check honeypot (spam)
    if (honey.trim() !== '') {
      console.log('🤖 Spam detected (honeypot filled)');
      generalError = 'Erreur de validation';
      return;
    }
    
    // Check submission time (anti-bot)
    const submissionTime = Date.now();
    if (submissionTime - formLoadTime < 2000) {
      console.log('⚡ Form submitted too fast');
      generalError = 'Veuillez prendre le temps de remplir le formulaire';
      return;
    }
    
    isSubmitting = true;
    
    // Prepare payload
    const payload = {
      name: name.trim(),
      email: email.trim(),
      country,
      service,
      message: message.trim(),
      honey,
      timestamp: Math.floor(formLoadTime / 1000)
    };
    
    console.log('📤 Sending payload:', {
      name: payload.name,
      email: payload.email,
      country: payload.country,
      service: payload.service,
      messageLength: payload.message.length
    });
    
    try {
      // ✅ CHANGE THIS URL TO YOUR ACTUAL API
      const API_URL = import.meta.env.PUBLIC_API_URL;
      const endpoint = `${API_URL}/api/contacts`;
      
      console.log('🌐 API endpoint:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      console.log('📥 Response status:', response.status);
      
      const result = await response.json();
      console.log('📋 Response data:', result);
      
      if (!response.ok) {
        // Handle API errors
        if (response.status === 429) {
          throw new Error('Trop de demandes. Veuillez patienter quelques instants.');
        }
        
        if (response.status === 422 && result.errors) {
          // Validation errors from API
          errors = result.errors;
          throw new Error(result.message || 'Erreur de validation');
        }
        
        if (response.status >= 500) {
          throw new Error('Erreur serveur. Veuillez réessayer plus tard.');
        }
        
        throw new Error(result.message || 'Erreur lors de l\'envoi');
      }
      
      // Success
      console.log('✅ Form submitted successfully');
      isSuccess = true;
      
      // Reset form
      name = '';
      email = '';
      country = '';
      service = '';
      message = '';
      
      // Track conversion (if analytics available)
      if (typeof window !== 'undefined' && 'gtag' in window) {
        (window as any).gtag('event', 'form_submit', {
          form_name: 'contact',
          service: service
        });
      }
      
      // Scroll to success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Hide success message after 10s
      setTimeout(() => {
        isSuccess = false;
      }, 10000);
      
    } catch (error: any) {
      console.error('❌ Form submission error:', error);
      
      if (error.errors) {
        // Validation errors from API
        errors = error.errors;
      } else {
        generalError = error.message || 'Une erreur est survenue. Veuillez réessayer.';
      }
      
      // Scroll to error message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
    } finally {
      isSubmitting = false;
    }
  }
</script>

<form 
  on:submit={handleSubmit} 
  class="contact-form" 
  novalidate
  aria-label="Formulaire de contact"
>
  <!-- Success message -->
  {#if isSuccess}
    <div class="alert alert-success" role="status" aria-live="polite">
      <svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" fill="none"/>
      </svg>
      <div>
        <strong>Message envoyé avec succès !</strong>
        <p>Nous vous répondrons sous 48h.</p>
      </div>
    </div>
  {/if}
  
  <!-- General error -->
  {#if generalError}
    <div class="alert alert-error" role="alert" aria-live="assertive">
      <svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none" />
        <path d="M12 8v4m0 4h.01" stroke="currentColor" stroke-width="2" />
      </svg>
      <span>{generalError}</span>
    </div>
  {/if}
  
  <!-- Name field -->
  <div class="form-group" class:error={errors.name}>
    <label for="name">
      Nom / Entreprise <span class="required" aria-label="requis">*</span>
    </label>
    <input
      id="name"
      type="text"
      bind:value={name}
      on:blur={() => handleBlur('name', name)}
      on:input={() => handleInput('name')}
      placeholder="Votre nom ou entreprise"
      aria-required="true"
      aria-invalid={!!errors.name}
      aria-describedby={errors.name ? 'name-error' : undefined}
      disabled={isSubmitting}
      maxlength="100"
      autocomplete="name"
    />
    {#if errors.name}
      <span id="name-error" class="error-message" role="alert">
        {errors.name}
      </span>
    {/if}
  </div>
  
  <!-- Email field -->
  <div class="form-group" class:error={errors.email}>
    <label for="email">
      Email <span class="required" aria-label="requis">*</span>
    </label>
    <input
      id="email"
      type="email"
      bind:value={email}
      on:blur={() => handleBlur('email', email)}
      on:input={() => handleInput('email')}
      placeholder="contact@exemple.fr"
      aria-required="true"
      aria-invalid={!!errors.email}
      aria-describedby={errors.email ? 'email-error' : undefined}
      disabled={isSubmitting}
      maxlength="255"
      autocomplete="email"
    />
    {#if errors.email}
      <span id="email-error" class="error-message" role="alert">
        {errors.email}
      </span>
    {/if}
  </div>
  
  <!-- Country field -->
  <div class="form-group" class:error={errors.country}>
    <label for="country">
      Pays <span class="required" aria-label="requis">*</span>
    </label>
    <select
      id="country"
      bind:value={country}
      on:blur={() => handleBlur('country', country)}
      on:change={() => handleInput('country')}
      aria-required="true"
      aria-invalid={!!errors.country}
      aria-describedby={errors.country ? 'country-error' : undefined}
      disabled={isSubmitting}
    >
      <option value="">Sélectionnez un pays</option>
      {#each COUNTRIES as c}
        <option value={c}>{c}</option>
      {/each}
    </select>
    {#if errors.country}
      <span id="country-error" class="error-message" role="alert">
        {errors.country}
      </span>
    {/if}
  </div>
  
  <!-- Service field -->
  <div class="form-group" class:error={errors.service}>
    <label for="service">
      Service <span class="required" aria-label="requis">*</span>
    </label>
    <select
      id="service"
      bind:value={service}
      on:blur={() => handleBlur('service', service)}
      on:change={() => handleInput('service')}
      aria-required="true"
      aria-invalid={!!errors.service}
      aria-describedby={errors.service ? 'service-error' : undefined}
      disabled={isSubmitting}
    >
      <option value="">Sélectionnez un service</option>
      <optgroup label="Starter Kits">
        {#each SERVICES['starter-kits'] as s}
          <option value={s}>{s}</option>
        {/each}
      </optgroup>
      <optgroup label="Solutions IA">
        {#each SERVICES['ia'] as s}
          <option value={s}>{s}</option>
        {/each}
      </optgroup>
      <optgroup label="Consulting">
        {#each SERVICES['consulting'] as s}
          <option value={s}>{s}</option>
        {/each}
      </optgroup>
    </select>
    {#if errors.service}
      <span id="service-error" class="error-message" role="alert">
        {errors.service}
      </span>
    {/if}
  </div>
  
  <!-- Message field -->
  <div class="form-group full" class:error={errors.message}>
    <label for="message">
      Message <span class="required" aria-label="requis">*</span>
    </label>
    <textarea
      id="message"
      bind:value={message}
      on:blur={() => handleBlur('message', message)}
      on:input={() => handleInput('message')}
      placeholder="Décrivez votre projet, vos besoins, vos contraintes..."
      aria-required="true"
      aria-invalid={!!errors.message}
      aria-describedby={errors.message ? 'message-error' : undefined}
      disabled={isSubmitting}
      rows="5"
      maxlength="2000"
    ></textarea>
    <div class="char-count" aria-live="polite">
      {message.length} / 2000
    </div>
    {#if errors.message}
      <span id="message-error" class="error-message" role="alert">
        {errors.message}
      </span>
    {/if}
  </div>
  
  <!-- Honeypot (hidden from users, visible to bots) -->
  <input
    type="text"
    name="website"
    bind:value={honey}
    tabindex="-1"
    autocomplete="off"
    class="honeypot"
    aria-hidden="true"
  />
  
  <!-- Submit button -->
  <button
    type="submit"
    class="btn-submit"
    disabled={isSubmitting}
    aria-busy={isSubmitting}
  >
    {#if isSubmitting}
      <span class="spinner" aria-hidden="true"></span>
      Envoi en cours...
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
      Envoyer
    {/if}
  </button>
</form>

<style>
  .contact-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.8rem;
    max-width: 900px;
    margin: 0 auto;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .form-group.full {
    grid-column: 1 / -1;
  }
  
  label {
    font-size: 0.95rem;
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
  }
  
  .required {
    color: var(--color-danger);
  }
  
  input,
  select,
  textarea {
    padding: 0.8rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-alt);
    color: var(--color-text);
    font-family: inherit;
    font-size: 15px;
    transition: all var(--transition-fast);
  }
  
  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .form-group.error input,
  .form-group.error textarea,
  .form-group.error select {
    border-color: var(--color-danger);
    background-color: rgba(239, 68, 68, 0.05);
  }
  
  .error-message {
    color: var(--color-danger);
    font-size: 0.875rem;
    font-weight: var(--font-weight-medium);
  }
  
  .char-count {
    text-align: right;
    font-size: 0.875rem;
    color: var(--color-text-light);
  }
  
  /* Honeypot hidden */
  .honeypot {
    position: absolute !important;
    left: -9999px !important;
    width: 1px !important;
    height: 1px !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  
  /* Alerts */
  .alert {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem;
    border-radius: var(--radius-lg);
    border: 2px solid;
    margin-bottom: 1.5rem;
    grid-column: 1 / -1;
    animation: slideDown 0.3s ease;
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .alert-icon {
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
  }
  
  .alert-success {
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-success);
    border-color: var(--color-success);
  }
  
  .alert-success strong {
    display: block;
    margin-bottom: 0.25rem;
  }
  
  .alert-success p {
    margin: 0;
    font-size: 0.95rem;
  }
  
  .alert-error {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-danger);
    border-color: var(--color-danger);
  }
  
  /* Submit button */
  .btn-submit {
    grid-column: 1 / -1;
    padding: 1.25rem 2rem;
    background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 1.1rem;
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    box-shadow: var(--shadow-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }
  
  .btn-submit:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-glow-hover);
  }
  
  .btn-submit:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .spinner {
    width: 1.25rem;
    height: 1.25rem;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  /* Mobile */
  @media (max-width: 768px) {
    .contact-form {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
  }
</style>