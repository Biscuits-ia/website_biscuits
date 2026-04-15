import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, cookies, url }) => {
  const formData = await request.formData();
  const email = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);

  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Veuillez entrer votre adresse email.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createSupabaseClient({ request, cookies });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${url.origin}/reinitialisation-mot-de-passe`,
  });

  if (error) {
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
