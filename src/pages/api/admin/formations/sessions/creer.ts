// ============================================================================
// src/pages/api/admin/formations/sessions/creer.ts
// ----------------------------------------------------------------------------
// Cree une session pour une formation (admin uniquement).
// ============================================================================

import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { getFormString } from '@/types/formations';
import { trainingSessionUpsertSchema, uuidSchema } from '@/lib/formations';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

  const form = await request.formData();
  const trainingIdRaw = getFormString(form, 'training_id') ?? '';

  const trainingIdParsed = uuidSchema.safeParse(trainingIdRaw);
  if (!trainingIdParsed.success) {
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Identifiant formation invalide.')}`,
    );
  }

  const raw = {
    training_id:             trainingIdParsed.data,
    starts_at:               getFormString(form, 'starts_at') ?? '',
    ends_at:                 getFormString(form, 'ends_at') ?? '',
    location:                getFormString(form, 'location') ?? undefined,
    online:                  getFormString(form, 'online') === 'on' || getFormString(form, 'online') === 'true',
    max_seats:               getFormString(form, 'max_seats') ?? '12',
    is_published:            getFormString(form, 'is_published') === 'on' || getFormString(form, 'is_published') === 'true',
    allow_sliding_scale:     getFormString(form, 'allow_sliding_scale') === 'on' || getFormString(form, 'allow_sliding_scale') === 'true',
    allow_sponsorship:       getFormString(form, 'allow_sponsorship') === 'on' || getFormString(form, 'allow_sponsorship') === 'true',
    allow_free_request:      getFormString(form, 'allow_free_request') === 'on' || getFormString(form, 'allow_free_request') === 'true',
    helloasso_form_url:      getFormString(form, 'helloasso_form_url') ?? undefined,
    bank_transfer_info:      getFormString(form, 'bank_transfer_info') ?? undefined,
    override_min_cents:      getFormString(form, 'override_min_cents') ?? undefined,
    override_suggested_cents: getFormString(form, 'override_suggested_cents') ?? undefined,
    override_solidarity_cents: getFormString(form, 'override_solidarity_cents') ?? undefined,
  };

  const parsed = trainingSessionUpsertSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Donnees invalides.';
    return redirect(`/dashboard/admin/formations?error=${encodeURIComponent(msg)}`);
  }

  // Verifie la coherence des dates
  if (new Date(parsed.data.ends_at) <= new Date(parsed.data.starts_at)) {
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('La date de fin doit etre apres la date de debut.')}`,
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('training_sessions')
    .insert({
      training_id:             parsed.data.training_id,
      starts_at:               new Date(parsed.data.starts_at).toISOString(),
      ends_at:                 new Date(parsed.data.ends_at).toISOString(),
      location:                parsed.data.location ?? null,
      online:                  parsed.data.online ?? false,
      max_seats:               parsed.data.max_seats ?? 12,
      is_published:            parsed.data.is_published ?? false,
      allow_sliding_scale:     parsed.data.allow_sliding_scale ?? true,
      allow_sponsorship:       parsed.data.allow_sponsorship ?? true,
      allow_free_request:      parsed.data.allow_free_request ?? true,
      helloasso_form_url:      parsed.data.helloasso_form_url ?? null,
      bank_transfer_info:      parsed.data.bank_transfer_info ?? null,
      override_min_cents:      parsed.data.override_min_cents ?? null,
      override_suggested_cents: parsed.data.override_suggested_cents ?? null,
      override_solidarity_cents: parsed.data.override_solidarity_cents ?? null,
    });

  if (error) {
    console.error('[admin/formations/sessions/creer] insert error:', error.message);
    return redirect(
      `/dashboard/admin/formations?error=${encodeURIComponent('Erreur lors de la creation de la session.')}`,
    );
  }

  return redirect('/dashboard/admin/formations?saved=1');
};