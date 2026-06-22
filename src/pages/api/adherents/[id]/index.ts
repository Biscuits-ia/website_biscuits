import type { APIRoute } from 'astro';
import {
  buildAccessMetadata,
  getAdherentsAuthContext,
  hasAnyRole,
  jsonError,
  jsonOk,
  logAdherentOperation,
  validateAdherentPayload,
} from '@/lib/adherentsApi';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, params, clientAddress }) => {
  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!result.ok) return jsonError('Non autorise.', result.status);
  if (rateLimitResponse) return rateLimitResponse;
  const ctx = result.ctx;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier', 'lecture_seule'])) {
    return jsonError('Acces refuse.', 403);
  }

  const adherentId = (params.id ?? '').trim();
  if (!adherentId) return jsonError('id manquant.');

  const { data, error } = await ctx.adminSupabase
    .from('adherents')
    .select('id, nom, prenom, email, telephone, adresse, date_adhesion, statut, created_at, updated_at, adherent_tags(tag_id, tags(id, label)), adherent_groupes(groupe_id, groupes(id, nom))')
    .eq('id', adherentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return jsonError('Adherent introuvable.', 404);
    console.error('[api/adherents/:id] get error:', error.message);
    return jsonError('Erreur lors du chargement.', 500);
  }

  return jsonOk({ data });
};

export const PUT: APIRoute = async ({ request, cookies, params, clientAddress }) => {
  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!result.ok) return jsonError('Non autorise.', result.status);
  if (rateLimitResponse) return rateLimitResponse;
  const ctx = result.ctx;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier'])) {
    return jsonError('Acces refuse.', 403);
  }

  const adherentId = (params.id ?? '').trim();
  if (!adherentId) return jsonError('id manquant.');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError('Corps JSON invalide.');
  }

  const { payload, error: validationError } = validateAdherentPayload(body, true);
  if (validationError || !payload) return jsonError(validationError ?? 'Donnees invalides.');
  if (Object.keys(payload).length === 0) return jsonError('Aucune donnee a mettre a jour.');

  const access = buildAccessMetadata(request, clientAddress);

  // Fetch old data for audit log
  const { data: oldData } = await ctx.adminSupabase
    .from('adherents')
    .select('nom, prenom, email, telephone, adresse, date_adhesion, statut')
    .eq('id', adherentId)
    .single();

  const { error } = await ctx.adminSupabase
    .from('adherents')
    .update(payload)
    .eq('id', adherentId);

  if (error) {
    if (error.code === '23505') return jsonError('Cet email existe deja.', 409);
    console.error('[api/adherents/:id] update error:', error.message);
    return jsonError('Erreur lors de la mise a jour.', 500);
  }

  // Log operation
  await logAdherentOperation(
    ctx.adminSupabase,
    'UPDATE_ADHERENT',
    {
      old: oldData,
      new: payload,
      utilisateur_id: ctx.userId,
      access,
      meta: { adherentId, changedFields: Object.keys(payload) },
    }
  );

  return jsonOk({ ok: true });
};

export const DELETE: APIRoute = async ({ request, cookies, params, clientAddress }) => {
  const { result, rateLimitResponse } = await getAdherentsAuthContext(request, cookies, clientAddress);
  if (!result.ok) return jsonError('Non autorise.', result.status);
  if (rateLimitResponse) return rateLimitResponse;
  const ctx = result.ctx;
  if (!hasAnyRole(ctx.roles, ['admin', 'tresorier'])) {
    return jsonError('Acces refuse.', 403);
  }

  const adherentId = (params.id ?? '').trim();
  if (!adherentId) return jsonError('id manquant.');

  const access = buildAccessMetadata(request, clientAddress);

  // Log operation before delete
  await logAdherentOperation(
    ctx.adminSupabase,
    'DELETE_ADHERENT',
    {
      old: { id: adherentId },
      new: null,
      utilisateur_id: ctx.userId,
      access,
      meta: { adherentId },
    }
  );

  const { error } = await ctx.adminSupabase
    .from('adherents')
    .delete()
    .eq('id', adherentId);

  if (error) {
    console.error('[api/adherents/:id] delete error:', error.message);
    return jsonError('Erreur lors de la suppression.', 500);
  }

  return jsonOk({ ok: true });
};
