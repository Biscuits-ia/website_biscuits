const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

export function isTurnstileEnabled(): boolean {
  return Boolean(import.meta.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstileToken(
  token: string,
  remoteip?: string
): Promise<TurnstileVerifyResult> {
  const secretKey = import.meta.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    return { success: true, errorCodes: ["turnstile-disabled"] };
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
    ...(remoteip ? { remoteip } : {}),
  });

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const data = await res.json();

  return {
    success: data.success === true,
    errorCodes: data["error-codes"],
  };
}
