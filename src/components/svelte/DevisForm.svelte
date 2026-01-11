<script>
  import { createEventDispatcher } from 'svelte';
  import { SERVICES_CONFIG } from "@/utils/formValidation";
  
  const dispatch = createEventDispatcher();
  
  const API_BASE_URL = import.meta.env.PUBLIC_API_URL;
  const API_ENDPOINT = `${API_BASE_URL}/api/devis`;
  const API_TIMEOUT = 15000;

  let formData = {
    name: '',
    email: '',
    phone: '',
    budget: '',
    service: '',
    message: '',
    address: '',      // ✅ Ajout
    zip_code: '',     // ✅ Ajout
    honey: ''         // ✅ Changé de website à honey
  };

  let errors = {};
  let isSubmitting = false;
  let submitSuccess = false;
  let submitError = '';
  let messageLength = 0;

  $: messageLength = formData.message.length;

  const validateField = (name, value) => {
    if (!value || value.trim() === '') {
      if (name === 'phone' || name === 'budget') return null;
      return 'Ce champ est obligatoire';
    }

    switch (name) {
      case 'name':
        if (value.length < 2) return 'Le nom doit contenir au moins 2 caractères';
        if (value.length > 100) return 'Le nom ne peut pas dépasser 100 caractères';
        break;

      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return 'Email invalide';
        if (value.length > 255) return 'L\'email ne peut pas dépasser 255 caractères';
        break;

      case 'phone':
        if (value && !/^[+\d\s()-]+$/.test(value)) return 'Téléphone invalide';
        break;

      case 'service':
        if (value.length < 3) return 'Veuillez sélectionner un service';
        break;

      case 'message':
        if (value.length < 20) return 'Le message doit contenir au moins 20 caractères';
        if (value.length > 2000) return 'Le message ne peut pas dépasser 2000 caractères';
        break;

      // ✅ Validation adresse
      case 'address':
        if (value.length < 5) return 'L\'adresse doit contenir au moins 5 caractères';
        if (value.length > 255) return 'L\'adresse ne peut pas dépasser 255 caractères';
        break;

      // ✅ Validation code postal
      case 'zip_code':
        if (!/^[0-9]{5}$/.test(value.trim())) return 'Code postal invalide (5 chiffres requis)';
        break;
    }

    return null;
  };

  const handleBlur = (field) => {
    const error = validateField(field, formData[field]);
    if (error) {
      errors[field] = error;
    } else {
      delete errors[field];
    }
    errors = errors;
  };

  const handleInput = (field) => {
    if (errors[field]) {
      delete errors[field];
      errors = errors;
    }
  };

  const sanitizeInput = (value) => {
    if (!value) return '';
    return value.trim().replace(/[<>]/g, '').slice(0, 5000);
  };

  const sendToApi = async (data) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error('Service temporairement indisponible. Réessayez plus tard.');
        }
        throw new Error(result.message || 'Une erreur est survenue');
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('La requête a expiré. Veuillez réessayer.');
      }
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    submitSuccess = false;
    submitError = '';
    errors = {};

    const sanitizedData = {
      name: sanitizeInput(formData.name),
      email: sanitizeInput(formData.email),
      phone: sanitizeInput(formData.phone) || undefined,
      service: sanitizeInput(formData.service),
      budget: sanitizeInput(formData.budget) || undefined,
      message: sanitizeInput(formData.message),
      address: sanitizeInput(formData.address),      // ✅ Ajout
      zip_code: sanitizeInput(formData.zip_code),    // ✅ Ajout
      honey: formData.honey,                          // ✅ Changé de website
      timestamp: Math.floor(Date.now() / 1000)        // ✅ Ajout timestamp
    };

    let hasErrors = false;
    const fieldsToValidate = ['name', 'email', 'phone', 'service', 'message', 'address', 'zip_code']; // ✅ Ajout
    
    fieldsToValidate.forEach((field) => {
      const value = sanitizedData[field];
      if (value !== undefined) {
        const error = validateField(field, value);
        if (error) {
          errors[field] = error;
          hasErrors = true;
        }
      }
    });

    if (hasErrors) {
      errors = errors;
      return;
    }

    isSubmitting = true;

    try {
      await sendToApi(sanitizedData);
      submitSuccess = true;
      
      formData = {
        name: '',
        email: '',
        phone: '',
        budget: '',
        service: '',
        message: '',
        address: '',
        zip_code: '',
        honey: ''
      };

      if (typeof window.gtag !== 'undefined') {
        window.gtag('event', 'form_submit', {
          form_name: 'quote',
          service: sanitizedData.service,
          budget: sanitizedData.budget,
        });
      }

      setTimeout(() => {
        submitSuccess = false;
      }, 10000);

      dispatch('success');

    } catch (error) {
      console.error('Erreur envoi:', error);
      submitError = error.message || 'Une erreur inattendue est survenue';
    } finally {
      isSubmitting = false;
    }
  };
