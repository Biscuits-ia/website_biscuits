// src/pages/api/admin/benevoles/update.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_PHOTO_SIZE = 2 * 1024 * 1024;

/** Validate photo file, upload to storage, return public URL or null on failure/skip. */
async function uploadPhoto(
  adminDb: ReturnType<typeof createSupabaseAdminClient>,
  id: string,
  photo: File,
): Promise<string | null> {
  if (!ALLOWED_MIME.has(photo.type) || photo.size > MAX_PHOTO_SIZE) return null;
  const ext    = photo.type.split('/')[1].replace('jpeg', 'jpg');
  const path   = `${id}/avatar.${ext}`;
  const buffer = await photo.arrayBuffer();
  const { error } = await adminDb.storage
    .from('benevoles')
    .upload(path, buffer, { contentType: photo.type, upsert: true });
  if (error) { console.error('[benevoles] storage upload:', error.message); return null; }
  const { data } = adminDb.storage.from('benevoles').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { request, redirect } = context;
  const form = await request.formData();

  const id          = (form.get('id') as string | null)?.trim() ?? '';
  const prenom      = (form.get('prenom') as string | null)?.trim() ?? '';
  const nom         = (form.get('nom') as string | null)?.trim() ?? '';
  const role        = (form.get('role') as string | null)?.trim() ?? '';
  const competences = (form.get('competences') as string | null)?.trim() ?? '';
  const bio         = (form.get('bio') as string | null)?.trim() || null;
  const lien        = (form.get('lien') as string | null)?.trim() || null;
  const ordre       = Number.parseInt((form.get('ordre') as string | null) ?? '0', 10);
  const photo       = form.get('photo');

  if (!isValidUUID(id)) {
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Identifiant invalide.'));
  }
  if (!prenom || !nom) {
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Prénom et nom requis.'));
  }
  const validRoles = ['benevole', 'membre_ca', 'membre_bureau'];
  if (!validRoles.includes(role)) {
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Rôle invalide.'));
  }

  const competencesArr = competences
    ? competences.split(',').map((c: string) => c.trim()).filter(Boolean)
    : [];

  const adminDb = createSupabaseAdminClient();

  const updatePayload: Record<string, unknown> = {
    prenom,
    nom,
    role,
    competences: competencesArr,
    bio,
    lien,
    ordre: Number.isNaN(ordre) ? 0 : ordre,
  };

  // Upload nouvelle photo si fournie
  if (photo instanceof File && photo.size > 0) {
    if (!ALLOWED_MIME.has(photo.type)) {
      return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Format de photo invalide (JPEG, PNG, WebP ou AVIF uniquement).'));
    }
    if (photo.size > MAX_PHOTO_SIZE) {
      return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Photo trop volumineuse (max 2 Mo).'));
    }
    const publicUrl = await uploadPhoto(adminDb, id, photo);
    if (publicUrl) updatePayload.photo_url = publicUrl;
  }

  const { error } = await adminDb.from('benevoles').update(updatePayload).eq('id', id);

  if (error) {
    console.error('[benevoles/update]', error.message);
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Erreur lors de la mise à jour.'));
  }

  return redirect('/dashboard/admin/trombinoscope?saved=1');
};
