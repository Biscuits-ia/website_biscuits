// src/scripts/contactFormInit.ts
// Script de gestion du formulaire de contact — importé depuis ContactForm.astro
// (l'import force Astro à bundler ce fichier en externe plutôt que de l'inliner,
//  ce qui est requis pour le Content-Security-Policy basé sur les nonces)

// This file must export at least one symbol to be treated as an ES module
// (prevents variable conflicts with other scripts in the global TypeScript scope)
export {};

type FieldId = 'name' | 'email' | 'sujet' | 'message';

interface ContactPayload {
  name:           string;
  email:          string;
  subject:        string;
  message:        string;
  type:           'contact';
  turnstileToken?: string;
}

interface ApiErrorResponse {
  message?: string;
  errors?: Partial<Record<'name' | 'email' | 'subject' | 'message', string[]>>;
}

import { EMAIL_RE, MIN_MESSAGE, MAX_MESSAGE } from '@/lib/validation';
const FIELDS: readonly FieldId[] = ['name', 'email', 'sujet', 'message'];

function initContactForm(): void {
  const wrapper = document.querySelector<HTMLElement>('.contact-form-wrapper');
  if (!wrapper) return;

  const API_URL = '/api/contact';

  const formEl      = document.getElementById('cf-form')    as HTMLFormElement    | null;
  const btnSubmitEl = document.getElementById('cf-submit')  as HTMLButtonElement  | null;
  const elSuccessEl = document.getElementById('cf-success') as HTMLElement        | null;
  const elErrorEl   = document.getElementById('cf-error')   as HTMLElement        | null;
  const elMessageEl = document.getElementById('cf-message') as HTMLTextAreaElement | null;

  if (!formEl || !btnSubmitEl || !elSuccessEl || !elErrorEl || !elMessageEl) return;

  const form      : HTMLFormElement     = formEl;
  const btnSubmit : HTMLButtonElement   = btnSubmitEl;
  const elSuccess : HTMLElement         = elSuccessEl;
  const elError   : HTMLElement         = elErrorEl;
  const elMessage : HTMLTextAreaElement = elMessageEl;

  const btnLabel  = document.getElementById('cf-btn-label')  as HTMLElement      | null;
  const btnLoader = document.getElementById('cf-btn-loader') as HTMLElement      | null;
  const elErrTxt  = document.getElementById('cf-error-text') as HTMLElement      | null;
  const elCount   = document.getElementById('cf-char-count') as HTMLElement      | null;
  const elHoney   = document.getElementById('cf-honey')      as HTMLInputElement | null;

  function showFieldError(id: FieldId, msg: string): void {
    document.getElementById(`cf-field-${id}`)?.classList.add('cf-field--error');
    document.getElementById(`cf-${id}`)?.setAttribute('aria-invalid', 'true');
    const span = document.getElementById(`cf-${id}-error`);
    if (span) { span.textContent = msg; span.hidden = false; }
  }

  function clearFieldError(id: FieldId): void {
    document.getElementById(`cf-field-${id}`)?.classList.remove('cf-field--error');
    document.getElementById(`cf-${id}`)?.setAttribute('aria-invalid', 'false');
    const span = document.getElementById(`cf-${id}-error`);
    if (span) { span.textContent = ''; span.hidden = true; }
  }

  function clearAllErrors(): void {
    FIELDS.forEach(clearFieldError);
  }

  function showGlobalError(msg: string): void {
    elSuccess.hidden = true;
    if (elErrTxt) elErrTxt.textContent = msg;
    elError.hidden   = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showGlobalSuccess(): void {
    elError.hidden   = true;
    elSuccess.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => { elSuccess.hidden = true; }, 10_000);
  }

  function setLoading(on: boolean): void {
    btnSubmit.disabled = on;
    btnSubmit.setAttribute('aria-busy', String(on));
    if (btnLabel)  btnLabel.textContent = on ? 'Envoi en cours…' : 'Envoyer ma demande';
    if (btnLoader) btnLoader.hidden = !on;
  }

  function updateCharCount(): void {
    const len = elMessage.value.length;
    if (elCount) {
      elCount.textContent = `${len} / ${MAX_MESSAGE}`;
      elCount.classList.toggle('cf-char-count--warn',   len > 1500);
      elCount.classList.toggle('cf-char-count--danger', len > 1900);
    }
  }

  function validate(payload: ContactPayload): boolean {
    const errs: Partial<Record<FieldId, string>> = {};

    if (!payload.name)                    errs.name    = 'Le nom est obligatoire.';
    else if (payload.name.length > 100)   errs.name    = 'Maximum 100 caractères.';

    if (!payload.email)                   errs.email   = "L'email est obligatoire.";
    else if (!EMAIL_RE.test(payload.email)) errs.email = 'Email invalide.';

    if (!payload.subject)                 errs.sujet   = 'Le sujet est obligatoire.';
    else if (payload.subject.length > 150) errs.sujet  = 'Maximum 150 caractères.';

    if (!payload.message)                          errs.message = 'Le message est obligatoire.';
    else if (payload.message.length < MIN_MESSAGE)     errs.message = `Minimum ${MIN_MESSAGE} caractères.`;
    else if (payload.message.length > MAX_MESSAGE)     errs.message = `Maximum ${MAX_MESSAGE} caractères.`;

    (Object.entries(errs) as [FieldId, string][])
      .forEach(([field, msg]) => showFieldError(field, msg));

    return Object.keys(errs).length === 0;
  }

  // ─── Turnstile ───────────────────────────────────────────────────────────
  let turnstileToken: string | null = null;
  const turnstileContainer = document.getElementById('cf-turnstile');
  const turnstileError = document.getElementById('cf-turnstile-error');

  function renderTurnstile(): void {
    if (!turnstileContainer) return;
    const siteKey = (window as any).__TURNSTILE_SITE_KEY;
    if (!siteKey || !(window as any).turnstile) return;
    (window as any).turnstile.render(turnstileContainer, {
      sitekey: siteKey,
      theme: 'auto',
      callback: (token: string) => {
        turnstileToken = token;
        if (turnstileError) { turnstileError.textContent = ''; turnstileError.hidden = true; }
      },
      'expired-callback': () => {
        turnstileToken = null;
      },
      'error-callback': () => {
        turnstileToken = null;
      },
    });
  }

  // Render if script already loaded, otherwise wait
  if ((window as any).turnstile) {
    renderTurnstile();
  } else {
    window.addEventListener('turnstileReady', renderTurnstile, { once: true });
  }

  function readPayload(): ContactPayload {
    return {
      name:    (document.getElementById('cf-name')  as HTMLInputElement).value.trim(),
      email:   (document.getElementById('cf-email') as HTMLInputElement).value.trim().toLowerCase(),
      subject: (document.getElementById('cf-sujet') as HTMLInputElement).value.trim(),
      message: elMessage.value.trim(),
      type:    'contact',
      turnstileToken: turnstileToken ?? undefined,
    };
  }

  async function submitForm(payload: ContactPayload): Promise<void> {
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: ApiErrorResponse = await res.json().catch(() => ({}));

    if (res.ok) {
      form.reset();
      updateCharCount();
      showGlobalSuccess();
      return;
    }

    if (res.status === 422 && data.errors) {
      const { name, email, subject, message } = data.errors;
      if (name)    showFieldError('name',    name[0]);
      if (email)   showFieldError('email',   email[0]);
      if (subject) showFieldError('sujet',   subject[0]);
      if (message) showFieldError('message', message[0]);
      return;
    }

    showGlobalError(data.message ?? `Erreur serveur (${res.status}). Veuillez réessayer.`);
  }

  elMessage.addEventListener('input', updateCharCount);

  FIELDS.forEach((id) => {
    document.getElementById(`cf-${id}`)?.addEventListener('input', () => clearFieldError(id));
  });

  form.addEventListener('submit', async (e: Event): Promise<void> => {
    e.preventDefault();

    elSuccess.hidden = true;
    elError.hidden   = true;
    clearAllErrors();

    if (elHoney?.value.trim() !== '') return;

    const payload = readPayload();

    if (!turnstileToken) {
      if (turnstileError) {
        turnstileError.textContent = 'Merci de compléter la vérification CAPTCHA.';
        turnstileError.hidden = false;
      }
      return;
    }

    if (!validate(payload)) {
      document.querySelector<HTMLElement>('.cf-field--error .cf-input')?.focus();
      return;
    }

    setLoading(true);
    try {
      await submitForm(payload);
    } catch {
      showGlobalError('Un problème est survenu. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
      turnstileToken = null;
      const w = window as unknown as Record<string, unknown>;
      const t = w.turnstile as { reset?: () => void } | undefined;
      t?.reset?.();
    }
  });
}

// Fonctionne avec et sans View Transitions Astro
document.addEventListener('astro:page-load', initContactForm);
document.addEventListener('DOMContentLoaded', initContactForm);
