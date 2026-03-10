<script>
  // ─── Config ───────────────────────────────────────────────────────────────
  const API_URL = `${import.meta.env.PUBLIC_API_URL ?? 'http://localhost:8000'}/api/volunteer-applications`;

  // ─── État ─────────────────────────────────────────────────────────────────
  let submitted  = $state(false);
  let loading    = $state(false);
  let serverError = $state('');

  let formData = $state({
    prenom:       '',
    nom:          '',
    email:        '',
    motivation:   '',
    competences:  '',
    disponibilite: '',
  });

  let errors = $state({
    prenom: '',
    nom:    '',
    email:  '',
  });

  // ─── Validation ───────────────────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate() {
    errors = { prenom: '', nom: '', email: '' };
    let ok = true;

    if (!formData.prenom.trim()) {
      errors.prenom = 'Le prénom est obligatoire.';
      ok = false;
    }
    if (!formData.nom.trim()) {
      errors.nom = 'Le nom est obligatoire.';
      ok = false;
    }
    if (!formData.email.trim()) {
      errors.email = "L'email est obligatoire.";
      ok = false;
    } else if (!EMAIL_RE.test(formData.email)) {
      errors.email = 'Veuillez entrer un email valide.';
      ok = false;
    }

    return ok;
  }

  function clearError(field) {
    if (errors[field]) errors[field] = '';
    if (serverError)   serverError   = '';
  }

  // ─── Soumission ───────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    serverError = '';

    if (!validate()) {
      const firstField = Object.keys(errors).find(k => errors[k]);
      document.getElementById(firstField)?.focus();
      return;
    }

    loading = true;

    try {
      const res = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          first_name:   formData.prenom,
          last_name:    formData.nom,
          email:        formData.email,
          motivation:   formData.motivation   || null,
          skills:       formData.competences  || null,
          availability: formData.disponibilite || null,
        }),
      });

      if (res.ok) {
        submitted = true;
        return;
      }

      const body = await res.json().catch(() => null);

      // Erreurs de validation Laravel 422
      if (res.status === 422 && body?.errors) {
        if (body.errors.first_name) errors.prenom = body.errors.first_name[0];
        if (body.errors.last_name)  errors.nom    = body.errors.last_name[0];
        if (body.errors.email)      errors.email  = body.errors.email[0];
        return;
      }

      serverError = body?.message ?? 'Une erreur est survenue. Veuillez réessayer.';

    } catch {
      serverError = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
    } finally {
      loading = false;
    }
  }

  function reset() {
    submitted   = false;
    serverError = '';
    formData    = { prenom: '', nom: '', email: '', motivation: '', competences: '', disponibilite: '' };
    errors      = { prenom: '', nom: '', email: '' };
  }
</script>

