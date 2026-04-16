import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const email    = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);
  const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);
  if (!email || !password) {
    return new Response(
      JSON.stringify({ error: 'Email et mot de passe requis.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createSupabaseClient({ request, cookies });
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Impossible de créer le compte. Veuillez réessayer.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};