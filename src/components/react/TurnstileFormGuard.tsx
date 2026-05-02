import { useEffect, useId, useRef, useState } from 'react';
import TurnstileWidget from './TurnstileWidget';

interface TurnstileFormGuardProps {
  scriptNonce?: string;
  inputName?: string;
}

const DEFAULT_INPUT_NAME = 'turnstileToken';
const TURNSTILE_ENABLED = import.meta.env.PUBLIC_TURNSTILE_ENABLED !== 'false';

export default function TurnstileFormGuard({
  scriptNonce,
  inputName = DEFAULT_INPUT_NAME,
}: Readonly<TurnstileFormGuardProps>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tokenRef = useRef('');
  const [errorMessage, setErrorMessage] = useState('');
  const [token, setToken] = useState('');
  const widgetId = useId().replaceAll(':', '');

  // Keep a ref in sync with the state so the submit handler always reads the
  // latest value without needing to be re-registered on every token change.
  tokenRef.current = token;

  useEffect(() => {
    if (!TURNSTILE_ENABLED) {
      return;
    }

    const container = containerRef.current;
    const form = container?.closest('form');

    if (!form || !(form instanceof HTMLFormElement)) {
      return;
    }

    const handleSubmit = (event: SubmitEvent) => {
      if (!tokenRef.current) {
        event.preventDefault();
        setErrorMessage('Merci de valider la vérification anti-bot avant de continuer.');
      }
    };

    form.addEventListener('submit', handleSubmit);

    return () => {
      form.removeEventListener('submit', handleSubmit);
    };
  }, []);  // tokenRef is stable — no stale closure

  return (
    <div ref={containerRef} data-turnstile-form-guard={widgetId}>
      {TURNSTILE_ENABLED ? (
        <TurnstileWidget
          theme="auto"
          size="flexible"
          responseField
          responseFieldName={inputName}
          scriptNonce={scriptNonce}
          onSuccess={(nextToken) => {
            setToken(nextToken);
            setErrorMessage('');
          }}
          onError={() => {
            setToken('');
            setErrorMessage('La vérification anti-bot a échoué. Réessayez.');
          }}
          onExpire={() => {
            setToken('');
            setErrorMessage('La vérification anti-bot a expiré. Merci de la relancer.');
          }}
        />
      ) : null}

      {errorMessage ? (
        <p role="alert" className="turnstile-inline-error">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}