/**
 * Cloudflare Turnstile server-side verification.
 *
 * Required env vars:
 *   TURNSTILE_SECRET_KEY — your Turnstile secret key
 *   (use 1x0000000000000000000000000000000AA for testing)
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = import.meta.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('TURNSTILE_SECRET_KEY is not set.');
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v1/siteverify', {
      method: 'POST',
      body,
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
