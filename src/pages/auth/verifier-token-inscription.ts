import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const formData = await request.formData();
    const email = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);
    const token = formData.get('token') instanceof File ? null : (formData.get('token') as string | null);

    if (!email || !token) {
      return new Response(
        JSON.stringify({ error: 'Email et code requis.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return new Response(
        JSON.stringify({ error: 'Adresse email invalide.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!/^[0-9A-Za-z]{6,10}$/.test(normalizedToken)) {
      return new Response(
        JSON.stringify({ error: 'Code invalide. Verifiez le code recu par email.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createSupabaseClient({ request, cookies });

    // Un seul appel verifyOtp avec type: 'signup'.
    // Avant, le code essayait 'email' PUIS 'signup' sur le meme client,
    // ce qui declenchait _useSession() 2x (donc 2 lectures du cookie) et
    // pouvait consommer le refresh_token avant la confirmation.
    // Le template d'inscription Supabase envoie le mail avec type=signup.
    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: 'signup',
    });

    if (error) {
      console.error('[signup] verifyOtp error:', error.message, '| code:', error.code);
      return new Response(
        JSON.stringify({ error: 'Code invalide ou expire. Demandez un nouveau code.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[signup] verify token route error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez reessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};