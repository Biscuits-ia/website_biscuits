import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { validatePassword } from '@/lib/validation';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const formData = await request.formData();
  const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);

  if (!password) {
    return new Response(
      JSON.stringify({ error: 'Le mot de passe est requis.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return new Response(
      JSON.stringify({ error: passwordError }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    // Reutiliser le client Supabase du middleware pour eviter de creer un
    // second client qui relirait d'anciens cookies et detruirait le
    // refresh_token en concurrence avec le browser SDK.
    const supabase = locals.supabase ?? createSupabaseClient({ request, cookies, locals });

    // Verifier que l'utilisateur est bien authentifie avant de mettre a jour
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('[reset-password] User not authenticated:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Session invalide. Veuillez demander un nouveau lien de reinitialisation.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error('[Auth] updateUser (reset password) SUPABASE ERROR:', error.message, '| status:', error.status, '| code:', (error as any).code);

      // IMPORTANT : on NE signe PAS out cote serveur apres une erreur
      // d'updateUser. signOut() consomme le refresh_token et declenche
      // la rotation -- c'est ce qui produit les "refresh_token_not_found"
      // en cascade sur les autres onglets/lambda. La session recovery
      // expire d'elle-meme cote Supabase Auth.

      // Distinguer les erreurs de session (lien expire) des erreurs de mise a jour
      const isSessionError = error.status === 401
        || error.status === 403
        || /session|jwt|token|not authenticated|unauthorized/i.test(error.message);

      if (isSessionError) {
        return new Response(
          JSON.stringify({ error: 'Lien invalide ou expire. Veuillez demander un nouveau lien de reinitialisation.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Transmettre un message specifique pour les politiques de mot de passe
      const isPolicyError = /password|same|reuse|weak|strength|character/i.test(error.message);
      const clientMessage = isPolicyError
        ? 'Mot de passe refuse par la politique de securite. Essayez un mot de passe different et plus complexe.'
        : 'Impossible de mettre a jour le mot de passe. Veuillez reessayer.';

      return new Response(
        JSON.stringify({ error: clientMessage }),
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
      JSON.stringify({ error: 'Erreur serveur. Veuillez reessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};