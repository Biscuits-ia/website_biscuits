import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { validatePassword } from '@/lib/validation';

/**
 * Client ephemere utilise UNIQUEMENT pour verifier le mot de passe
 * actuel de l'utilisateur. Il n'utilise PAS les cookies de la requete,
 * il ne persiste rien et n'auto-refresh pas : aucun risque de toucher
 * au refresh_token partage avec le browser SDK.
 */
function createSupabaseClientForLogin() {
  const url = import.meta.env.SUPABASE_URL;
  const key =
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('[auth] Configuration Supabase manquante.');
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      skipAutoInitialize: true,
      detectSessionInUrl: false,
    },
  });
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
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

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return new Response(
        JSON.stringify({ error: passwordError }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Reutiliser le client du middleware pour ne pas relire les
    // cookies en concurrence avec le browser SDK.
    const supabase = locals.supabase ?? createSupabaseClient({ request, cookies, locals });

    // Recuperer l'utilisateur connecte
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Vous devez etre connecte.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Verifier le mot de passe actuel via un client ephemere isole
    // (aucun cookie, aucune persistance, aucun refresh). On evite ainsi
    // que signInWithPassword consomme le refresh_token partage et
    // detruise la session en cours dans le navigateur.
    const loginClient = createSupabaseClientForLogin();
    const { error: loginError } = await loginClient.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });

    if (loginError) {
      return new Response(
        JSON.stringify({ error: 'Le mot de passe actuel est incorrect.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Mettre a jour le mot de passe via l'API Admin (pas de rotation
    // cote client -> pas de rafraichissement -> pas de risque de
    // 'refresh_token_not_found' sur les autres onglets).
    const adminClient = createSupabaseAdminClient();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error('[Auth] update-password error:', updateError.message);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la mise a jour du mot de passe.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mot de passe mis a jour avec succes.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Auth] update-password route error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez reessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};