// src/pages/api/admin/logiciels/supprimer.ts
// Supprime un logiciel. Form fields attendus : software_id.
import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

function redirectWith(path: string, params: Record<string, string>): Response {
  const search = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 303,
    headers: { Location: `${path}?${search}` },
  });
}

function errorRedirect(message: string): Response {
  return redirectWith('/dashboard/admin/logiciels', {
    error: message,
    saved: '0',
  });
}

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;

  const form = await Astro.request.formData();
  const id = form.get('software_id');
  if (typeof id !== 'string' || !isValidUUID(id)) {
    return errorRedirect('Identifiant logiciel invalide.');
  }

  const adminDb = createSupabaseAdminClient();
  const { error } = await adminDb.from('software').delete().eq('id', id);

  if (error) {
    console.error('[api/admin/logiciels/supprimer] delete error:', error.message);
    return errorRedirect('Erreur lors de la suppression.');
  }

  return redirectWith('/dashboard/admin/logiciels', { saved: '1' });
};
