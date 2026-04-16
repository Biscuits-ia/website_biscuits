import { useEffect, useId, useRef, useState } from 'react';
import TurnstileWidget, { type TurnstileWidgetHandle } from './TurnstileWidget';

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
  const widgetRef = useRef<TurnstileWidgetHandle | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const isSubmittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState('');
  const widgetId = useId().replaceAll(':', '');

  useEffect(() => {
    const container = containerRef.current;
    const form = container?.closest('form');

    if (!form || !(form instanceof HTMLFormElement)) {
      return;
    }

    const handleSubmit = async (event: SubmitEvent) => {
      if (isSubmittingRef.current) {
        return;
      }

      event.preventDefault();
      setErrorMessage('');

      try {
        isSubmittingRef.current = true;
        widgetRef.current?.execute();

        const token = await widgetRef.current?.getResponsePromise(10000, 250);

        if (!token) {
          setErrorMessage('La vérification anti-bot a échoué. Réessayez.');
          isSubmittingRef.current = false;
          return;
        }

        if (hiddenInputRef.current) {
          hiddenInputRef.current.value = token;
        }

        form.submit();
      } catch {
        setErrorMessage('La vérification anti-bot a échoué. Réessayez.');
        widgetRef.current?.reset();
        isSubmittingRef.current = false;
      }
    };

    form.addEventListener('submit', handleSubmit);

    return () => {
      form.removeEventListener('submit', handleSubmit);
    };
  }, []);

  return (
    <div ref={containerRef} data-turnstile-form-guard={widgetId}>
      <input ref={hiddenInputRef} type="hidden" name={inputName} defaultValue="" />
      <TurnstileWidget
        ref={widgetRef}
        theme="auto"
        size="invisible"
        execution="execute"
        appearance="execute"
        scriptNonce={scriptNonce}
        onSuccess={(token) => {
          if (hiddenInputRef.current) {
            hiddenInputRef.current.value = token;
          }
        }}
        onError={() => {
          setErrorMessage('La vérification anti-bot a échoué. Réessayez.');
          isSubmittingRef.current = false;
        }}
        onExpire={() => {
          if (hiddenInputRef.current) {
            hiddenInputRef.current.value = '';
          }
          isSubmittingRef.current = false;
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