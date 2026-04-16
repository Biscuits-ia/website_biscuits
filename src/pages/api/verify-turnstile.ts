import type { APIRoute } from "astro";
import { verifyTurnstileToken } from "../../lib/turnstile";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const token = body?.token;

  if (!token || typeof token !== "string") {
    return new Response(JSON.stringify({ success: false, error: "Token manquant" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
  const result = await verifyTurnstileToken(token, ip);

  if (!result.success) {
    return new Response(
      JSON.stringify({ success: false, error: "CAPTCHA invalide", codes: result.errorCodes }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
