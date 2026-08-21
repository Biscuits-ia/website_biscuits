// src/pages/api/admin/logiciels/modifier.ts
// Met à jour un logiciel. Form fields attendus : software_id, name,
// description, category, logo_url, download_url, website_url, is_free, is_visible.
import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { isValidUUID, validateHttpUrl } from '@/lib/validation';

function sanitize(text: FormDataEntryValue | null, maxLen = 500): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/** null = champ vide (ok) ; undefined = champ rempli mais URL invalide (rejeter). */
function sanitizeUrl(text: FormDataEntryValue | null, maxLen = 500): string | null | undefined {
  const trimmed = sanitize(text, maxLen);
  if (trimmed === null) return null;
  const valid = validateHttpUrl(trimmed);
  return valid === null ? undefined : valid;
}

function isChecked(value: FormDataEntryValue | null): boolean {
  return typeof value === 'string' && (value === 'true' || value === 'on' || value === '1');
}

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
  const id = sanitize(form.get('software_id'), 64);
  if (!id || !isValidUUID(id)) return errorRedirect('Identifiant logiciel invalide.');

  const name = sanitize(form.get('name'), 120);
  if (!name) return errorRedirect('Le nom est requis.');

  const logoUrl = sanitizeUrl(form.get('logo_url'), 500);
  const downloadUrl = sanitizeUrl(form.get('download_url'), 500);
  const websiteUrl = sanitizeUrl(form.get('website_url'), 500);
  if (logoUrl === undefined || downloadUrl === undefined || websiteUrl === undefined) {
    return errorRedirect('URL invalide (http/https requis).');
  }

  const adminDb = createSupabaseAdminClient();
  const { error } = await adminDb
    .from('software')
    .update({
      name,
      description: sanitize(form.get('description'), 1000),
      category: sanitize(form.get('category'), 60),
      logo_url: logoUrl,
      download_url: downloadUrl,
      website_url: websiteUrl,
      is_free: isChecked(form.get('is_free')),
      is_visible: isChecked(form.get('is_visible')),
    })
    .eq('id', id);

  if (error) {
    console.error('[api/admin/logiciels/modifier] update error:', error.message);
    return errorRedirect('Erreur lors de la mise à jour.');
  }

  return redirectWith('/dashboard/admin/logiciels', { saved: '1' });
};
