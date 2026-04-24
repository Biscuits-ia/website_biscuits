import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);

  if (!password) {
    return new Response(
      JSON.stringify({ error: 'Le mot de passe est requis.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    // La session de récupération est déjà posée dans les cookies par /auth/callback.
    // On la réutilise directement — pas besoin de tokens en FormData.
    const supabase = createSupabaseClient({ request, cookies });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Lien invalide ou expiré. Veuillez demander un nouveau lien de réinitialisation.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error('[Auth] updateUser (reset password) error:', error.message);
      return new Response(
        JSON.stringify({ error: 'Impossible de mettre à jour le mot de passe. Veuillez réessayer.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Auth] reinitialiser-mot-de-passe error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez réessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};