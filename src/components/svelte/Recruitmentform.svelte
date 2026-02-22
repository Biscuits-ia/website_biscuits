<script>
  // --- État du formulaire ---
  let submitted = false;
  let loading = false;

  // Données du formulaire avec valeurs initiales vides
  let formData = {
    nom: '',
    prenom: '',
    email: '',
    motivation: '',
    competences: '',
    disponibilite: ''
  };

  // Erreurs de validation par champ
  let errors = {
    nom: '',
    prenom: '',
    email: ''
  };

  // --- Validation minimale ---
  function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validate() {
    let valid = true;
    errors = { nom: '', prenom: '', email: '' };

    if (!formData.nom.trim()) {
      errors.nom = 'Le nom est obligatoire.';
      valid = false;
    }
    if (!formData.prenom.trim()) {
      errors.prenom = 'Le prénom est obligatoire.';
      valid = false;
    }
    if (!formData.email.trim()) {
      errors.email = "L'email est obligatoire.";
      valid = false;
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Veuillez entrer un email valide.';
      valid = false;
    }

    return valid;
  }

  // --- Soumission du formulaire ---
  async function handleSubmit() {
    if (!validate()) return;

    loading = true;

    await new Promise((resolve) => setTimeout(resolve, 800));

    console.log('📋 Nouvelle candidature Biscuits IA :', formData);

    loading = false;
    submitted = true;
  }

  function reset() {
    submitted = false;
    formData = {
      nom: '',
      prenom: '',
      email: '',
      motivation: '',
      competences: '',
      disponibilite: ''
    };
    errors = { nom: '', prenom: '', email: '' };
  }
</script>

