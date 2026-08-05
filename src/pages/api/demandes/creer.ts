// src/pages/api/demandes/creer.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { getFormString } from '@/lib/formData';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const form = await request.formData();
  const subject = getFormString(form, 'subject');
  const description = getFormString(form, 'description');

  if (!subject || !description) {
    return redirect(
      '/dashboard/user/demandes?error=' + encodeURIComponent('Sujet et description requis.')
    );
  }

  // Validation de longueur pour éviter les payloads abusifs
  if (subject.trim().length > 200) {
    return redirect(
      '/dashboard/user/demandes?error=' +
        encodeURIComponent('Le sujet ne doit pas dépasser 200 caractères.')
    );
  }

  if (description.trim().length > 5000) {
    return redirect(
      '/dashboard/user/demandes?error=' +
        encodeURIComponent('La description ne doit pas dépasser 5000 caractères.')
    );
  }

  const { error } = await supabase.from('requests').insert({
    user_id: user.id,
    subject: subject.trim(),
    description: description.trim(),
  });

  if (error) {
    console.error('[creer] Supabase error:', error.message);
    return redirect(
      '/dashboard/user/demandes?error=' +
        encodeURIComponent('Erreur lors de la création de la demande.')
    );
  }

  return redirect('/dashboard/user/demandes?saved=1');
};
