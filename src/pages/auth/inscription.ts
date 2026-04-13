import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email    = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);
  const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);

  if (!email || !password) {
    return new Response('Email and password are required', { status: 400 });
  }

  // On passe bien cookies pour que setAll puisse écrire la session
  const supabase = createSupabaseClient({ request, cookies });
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return redirect('/connexion');
};