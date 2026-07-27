import { useCallback, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import '@/styles/recruitment-form.css';
import { EMAIL_RE, MAX_NAME } from '@/lib/validation';

/**
 * Candidature SPONTANEE, sans session.
 *
 * Le choix d'une session ne passe plus par ici : il se fait sur les cartes de
 * /rejoignez-nous, via /api/recruitment/reserve. Deux chemins menaient a la meme
 * place — le bouton de la carte et le radiogroup de ce formulaire — et c'est
 * cette dualite qui a produit le bug du 26/07 : le bouton ecrivait
 * `radio.checked` sur un champ controle par React sans mettre a jour son etat,
 * la candidature partait donc SANS la session demandee. Un seul chemin, plus de
 * synchronisation a tenir.
 */

interface RecruitmentFormData {
  first_name: string;
  last_name: string;
  email: string;
  skills: string;
  availability: string;
  motivation: string;
  /** Honeypot anti-bot. Doit rester vide : /api/recruitment rejette sinon. */
  honey: string;
}

interface RecruitmentApiResponse {
  message?: string;
  /** Adresse reellement enregistree (celle du compte si l'utilisateur est connecte). */
  email?: string;
  errors?: Partial<Record<'first_name' | 'last_name' | 'email', string[]>>;
}

type RecruitmentFieldId = 'first_name' | 'last_name' | 'email';

interface RecruitmentFormProps {
  idPrefix?: string;
  /**
   * Presence d'un compte connecte. Ne sert plus qu'a savoir s'il y a une adresse
   * a imposer : le serveur enregistre celle du compte, le champ doit donc
   * afficher celle-la et pas une autre.
   */
  isAuthenticated?: boolean;
  /**
   * Email du compte connecte. Le serveur l'impose a l'enregistrement : on le
   * pre-remplit et on verrouille le champ pour que l'ecran corresponde a ce qui
   * sera reellement stocke.
   */
  accountEmail?: string;
}

function buildInitialData(accountEmail?: string): RecruitmentFormData {
  return {
    first_name: '',
    last_name: '',
    email: accountEmail ?? '',
    skills: '',
    availability: '',
    motivation: '',
    honey: '',
  };
}

export default function RecruitmentFormClient({
  idPrefix = 'recruitment',
  isAuthenticated = false,
  accountEmail,
}: RecruitmentFormProps = {}) {
  const fieldId = useCallback((name: string) => `${idPrefix}-${name}`, [idPrefix]);
  // L'email n'est verrouille que s'il y a une adresse de compte a imposer.
  const emailLocked = Boolean(isAuthenticated && accountEmail);
  const [formData, setFormData] = useState<RecruitmentFormData>(
    () => buildInitialData(emailLocked ? accountEmail : ''),
  );
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RecruitmentFieldId, string>>>({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ fullName: string; email: string } | null>(null);

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

      // Verrou cote client : le champ est deja `readOnly`, ceci couvre le
      // retrait de l'attribut depuis les devtools. Le serveur reste l'autorite.
      if (name === 'email' && emailLocked) return;

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
    [clearFieldError, serverError, emailLocked],
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
            // Honeypot : le serveur l'attendait depuis toujours, le client ne
            // l'envoyait jamais — la protection anti-bot etait inoperante.
            honey: formData.honey,
          }),
        });

        const payload: RecruitmentApiResponse = await response
          .json()
          .catch(() => ({ message: 'Réponse serveur invalide.' }));

        if (response.ok) {
          setConfirmation({
            fullName: `${formData.first_name.trim()} ${formData.last_name.trim()}`,
            // Le serveur renvoie l'adresse reellement enregistree : quand
            // l'utilisateur est connecte c'est celle du compte, pas forcement
            // celle du champ.
            email: payload.email ?? formData.email.trim().toLowerCase(),
          });
          setFormData(buildInitialData(emailLocked ? accountEmail : ''));
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
    [formData, validate, emailLocked, accountEmail],
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
      <form className="form" noValidate aria-label="Formulaire de candidature spontanée Biscuits IA" onSubmit={handleSubmit}>
        <header className="form__header">
          <h1 className="form__title">Devenir bénévole chez <span className="highlight">Biscuits IA</span></h1>
          <p className="form__subtitle">
            Aucune session ne vous convient ? Envoyez une candidature spontanée : nous vous
            recontacterons dès qu'une nouvelle session sera programmée.
          </p>
          <p className="jeveuxaider">
            Vous pouvez aussi candidater via la plateforme <a href="https://www.jeveuxaider.gouv.fr/organisations/34315-biscuits-ia" target="_blank" rel="noopener noreferrer">jeveuxaider.gouv</a>
          </p>
        </header>

        <div className="alert alert--error" role="alert" style={{ display: serverError ? 'block' : 'none' }}>
          {serverError}
        </div>

        {/* Honeypot : invisible pour l'humain, rempli par les bots.
            aria-hidden + tabIndex -1 pour ne pas polluer la navigation clavier. */}
        <div className="hp-field" aria-hidden="true">
          <label htmlFor={fieldId('honey')}>Ne pas remplir</label>
          <input
            id={fieldId('honey')}
            name="honey"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={formData.honey}
            onChange={handleInputChange}
          />
        </div>

        <div className="form__row">
          <div className={`field ${fieldErrors.first_name ? 'field--error' : ''}`}>
            <label className="field__label" htmlFor={fieldId('prenom')}>Prénom <span className="field__required" aria-hidden="true">*</span></label>
            <input id={fieldId('prenom')} name="first_name" className="field__input" type="text" placeholder="Marie" autoComplete="given-name" aria-required="true" aria-invalid={fieldErrors.first_name ? 'true' : 'false'} value={formData.first_name} onChange={handleInputChange} />
            <span className="field__error" role="alert" style={{ display: fieldErrors.first_name ? 'block' : 'none' }}>{fieldErrors.first_name}</span>
          </div>

          <div className={`field ${fieldErrors.last_name ? 'field--error' : ''}`}>
            <label className="field__label" htmlFor={fieldId('nom')}>Nom <span className="field__required" aria-hidden="true">*</span></label>
            <input id={fieldId('nom')} name="last_name" className="field__input" type="text" placeholder="Dupont" autoComplete="family-name" aria-required="true" aria-invalid={fieldErrors.last_name ? 'true' : 'false'} value={formData.last_name} onChange={handleInputChange} />
            <span className="field__error" role="alert" style={{ display: fieldErrors.last_name ? 'block' : 'none' }}>{fieldErrors.last_name}</span>
          </div>
        </div>

        <div className={`field ${fieldErrors.email ? 'field--error' : ''}`}>
          <label className="field__label" htmlFor={fieldId('email')}>Email <span className="field__required" aria-hidden="true">*</span></label>
          {/* readOnly plutot que disabled : le champ reste focusable, lisible
              par les lecteurs d'ecran et copiable. */}
          <input
            id={fieldId('email')}
            name="email"
            className={`field__input ${emailLocked ? 'field__input--locked' : ''}`}
            type="email"
            placeholder="marie.dupont@exemple.fr"
            autoComplete="email"
            aria-required="true"
            aria-invalid={fieldErrors.email ? 'true' : 'false'}
            aria-describedby={emailLocked ? fieldId('email-hint') : undefined}
            readOnly={emailLocked}
            value={formData.email}
            onChange={handleInputChange}
          />
          {emailLocked && (
            <span className="field__hint" id={fieldId('email-hint')}>
              Adresse de votre compte. Votre candidature y sera rattachée.
            </span>
          )}
          <span className="field__error" role="alert" style={{ display: fieldErrors.email ? 'block' : 'none' }}>{fieldErrors.email}</span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor={fieldId('competences')}>Compétences</label>
          <textarea id={fieldId('competences')} name="skills" className="field__input field__textarea" placeholder="Vos compétences clés (ex : développement web, graphisme, rédaction…)" rows={3} value={formData.skills} onChange={handleInputChange}></textarea>
        </div>

        <div className="field">
          <label className="field__label" htmlFor={fieldId('disponibilite')}>Disponibilité</label>
          <select id={fieldId('disponibilite')} name="availability" className="field__input field__select" value={formData.availability} onChange={handleInputChange}>
            <option value="">Sélectionnez votre disponibilité</option>
            <option value="immediat">Immédiate</option>
            <option value="1mois">Dans 1 mois</option>
            <option value="3mois">Dans 3 mois</option>
            <option value="6mois">Dans 6 mois</option>
            <option value="autre">À discuter</option>
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor={fieldId('motivation')}>Motivation</label>
          <textarea id={fieldId('motivation')} name="motivation" className="field__input field__textarea" placeholder="Pourquoi souhaitez-vous vous engager bénévolement auprès de Biscuits IA ?" rows={5} value={formData.motivation} onChange={handleInputChange}></textarea>
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