{#if submitted}
  <div class="confirmation" role="alert" aria-live="polite">
    <div class="confirmation__icon" aria-hidden="true">🎉</div>
    <h2 class="confirmation__title">Candidature envoyée !</h2>
    <p class="confirmation__text">
      Merci <strong>{formData.prenom} {formData.nom}</strong>, nous avons bien reçu votre candidature.
      Notre équipe vous contactera prochainement à l'adresse <strong>{formData.email}</strong>.
    </p>
    <button class="btn btn--secondary" on:click={reset}>
      Soumettre une nouvelle candidature
    </button>
  </div>
{:else}
  <form
    class="form"
    on:submit|preventDefault={handleSubmit}
    novalidate
    aria-label="Formulaire de candidature Biscuits IA"
  >
    <header class="form__header">
      <h1 class="form__title">Candidature chez<br /><em>Biscuits IA</em></h1>
      <p class="form__subtitle">
        Dites-nous qui vous êtes et pourquoi vous souhaitez contribuer à notre aventure.
      </p>
    </header>

    <!-- ── Identité ── -->
    <fieldset class="form__group form__group--row">
      <legend class="sr-only">Identité</legend>

      <!-- Prénom -->
      <div class="field" class:field--error={errors.prenom}>
        <label class="field__label" for="prenom">
          Prénom <span class="field__required" aria-hidden="true">*</span>
        </label>
        <input
          id="prenom"
          class="field__input"
          type="text"
          bind:value={formData.prenom}
          placeholder="Marie"
          autocomplete="given-name"
          aria-required="true"
          aria-describedby={errors.prenom ? 'prenom-error' : undefined}
        />
        {#if errors.prenom}
          <span id="prenom-error" class="field__error" role="alert">{errors.prenom}</span>
        {/if}
      </div>

      <!-- Nom -->
      <div class="field" class:field--error={errors.nom}>
        <label class="field__label" for="nom">
          Nom <span class="field__required" aria-hidden="true">*</span>
        </label>
        <input
          id="nom"
          class="field__input"
          type="text"
          bind:value={formData.nom}
          placeholder="Dupont"
          autocomplete="family-name"
          aria-required="true"
          aria-describedby={errors.nom ? 'nom-error' : undefined}
        />
        {#if errors.nom}
          <span id="nom-error" class="field__error" role="alert">{errors.nom}</span>
        {/if}
      </div>
    </fieldset>

    <!-- ── Email ── -->
    <div class="field" class:field--error={errors.email}>
      <label class="field__label" for="email">
        Email <span class="field__required" aria-hidden="true">*</span>
      </label>
      <input
        id="email"
        class="field__input"
        type="email"
        bind:value={formData.email}
        placeholder="marie.dupont@exemple.fr"
        autocomplete="email"
        aria-required="true"
        aria-describedby={errors.email ? 'email-error' : undefined}
      />
      {#if errors.email}
        <span id="email-error" class="field__error" role="alert">{errors.email}</span>
      {/if}
    </div>

    <!-- ── Motivation ── -->
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

    <!-- ── Compétences ── -->
    <div class="field">
      <label class="field__label" for="competences">
        Spécialités / Compétences
      </label>
      <textarea
        id="competences"
        class="field__input field__textarea"
        bind:value={formData.competences}
        placeholder="Ex : Machine Learning, Python, NLP, design UX/UI…"
        rows="3"
      ></textarea>
    </div>

    <!-- ── Disponibilité ── -->
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

    <!-- ── Bouton de soumission ── -->
    <div class="form__footer">
      <p class="form__note">
        <span aria-hidden="true">*</span> Champs obligatoires
      </p>
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

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .form {
    background: var(--color-bg-elevated);
    border: var(--brutal-border);
    box-shadow: var(--shadow-lg);
    max-width: 1080px;
    margin: 5rem auto;
    padding: var(--spacing-xl) var(--spacing-lg);
    color: var(--color-text);
    transition: box-shadow var(--transition-fast);
  }

  /* ── En-tête ── */
  .form__header {
    text-align: center;
  }

  .form__title {
    font-size: clamp(var(--font-size-2xl), 4vw, var(--font-size-4xl));
    font-weight: var(--font-weight-extrabold);
    letter-spacing: -0.03em;
    line-height: 1.15;
    margin: 0 0 var(--spacing-sm);
    color: var(--color-text);
  }

  .form__title em {
    font-style: italic;
    color: var(--color-primary);
  }

  .form__subtitle {
    color: var(--color-text-light);
    font-size: var(--font-size-sm);
    margin: 0;
    line-height: 1.6;
  }

  /* ── Groupe de champs côte à côte ── */
  .form__group--row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
    border: none;
    padding: 0;
    margin: 0 0 var(--spacing-md);
  }

  /* ── Pied du formulaire ── */
  .form__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--spacing-md);
    margin-top: var(--spacing-xl);
    padding-top: var(--spacing-lg);
    border-top: var(--brutal-border-thin);
  }

  .form__note {
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    font-weight: var(--font-weight-medium);
    margin: 0;
  }

  /* ============================================================
     CHAMPS — hérite des règles globales input/select/textarea
     ============================================================ */
  .field {
    margin-bottom: var(--spacing-md);
  }

  .field__label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--color-text);
    margin-bottom: var(--spacing-xs);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .field__required {
    color: var(--color-primary);
    margin-left: 2px;
  }

  /* Les styles de base (border, shadow, focus) viennent du global */
  .field__input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-base);
    color: var(--color-text);
    /* border, box-shadow, background et focus déjà définis dans :root input */
    transition: all var(--transition-fast);
  }

  .field__textarea {
    resize: vertical;
    min-height: 96px;
    line-height: 1.6;
  }

  .field__select {
    appearance: none;
    /* Chevron dessiné en oklch pour correspondre à --color-text-light */
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9' viewBox='0 0 14 9'%3E%3Cpath d='M1 1l6 6 6-6' stroke='%23333' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--spacing-md) center;
    background-color: var(--color-bg-elevated);
    padding-right: 2.5rem;
    cursor: pointer;
  }

  /* ── État erreur ── */
  .field--error .field__input {
    border-color: var(--color-danger);
    box-shadow: 4px 4px 0px var(--color-danger);
  }

  .field--error .field__input:focus {
    box-shadow: 6px 6px 0px var(--color-danger);
  }

  .field__error {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-danger);
    margin-top: var(--spacing-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ============================================================
     BOUTONS — hérite des règles globales button
     ============================================================ */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-lg);
    font-size: var(--font-size-sm);
    /* font-weight, text-transform, letter-spacing, border, shadow, transition
       sont définis dans :root button — on ne les répète pas */
    cursor: pointer;
    white-space: nowrap;
    background: var(--color-primary);
    color: var(--color-bg);
  }

  /* État désactivé — ne déclenche pas les effets hover/active globaux */
  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: var(--shadow-sm) !important;
  }

  /* Bouton secondaire */
  .btn--secondary {
    background: var(--color-bg);
    color: var(--color-primary);
    margin-top: var(--spacing-md);
  }

  /* ── Spinner de chargement ── */
  .btn__spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: var(--color-bg);
    border-radius: 50%; /* seule exception : le spinner reste rond */
    animation: spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ============================================================
     CONFIRMATION — carte de succès dans l'esprit zone-card
     ============================================================ */
  .confirmation {
    background: var(--color-bg-elevated);
    border: var(--brutal-border);
    box-shadow: var(--shadow-lg);
    max-width: 540px;
    margin: var(--spacing-xl) auto;
    padding: var(--spacing-2xl) var(--spacing-xl);
    text-align: center;
    color: var(--color-text);
    animation: popIn 0.3s ease;
  }

  @keyframes popIn {
    from { opacity: 0; transform: translate(4px, 4px); }
    to   { opacity: 1; transform: translate(0, 0); }
  }

  .confirmation__icon {
    font-size: var(--font-size-5xl);
    margin-bottom: var(--spacing-md);
    display: block;
  }

  .confirmation__title {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-extrabold);
    letter-spacing: -0.03em;
    color: var(--color-third); /* vert biscuits */
    margin: 0 0 var(--spacing-md);
  }

  .confirmation__text {
    color: var(--color-text-light);
    line-height: 1.6;
    font-size: var(--font-size-base);
    margin: 0;
  }

  .confirmation__text strong {
    color: var(--color-text);
    font-weight: var(--font-weight-bold);
  }

  /* ============================================================
     RESPONSIVE
     ============================================================ */
  @media (max-width: 640px) {
    .form,
    .confirmation {
      margin: var(--spacing-md);
      padding: var(--spacing-lg) var(--spacing-md);
    }

    .form__group--row {
      grid-template-columns: 1fr;
    }

    .form__footer {
      flex-direction: column;
      align-items: stretch;
    }

    .btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>