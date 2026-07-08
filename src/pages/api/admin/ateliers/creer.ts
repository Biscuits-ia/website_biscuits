// src/pages/api/admin/ateliers/creer.ts
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { getFormString } from '@/types/ateliers';

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;
  const { user: _user } = auth;
  const { request, redirect } = Astro;

  const form        = await request.formData();
  const title       = getFormString(form, 'title')?.trim() ?? '';
  const description = getFormString(form, 'description')?.trim() || null;
  const category    = getFormString(form, 'category')?.trim() || null;
  const level       = getFormString(form, 'level')?.trim() || null;
  const priceRaw    = getFormString(form, 'price_cents') ?? '0';
  const priceLabel  = getFormString(form, 'price_label')?.trim() || null;

  if (!title) {
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('Le titre est obligatoire.'));
  }

  const priceCents = Math.max(0, Number.parseInt(priceRaw, 10) || 0);
  const isFree = priceCents === 0;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('workshops')
    .insert({ title, description, category, level, price_cents: priceCents, price_label: priceLabel, is_free: isFree });

  if (error) {
    console.error('[admin/ateliers/creer]', error.message);
    return redirect('/dashboard/admin/ateliers?error=' + encodeURIComponent('Erreur lors de la création.'));
  }

  return redirect('/dashboard/admin/ateliers?saved=1');
};
