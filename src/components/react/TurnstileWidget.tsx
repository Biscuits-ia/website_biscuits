import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  Turnstile,
  type AppearanceMode,
  type ExecutionMode,
  type TurnstileInstance,
  type TurnstileTheme,
  type WidgetSize,
} from '@marsidev/react-turnstile';

export interface TurnstileWidgetProps {
  onSuccess(token: string): void;
  onError?(): void;
  onExpire?(): void;
  theme?: TurnstileTheme;
  size?: WidgetSize;
  execution?: ExecutionMode;
  appearance?: AppearanceMode;
  responseField?: boolean;
  responseFieldName?: string;
  scriptNonce?: string;
}

export interface TurnstileWidgetHandle {
  reset(): void;
  getResponse(): string | undefined;
  getResponsePromise(timeout?: number, retry?: number): Promise<string>;
  execute(): void;
}

const DEFAULT_THEME: TurnstileTheme = 'auto';
const DEFAULT_SIZE: WidgetSize = 'normal';
const DEFAULT_EXECUTION: ExecutionMode = 'render';
const DEFAULT_APPEARANCE: AppearanceMode = 'always';

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget(
    {
      onSuccess,
      onError,
      onExpire,
      theme = DEFAULT_THEME,
      size = DEFAULT_SIZE,
      execution = DEFAULT_EXECUTION,
      appearance = DEFAULT_APPEARANCE,
      responseField = false,
      responseFieldName,
      scriptNonce,
    }: Readonly<TurnstileWidgetProps>,
    ref,
  ) {
    const widgetRef = useRef<TurnstileInstance | null>(null);
    const widgetId = useId().replaceAll(':', '');
    const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          widgetRef.current?.reset();
        },
        getResponse() {
          return widgetRef.current?.getResponse();
        },
        async getResponsePromise(timeout?: number, retry?: number) {
          return (
            (await widgetRef.current?.getResponsePromise(timeout, retry)) ?? ''
          );
        },
        execute() {
          widgetRef.current?.execute();
        },
      }),
      [],
    );

    const handleSuccess = useCallback(
      (token: string) => {
        onSuccess(token);
      },
      [onSuccess],
    );

    const handleExpire = useCallback(() => {
      widgetRef.current?.reset();
      onExpire?.();
    }, [onExpire]);

    const handleError = useCallback(() => {
      widgetRef.current?.reset();
      onError?.();
    }, [onError]);

    if (!siteKey) {
      console.error('[turnstile] PUBLIC_TURNSTILE_SITE_KEY is not configured.');

      return (
        <p role="alert" className="turnstile-widget-error">
          La protection anti-bot est indisponible pour le moment.
        </p>
      );
    }

    return (
      <Turnstile
        ref={widgetRef}
        id={`turnstile-${widgetId}`}
        siteKey={siteKey}
        onSuccess={handleSuccess}
        onExpire={handleExpire}
        onError={handleError}
        options={{
          theme,
          size,
          execution,
          appearance,
          responseField,
          responseFieldName,
        }}
        scriptOptions={{
          nonce: scriptNonce,
        }}
      />
    );
  },
);

export default TurnstileWidget;