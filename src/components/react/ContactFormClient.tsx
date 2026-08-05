import { useCallback, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import '@/styles/contact-form.css';
import { EMAIL_RE, MAX_MESSAGE, MAX_NAME, MAX_SUBJECT, MIN_MESSAGE } from '@/lib/validation';

type FieldId = 'name' | 'email' | 'subject' | 'message';

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  honey: string;
}

interface ContactApiResponse {
  message?: string;
  errors?: Partial<Record<'name' | 'email' | 'subject' | 'message', string[]>>;
}

const INITIAL_FORM_DATA: ContactFormData = {
  name: '',
  email: '',
  subject: '',
  message: '',
  honey: '',
};

export default function ContactFormClient() {
  const [formData, setFormData] = useState<ContactFormData>(INITIAL_FORM_DATA);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldId, string>>>({});
  const [globalError, setGlobalError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearAllErrors = useCallback(() => {
    setFieldErrors({});
    setGlobalError('');
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.currentTarget;

      setFormData((current) => ({
        ...current,
        [name]: value,
      }));

      if (name !== 'honey') {
        const normalizedName = name as FieldId;
        setFieldErrors((current) => {
          if (!current[normalizedName]) {
            return current;
          }

          return {
            ...current,
            [normalizedName]: undefined,
          };
        });
      }

      if (globalError) {
        setGlobalError('');
      }

      if (showSuccess) {
        setShowSuccess(false);
      }
    },
    [globalError, showSuccess]
  );

  const validate = useCallback((data: ContactFormData): boolean => {
    const errors: Partial<Record<FieldId, string>> = {};

    if (!data.name.trim()) {
      errors.name = 'Le nom est obligatoire.';
    } else if (data.name.trim().length > MAX_NAME) {
      errors.name = `Maximum ${MAX_NAME} caractères.`;
    }

    if (!data.email.trim()) {
      errors.email = "L'email est obligatoire.";
    } else if (!EMAIL_RE.test(data.email.trim().toLowerCase())) {
      errors.email = 'Email invalide.';
    }

    if (!data.subject.trim()) {
      errors.subject = 'Le sujet est obligatoire.';
    } else if (data.subject.trim().length > MAX_SUBJECT) {
      errors.subject = `Maximum ${MAX_SUBJECT} caractères.`;
    }

    if (!data.message.trim()) {
      errors.message = 'Le message est obligatoire.';
    } else if (data.message.trim().length < MIN_MESSAGE) {
      errors.message = `Minimum ${MIN_MESSAGE} caractères.`;
    } else if (data.message.trim().length > MAX_MESSAGE) {
      errors.message = `Maximum ${MAX_MESSAGE} caractères.`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, []);

  const handleSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearAllErrors();
      setShowSuccess(false);

      if (formData.honey.trim() !== '') {
        return;
      }

      if (!validate(formData)) {
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name: formData.name.trim(),
            email: formData.email.trim().toLowerCase(),
            subject: formData.subject.trim(),
            message: formData.message.trim(),
          }),
        });

        const payload: ContactApiResponse = await response
          .json()
          .catch(() => ({ message: 'Réponse serveur invalide.' }));

        if (response.ok) {
          setFormData(INITIAL_FORM_DATA);
          setShowSuccess(true);
          return;
        }

        if (response.status === 422 && payload.errors) {
          setFieldErrors({
            name: payload.errors.name?.[0],
            email: payload.errors.email?.[0],
            subject: payload.errors.subject?.[0],
            message: payload.errors.message?.[0],
          });
          return;
        }

        setGlobalError(
          typeof payload.message === 'string'
            ? payload.message
            : `Erreur serveur (${response.status}). Veuillez réessayer.`
        );
      } catch {
        setGlobalError('Un problème est survenu. Vérifiez votre connexion.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [clearAllErrors, formData, validate]
  );

  const characterCount = formData.message.length;
  let characterCountClass = '';
  if (characterCount > 1900) {
    characterCountClass = 'cf-char-count--danger';
  } else if (characterCount > 1500) {
    characterCountClass = 'cf-char-count--warn';
  }

  return (
    <div className="contact-form-wrapper">
      <div
        className="cf-alert cf-alert--success"
        role="status"
        aria-live="polite"
        hidden={!showSuccess}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        <span>
          Votre demande a été envoyée avec succès ! Nous vous répondrons dans les plus brefs délais.
        </span>
      </div>

      <div
        className="cf-alert cf-alert--error"
        role="alert"
        aria-live="assertive"
        hidden={globalError.length === 0}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>{globalError}</span>
      </div>

      <form
        className="cf-form"
        noValidate
        aria-label="Formulaire de contact"
        onSubmit={handleSubmit}
      >
        <div className="cf-row">
          <div className={`cf-field ${fieldErrors.name ? 'cf-field--error' : ''}`}>
            <label className="cf-label" htmlFor="cf-name">
              Nom <span className="cf-required">*</span>
            </label>
            <input
              id="cf-name"
              name="name"
              type="text"
              className="cf-input"
              placeholder="Nom"
              maxLength={MAX_NAME}
              autoComplete="name"
              aria-required="true"
              aria-invalid={fieldErrors.name ? 'true' : 'false'}
              value={formData.name}
              onChange={handleInputChange}
            />
            <span className="cf-error" role="alert" hidden={!fieldErrors.name}>
              {fieldErrors.name}
            </span>
          </div>

          <div className={`cf-field ${fieldErrors.email ? 'cf-field--error' : ''}`}>
            <label className="cf-label" htmlFor="cf-email">
              Email <span className="cf-required">*</span>
            </label>
            <input
              id="cf-email"
              name="email"
              type="email"
              className="cf-input"
              placeholder="contact@exemple.fr"
              maxLength={255}
              autoComplete="email"
              aria-required="true"
              aria-invalid={fieldErrors.email ? 'true' : 'false'}
              value={formData.email}
              onChange={handleInputChange}
            />
            <span className="cf-error" role="alert" hidden={!fieldErrors.email}>
              {fieldErrors.email}
            </span>
          </div>
        </div>

        <div className={`cf-field ${fieldErrors.subject ? 'cf-field--error' : ''}`}>
          <label className="cf-label" htmlFor="cf-sujet">
            Sujet <span className="cf-required">*</span>
          </label>
          <input
            id="cf-sujet"
            name="subject"
            type="text"
            className="cf-input"
            placeholder="Sujet de votre message"
            maxLength={MAX_SUBJECT}
            aria-required="true"
            aria-invalid={fieldErrors.subject ? 'true' : 'false'}
            value={formData.subject}
            onChange={handleInputChange}
          />
          <span className="cf-error" role="alert" hidden={!fieldErrors.subject}>
            {fieldErrors.subject}
          </span>
        </div>

        <div className={`cf-field ${fieldErrors.message ? 'cf-field--error' : ''}`}>
          <label className="cf-label" htmlFor="cf-message">
            Votre message <span className="cf-required">*</span>
          </label>
          <textarea
            id="cf-message"
            name="message"
            className="cf-input cf-textarea"
            rows={5}
            placeholder="Décrivez votre demande…"
            minLength={MIN_MESSAGE}
            maxLength={MAX_MESSAGE}
            aria-required="true"
            aria-invalid={fieldErrors.message ? 'true' : 'false'}
            aria-describedby="cf-char-count"
            value={formData.message}
            onChange={handleInputChange}
          />
          <span
            id="cf-char-count"
            className={`cf-char-count ${characterCountClass}`}
            aria-live="polite"
          >
            {characterCount} / {MAX_MESSAGE}
          </span>
          <span className="cf-error" role="alert" hidden={!fieldErrors.message}>
            {fieldErrors.message}
          </span>
        </div>

        <input
          type="text"
          name="honey"
          tabIndex={-1}
          autoComplete="off"
          className="cf-honeypot"
          aria-hidden="true"
          value={formData.honey}
          onChange={handleInputChange}
        />

        <div className="cf-footer">
          <p className="cf-note">
            <span aria-hidden="true">*</span> Champs obligatoires
          </p>
          <button
            type="submit"
            className="cf-btn"
            aria-busy={isSubmitting ? 'true' : 'false'}
            disabled={isSubmitting}
          >
            <span>{isSubmitting ? 'Envoi en cours…' : 'Envoyer ma demande'}</span>
            <span className="cf-spinner" aria-hidden="true" hidden={!isSubmitting}></span>
          </button>
        </div>
      </form>
    </div>
  );
}
