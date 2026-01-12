<script lang="ts">
  
  import {
    validateField,
    SERVICES_CONFIG,
    COUNTRIES,
  } from '@/utils/formValidation';
  import {
    submitToWeb3Forms,
    sanitizeInput,
    isTooFast,
    trackFormSubmit,
  } from '@/utils/web3forms';

  const ACCESS_KEY = import.meta.env.PUBLIC_WEB3FORMS_CONTACT;

  // Type pour formData
  type FormDataType = {
    name: string;
    email: string;
    country: string;
    service: string;
    message: string;
    honey: string;
  };

  // État du formulaire
  let formData: FormDataType = {
    name: '',
    email: '',
    country: '',
    service: '',
    message: '',
    honey: '', // Honeypot anti-spam
  };

  // État UI
  let errors: Record<string, string> = {};
  let isSubmitting = false;
  let submitSuccess = false;
  let submitError = '';
  let messageLength = 0;

  // Timestamp de chargement (anti-bot)
  const formLoadTime = Date.now();

  // Réactivité pour le compteur de caractères
  $: messageLength = formData.message.length;

  /**
   * Validation en temps réel au blur
   */
  function handleBlur(field: keyof FormDataType) {
    const error = validateField(field, formData[field]);
    if (error) {
      errors[field] = error;
    } else {
      delete errors[field];
    }
    errors = { ...errors };
  }

  /**
   * Efface l'erreur lors de la saisie
   */
  function handleInput(field: keyof FormDataType) {
    if (errors[field]) {
      delete errors[field];
      errors = { ...errors };
    }
  }

  /**
   * Soumission du formulaire
   */
  async function handleSubmit(e: Event) {
    e.preventDefault();

    // Reset des états
    submitSuccess = false;
    submitError = '';
    errors = {};

    // 🔒 Protection anti-spam : Honeypot
    if (formData.honey.trim() !== '') {
      submitError = 'Erreur de validation';
      return;
    }

    // 🔒 Protection anti-bot : Vérification du timing
    if (isTooFast(formLoadTime)) {
      submitError = 'Veuillez prendre le temps de remplir le formulaire';
      return;
    }

    // 🔍 Validation des champs
    const fieldsToValidate: (keyof FormDataType)[] = ['name', 'email', 'country', 'service', 'message'];
    let hasErrors = false;

    fieldsToValidate.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) {
        errors[field] = error;
        hasErrors = true;
      }
    });

    if (hasErrors) {
      errors = { ...errors };
      // Focus sur le premier champ en erreur
      const firstErrorField = Object.keys(errors)[0] as string;
      document.getElementById(firstErrorField)?.focus();
      return;
    }

    isSubmitting = true;

    try {
      // 📤 Préparation du payload pour Web3Forms
      const payload = {
        access_key: ACCESS_KEY,
        name: sanitizeInput(formData.name),
        email: sanitizeInput(formData.email),
        country: formData.country,
        service: formData.service,
        message: sanitizeInput(formData.message),
        // ✅ Champs personnalisés pour Web3Forms
        from_name: sanitizeInput(formData.name),
        subject: `[Contact] ${formData.service} - ${formData.name}`,
        // ✅ Redirection après succès (optionnel)
        // redirect: 'https://votresite.com/merci',
      };

      // 🚀 Envoi vers Web3Forms
      await submitToWeb3Forms(payload);

      // ✅ Succès
      submitSuccess = true;

      // 📊 Tracking analytics
      trackFormSubmit('contact', {
        service: formData.service,
        country: formData.country,
      });

      // 🔄 Reset du formulaire
      formData = {
        name: '',
        email: '',
        country: '',
        service: '',
        message: '',
        honey: '',
      };

      // 📜 Scroll vers le haut
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // ⏱️ Cache le message de succès après 10s
      setTimeout(() => {
        submitSuccess = false;
      }, 10000);
    } catch (error: any) {
      console.error('❌ Erreur soumission:', error);
      submitError = error.message || 'Une erreur est survenue. Veuillez réessayer.';
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
  <!-- ✅ Message de succès -->
  {#if submitSuccess}
    <div class="alert alert-success" role="status" aria-live="polite">
      <svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M20 6L9 17l-5-5"
          stroke="currentColor"
          stroke-width="2"
          fill="none"
        />
      </svg>
      <div>
        <strong>Message envoyé avec succès !</strong>
        <p>Nous vous répondrons sous 48h.</p>
      </div>
    </div>
  {/if}

  <!-- ❌ Message d'erreur -->
  {#if submitError}
    <div class="alert alert-error" role="alert" aria-live="assertive">
      <svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          stroke-width="2"
          fill="none"
        />
        <path d="M12 8v4m0 4h.01" stroke="currentColor" stroke-width="2" />
      </svg>
      <span>{submitError}</span>
    </div>
  {/if}

  <!-- 📝 Champ Nom -->
  <div class="form-group" class:error={errors.name}>
    <label for="name">
      Nom / Entreprise <span class="required" aria-label="requis">*</span>
    </label>
    <input
      id="name"
      type="text"
      bind:value={formData.name}
      on:blur={() => handleBlur('name')}
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

  <!-- 📧 Champ Email -->
  <div class="form-group" class:error={errors.email}>
    <label for="email">
      Email <span class="required" aria-label="requis">*</span>
    </label>
    <input
      id="email"
      type="email"
      bind:value={formData.email}
      on:blur={() => handleBlur('email')}
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

  <!-- 🌍 Champ Pays -->
  <div class="form-group" class:error={errors.country}>
    <label for="country">
      Pays <span class="required" aria-label="requis">*</span>
    </label>
    <select
      id="country"
      bind:value={formData.country}
      on:blur={() => handleBlur('country')}
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

  <!-- 🛠️ Champ Service -->
  <div class="form-group" class:error={errors.service}>
    <label for="service">
      Service <span class="required" aria-label="requis">*</span>
    </label>
    <select
      id="service"
      bind:value={formData.service}
      on:blur={() => handleBlur('service')}
      on:change={() => handleInput('service')}
      aria-required="true"
      aria-invalid={!!errors.service}
      aria-describedby={errors.service ? 'service-error' : undefined}
      disabled={isSubmitting}
    >
      <option value="">Sélectionnez un service</option>
      <optgroup label="Starter Kits">
        {#each SERVICES_CONFIG['starter-kits'] as s}
          <option value={s}>{s}</option>
        {/each}
      </optgroup>
      <optgroup label="Solutions IA">
        {#each SERVICES_CONFIG.ia as s}
          <option value={s}>{s}</option>
        {/each}
      </optgroup>
      <optgroup label="Consulting">
        {#each SERVICES_CONFIG.consulting as s}
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

  <!-- 💬 Champ Message -->
  <div class="form-group full" class:error={errors.message}>
    <label for="message">
      Message <span class="required" aria-label="requis">*</span>
    </label>
    <textarea
      id="message"
      bind:value={formData.message}
      on:blur={() => handleBlur('message')}
      on:input={() => handleInput('message')}
      placeholder="Décrivez votre projet, vos besoins, vos contraintes..."
      aria-required="true"
      aria-invalid={!!errors.message}
      aria-describedby={errors.message ? 'message-error' : undefined}
      disabled={isSubmitting}
      rows="5"
      maxlength="2000"
    ></textarea>
    <div
      class="char-count"
      class:warning={messageLength > 1500}
      class:danger={messageLength > 1900}
      aria-live="polite"
    >
      {messageLength} / 2000
    </div>
    {#if errors.message}
      <span id="message-error" class="error-message" role="alert">
        {errors.message}
      </span>
    {/if}
  </div>

  <!-- 🍯 Honeypot (caché pour les humains, visible pour les bots) -->
  <input
    type="text"
    name="website"
    bind:value={formData.honey}
    tabindex="-1"
    autocomplete="off"
    class="honeypot"
    aria-hidden="true"
  />

  <!-- 🚀 Bouton de soumission -->
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
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
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
    font-weight: 600;
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
    transition: all 0.2s;
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
    font-weight: 500;
  }

  .char-count {
    text-align: right;
    font-size: 0.875rem;
    color: var(--color-text-light);
    transition: color 0.2s;
  }

  .char-count.warning {
    color: var(--color-warning);
  }

  .char-count.danger {
    color: var(--color-danger);
  }

  /* Honeypot caché */
  .honeypot {
    position: absolute !important;
    left: -9999px !important;
    width: 1px !important;
    height: 1px !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* Alertes */
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

  /* Bouton de soumission */
  .btn-submit {
    grid-column: 1 / -1;
    padding: 1.25rem 2rem;
    background: linear-gradient(
      135deg,
      var(--color-primary),
      var(--color-primary-dark)
    );
    color: white;
    border: none;
    border-radius: var(--radius-lg);
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }

  .btn-submit:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  }

  .btn-submit:focus-visible {
    outline: 3px solid var(--color-primary);
    outline-offset: 3px;
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

  @media (max-width: 768px) {
    .contact-form {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
  }
</style>