<div class="recruitment-page">
  {#if submitted}
    <!-- ── Confirmation ── -->
    <div class="confirmation" role="alert" aria-live="polite">
      <div class="confirmation__icon" aria-hidden="true">🎉</div>
      <h2 class="confirmation__title">Candidature envoyée !</h2>
      <p class="confirmation__text">
        Merci <strong>{formData.prenom} {formData.nom}</strong>, nous avons bien reçu votre candidature.
        Notre équipe vous contactera prochainement à <strong>{formData.email}</strong>.
      </p>
      <button class="btn btn--secondary" onclick={reset}>
        Soumettre une nouvelle candidature
      </button>
    </div>

  {:else}
    <!-- ── Formulaire ── -->
    <form
      class="form"
      onsubmit={handleSubmit}
      novalidate
      aria-label="Formulaire de candidature Biscuits IA"
    >
      <header class="form__header">
        <h1 class="form__title">Candidature chez <span class="highlight">Biscuits IA</span></h1>
        <p class="form__subtitle">
          Dites-nous qui vous êtes et pourquoi vous souhaitez contribuer à notre aventure.
        </p>
      </header>

      <!-- Erreur serveur globale -->
      {#if serverError}
        <div class="alert alert--error" role="alert">{serverError}</div>
      {/if}

      <!-- Identité -->
      <div class="form__row">
        <div class="field" class:field--error={errors.prenom}>
          <label class="field__label" for="prenom">
            Prénom <span class="field__required" aria-hidden="true">*</span>
          </label>
          <input
            id="prenom"
            class="field__input"
            type="text"
            bind:value={formData.prenom}
            oninput={() => clearError('prenom')}
            placeholder="Marie"
            autocomplete="given-name"
            aria-required="true"
            aria-invalid={errors.prenom ? 'true' : 'false'}
            aria-describedby={errors.prenom ? 'prenom-error' : undefined}
          />
          {#if errors.prenom}
            <span id="prenom-error" class="field__error" role="alert">{errors.prenom}</span>
          {/if}
        </div>

        <div class="field" class:field--error={errors.nom}>
          <label class="field__label" for="nom">
            Nom <span class="field__required" aria-hidden="true">*</span>
          </label>
          <input
            id="nom"
            class="field__input"
            type="text"
            bind:value={formData.nom}
            oninput={() => clearError('nom')}
            placeholder="Dupont"
            autocomplete="family-name"
            aria-required="true"
            aria-invalid={errors.nom ? 'true' : 'false'}
            aria-describedby={errors.nom ? 'nom-error' : undefined}
          />
          {#if errors.nom}
            <span id="nom-error" class="field__error" role="alert">{errors.nom}</span>
          {/if}
        </div>
      </div>

      <!-- Email -->
      <div class="field" class:field--error={errors.email}>
        <label class="field__label" for="email">
          Email <span class="field__required" aria-hidden="true">*</span>
        </label>
        <input
          id="email"
          class="field__input"
          type="email"
          bind:value={formData.email}
          oninput={() => clearError('email')}
          placeholder="marie.dupont@exemple.fr"
          autocomplete="email"
          aria-required="true"
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {#if errors.email}
          <span id="email-error" class="field__error" role="alert">{errors.email}</span>
        {/if}
      </div>

      <!-- Motivation -->
      <div class="field">
        <label class="field__label" for="motivation">
          Pourquoi souhaitez-vous nous rejoindre ?
        </label>
        <textarea
          id="motivation"
          class="field__input field__textarea"
          bind:value={formData.motivation}
          placeholder="Partagez votre motivation, ce qui vous attire chez Biscuits IA…"
          rows="4"
        ></textarea>
      </div>

      <!-- Compétences -->
      <div class="field">
        <label class="field__label" for="competences">Spécialités / Compétences</label>
        <textarea
          id="competences"
          class="field__input field__textarea"
          bind:value={formData.competences}
          placeholder="Ex : IA Engineer, Développement, Médiation…"
          rows="3"
        ></textarea>
      </div>

      <!-- Disponibilité -->
      <div class="field">
        <label class="field__label" for="disponibilite">Disponibilité</label>
        <select id="disponibilite" class="field__input field__select" bind:value={formData.disponibilite}>
          <option value="" disabled selected>Sélectionnez votre disponibilité</option>
          <option value="immediat">Immédiate</option>
          <option value="1mois">Dans 1 mois</option>
          <option value="3mois">Dans 3 mois</option>
          <option value="6mois">Dans 6 mois</option>
          <option value="autre">À discuter</option>
        </select>
      </div>

      <!-- Footer -->
      <div class="form__footer">
        <p class="form__note"><span aria-hidden="true">*</span> Champs obligatoires</p>
        <button class="btn btn--primary" type="submit" disabled={loading} aria-busy={loading}>
          {#if loading}
            <span class="btn__spinner" aria-hidden="true"></span>
            Envoi en cours…
          {:else}
            Envoyer ma candidature →
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .recruitment-page {
    min-height: 100vh;
    padding: calc(var(--header-height-mobile) + 2rem) 1rem 3rem;
    background: var(--color-bg);
  }

  @media (min-width: 768px) {
    .recruitment-page {
      padding: calc(var(--header-height-desktop, 80px) + 3rem) 2rem 4rem;
    }
  }

  /* Formulaire */
  .form {
    background: var(--color-bg-elevated);
    border: var(--brutal-border);
    box-shadow: var(--shadow-lg);
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  @media (min-width: 768px) {
    .form { padding: 3rem 2.5rem; }
  }

  /* En-tête */
  .form__header {
    text-align: center;
    margin-bottom: 2.5rem;
    padding-bottom: 1.5rem;
    border-bottom: var(--brutal-border-thin);
  }

  .form__title {
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: var(--font-weight-extrabold);
    letter-spacing: -0.03em;
    line-height: 1.2;
    margin: 0 0 1rem;
    color: var(--color-text);
  }

  .form__title .highlight { color: var(--color-primary); }

  .form__subtitle {
    color: var(--color-text-light);
    font-size: var(--font-size-base);
    margin: 0 auto;
    line-height: 1.6;
    max-width: 500px;
  }

  /* Alerte serveur */
  .alert--error {
    padding: 0.875rem 1rem;
    border: var(--brutal-border);
    border-color: var(--color-danger);
    background: color-mix(in srgb, var(--color-danger) 10%, transparent);
    color: var(--color-danger);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    margin-bottom: 1.5rem;
  }

  /* Grille 2 colonnes */
  .form__row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  @media (min-width: 640px) {
    .form__row { grid-template-columns: 1fr 1fr; }
  }

  /* Champs */
  .field { margin-bottom: 1.5rem; }

  .field__label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--color-text);
    margin-bottom: 0.5rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .field__required { color: var(--color-primary); margin-left: 2px; }

  .field__input {
    width: 100%;
    padding: 0.875rem 1rem;
    font-size: 1rem;
    font-family: inherit;
    color: var(--color-text);
    background: var(--color-bg);
    border: var(--brutal-border);
    box-shadow: var(--shadow-sm);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .field__input::placeholder { color: var(--color-text-light); opacity: 0.7; }

  .field__input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: var(--shadow-md);
  }

  .field__textarea { resize: vertical; min-height: 120px; line-height: 1.6; }

  .field__select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9' viewBox='0 0 14 9'%3E%3Cpath d='M1 1l6 6 6-6' stroke='%23333' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 1rem center;
    padding-right: 2.5rem;
    cursor: pointer;
  }

  .field--error .field__input {
    border-color: var(--color-danger);
    box-shadow: 4px 4px 0px var(--color-danger);
  }

  .field--error .field__input:focus { box-shadow: 6px 6px 0px var(--color-danger); }

  .field__error {
    display: block;
    font-size: 0.8125rem;
    color: var(--color-danger);
    margin-top: 0.5rem;
    font-weight: var(--font-weight-bold);
  }

  /* Pied */
  .form__footer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: var(--brutal-border-thin);
  }

  @media (min-width: 640px) {
    .form__footer { flex-direction: row; align-items: center; justify-content: space-between; }
  }

  .form__note { font-size: var(--font-size-xs); color: var(--color-text-light); margin: 0; }

  /* Boutons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-extrabold);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    white-space: nowrap;
    border: var(--brutal-border);
    box-shadow: var(--shadow-md);
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn:hover:not(:disabled) { transform: translate(-2px, -2px); box-shadow: var(--shadow-lg); }
  .btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: var(--shadow-sm); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn--primary { background: var(--color-primary); color: var(--color-bg); width: 100%; }

  @media (min-width: 640px) {
    .btn--primary { width: auto; }
  }

  .btn--secondary { background: var(--color-bg); color: var(--color-text); border: var(--brutal-border); }

  .btn__spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: var(--color-bg);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Confirmation */
  .confirmation {
    background: var(--color-bg-elevated);
    border: var(--brutal-border);
    box-shadow: var(--shadow-lg);
    max-width: 540px;
    margin: 0 auto;
    padding: 3rem 2rem;
    text-align: center;
    color: var(--color-text);
    animation: popIn 0.4s ease;
  }

  @keyframes popIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .confirmation__icon { font-size: 4rem; margin-bottom: 1.5rem; display: block; }

  .confirmation__title {
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: var(--font-weight-extrabold);
    letter-spacing: -0.02em;
    color: var(--color-success);
    margin: 0 0 1rem;
  }

  .confirmation__text {
    color: var(--color-text-light);
    line-height: 1.7;
    font-size: var(--font-size-base);
    margin: 0 0 2rem;
  }

  .confirmation__text strong { color: var(--color-text); font-weight: var(--font-weight-bold); }
</style>