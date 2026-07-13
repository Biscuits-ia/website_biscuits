// src/pages/api/admin/resources/toggle.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { getFormString } from '@/types/ateliers';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { request, redirect } = context;
  const adminDb = createSupabaseAdminClient();

  const form        = await request.formData();
  const resourceId  = getFormString(form, 'resource_id');
  const isPublished = form.get('is_published') === 'true';

  if (!isValidUUID(resourceId)) return new Response('resource_id invalide', { status: 400 });

  const { error } = await adminDb
    .from('resources')
    .update({ is_published: isPublished })
    .eq('id', resourceId);

  if (error) {
    console.error('[toggle] Supabase error:', error.message);
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Erreur lors de la mise à jour de la ressource.'));
  }

  return redirect('/dashboard/admin/resources?saved=1');
};