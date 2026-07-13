// src/pages/api/admin/benevoles/create.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_PHOTO_SIZE = 2 * 1024 * 1024; // 2 Mo

export const POST: APIRoute = async (context) => {
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { request, redirect } = context;
  const form = await request.formData();

  const prenom      = (form.get('prenom') as string | null)?.trim() ?? '';
  const nom         = (form.get('nom') as string | null)?.trim() ?? '';
  const role        = (form.get('role') as string | null)?.trim() ?? '';
  const competences = (form.get('competences') as string | null)?.trim() ?? '';
  const bio         = (form.get('bio') as string | null)?.trim() || null;
  const lien        = (form.get('lien') as string | null)?.trim() || null;
  const ordre       = Number.parseInt((form.get('ordre') as string | null) ?? '0', 10);
  const actif       = form.get('actif') === 'true';
  const photo       = form.get('photo');

  if (!prenom || !nom) {
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Prénom et nom requis.'));
  }

  const validRoles = ['benevole', 'membre_ca', 'membre_bureau'];
  if (!validRoles.includes(role)) {
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Rôle invalide.'));
  }

  // Parse competences
  const competencesArr = competences
    ? competences.split(',').map((c: string) => c.trim()).filter(Boolean)
    : [];

  const adminDb = createSupabaseAdminClient();

  // Insérer d'abord pour obtenir l'id
  const { data: inserted, error: insertError } = await adminDb
    .from('benevoles')
    .insert({
      prenom,
      nom,
      role,
      competences: competencesArr,
      bio,
      lien,
      ordre: Number.isNaN(ordre) ? 0 : ordre,
      actif,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[benevoles/create]', insertError?.message);
    return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Erreur lors de la création.'));
  }

  // Upload photo si fournie
  if (photo instanceof File && photo.size > 0) {
    if (!ALLOWED_MIME.has(photo.type)) {
      return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Format de photo invalide (JPEG, PNG, WebP ou AVIF uniquement).'));
    }
    if (photo.size > MAX_PHOTO_SIZE) {
      return redirect('/dashboard/admin/trombinoscope?error=' + encodeURIComponent('Photo trop volumineuse (max 2 Mo).'));
    }

    const ext      = photo.type.split('/')[1].replace('jpeg', 'jpg');
    const path     = `${inserted.id}/avatar.${ext}`;
    const buffer   = await photo.arrayBuffer();

    const { error: storageError } = await adminDb.storage
      .from('benevoles')
      .upload(path, buffer, { contentType: photo.type, upsert: true });

    if (storageError) {
      console.error('[benevoles/create] storage upload:', storageError.message);
    } else {
      const { data: urlData } = adminDb.storage.from('benevoles').getPublicUrl(path);
      await adminDb.from('benevoles').update({ photo_url: urlData.publicUrl }).eq('id', inserted.id);
    }
  }

  return redirect('/dashboard/admin/trombinoscope?saved=1');
};
