// With `output: 'static'` configured:
// export const prerender = false;
import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { verifyTurnstile } from "@/lib/turnstile";

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const formData = await request.formData();
  const email    = formData.get("email") instanceof File ? null : (formData.get("email") as string | null);
  const password = formData.get("password") instanceof File ? null : (formData.get("password") as string | null);
  const turnstileToken = formData.get("cf-turnstile-response");
  const token = typeof turnstileToken === 'string' ? turnstileToken : '';

  const turnstileOk = await verifyTurnstile(token, clientAddress);
  if (!turnstileOk) {
    return new Response(JSON.stringify({ error: "Vérification anti-robot échouée. Veuillez réessayer." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Email et mot de passe requis." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createSupabaseClient({ request, cookies });
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const msg = error.message === "Invalid login credentials"
      ? "Email ou mot de passe incorrect."
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Les cookies de session sont posés automatiquement par createSupabaseClient → setAll
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};