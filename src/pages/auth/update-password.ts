import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: 'Configuration Supabase manquante.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const formData = await request.formData();
    const currentPassword = formData.get('current_password') as string | null;
    const newPassword = formData.get('new_password') as string | null;
    const confirmPassword = formData.get('confirm_password') as string | null;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'Veuillez remplir tous les champs.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (newPassword !== confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'Les nouveaux mots de passe ne correspondent pas.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createSupabaseClient({ request, cookies });

    // Récupérer l'utilisateur connecté
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Vous devez être connecté.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Vérifier le mot de passe actuel
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });

    if (loginError) {
      return new Response(
        JSON.stringify({ error: 'Le mot de passe actuel est incorrect.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Mettre à jour le mot de passe
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error('[Auth] update-password error:', updateError.message);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la mise à jour du mot de passe.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Mot de passe mis à jour avec succès.' 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Auth] update-password route error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez réessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
