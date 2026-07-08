// src/pages/api/admin/sessions/creer.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { getFormString } from '@/types/ateliers';
import { isValidUUID } from '@/lib/validation';

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;
  const { user: _user } = auth;
  const { request, redirect } = Astro;

  const form        = await request.formData();
  const workshopId  = getFormString(form, 'workshop_id');
  const startsAt    = getFormString(form, 'starts_at');
  const endsAt      = getFormString(form, 'ends_at');
  const location    = getFormString(form, 'location')?.trim() || null;
  const maxSeatsRaw = getFormString(form, 'max_seats') ?? '15';
  const isPublished = form.get('is_published') === 'true';
  const online      = form.get('online') === 'true';
  // Prix de substitution (laissé null si vide = hérite de l'atelier)
  const priceRaw    = getFormString(form, 'price_cents')?.trim();
  const priceLabel  = getFormString(form, 'price_label')?.trim() || null;

  if (!isValidUUID(workshopId)) {
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('ID atelier invalide.'));
  }
  if (!startsAt || !endsAt) {
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('Les dates de début et fin sont obligatoires.'));
  }

  const maxSeats   = Math.max(1, Number.parseInt(maxSeatsRaw, 10) || 15);
  const priceCents = priceRaw !== '' && priceRaw !== undefined
    ? Math.max(0, Number.parseInt(priceRaw, 10) || 0)
    : null;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('workshop_sessions')
    .insert({
      workshop_id:  workshopId,
      starts_at:    new Date(startsAt).toISOString(),
      ends_at:      new Date(endsAt).toISOString(),
      location,
      max_seats:    maxSeats,
      is_published: isPublished,
      online,
      price_cents:  priceCents,
      price_label:  priceLabel,
    });

  if (error) {
    console.error('[admin/sessions/creer]', error.message);
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('Erreur lors de la création de la session.'));
  }

  return redirect('/dashboard/admin/ateliers?saved=1');
};
