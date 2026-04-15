// src/pages/api/demandes/creer.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { getFormString }        from '@/types/ateliers';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const form        = await request.formData();
  const subject     = getFormString(form, 'subject');
  const description = getFormString(form, 'description');

  if (!subject || !description) {
    return redirect(
      '/dashboard/user/demandes?error=' +
      encodeURIComponent('Sujet et description requis.'),
    );
  }

  const { error } = await supabase
    .from('requests')
    .insert({
      user_id:     user.id,
      subject:     subject.trim(),
      description: description.trim(),
    });

  if (error) {
    console.error('[creer] Supabase error:', error.message);
    return redirect(
      '/dashboard/user/demandes?error=' + encodeURIComponent('Erreur lors de la création de la demande.'),
    );
  }

  return redirect('/dashboard/user/demandes?saved=1');
};