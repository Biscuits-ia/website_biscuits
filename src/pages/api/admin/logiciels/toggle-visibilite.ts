// src/pages/api/admin/logiciels/toggle-visibilite.ts
// Bascule is_visible d'un logiciel. Form fields attendus : software_id, is_visible.
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

function parseBool(value: FormDataEntryValue | null): boolean {
  if (typeof value !== 'string') return false;
  return value === 'true' || value === '1' || value === 'on';
}

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;

  const form = await Astro.request.formData();
  const id = form.get('software_id');
  if (typeof id !== 'string' || !isValidUUID(id)) {
    return errorRedirect('Identifiant logiciel invalide.');
  }

  const isVisible = parseBool(form.get('is_visible'));

  const adminDb = createSupabaseAdminClient();
  const { error } = await adminDb
    .from('software')
    .update({ is_visible: isVisible })
    .eq('id', id);

  if (error) {
    console.error('[api/admin/logiciels/toggle-visibilite] update error:', error.message);
    return errorRedirect('Erreur lors du changement de visibilité.');
  }

  return redirectWith('/dashboard/admin/logiciels', { saved: '1' });
};