// src/pages/api/ateliers/desinscrire.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { getFormString }        from '@/types/ateliers';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const form      = await request.formData();
  const sessionId = getFormString(form, 'session_id');

  if (!sessionId) {
    return new Response('session_id requis', { status: 400 });
  }

  const { error } = await supabase
    .from('workshop_registrations')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', user.id);

  if (error) {
    return redirect(
      '/dashboard/user/ateliers?error=' + encodeURIComponent(error.message),
    );
  }

  return redirect('/dashboard/user/ateliers?saved=1');
};