import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);
  
  if (!password) {
    return new Response(
      JSON.stringify({ error: 'Le mot de passe est requis.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createSupabaseClient({ request, cookies });
  
  // Cette fonction nécessite que l'utilisateur ait une session valide
  // (créée via le token de récupération dans l'URL)
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error('Erreur mise à jour mot de passe:', error.message);
    return new Response(
      JSON.stringify({ error: error.message || 'Impossible de mettre à jour le mot de passe.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};