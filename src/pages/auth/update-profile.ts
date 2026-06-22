import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { EMAIL_RE, MAX_EMAIL, MAX_NAME } from '@/lib/validation';

export const POST: APIRoute = async ({ request, cookies }) => {
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

    const supabase = createSupabaseClient({ request, cookies });

    // Récupérer l'utilisateur connecté
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Vous devez être connecté.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Valider l'email si fourni
    if (email) {
      if (email.length > MAX_EMAIL) {
        return new Response(
          JSON.stringify({ error: `L'email ne peut pas dépasser ${MAX_EMAIL} caractères.` }),
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
        JSON.stringify({ error: `Le nom ne peut pas dépasser ${MAX_NAME} caractères.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Mettre à jour les métadonnées utilisateur
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

    // Mettre à jour l'email si différent
    let emailError = null;
    if (email && email !== user.email) {
      // Vérifier si l'email est déjà utilisé
      // NOTE: postgrest-js >= 1.x : `.eq()` ne prend que 2 args (column, value).
      // Pour exclure l'utilisateur courant on utilise `.neq('id', user.id)`.
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .neq('id', user.id)
        .maybeSingle();

      if (existingUser) {
        return new Response(
          JSON.stringify({ error: 'Cet email est déjà utilisé par un autre compte.' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Mettre à jour l'email via Supabase
      const { error: emailUpdateError } = await supabase.auth.updateUser({ email });
      if (emailUpdateError) {
        emailError = emailUpdateError;
        console.error('[Auth] update-email error:', emailUpdateError.message);
      }
    }

    // Mettre à jour les métadonnées
    const { error: metadataError } = await supabase.auth.updateUser({
      data: updateData
    });

    if (metadataError) {
      console.error('[Auth] update-profile metadata error:', metadataError);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la mise à jour du profil.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Si l'email a changé, rediriger vers la page de confirmation
    const redirectUrl = emailError 
      ? `/dashboard/user/settings?error=${encodeURIComponent(emailError.message)}`
      : `/dashboard/user/settings?saved=1`;

    return new Response(
      JSON.stringify({ 
        success: true, 
        redirect: redirectUrl,
        message: emailError 
          ? 'Profil mis à jour mais échec de la mise à jour de l email.' 
          : 'Profil mis à jour avec succès.' 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[Auth] update-profile route error:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur. Veuillez réessayer.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
