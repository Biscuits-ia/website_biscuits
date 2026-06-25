import { useCallback, useState, type ChangeEvent } from 'react';
import '@/styles/victim-form.css';
import { EMAIL_RE, MAX_MESSAGE, MAX_NAME, MIN_MESSAGE } from '@/lib/validation';

type FieldId = 'name' | 'email' | 'situation_type' | 'message';

interface VictimFormData {
  name: string;
  email: string;
  situation_type: string;
  message: string;
  honey: string;
  urgent: boolean;
}

interface VictimApiResponse {
  message?: string;
  errors?: Partial<Record<FieldId, string[]>>;
}

const SITUATION_TYPES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Choisir...' },
  { value: 'arnaque-financiere', label: 'Arnaque financiere (virement, paiement)' },
  { value: 'usurpation-identite', label: 'Usurpation d\'identite' },
  { value: 'phishing-smishing', label: 'Phishing / smishing' },
  { value: 'chantage-extorsion', label: 'Chantage / extorsion' },
  { value: 'pedocriminalite', label: 'Contenu impliquant un mineur' },
  { value: 'faux-outil-ia', label: 'Faux outil IA / malware' },
  { value: 'autre', label: 'Autre cybercriminalite' },
];

const INITIAL_FORM_DATA: VictimFormData = {
  name: '',
  email: '',
  situation_type: '',
  message: '',
  honey: '',
  urgent: false,
};

