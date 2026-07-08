// ============================================================================
// src/pages/api/admin/formations/modifier.ts
// ----------------------------------------------------------------------------
// Modifie une formation (admin uniquement). Re-genere le slug si le titre change.
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { getFormString } from '@/types/formations';
import { trainingUpsertSchema, generateUniqueSlug, uuidSchema } from '@/lib/formations';

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;
  const { user: _user } = auth;
  const { request, redirect } = Astro;

  const form = await request.formData();
  const idRaw = getFormString(form, 'training_id') ?? '';

  const idParsed = uuidSchema.safeParse(idRaw);
  if (!idParsed.success) {
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Identifiant invalide.')}`,
    );
  }

  const raw = {
    title:                  getFormString(form, 'title') ?? '',
    short_description:      getFormString(form, 'short_description') ?? undefined,
    description:            getFormString(form, 'description') ?? undefined,
    category:               getFormString(form, 'category') ?? undefined,
    level:                  getFormString(form, 'level') ?? undefined,
    duration_label:         getFormString(form, 'duration_label') ?? undefined,
    is_paying:              getFormString(form, 'is_paying') === 'on' || getFormString(form, 'is_paying') === 'true',
    min_price_cents:        getFormString(form, 'min_price_cents') ?? '0',
    suggested_price_cents:  getFormString(form, 'suggested_price_cents') ?? '0',
    solidarity_price_cents: getFormString(form, 'solidarity_price_cents') ?? '0',
    is_published:           getFormString(form, 'is_published') === 'on' || getFormString(form, 'is_published') === 'true',
    display_order:          getFormString(form, 'display_order') ?? '0',
    cover_image_url:        getFormString(form, 'cover_image_url') ?? undefined,
  };

  const parsed = trainingUpsertSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return redirect(`/dashboard/admin/formations?error=${encodeURIComponent(msg)}`);
  }

  const admin = createSupabaseAdminClient();

  // Recupere la formation pour comparer le titre (slug a regenerer ?)
  const { data: current, error: currentErr } = await admin
    .from('trainings')
    .select('title')
    .eq('id', idParsed.data)
    .single();

  if (currentErr || !current) {
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Formation introuvable.')}`,
    );
  }

  let newSlug: string | undefined;
  if (current.title !== parsed.data.title) {
    try {
      newSlug = await generateUniqueSlug(admin, parsed.data.title, idParsed.data);
    } catch (err) {
      console.error('[admin/formations/modifier] slug error:', err);
    }
  }

  const { error } = await admin
    .from('trainings')
    .update({
      ...(newSlug ? { slug: newSlug } : {}),
      title:                  parsed.data.title,
      short_description:      parsed.data.short_description ?? null,
      description:            parsed.data.description ?? null,
      category:               parsed.data.category ?? null,
      level:                  parsed.data.level ?? null,
      duration_label:         parsed.data.duration_label ?? null,
      is_paying:              parsed.data.is_paying ?? true,
      min_price_cents:        parsed.data.min_price_cents,
      suggested_price_cents:  parsed.data.suggested_price_cents,
      solidarity_price_cents: parsed.data.solidarity_price_cents,
      is_published:           parsed.data.is_published ?? false,
      display_order:          parsed.data.display_order ?? 0,
      cover_image_url:        parsed.data.cover_image_url ?? null,
    })
    .eq('id', idParsed.data);

  if (error) {
    console.error('[admin/formations/modifier] update error:', error.message);
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Erreur lors de la modification.')}`,
    );
  }

  return redirect('/dashboard/admin/formations?saved=1');
};