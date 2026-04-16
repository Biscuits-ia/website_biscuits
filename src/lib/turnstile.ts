const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstileToken(
  token: string,
  remoteip?: string
): Promise<TurnstileVerifyResult> {
  const secretKey = import.meta.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.error("TURNSTILE_SECRET_KEY manquante");
    return { success: false, errorCodes: ["missing-secret-key"] };
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
