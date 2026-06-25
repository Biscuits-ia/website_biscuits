// ============================================================================
// src/pages/api/admin/formations/creer.ts
// ----------------------------------------------------------------------------
// Cree une formation dans le catalogue (admin uniquement).
// Genere un slug unique a partir du titre.
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { getFormString } from '@/types/formations';
import { trainingUpsertSchema, generateUniqueSlug } from '@/lib/formations';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

  const form = await request.formData();
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

  // Genere un slug unique
  let slug: string;
  try {
    slug = await generateUniqueSlug(admin, parsed.data.title);
  } catch (err) {
    console.error('[admin/formations/creer] slug error:', err);
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Impossible de generer un slug. Verifiez le titre.')}`,
    );
  }

  const { error } = await admin
    .from('trainings')
    .insert({
      slug:                   slug,
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
    });

  if (error) {
    console.error('[admin/formations/creer] insert error:', error.message);
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Erreur lors de la creation.')}`,
    );
  }

  return redirect('/dashboard/admin/formations?saved=1');
};