// src/pages/api/admin/resources/toggle.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getFormString } from '@/types/ateliers';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const adminDb = createSupabaseAdminClient();
  const { data: profile } = await adminDb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return new Response('Accès interdit', { status: 403 });
  }

  const form        = await request.formData();
  const resourceId  = getFormString(form, 'resource_id');
  const isPublished = form.get('is_published') === 'true';

  if (!resourceId) return new Response('resource_id requis', { status: 400 });

  const { error } = await adminDb
    .from('resources')
    .update({ is_published: isPublished })
    .eq('id', resourceId);

  if (error) {
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent(error.message));
  }

  return redirect('/dashboard/admin/resources?saved=1');
};