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
    // Réutiliser le client Supabase du middleware pour éviter de créer un second client
    // qui lirait les anciens cookies de la requête (potentiellement obsolètes si le token
    // a été rafraîchi par le middleware). Le client locals.supabase a déjà le token
    // en mémoire après le getUser() du middleware.
    const supabase = locals.supabase ?? createSupabaseClient({ request, cookies });

    // Vérifier que l'utilisateur est bien authentifié avant de mettre à jour
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('[reset-password] User not authenticated:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Session invalide. Veuillez demander un nouveau lien de réinitialisation.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error('[Auth] updateUser (reset password) SUPABASE ERROR:', error.message, '| status:', error.status, '| code:', (error as any).code);

      // Déconnecter immédiatement — ne jamais laisser un utilisateur connecté
      // avec une session recovery si la mise à jour a échoué (risque de session
      // orpheline permettant l'accès au compte sans avoir changé le mot de passe).
      await supabase.auth.signOut({ scope: 'global' });

      // Distinguer les erreurs de session (lien expiré) des erreurs de mise à jour
      const isSessionError = error.status === 401
        || error.status === 403
        || /session|jwt|token|not authenticated|unauthorized/i.test(error.message);

      if (isSessionError) {
        return new Response(
          JSON.stringify({ error: 'Lien invalide ou expiré. Veuillez demander un nouveau lien de réinitialisation.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Transmettre un message spécifique pour les politiques de mot de passe
      const isPolicyError = /password|same|reuse|weak|strength|character/i.test(error.message);
      const clientMessage = isPolicyError
        ? 'Mot de passe refusé par la politique de sécurité. Essayez un mot de passe différent et plus complexe.'
        : 'Impossible de mettre à jour le mot de passe. Veuillez réessayer.';

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
      JSON.stringify({ error: 'Erreur serveur. Veuillez réessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
