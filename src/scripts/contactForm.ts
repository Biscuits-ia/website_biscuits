type ValidatedField = 'name' | 'email' | 'sujet' | 'message';

interface ContactPayload {
  name:    string;
  email:   string;
  subject: string;
  message: string;
  type:    'contact';
}

interface ApiResponse {
  message?: string;
  form_id?: string | number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 2000;
const MIN_MESSAGE = 20;
const FIELDS: readonly ValidatedField[] = ['name', 'email', 'sujet', 'message'];

const API_URL: string =
  document.querySelector<HTMLElement>('.contact-form-wrapper')?.dataset.apiUrl
  ?? 'http://localhost:8000/api/forms';

// ─── Helpers DOM ──────────────────────────────────────────────────────────────

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`[ContactForm] #${id} introuvable.`);
  return el;
}

function getVal(id: string): string {
  return getEl<HTMLInputElement>(id).value.trim();
}

// ─── Éléments DOM ─────────────────────────────────────────────────────────────

const form         = getEl<HTMLFormElement>('contact-form');
const btnSubmit    = getEl<HTMLButtonElement>('btn-submit');
const btnLabel     = getEl<HTMLElement>('btn-label');
const btnLoader    = getEl<HTMLElement>('btn-loader');
const alertSuccess = getEl<HTMLElement>('alert-success');
const alertError   = getEl<HTMLElement>('alert-error');
const alertErrText = getEl<HTMLElement>('alert-error-text');
const messageInput = getEl<HTMLTextAreaElement>('message');
const charCount    = getEl<HTMLElement>('message-count');
const honeyInput   = getEl<HTMLInputElement>('honey');

// ─── Validation ───────────────────────────────────────────────────────────────

function validateField(field: ValidatedField, value: string): string {
  switch (field) {
    case 'name':
      if (!value)             return 'Le nom est obligatoire.';
      if (value.length > 100) return 'Le nom ne doit pas dépasser 100 caractères.';
      return '';
    case 'email':
      if (!value)                return "L'email est obligatoire.";
      if (!EMAIL_RE.test(value)) return 'Veuillez entrer un email valide.';
      return '';
    case 'sujet':
      if (!value)             return 'Le sujet est obligatoire.';
      if (value.length > 150) return 'Le sujet ne doit pas dépasser 150 caractères.';
      return '';
    case 'message':
      if (!value)                     return 'Le message est obligatoire.';
      if (value.length < MIN_MESSAGE) return `Le message doit contenir au moins ${MIN_MESSAGE} caractères.`;
      if (value.length > MAX_MESSAGE) return `Le message ne doit pas dépasser ${MAX_MESSAGE} caractères.`;
      return '';
  }
}

// ─── UI — erreurs champ ───────────────────────────────────────────────────────

function showFieldError(field: ValidatedField, message: string): void {
  getEl(`field-${field}`).classList.add('error');
  getEl(field).setAttribute('aria-invalid', 'true');
  const span = getEl(`${field}-error`);
  span.textContent = message;
  span.hidden = false;
}

function clearFieldError(field: ValidatedField): void {
  getEl(`field-${field}`).classList.remove('error');
  getEl(field).setAttribute('aria-invalid', 'false');
  const span = getEl(`${field}-error`);
  span.textContent = '';
  span.hidden = true;
}

function clearAllErrors(): void {
  FIELDS.forEach(clearFieldError);
}

// ─── UI — alertes globales ────────────────────────────────────────────────────

function showSuccess(): void {
  alertError.hidden   = true;
  alertSuccess.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => { alertSuccess.hidden = true; }, 10_000);
}

function showError(message: string): void {
  alertSuccess.hidden      = true;
  alertErrText.textContent = message;
  alertError.hidden        = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideAlerts(): void {
  alertSuccess.hidden = true;
  alertError.hidden   = true;
}

// ─── UI — bouton ──────────────────────────────────────────────────────────────

function setLoading(loading: boolean): void {
  btnSubmit.disabled = loading;
  btnSubmit.setAttribute('aria-busy', String(loading));
  btnLabel.textContent = loading ? 'Envoi en cours…' : 'Envoyer ma demande';
  btnLoader.hidden     = !loading;
}

// ─── Compteur de caractères ───────────────────────────────────────────────────

function updateCharCount(): void {
  const len = messageInput.value.length;
  charCount.textContent = `${len} / ${MAX_MESSAGE}`;
  charCount.classList.toggle('warning', len > 1500);
  charCount.classList.toggle('danger',  len > 1900);
}

// ─── Lecture formulaire ───────────────────────────────────────────────────────

function readFormData(): ContactPayload {
  return {
    name:    getVal('name'),
    email:   getVal('email').toLowerCase(),
    subject: getVal('sujet'),
    message: getVal('message'),
    type:    'contact',
  };
}

// ─── Appel API ────────────────────────────────────────────────────────────────

async function submitContact(payload: ContactPayload): Promise<ApiResponse> {
  const res = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  const data: ApiResponse = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message ?? "Erreur lors de l'envoi du formulaire.");
  }

  return data;
}

// ─── Événements ──────────────────────────────────────────────────────────────

messageInput.addEventListener('input', updateCharCount);

FIELDS.forEach((field) => {
  const el = getEl(field);
  el.addEventListener('blur',  () => {
    const error = validateField(field, getVal(field));
    if (error) showFieldError(field, error);
    else       clearFieldError(field);
  });
  el.addEventListener('input', () => clearFieldError(field));
});

form.addEventListener('submit', async (e: Event) => {
  e.preventDefault();
  hideAlerts();
  clearAllErrors();

  if (honeyInput.value.trim() !== '') {
    showError('Erreur de validation.');
    return;
  }

  const payload = readFormData();

  const errs: Partial<Record<ValidatedField, string>> = {};
  const nameErr    = validateField('name',    payload.name);
  const emailErr   = validateField('email',   payload.email);
  const sujetErr   = validateField('sujet',   getVal('sujet'));
  const messageErr = validateField('message', payload.message);

  if (nameErr)    errs.name    = nameErr;
  if (emailErr)   errs.email   = emailErr;
  if (sujetErr)   errs.sujet   = sujetErr;
  if (messageErr) errs.message = messageErr;

  if (Object.keys(errs).length > 0) {
    (Object.entries(errs) as [ValidatedField, string][])
      .forEach(([field, msg]) => showFieldError(field, msg));
    getEl(Object.keys(errs)[0] as ValidatedField).focus();
    return;
  }

  setLoading(true);

  try {
    form.reset();
    updateCharCount();
    showSuccess();

  } catch (err: unknown) {
    const message = err instanceof Error
      ? err.message
      : 'Une erreur est survenue. Veuillez réessayer.';

    showError(message);

  } finally {
    setLoading(false);
  }
});

// ─── Enregistrement du Service Worker ─────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('Service Worker enregistré avec succès:', registration.scope);
      })
      .catch(error => {
        console.log('Échec de l\'enregistrement du Service Worker:', error);
      });
  });
}