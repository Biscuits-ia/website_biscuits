// src/pages/api/admin/resources/upload.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { getFormString } from '@/lib/formData';

// `image/svg+xml` a ete RETIRE le 2026-07-08.
//
// Un SVG est un document XML actif : il peut porter `<script>`, `onload=`,
// `<foreignObject>`. Servi sur une origine ou l'on a une session, c'est une XSS
// stockee. Aujourd'hui les fichiers sortent via une signed URL *.supabase.co
// (cross-origin, donc contenu), mais brancher un domaine custom sur le bucket
// suffirait a rendre la faille exploitable en same-origin.
// Si un SVG doit vraiment etre accepte un jour : passer par DOMPurify cote
// serveur, ou le rasteriser.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'video/mp4',
  'video/webm',
]);

/**
 * Signatures binaires (magic bytes) des types dont l'entete est fiable.
 *
 * `file.type` provient du FormData du navigateur : c'est une DECLARATION du
 * client, pas une mesure. Un attaquant envoie du HTML avec
 * `type: "application/pdf"` et passe la validation.
 *
 * On verifie donc l'entete reelle pour les formats a signature stable. Les
 * formats sans signature exploitable (text/*, csv, markdown) sont laisses au
 * seul controle de `file.type` : ils sont inertes ET servis en piece jointe.
 */
const MAGIC_BYTES: Record<string, readonly number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]], // GIF8
  // ZIP local file header. Couvre aussi docx/xlsx/pptx, qui sont des ZIP.
  'application/zip': [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
  ],
};
const ZIP_BASED = new Set([
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** `true` si l'entete du fichier correspond au type declare (ou si le type n'a pas de signature). */
function magicBytesMatch(declaredType: string, header: Uint8Array): boolean {
  // RIFF....WEBP : la signature est en deux morceaux, on la traite a part.
  if (declaredType === 'image/webp') {
    const riff = [0x52, 0x49, 0x46, 0x46];
    const webp = [0x57, 0x45, 0x42, 0x50];
    return riff.every((b, i) => header[i] === b) && webp.every((b, i) => header[8 + i] === b);
  }

  const key = ZIP_BASED.has(declaredType) ? 'application/zip' : declaredType;
  const signatures = MAGIC_BYTES[key];
  if (!signatures) return true; // Pas de signature connue : rien a verifier.

  return signatures.some((sig) => sig.every((byte, i) => header[i] === byte));
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 Mo

export const POST: APIRoute = async (context) => {
  // ── Auth : admin uniquement ──────────────────────────────────────────────
  const auth = await requireAdmin(context);
  if (auth instanceof Response) return auth;

  const { request, redirect } = context;
  const { user } = auth;
  const adminDb = createSupabaseAdminClient();

  // ── Lecture du formulaire ────────────────────────────────────────────────
  const form = await request.formData();
  const title = getFormString(form, 'title');
  const description = getFormString(form, 'description');
  const category = getFormString(form, 'category');
  const isPublished = form.get('is_published') === 'true';
  const file = form.get('file');

  if (!title || !category) {
    return redirect(
      '/dashboard/admin/resources?error=' + encodeURIComponent('Titre et catégorie requis.')
    );
  }

  if (!(file instanceof File) || file.size === 0) {
    return redirect('/dashboard/admin/resources?error=' + encodeURIComponent('Fichier invalide.'));
  }

  // ── Validation fichier ───────────────────────────────────────────────────
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return redirect(
      '/dashboard/admin/resources?error=' + encodeURIComponent('Type de fichier non autorisé.')
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return redirect(
      '/dashboard/admin/resources?error=' +
        encodeURIComponent('Fichier trop volumineux (max 50 Mo).')
    );
  }

  const fileBuffer = await file.arrayBuffer();

  // Le type declare doit correspondre a l'entete reelle du fichier.
  if (!magicBytesMatch(file.type, new Uint8Array(fileBuffer.slice(0, 16)))) {
    console.warn('[upload] magic bytes mismatch:', {
      declared: file.type,
      name: file.name,
      user: user.id,
    });
    return redirect(
      '/dashboard/admin/resources?error=' +
        encodeURIComponent('Le contenu du fichier ne correspond pas à son type.')
    );
  }

  // ── Upload vers Supabase Storage ─────────────────────────────────────────
  // Chemin : {userId}/{timestamp}-{nom-nettoyé}
  const safeName = file.name.replaceAll(/[^a-zA-Z0-9.\-_]/g, '_');
  const filePath = `${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await adminDb.storage
    .from('resources')
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('[upload] Supabase storage error:', uploadError.message);
    return redirect(
      '/dashboard/admin/resources?error=' +
        encodeURIComponent("Erreur lors de l'upload du fichier.")
    );
  }

  // ── Insertion en BDD ─────────────────────────────────────────────────────
  const { error: insertError } = await adminDb.from('resources').insert({
    title: title.trim(),
    description: description?.trim() ?? null,
    category: category.trim(),
    file_path: filePath,
    file_name: file.name,
    file_size: file.size,
    file_type: file.type,
    is_published: isPublished,
    created_by: user.id,
  });

  if (insertError) {
    // Rollback : supprimer le fichier uploadé si l'insertion échoue
    await adminDb.storage.from('resources').remove([filePath]);
    console.error('[upload] Supabase insert error:', insertError.message);
    return redirect(
      '/dashboard/admin/resources?error=' +
        encodeURIComponent("Erreur lors de l'enregistrement de la ressource.")
    );
  }

  return redirect('/dashboard/admin/resources?saved=1');
};
