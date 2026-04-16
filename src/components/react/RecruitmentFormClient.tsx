import { useCallback, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import TurnstileWidget, { type TurnstileWidgetHandle } from './TurnstileWidget';
import '@/styles/recruitment-form.css';
import { EMAIL_RE, MAX_NAME } from '@/lib/validation';

interface RecruitmentFormClientProps {
  scriptNonce?: string;
}

interface RecruitmentFormData {
  first_name: string;
  last_name: string;
  email: string;
  skills: string;
  availability: string;
  motivation: string;
}

interface RecruitmentApiResponse {
  message?: string;
  errors?: Partial<Record<'first_name' | 'last_name' | 'email', string[]>>;
}

type RecruitmentFieldId = 'first_name' | 'last_name' | 'email';

const INITIAL_FORM_DATA: RecruitmentFormData = {
  first_name: '',
  last_name: '',
  email: '',
  skills: '',
  availability: '',
  motivation: '',
};

export default function RecruitmentFormClient({ scriptNonce }: Readonly<RecruitmentFormClientProps>) {
  const [formData, setFormData] = useState<RecruitmentFormData>(INITIAL_FORM_DATA);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RecruitmentFieldId, string>>>({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ fullName: string; email: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const widgetRef = useRef<TurnstileWidgetHandle | null>(null);

  const clearFieldError = useCallback((field: RecruitmentFieldId) => {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: undefined,
      };
    });
  }, []);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken('');
    widgetRef.current?.reset();
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = event.currentTarget;

      setFormData((current) => ({
        ...current,
        [name]: value,
      }));

      if (name === 'first_name' || name === 'last_name' || name === 'email') {
        clearFieldError(name);
      }

      if (serverError) {
        setServerError('');
      }
    },
    [clearFieldError, serverError],
  );

  const validate = useCallback((data: RecruitmentFormData): boolean => {
    const errors: Partial<Record<RecruitmentFieldId, string>> = {};

    if (!data.first_name.trim()) {
      errors.first_name = 'Le prénom est obligatoire.';
    } else if (data.first_name.trim().length > MAX_NAME) {
      errors.first_name = `Maximum ${MAX_NAME} caractères.`;
    }

    if (!data.last_name.trim()) {
      errors.last_name = 'Le nom est obligatoire.';
    } else if (data.last_name.trim().length > MAX_NAME) {
      errors.last_name = `Maximum ${MAX_NAME} caractères.`;
    }

    if (!data.email.trim()) {
      errors.email = "L'email est obligatoire.";
    } else if (!EMAIL_RE.test(data.email.trim().toLowerCase())) {
      errors.email = 'Veuillez entrer un email valide.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, []);

  const resolveTurnstileToken = useCallback(async (): Promise<string> => {
    if (turnstileToken) {
      return turnstileToken;
    }

    widgetRef.current?.execute();
    const token = await widgetRef.current?.getResponsePromise(10000, 250);

    if (!token) {
      throw new Error('TURNSTILE_TOKEN_MISSING');
    }

    setTurnstileToken(token);
    return token;
  }, [turnstileToken]);

  const handleSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setServerError('');

      if (!validate(formData)) {
        return;
      }

      setIsSubmitting(true);

      try {
        const verifiedTurnstileToken = await resolveTurnstileToken();
        const response = await fetch('/api/recruitment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim(),
            email: formData.email.trim().toLowerCase(),
            motivation: formData.motivation.trim() || null,
            skills: formData.skills.trim() || null,
            availability: formData.availability || null,
            turnstileToken: verifiedTurnstileToken,
          }),
        });

        const payload: RecruitmentApiResponse = await response
          .json()
          .catch(() => ({ message: 'Réponse serveur invalide.' }));

        if (response.ok) {
          setConfirmation({
            fullName: `${formData.first_name.trim()} ${formData.last_name.trim()}`,
            email: formData.email.trim().toLowerCase(),
          });
          setFormData(INITIAL_FORM_DATA);
          setFieldErrors({});
          resetTurnstile();
          return;
        }

        if (response.status === 422 && payload.errors) {
          setFieldErrors({
            first_name: payload.errors.first_name?.[0],
            last_name: payload.errors.last_name?.[0],
            email: payload.errors.email?.[0],
          });
          resetTurnstile();
          return;
        }

        setServerError(
          typeof payload.message === 'string'
            ? payload.message
            : `Erreur serveur (${response.status}). Veuillez réessayer.`,
        );
        resetTurnstile();
      } catch (error) {
        setServerError(
          error instanceof Error && error.message === 'TURNSTILE_TOKEN_MISSING'
            ? 'La vérification anti-bot a échoué. Réessayez.'
            : 'Un problème est survenu. Vérifiez votre connexion internet.',
        );
        resetTurnstile();
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, resetTurnstile, resolveTurnstileToken, validate],
  );

  if (confirmation) {
    return (
      <div className="recruitment-page">
        <div className="confirmation" role="alert" aria-live="polite">
          <div className="confirmation__icon" aria-hidden="true">🎉</div>
          <h2 className="confirmation__title">Candidature envoyée !</h2>
          <p className="confirmation__text">
            Merci <strong>{confirmation.fullName}</strong>, nous avons bien reçu votre candidature.
            Notre équipe vous contactera prochainement à <strong>{confirmation.email}</strong>.
          </p>
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => {
              setConfirmation(null);
              setServerError('');
              resetTurnstile();
            }}
          >
            Soumettre une nouvelle candidature
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="recruitment-page">
      <form className="form" noValidate aria-label="Formulaire de candidature Biscuits IA" onSubmit={handleSubmit}>
        <header className="form__header">
          <h1 className="form__title">Devenir bénévole chez <span className="highlight">Biscuits IA</span></h1>
          <p className="form__subtitle">
            Rejoignez notre équipe associative et contribuez à notre mission d'intérêt général.
          </p>
        </header>

        <div className="alert alert--error" role="alert" style={{ display: serverError ? 'block' : 'none' }}>
          {serverError}
        </div>

        <div className="form__row">
          <div className={`field ${fieldErrors.first_name ? 'field--error' : ''}`}>
            <label className="field__label" htmlFor="prenom">Prénom <span className="field__required" aria-hidden="true">*</span></label>
            <input id="prenom" name="first_name" className="field__input" type="text" placeholder="Marie" autoComplete="given-name" aria-required="true" aria-invalid={fieldErrors.first_name ? 'true' : 'false'} value={formData.first_name} onChange={handleInputChange} />
            <span className="field__error" role="alert" style={{ display: fieldErrors.first_name ? 'block' : 'none' }}>{fieldErrors.first_name}</span>
          </div>

          <div className={`field ${fieldErrors.last_name ? 'field--error' : ''}`}>
            <label className="field__label" htmlFor="nom">Nom <span className="field__required" aria-hidden="true">*</span></label>
            <input id="nom" name="last_name" className="field__input" type="text" placeholder="Dupont" autoComplete="family-name" aria-required="true" aria-invalid={fieldErrors.last_name ? 'true' : 'false'} value={formData.last_name} onChange={handleInputChange} />
            <span className="field__error" role="alert" style={{ display: fieldErrors.last_name ? 'block' : 'none' }}>{fieldErrors.last_name}</span>
          </div>
        </div>

        <div className={`field ${fieldErrors.email ? 'field--error' : ''}`}>
          <label className="field__label" htmlFor="email">Email <span className="field__required" aria-hidden="true">*</span></label>
          <input id="email" name="email" className="field__input" type="email" placeholder="marie.dupont@exemple.fr" autoComplete="email" aria-required="true" aria-invalid={fieldErrors.email ? 'true' : 'false'} value={formData.email} onChange={handleInputChange} />
          <span className="field__error" role="alert" style={{ display: fieldErrors.email ? 'block' : 'none' }}>{fieldErrors.email}</span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="competences">Compétences</label>
          <textarea id="competences" name="skills" className="field__input field__textarea" placeholder="Vos compétences clés (ex : développement web, graphisme, rédaction…)" rows={3} value={formData.skills} onChange={handleInputChange}></textarea>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="disponibilite">Disponibilité</label>
          <select id="disponibilite" name="availability" className="field__input field__select" value={formData.availability} onChange={handleInputChange}>
            <option value="">Sélectionnez votre disponibilité</option>
            <option value="immediat">Immédiate</option>
            <option value="1mois">Dans 1 mois</option>
            <option value="3mois">Dans 3 mois</option>
            <option value="6mois">Dans 6 mois</option>
            <option value="autre">À discuter</option>
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="motivation">Motivation</label>
          <textarea id="motivation" name="motivation" className="field__input field__textarea" placeholder="Pourquoi souhaitez-vous vous engager bénévolement auprès de Biscuits IA ?" rows={5} value={formData.motivation} onChange={handleInputChange}></textarea>
        </div>

        <TurnstileWidget
          ref={widgetRef}
          theme="auto"
          size="invisible"
          execution="execute"
          appearance="execute"
          scriptNonce={scriptNonce}
          onSuccess={setTurnstileToken}
          onError={() => {
            setTurnstileToken('');
            setServerError('La vérification anti-bot a échoué. Réessayez.');
          }}
          onExpire={() => {
            setTurnstileToken('');
          }}
        />

        <div className="form__footer">
          <p className="form__note"><span aria-hidden="true">*</span> Champs obligatoires</p>
          <button className="btn btn--primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Envoi en cours…' : 'Envoyer ma candidature →'}
          </button>
        </div>
      </form>
    </div>
  );
}