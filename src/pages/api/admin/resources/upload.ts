// src/pages/api/admin/resources/upload.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getFormString } from '@/types/ateliers';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'text/csv',
  'video/mp4', 'video/webm',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 Mo

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  // ── Auth : admin uniquement ──────────────────────────────────────────────
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

  // ── Lecture du formulaire ────────────────────────────────────────────────
  const form        = await request.formData();
  const title       = getFormString(form, 'title');
  const description = getFormString(form, 'description');
  const category    = getFormString(form, 'category');
  const isPublished = form.get('is_published') === 'true';
  const file        = form.get('file');

  if (!title || !category) {
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Titre et catégorie requis.'));
  }

  if (!(file instanceof File) || file.size === 0) {
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Fichier invalide.'));
  }

  // ── Validation fichier ───────────────────────────────────────────────────
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Type de fichier non autorisé.'));
  }

  if (file.size > MAX_FILE_SIZE) {
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Fichier trop volumineux (max 50 Mo).'));
  }

  // ── Upload vers Supabase Storage ─────────────────────────────────────────
  // Chemin : {userId}/{timestamp}-{nom-nettoyé}
  const safeName  = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const filePath  = `${user.id}/${Date.now()}-${safeName}`;
  const fileBuffer = await file.arrayBuffer();

  const { error: uploadError } = await adminDb.storage
    .from('resources')
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('[upload] Supabase storage error:', uploadError.message);
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Erreur lors de l\'upload du fichier.'));
  }

  // ── Insertion en BDD ─────────────────────────────────────────────────────
  const { error: insertError } = await adminDb
    .from('resources')
    .insert({
      title:        title.trim(),
      description:  description?.trim() ?? null,
      category:     category.trim(),
      file_path:    filePath,
      file_name:    file.name,
      file_size:    file.size,
      file_type:    file.type,
      is_published: isPublished,
      created_by:   user.id,
    });

  if (insertError) {
    // Rollback : supprimer le fichier uploadé si l'insertion échoue
    await adminDb.storage.from('resources').remove([filePath]);
    console.error('[upload] Supabase insert error:', insertError.message);
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Erreur lors de l\'enregistrement de la ressource.'));
  }

  return redirect('/dashboard/admin/resources?saved=1');
};