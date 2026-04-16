import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies, url, site }) => {
  const formData = await request.formData();
  const email = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);
  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Veuillez entrer votre adresse email.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Utiliser l'URL du site configurée (SITE env var) ou l'origin de la requête
  const origin = site?.origin || url.origin;
  
  const supabase = createSupabaseClient({ request, cookies });
  
  const redirectUrl = `${origin}/reinitialisation-mot-de-passe`;
  console.log('[DEBUG] Demande reset password pour:', email);
  console.log('[DEBUG] URL de redirection:', redirectUrl);
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });

  if (error) {
    console.error('[DEBUG] Erreur resetPasswordForEmail:', error.message);
    return new Response(
      JSON.stringify({ error: 'Impossible d\'envoyer le lien. Veuillez réessayer.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
