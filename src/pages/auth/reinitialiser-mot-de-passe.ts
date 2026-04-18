import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);
  const accessToken = formData.get('access_token') instanceof File ? null : (formData.get('access_token') as string | null);
  const refreshToken = formData.get('refresh_token') instanceof File ? null : (formData.get('refresh_token') as string | null);
  
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

  if (!accessToken || !refreshToken) {
    return new Response(
      JSON.stringify({ error: 'Lien de réinitialisation invalide ou incomplet.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    // Créer un client Supabase avec les tokens de récupération
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseKey = import.meta.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Configuration Supabase manquante');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    });

    // Établir la session avec les tokens de récupération
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      console.error('Erreur setSession reset password:', sessionError.message);
      return new Response(
        JSON.stringify({ error: 'Lien invalide ou expiré. Veuillez demander un nouveau lien de réinitialisation.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Mettre à jour le mot de passe
    // Avec un token de récupération, updateUser() ne devrait pas demander l'ancien mot de passe
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error('Erreur mise à jour mot de passe:', error.message);
      return new Response(
        JSON.stringify({ error: error.message || 'Impossible de mettre à jour le mot de passe.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Erreur serveur reset password:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez réessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};