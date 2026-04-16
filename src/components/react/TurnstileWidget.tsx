import { Turnstile } from "@marsidev/react-turnstile";

interface Props {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
}

export default function TurnstileWidget({
  onSuccess,
  onError,
  onExpire,
  theme = "auto",
}: Readonly<Props>) {
  const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    console.warn("Turnstile site key manquante");
    return null;
  }

  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={onSuccess}
      onError={onError}
      onExpire={onExpire}
      options={{ theme }}
    />
  );
}
