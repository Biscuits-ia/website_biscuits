import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const accessToken = formData.get('access_token') instanceof File ? null : (formData.get('access_token') as string | null);
  const refreshToken = formData.get('refresh_token') instanceof File ? null : (formData.get('refresh_token') as string | null);

  if (!accessToken || !refreshToken) {
    return new Response(
      JSON.stringify({ error: 'Token invalide.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createSupabaseClient({ request, cookies });
  
  // Définir la session avec les tokens reçus
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    console.error('Erreur setSession:', error.message);
    return new Response(
      JSON.stringify({ error: 'Impossible de vérifier le token. Le lien a peut-être expiré.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};