<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    validateField,
  } from '@/utils/formValidation';
  import {
    submitToWeb3Forms,
    sanitizeInput,
    isTooFast,
  } from '@/utils/web3forms';

  const dispatch = createEventDispatcher();

  const ACCESS_KEY = import.meta.env.PUBLIC_WEB3FORMS_DEVIS;

  type FormDataType = {
    name: string;
    email: string;
    sujet: string;
    message: string;
    honey: string;
  };

  let formData: FormDataType = {
    name: '',
    email: '',
    sujet: '',
    message: '',
    honey: '',
  };

  let errors: Record<string, string> = {};
  let isSubmitting = false;
  let submitSuccess = false;
  let submitError = '';
  let messageLength = 0;

  const formLoadTime = Date.now();

  $: messageLength = formData.message.length;

  function handleBlur(field: keyof FormDataType) {
    const error = validateField(field, formData[field]);
    if (error) {
      errors[field] = error;
    } else {
      delete errors[field];
    }
    errors = { ...errors };
  }

  function handleInput(field: keyof FormDataType) {
    if (errors[field]) {
      delete errors[field];
      errors = { ...errors };
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();

    submitSuccess = false;
    submitError = '';
    errors = {};

    if (formData.honey.trim() !== '') {
      submitError = 'Erreur de validation';
      return;
    }

    if (isTooFast(formLoadTime)) {
      submitError = 'Veuillez prendre le temps de remplir le formulaire';
      return;
    }

    const fieldsToValidate: (keyof FormDataType)[] = [
      'name',
      'email',
      'sujet',
      'message',
    ];
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
      const firstErrorField = Object.keys(errors)[0] as string;
      document.getElementById(firstErrorField)?.focus();
      return;
    }

    isSubmitting = true;

    try {
      const payload = {
        access_key: ACCESS_KEY,
        name: sanitizeInput(formData.name),
        email: sanitizeInput(formData.email),
        sujet: sanitizeInput(formData.sujet),
        message: sanitizeInput(formData.message),
        from_name: sanitizeInput(formData.name),
      };

      await submitToWeb3Forms(payload);

      submitSuccess = true;

      formData = {
        name: '',
        email: '',
        sujet: '',
        message: '',
        honey: '',
      };

      window.scrollTo({ top: 0, behavior: 'smooth' });

      setTimeout(() => {
        submitSuccess = false;
      }, 10000);

      dispatch('success');
    } catch (error: any) {
      console.error('❌ Erreur soumission:', error);
      submitError =
        error.message || 'Une erreur est survenue. Veuillez réessayer.';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      isSubmitting = false;
    }
  }
</script>

<form
  on:submit={handleSubmit}
  class="quote-form"
  novalidate
  aria-label="Formulaire de demande de devis"
>
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
      <span>Votre demande a été envoyée avec succès ! Nous vous répondrons dans les plus brefs délais.</span>
    </div>
  {/if}

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

  <div class="form-group" class:error={errors.name}>
    <label for="name">
      Nom <span class="required">*</span>
    </label>
    <input
      type="text"
      id="name"
      bind:value={formData.name}
      on:blur={() => handleBlur('name')}
      on:input={() => handleInput('name')}
      placeholder="Nom"
      required
      maxlength="100"
      autocomplete="name"
      aria-invalid={errors.name ? 'true' : 'false'}
      aria-describedby={errors.name ? 'name-error' : undefined}
      disabled={isSubmitting}
    />
    {#if errors.name}
      <span class="error-message" id="name-error" role="alert"
        >{errors.name}</span
      >
    {/if}
  </div>

  <div class="form-group" class:error={errors.email}>
    <label for="email"> Email <span class="required">*</span> </label>
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
      disabled={isSubmitting}
    />
    {#if errors.email}
      <span class="error-message" id="email-error" role="alert"
        >{errors.email}</span
      >
    {/if}
  </div>

  <div class="form-group full" class:error={errors.message}>
    <label for="message">
      Votre message <span class="required">*</span>
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
      disabled={isSubmitting}
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
      <span class="error-message" id="message-error" role="alert"
        >{errors.message}</span
      >
    {/if}
  </div>

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
    <span>Envoyer ma demande</span>
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
  textarea {
    padding: 0.8rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-alt);
    color: var(--color-text);
    font-family: inherit;
    font-size: 15px;
    transition: all 0.2s;
  }

  input:focus,
  input:disabled,

  .form-group.error input,
  .form-group.error textarea {
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
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 1.25rem;
    font-size: 0.95rem;
    font-weight: 500;
    animation: slideDown 0.3s ease-out;
    grid-column: 1 / -1;
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

  .btn-loader {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
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