</script>

{#if submitSuccess}
  <div class="alert alert-success" role="status" aria-live="polite">
    <svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" fill="none"/>
    </svg>
    <span>Demande envoyée avec succès ! Nous vous répondrons sous 24-48h.</span>
  </div>
{/if}

{#if submitError}
  <div class="alert alert-error" role="alert" aria-live="assertive">
    <svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none" />
      <path d="M12 8v4m0 4h.01" stroke="currentColor" stroke-width="2" />
    </svg>
    <span>{submitError}</span>
  </div>
{/if}

<form on:submit={handleSubmit} class="quote-form" novalidate>
  <div class="form-group" class:error={errors.name}>
    <label for="name">
      Nom / Entreprise <span class="required">*</span>
    </label>
    <input 
      type="text" 
      id="name" 
      bind:value={formData.name}
      on:blur={() => handleBlur('name')}
      on:input={() => handleInput('name')}
      placeholder="Votre nom ou entreprise" 
      required 
      maxlength="100"
      autocomplete="name"
      aria-invalid={errors.name ? 'true' : 'false'}
      aria-describedby={errors.name ? 'name-error' : undefined}
    />
    {#if errors.name}
      <span class="error-message" id="name-error" role="alert">{errors.name}</span>
    {/if}
  </div>

  <div class="form-group" class:error={errors.email}>
    <label for="email">
      Email professionnel <span class="required">*</span>
    </label>
    <input 
      type="email" 
      id="email" 
      bind:value={formData.email}
      on:blur={() => handleBlur('email')}
      on:input={() => handleInput('email')}
      placeholder="contact@exemple.fr" 
      required 
      maxlength="255"
      autocomplete="email"
      aria-invalid={errors.email ? 'true' : 'false'}
      aria-describedby={errors.email ? 'email-error' : undefined}
    />
    {#if errors.email}
      <span class="error-message" id="email-error" role="alert">{errors.email}</span>
    {/if}
  </div>

  <div class="form-group" class:error={errors.phone}>
    <label for="phone">Téléphone</label>
    <input 
      type="tel" 
      id="phone" 
      bind:value={formData.phone}
      on:blur={() => handleBlur('phone')}
      on:input={() => handleInput('phone')}
      placeholder="+33 6 00 00 00 00" 
      maxlength="20"
      autocomplete="tel"
      aria-invalid={errors.phone ? 'true' : 'false'}
      aria-describedby={errors.phone ? 'phone-error' : undefined}
    />
    {#if errors.phone}
      <span class="error-message" id="phone-error" role="alert">{errors.phone}</span>
    {/if}
  </div>

  <!-- ✅ NOUVEAU : Champ Adresse -->
  <div class="form-group" class:error={errors.address}>
    <label for="address">
      Adresse <span class="required">*</span>
    </label>
    <input 
      type="text" 
      id="address" 
      bind:value={formData.address}
      on:blur={() => handleBlur('address')}
      on:input={() => handleInput('address')}
      placeholder="123 rue de la République" 
      required 
      maxlength="255"
      autocomplete="street-address"
      aria-invalid={errors.address ? 'true' : 'false'}
      aria-describedby={errors.address ? 'address-error' : undefined}
    />
    {#if errors.address}
      <span class="error-message" id="address-error" role="alert">{errors.address}</span>
    {/if}
  </div>

  <!-- ✅ NOUVEAU : Champ Code postal -->
  <div class="form-group" class:error={errors.zip_code}>
    <label for="zip_code">
      Code postal <span class="required">*</span>
    </label>
    <input 
      type="text" 
      id="zip_code" 
      bind:value={formData.zip_code}
      on:blur={() => handleBlur('zip_code')}
      on:input={() => handleInput('zip_code')}
      placeholder="86000" 
      required 
      maxlength="5"
      pattern="[0-9]{5}"
      autocomplete="postal-code"
      aria-invalid={errors.zip_code ? 'true' : 'false'}
      aria-describedby={errors.zip_code ? 'zip_code-error' : undefined}
    />
    {#if errors.zip_code}
      <span class="error-message" id="zip_code-error" role="alert">{errors.zip_code}</span>
    {/if}
  </div>

  <div class="form-group">
    <label for="budget">Budget estimé</label>
    <select id="budget" bind:value={formData.budget}>
      <option value="">-- Budget indicatif --</option>
      <option value="< 1000€">Moins de 1 000€</option>
      <option value="1000-3000€">1 000€ - 3 000€</option>
      <option value="3000-5000€">3 000€ - 5 000€</option>
      <option value="5000-10000€">5 000€ - 10 000€</option>
      <option value="10000-20000€">10 000€ - 20 000€</option>
      <option value="> 20000€">Plus de 20 000€</option>
    </select>
  </div>

  <div class="form-group full" class:error={errors.service}>
    <label for="service">
      Service souhaité <span class="required">*</span>
    </label>
    <select 
      id="service" 
      bind:value={formData.service}
      on:blur={() => handleBlur('service')}
      on:change={() => handleInput('service')}
      required 
      aria-required="true"
      aria-invalid={errors.service ? 'true' : 'false'}
      aria-describedby={errors.service ? 'service-error' : undefined}
    >
      <option value="">Sélectionnez un service…</option>
      <optgroup label="Starter Kits">
        {#each SERVICES_CONFIG["starter-kits"] as service}
          <option value={service}>{service}</option>
        {/each}
      </optgroup>
      <optgroup label="Solutions IA">
        {#each SERVICES_CONFIG["ia"] as service}
          <option value={service}>{service}</option>
        {/each}
      </optgroup>
      <optgroup label="Consulting & Coaching">
        {#each SERVICES_CONFIG["consulting"] as service}
          <option value={service}>{service}</option>
        {/each}
      </optgroup>
    </select>
    {#if errors.service}
      <span class="error-message" id="service-error" role="alert">{errors.service}</span>
    {/if}
  </div>

  <div class="form-group full" class:error={errors.message}>
    <label for="message">
      Détails supplémentaires <span class="required">*</span>
    </label>
    <textarea 
      id="message" 
      bind:value={formData.message}
      on:blur={() => handleBlur('message')}
      on:input={() => handleInput('message')}
      rows="5" 
      placeholder="Nombre de postes, besoins, contraintes, deadlines…" 
      required 
      minlength="20"
      maxlength="2000"
      aria-invalid={errors.message ? 'true' : 'false'}
      aria-describedby="message-count {errors.message ? 'message-error' : ''}"
    ></textarea>
    <span 
      class="char-count" 
      id="message-count"
      class:warning={messageLength > 1500}
      class:danger={messageLength > 1900}
      aria-live="polite"
    >
      {messageLength} / 2000
    </span>
    {#if errors.message}
      <span class="error-message" id="message-error" role="alert">{errors.message}</span>
    {/if}
  </div>

  <!-- ✅ Honeypot (changé de website à honey) -->
  <input 
    type="text" 
    name="honey" 
    bind:value={formData.honey}
    tabindex="-1" 
    autocomplete="off" 
    class="honeypot" 
    aria-hidden="true" 
  />

  <button 
    type="submit" 
    class="btn-primary" 
    class:loading={isSubmitting}
    disabled={isSubmitting}
    aria-busy={isSubmitting}
  >
    <span class="btn-text">Envoyer ma demande</span>
    {#if isSubmitting}
      <span class="btn-loader" aria-hidden="true"></span>
    {/if}
  </button>
</form>

<style>
  .quote-form {
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
    color: var(--color-text-light);
  }

  .required {
    color: var(--color-danger);
  }

  input,
  select,
  textarea {
    padding: 0.8rem;
    border: 1px solid var(--color-border);
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
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }

  .form-group.error input,
  .form-group.error textarea,
  .form-group.error select {
    border-color: var(--color-danger);
    background-color: var(--color-danger-light);
  }

  .error-message {
    color: var(--color-danger);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .char-count {
    display: block;
    font-size: 0.875rem;
    text-align: right;
    color: var(--color-text-light);
    transition: color var(--transition-fast);
  }

  .char-count.warning {
    color: var(--color-warning);
  }

  .char-count.danger {
    color: var(--color-danger);
  }

  .honeypot {
    position: absolute !important;
    left: -9999px !important;
    width: 1px !important;
    height: 1px !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  .alert {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 1.25rem;
    border-radius: var(--radius-lg);
    font-size: 0.95rem;
    font-weight: 500;
    animation: slideDown 0.3s ease-out;
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
    background: var(--color-success-light);
    color: var(--color-success);
    border: 1px solid var(--color-success);
  }

  .alert-error {
    background: var(--color-danger-light);
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
  }

  .btn-primary {
    position: relative;
    width: 100%;
    padding: 1.25rem;
    background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
    color: var(--color-bg);
    border: none;
    border-radius: var(--radius-lg);
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-base);
    margin-top: 1rem;
    box-shadow: var(--shadow-glow);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: var(--shadow-glow-hover);
  }

  .btn-primary:focus-visible {
    outline: 3px solid var(--color-primary);
    outline-offset: 3px;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary.loading .btn-text {
    opacity: 0;
  }

  .btn-loader {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: translate(-50%, -50%) rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .quote-form {
      grid-template-columns: 1fr;
    }
  }
</style>