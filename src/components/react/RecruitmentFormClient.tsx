import { useCallback, useEffect, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import '@/styles/recruitment-form.css';
import { EMAIL_RE, MAX_NAME } from '@/lib/validation';

interface RecruitmentSession {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  max_candidates: number;
  status: string;
  candidate_count: number;
  places_remaining: number;
}

interface RecruitmentFormData {
  first_name: string;
  last_name: string;
  email: string;
  skills: string;
  availability: string;
  motivation: string;
  session_id: string;
}

interface RecruitmentApiResponse {
  message?: string;
  errors?: Partial<Record<'first_name' | 'last_name' | 'email' | 'session_id', string[]>>;
}

type RecruitmentFieldId = 'first_name' | 'last_name' | 'email';

const INITIAL_FORM_DATA: RecruitmentFormData = {
  first_name: '',
  last_name: '',
  email: '',
  skills: '',
  availability: '',
  motivation: '',
  session_id: '',
};

export default function RecruitmentFormClient() {
  const [formData, setFormData] = useState<RecruitmentFormData>(INITIAL_FORM_DATA);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RecruitmentFieldId, string>>>({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ fullName: string; email: string } | null>(null);
  const [sessions, setSessions] = useState<RecruitmentSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadSessions() {
      try {
        const res = await fetch('/api/recruitment/sessions', {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error('Erreur lors du chargement des sessions');
        const data = (await res.json()) as RecruitmentSession[];
        if (!cancelled) setSessions(data);
      } catch (err) {
        if (!cancelled) setSessionsError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    }
    void loadSessions();
    return () => { cancelled = true; };
  }, []);

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

      if (name === 'session_id') {
        // ne rien faire de spécial ; la valeur est mise à jour ci-dessus
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

  const handleSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      setServerError('');

      if (!validate(formData)) {
        return;
      }

      setIsSubmitting(true);

      try {
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
            session_id: formData.session_id || null,
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
          return;
        }

        if (response.status === 422 && payload.errors) {
          setFieldErrors({
            first_name: payload.errors.first_name?.[0],
            last_name: payload.errors.last_name?.[0],
            email: payload.errors.email?.[0],
          });
          return;
        }

        setServerError(
          typeof payload.message === 'string'
            ? payload.message
            : `Erreur serveur (${response.status}). Veuillez réessayer.`,
        );
      } catch {
        setServerError(
          'Un problème est survenu. Vérifiez votre connexion internet.',
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, validate],
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
          <p className="jeveuxaider">
            Vous pouvez aussi candidater via la plateforme <a href="https://www.jeveuxaider.gouv.fr/organisations/34315-biscuits-ia" target="_blank" rel="noopener noreferrer">jeveuxaider.gouv</a>
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
          <label className="field__label" htmlFor="session">Session de recrutement</label>
          {sessionsLoading ? (
            <p className="field__hint">Chargement des sessions…</p>
          ) : sessionsError ? (
            <p className="field__hint field__hint--error">{sessionsError}</p>
          ) : sessions.length === 0 ? (
            <p className="field__hint">Aucune session disponible pour le moment. Vous pouvez tout de même envoyer une candidature spontanée.</p>
          ) : (
            <div className="session-options" role="radiogroup" aria-label="Choisir une session de recrutement">
              <label className={`session-option ${formData.session_id === '' ? 'session-option--selected' : ''}`}>
                <input type="radio" name="session_id" value="" checked={formData.session_id === ''} onChange={handleInputChange} />
                <span className="session-option__title">Aucune préférence</span>
                <span className="session-option__meta">Candidature spontanée</span>
              </label>
              {sessions.map((s) => {
                const scheduled = new Date(s.scheduled_at);
                const full = s.places_remaining === 0;
                return (
                  <label key={s.id} className={`session-option ${formData.session_id === s.id ? 'session-option--selected' : ''} ${full ? 'session-option--full' : ''}`}>
                    <input type="radio" name="session_id" value={s.id} checked={formData.session_id === s.id} onChange={handleInputChange} disabled={full} />
                    <span className="session-option__title">{s.title}</span>
                    <span className="session-option__meta">
                      {scheduled.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{s.duration_minutes} min
                      {s.location && ` · ${s.location}`}
                    </span>
                    <span className={`session-option__badge ${full ? 'session-option__badge--full' : ''}`}>
                      {full ? 'Complet' : `${s.places_remaining} place${s.places_remaining > 1 ? 's' : ''}`}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
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