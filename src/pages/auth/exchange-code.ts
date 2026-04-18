import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const code = url.searchParams.get('code');
  
  if (!code) {
    return new Response(
      JSON.stringify({ error: 'Code manquant' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const supabase = createSupabaseClient({ request, cookies });

    // Échanger le code contre une session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      console.error('Erreur exchangeCodeForSession:', error?.message || 'Pas de session');
      return new Response(
        JSON.stringify({ error: 'Impossible d\'échanger le code. Le lien a peut-être expiré.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Retourner les tokens pour utilisation côté client
    return new Response(
      JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Erreur exchange-code:', err);
    return new Response(
      JSON.stringify({ error: 'Erreur serveur' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
