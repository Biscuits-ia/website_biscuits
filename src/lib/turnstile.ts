const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

function getTurnstileSecretKey(): string | undefined {
  return import.meta.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY;
}

export function isTurnstileEnabled(): boolean {
  const publicFlag = import.meta.env.PUBLIC_TURNSTILE_ENABLED;
  if (publicFlag === 'false') return false;
  return true;
}

export function getRequestIp(
  request: Request,
  fallbackIp?: string,
): string | undefined {
  const cfConnectingIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const forwardedIp = xForwardedFor.split(',')[0]?.trim();
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  const xRealIp = request.headers.get('x-real-ip')?.trim();
  if (xRealIp) {
    return xRealIp;
  }

  return fallbackIp;
}

export async function verifyTurnstileToken(
  token: string,
  ip?: string,
): Promise<boolean> {
  if (!isTurnstileEnabled()) {
    return true;
  }

  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return false;
  }

  const secretKey = getTurnstileSecretKey();

  if (!secretKey) {
    console.error('[turnstile] TURNSTILE_SECRET_KEY is not configured.');
    return false;
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: normalizedToken,
  });

  if (ip) {
    body.set('remoteip', ip);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      console.error(
        `[turnstile] Verification request failed with status ${response.status}.`,
      );
      return false;
    }

    let payload: TurnstileVerifyResponse;

    try {
      payload = (await response.json()) as TurnstileVerifyResponse;
    } catch (error) {
      console.error('[turnstile] Failed to parse verification response.', error);
      return false;
    }

    if (!payload.success) {
      console.error('[turnstile] Token verification failed.', {
        errorCodes: payload['error-codes'] ?? [],
      });
    }

    return payload.success;
  } catch (error) {
    console.error('[turnstile] Network error during verification.', error);
    return false;
  }
}