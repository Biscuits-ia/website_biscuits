import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { EMAIL_RE, MAX_EMAIL, MAX_NAME } from '@/lib/validation';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) {
      return new Response(
        JSON.stringify({ error: 'Configuration Supabase manquante.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const formData = await request.formData();
    const full_name = formData.get('full_name') as string | null;
    const email = formData.get('email') as string | null;
    const phone = formData.get('phone') as string | null;
    const organization = formData.get('organization') as string | null;

    // Reutiliser le client du middleware pour ne pas relire les cookies
    // en concurrence avec le browser SDK.
    const supabase = locals.supabase ?? createSupabaseClient({ request, cookies, locals });

    // Recuperer l'utilisateur connecte
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Vous devez etre connecte.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Valider l'email si fourni
    if (email) {
      if (email.length > MAX_EMAIL) {
        return new Response(
          JSON.stringify({ error: `L'email ne peut pas depasser ${MAX_EMAIL} caracteres.` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (!EMAIL_RE.test(email)) {
        return new Response(
          JSON.stringify({ error: 'Adresse email invalide.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (full_name && full_name.length > MAX_NAME) {
      return new Response(
        JSON.stringify({ error: `Le nom ne peut pas depasser ${MAX_NAME} caracteres.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Mettre a jour les metadonnees utilisateur
    const updateData: Record<string, string | null> = {};

    if (full_name !== null && full_name.trim() !== '') {
      updateData.full_name = full_name.trim();
    }

    if (phone !== null && phone.trim() !== '') {
      updateData.phone = phone.trim();
    }

    if (organization !== null && organization.trim() !== '') {
      updateData.organization = organization.trim();
    }

    // Mettre a jour l'email via l'API Admin si different. On evite
    // l'appel cote client (qui declenche la rotation du refresh_token
    // et casse les autres onglets).
    let emailError: Error | null = null;
    if (email && email !== user.email) {
      try {
        const adminClient = createSupabaseAdminClient();
        const { error: emailUpdateError } = await adminClient.auth.admin.updateUserById(user.id, {
          email,
        });
        if (emailUpdateError) {
          emailError = emailUpdateError;
          console.error('[Auth] update-email (admin) error:', emailUpdateError.message);
        }
      } catch (e) {
        emailError = e as Error;
        console.error('[Auth] update-email exception:', e);
      }
    }

    // Mettre a jour les metadonnees via le client cote utilisateur.
    // NOTE : updateUser({ data }) ne declenche PAS de rotation du
    // refresh_token (pas de modification des credentials), donc c'est
    // safe cote serveur.
    const { error: metadataError } = await supabase.auth.updateUser({
      data: updateData,
    });

    if (metadataError) {
      console.error('[Auth] update-profile metadata error:', metadataError);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la mise a jour du profil.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Si l'email a change, rediriger vers la page de confirmation
    const redirectUrl = emailError
      ? `/dashboard/user/settings?error=${encodeURIComponent(emailError.message)}`
      : `/dashboard/user/settings?saved=1`;

    return new Response(
      JSON.stringify({
        success: true,
        redirect: redirectUrl,
        message: emailError
          ? 'Profil mis a jour mais echec de la mise a jour de l email.'
          : 'Profil mis a jour avec succes.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Auth] update-profile route error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez reessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};