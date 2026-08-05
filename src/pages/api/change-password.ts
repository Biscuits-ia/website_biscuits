import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { validatePassword } from '@/lib/validation';

type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/**
 * Client ephemere isole des cookies de la requete. Utilise uniquement
 * pour verifier le mot de passe actuel via signInWithPassword, sans
 * toucher au refresh_token partage avec le browser SDK.
 */
function createSupabaseClientForLogin() {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.SUPABASE_ANON_KEY;
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
  let body: ChangePasswordBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Corps de la requete invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { currentPassword, newPassword, confirmPassword } = body;

  // Validation
  if (!currentPassword || !newPassword || !confirmPassword) {
    return new Response(JSON.stringify({ message: 'Veuillez remplir tous les champs.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (newPassword !== confirmPassword) {
    return new Response(
      JSON.stringify({ message: 'Les nouveaux mots de passe ne correspondent pas.' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return new Response(JSON.stringify({ message: passwordError }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Reutiliser le client du middleware pour ne pas relire les cookies
  // en concurrence avec le browser SDK.
  const supabase = locals.supabase ?? createSupabaseClient({ request, cookies, locals });

  // Verifier que l'utilisateur est authentifie
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ message: 'Utilisateur non authentifie.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verifier le mot de passe actuel via un client ephemere isole des
  // cookies partages (cf. createSupabaseClientForLogin).
  const loginClient = createSupabaseClientForLogin();
  const { error: loginError } = await loginClient.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  });

  if (loginError) {
    return new Response(JSON.stringify({ message: 'Le mot de passe actuel est incorrect.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Changer le mot de passe avec l'API Admin. Pas de rotation cote
  // client -> pas de rafraichissement -> pas de risque de
  // 'refresh_token_not_found' sur les autres onglets.
  // NOTE: depuis @supabase/supabase-js 2.103, `auth.admin.updateUser` est
  // renomme en `auth.admin.updateUserById` (le premier est supprime).
  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  if (error) {
    console.error('[api/change-password] update failed:', error.message);
    return new Response(JSON.stringify({ message: 'Erreur lors du changement de mot de passe.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message: 'Mot de passe modifie avec succes.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
