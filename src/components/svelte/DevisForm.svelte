<!-- src/islands/DevisForm.svelte -->
<script lang="ts">
  import { submitDevis } from '@/utils/api';
  
  // Form state
  let name = '';
  let email = '';
  let phone = '';
  let service = '';
  let budget = '';
  let message = '';
  let honey = ''; // Honeypot
  
  // UI state
  let errors: Record<string, string> = {};
  let isSubmitting = false;
  let isSuccess = false;
  let generalError = '';
  let messageLength = 0;
  
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
      'Automatisation IA API',
      'Chatbot IA Professionnel'
    ],
    'consulting': [
      'Consulting Technique',
      'Coaching Développeur',
      'Architecture & Performance'
    ]
  };
  
  const BUDGETS = [
    '< 1000€',
    '1000-3000€',
    '3000-5000€',
    '5000-10000€',
    '10000-20000€',
    '> 20000€'
  ];
  
  // Reactive message length
  $: messageLength = message.length;
  $: messageLengthColor = messageLength > 1900 ? 'var(--color-danger)' : 
                          messageLength > 1500 ? 'var(--color-warning)' : 
                          'var(--color-text-light)';
  
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
        if (value.length > 255) return 'Email trop long';
        return null;
        
      case 'phone':
        if (value && !/^[+\d\s()-]+$/.test(value)) {
          return 'Téléphone invalide';
        }
        if (value.length > 20) return 'Téléphone trop long';
        return null;
        
      case 'service':
        if (!value) return 'Veuillez sélectionner un service';
        return null;
        
      case 'message':
        if (!value.trim()) return 'Le message est requis';
        if (value.length < 20) return 'Le message doit contenir au moins 20 caractères';
        if (value.length > 2000) return 'Le message est trop long (max 2000 caractères)';
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
    
    // Reset states
    errors = {};
    generalError = '';
    isSuccess = false;
    
    // Validate all required fields
    const fields = { name, email, phone, service, message };
    let hasErrors = false;
    
    // Required fields validation
    ['name', 'email', 'service', 'message'].forEach(field => {
      const error = validateField(field, fields[field as keyof typeof fields]);
      if (error) {
        errors[field] = error;
        hasErrors = true;
      }
    });
    
    // Optional phone validation
    if (phone) {
      const phoneError = validateField('phone', phone);
      if (phoneError) {
        errors.phone = phoneError;
        hasErrors = true;
      }
    }
    
    if (hasErrors) {
      // Focus first error
      const firstError = Object.keys(errors)[0];
      if (firstError) {
        document.getElementById(firstError)?.focus();
      }
      return;
    }
    
    // Check honeypot (spam)
    if (honey.trim() !== '') {
      generalError = 'Erreur de validation';
      return;
    }
    
    // Check submission time (anti-bot)
    const submissionTime = Date.now();
    if (submissionTime - formLoadTime < 2000) {
      generalError = 'Veuillez prendre le temps de remplir le formulaire';
      return;
    }
    
    isSubmitting = true;
    
    try {
      await submitDevis({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        service,
        budget: budget || undefined,
        message: message.trim(),
        honey,
        timestamp: Math.floor(formLoadTime / 1000)
      });
      
      // Success
      isSuccess = true;
      
      // Reset form
      name = '';
      email = '';
      phone = '';
      service = '';
      budget = '';
      message = '';
      
      // Track conversion
      if (typeof window.gtag !== 'undefined') {
        window.gtag('event', 'form_submit', {
          form_name: 'devis',
          service: service,
          budget: budget
        });
      }
      
      // Scroll to success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Hide success message after 10s
      setTimeout(() => {
        isSuccess = false;
      }, 10000);
      
    } catch (error: any) {
      console.error('Devis form error:', error);
      
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
  class="devis-form" 
  novalidate
  aria-label="Formulaire de demande de devis"
>
  <!-- Success message -->
  {#if isSuccess}
    <div class="alert alert-success" role="status" aria-live="polite">
      <svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" fill="none"/>
      </svg>
      <div>
        <strong>Demande envoyée avec succès !</strong>
        <p>Nous vous répondrons sous 24-48h avec un devis détaillé.</p>
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
      Email professionnel <span class="required" aria-label="requis">*</span>
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
  
  <!-- Phone field (optional) -->
  <div class="form-group" class:error={errors.phone}>
    <label for="phone">
      Téléphone <span class="optional">(optionnel)</span>
    </label>
    <input
      id="phone"
      type="tel"
      bind:value={phone}
      on:blur={() => handleBlur('phone', phone)}
      on:input={() => handleInput('phone')}
      placeholder="+33 6 00 00 00 00"
      aria-invalid={!!errors.phone}
      aria-describedby={errors.phone ? 'phone-error' : undefined}
      disabled={isSubmitting}
      maxlength="20"
      autocomplete="tel"
    />
    {#if errors.phone}
      <span id="phone-error" class="error-message" role="alert">
        {errors.phone}
      </span>
    {/if}
  </div>
  
  <!-- Budget field (optional) -->
  <div class="form-group" class:error={errors.budget}>
    <label for="budget">
      Budget estimé <span class="optional">(optionnel)</span>
    </label>
    <select
      id="budget"
      bind:value={budget}
      disabled={isSubmitting}
    >
      <option value="">-- Budget indicatif --</option>
      {#each BUDGETS as b}
        <option value={b}>{b}</option>
      {/each}
    </select>
  </div>
  
  <!-- Service field -->
  <div class="form-group full" class:error={errors.service}>
    <label for="service">
      Service souhaité <span class="required" aria-label="requis">*</span>
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
      <option value="">Sélectionnez un service…</option>
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
      <optgroup label="Consulting & Coaching">
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
      Détails supplémentaires <span class="required" aria-label="requis">*</span>
    </label>
    <textarea
      id="message"
      bind:value={message}
      on:blur={() => handleBlur('message', message)}
      on:input={() => handleInput('message')}
      placeholder="Nombre de postes, besoins, contraintes, deadlines…"
      aria-required="true"
      aria-invalid={!!errors.message}
      aria-describedby={errors.message ? 'message-error' : undefined}
      disabled={isSubmitting}
      rows="5"
      maxlength="2000"
    ></textarea>
    <div class="char-count" style="color: {messageLengthColor}" aria-live="polite">
      {messageLength} / 2000
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
      Envoyer ma demande
    {/if}
  </button>
</form>

<style>
  .devis-form {
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
  
  .optional {
    color: var(--color-text-light);
    font-weight: var(--font-weight-normal);
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
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .char-count {
    text-align: right;
    font-size: 0.875rem;
    font-weight: var(--font-weight-medium);
    transition: color var(--transition-fast);
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
    box-shadow: var(--shadow-glow);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    position: relative;
    overflow: hidden;
  }
  
  .btn-submit::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition: left 0.5s ease;
  }
  
  .btn-submit:hover:not(:disabled)::before {
    left: 100%;
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
    .devis-form {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
  }
</style>