export default function VictimForm() {
  const [formData, setFormData] = useState<VictimFormData>(INITIAL_FORM_DATA);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldId, string[]>>>({});
  const [globalError, setGlobalError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearAllErrors = useCallback(() => {
    setFieldErrors({});
    setGlobalError('');
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const target = event.currentTarget;
      const name = target.name as keyof VictimFormData;
      const value =
        target instanceof HTMLInputElement && target.type === 'checkbox'
          ? target.checked
          : target.value;

      setFormData((current) => ({ ...current, [name]: value }));

      if (name !== 'honey') {
        const normalized = name as FieldId;
        setFieldErrors((current) => {
          if (!current[normalized]) return current;
          return { ...current, [normalized]: undefined };
        });
      }

      if (globalError) setGlobalError('');
      if (showSuccess) setShowSuccess(false);
    },
    [globalError, showSuccess],
  );

  const validate = useCallback((data: VictimFormData): Partial<Record<FieldId, string[]>> => {
    const errors: Partial<Record<FieldId, string[]>> = {};

    if (!data.name.trim()) {
      errors.name = ['Le nom est obligatoire.'];
    } else if (data.name.trim().length > MAX_NAME) {
      errors.name = [`Maximum ${MAX_NAME} caracteres.`];
    }

    if (!data.email.trim()) {
      errors.email = ['L\'email est obligatoire.'];
    } else if (!EMAIL_RE.test(data.email.trim().toLowerCase())) {
      errors.email = ['Email invalide.'];
    }

    if (!data.situation_type) {
      errors.situation_type = ['Selectionnez le type de situation.'];
    }

    if (!data.message.trim()) {
      errors.message = ['La description est obligatoire.'];
    } else if (data.message.trim().length < MIN_MESSAGE) {
      errors.message = [`Minimum ${MIN_MESSAGE} caracteres.`];
    } else if (data.message.trim().length > MAX_MESSAGE) {
      errors.message = [`Maximum ${MAX_MESSAGE} caracteres.`];
    }

    return errors;
  }, []);

  const handleSubmit = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearAllErrors();

      const errors = validate(formData);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            subject: `[VICTIME] ${formData.situation_type}${formData.urgent ? ' - URGENT' : ''}`,
            message: formData.message,
            honey: formData.honey,
            kind: 'victime',
            urgent: formData.urgent,
          }),
        });

        const data = (await response.json().catch(() => ({}))) as VictimApiResponse;

        if (!response.ok) {
          if (data.errors) {
            setFieldErrors(data.errors as Partial<Record<FieldId, string[]>>);
          }
          setGlobalError(data.message ?? 'Une erreur est survenue. Reessayez plus tard.');
          return;
        }

        setFormData(INITIAL_FORM_DATA);
        setShowSuccess(true);
        event.currentTarget.reset();
      } catch {
        setGlobalError('Erreur reseau. Verifiez votre connexion et reessayez.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, validate, clearAllErrors],
  );

  const errorList = (key: FieldId): string[] | undefined => fieldErrors[key];

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate aria-label="Formulaire d'aide aux victimes">
      {globalError && (
        <p className="auth-msg error" role="alert" style={{ display: 'block' }}>
          {globalError}
        </p>
      )}
      {showSuccess && (
        <p className="auth-msg success" role="status" style={{ display: 'block' }}>
          Votre demande a bien ete envoyee. Nous vous repondons sous 48h ouvrees. Pour les situations d\'urgence (compte bancaire vide, menace immediate), appelez le 17 ou le 3018.
        </p>
      )}

      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label htmlFor="victim-name" className="auth-label">
          Votre nom (ou pseudonyme si vous preferez rester anonyme)
        </label>
        <input
          id="victim-name"
          name="name"
          type="text"
          autoComplete="name"
          className="auth-input"
          aria-required="true"
          aria-invalid={Boolean(errorList('name'))}
          value={formData.name}
          onChange={handleInputChange}
          maxLength={MAX_NAME}
        />
        {errorList('name')?.map((e) => (
          <p key={e} className="field-error">{e}</p>
        ))}
      </div>

      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label htmlFor="victim-email" className="auth-label">
          Email (pour vous repondre)
        </label>
        <input
          id="victim-email"
          name="email"
          type="email"
          autoComplete="email"
          className="auth-input"
          aria-required="true"
          aria-invalid={Boolean(errorList('email'))}
          value={formData.email}
          onChange={handleInputChange}
        />
        {errorList('email')?.map((e) => (
          <p key={e} className="field-error">{e}</p>
        ))}
      </div>

      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label htmlFor="victim-type" className="auth-label">
          Type de situation
        </label>
        <select
          id="victim-type"
          name="situation_type"
          className="auth-input"
          aria-required="true"
          aria-invalid={Boolean(errorList('situation_type'))}
          value={formData.situation_type}
          onChange={handleInputChange}
        >
          {SITUATION_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {errorList('situation_type')?.map((e) => (
          <p key={e} className="field-error">{e}</p>
        ))}
      </div>

      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label htmlFor="victim-message" className="auth-label">
          Decrivez brievement la situation (sans details bancaires ni mots de passe)
        </label>
        <textarea
          id="victim-message"
          name="message"
          rows={6}
          className="auth-input"
          aria-required="true"
          aria-invalid={Boolean(errorList('message'))}
          value={formData.message}
          onChange={handleInputChange}
          maxLength={MAX_MESSAGE}
          placeholder="Quand, comment, qui est implique. Evitez de coller des numeros de carte ou mots de passe ici."
        />
        {errorList('message')?.map((e) => (
          <p key={e} className="field-error">{e}</p>
        ))}
      </div>

      <div className="form-group" style={{ marginBottom: '1.25rem' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            name="urgent"
            checked={formData.urgent}
            onChange={handleInputChange}
          />
          <span>J\'ai besoin d\'une reponse rapide (compte bancaire vide, menace en cours)</span>
        </label>
      </div>

      <input type="text" name="honey" value={formData.honey} onChange={handleInputChange} style={{ position: 'absolute', left: '-9999px' }} tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <button type="submit" className="cta-btn cta-btn-dark" disabled={isSubmitting}>
        {isSubmitting ? 'Envoi en cours...' : 'Envoyer ma demande'}
      </button>

      <p className="form-rgpd" style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: '1rem' }}>
        🔒 Vos donnees sont traitees de maniere confidentielle. Elles ne sont jamais revendues ni partagees. Voir notre <a href="/legal/confidentialite">politique de confidentialite</a>.
      </p>
    </form>
  );
}