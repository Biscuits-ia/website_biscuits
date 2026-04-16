import { useEffect, useId, useRef, useState } from 'react';
import TurnstileWidget from './TurnstileWidget';

interface TurnstileFormGuardProps {
  scriptNonce?: string;
  inputName?: string;
}

const DEFAULT_INPUT_NAME = 'turnstileToken';

export default function TurnstileFormGuard({
  scriptNonce,
  inputName = DEFAULT_INPUT_NAME,
}: Readonly<TurnstileFormGuardProps>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [token, setToken] = useState('');
  const widgetId = useId().replaceAll(':', '');

  useEffect(() => {
    const container = containerRef.current;
    const form = container?.closest('form');

    if (!form || !(form instanceof HTMLFormElement)) {
      return;
    }

    const handleSubmit = async (event: SubmitEvent) => {
      if (!token) {
        event.preventDefault();
        setErrorMessage('Merci de valider la vérification anti-bot avant de continuer.');
      }
    };

    form.addEventListener('submit', handleSubmit);

    return () => {
      form.removeEventListener('submit', handleSubmit);
    };
  }, []);

  return (
    <div ref={containerRef} data-turnstile-form-guard={widgetId}>
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

      {errorMessage ? (
        <p role="alert" className="turnstile-inline-error">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}