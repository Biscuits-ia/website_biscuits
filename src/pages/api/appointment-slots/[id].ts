import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { isValidUUID } from '@/lib/validation';

/** Vérifie que l'appelant est admin. Retourne null si ok, sinon une Response d'erreur. */
async function requireAdmin(
  request: Request,
  cookies: Parameters<typeof createSupabaseClient>[0]['cookies'],
): Promise<Response | null> {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Accès refusé' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  try {
    const denied = await requireAdmin(request, cookies);
    if (denied) return denied;

    const { id } = params;
    if (!id || !isValidUUID(id)) {
      return new Response(JSON.stringify({ error: 'ID invalide' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json() as Record<string, unknown>;

    // Whitelist des champs modifiables
    const allowed: Record<string, unknown> = {};
    if (typeof body.start_time === 'string') allowed.start_time = body.start_time;
    if (typeof body.end_time === 'string') allowed.end_time = body.end_time;
    if (typeof body.is_available === 'boolean') allowed.is_available = body.is_available;

    if (Object.keys(allowed).length === 0) {
      return new Response(JSON.stringify({ error: 'Aucun champ valide à mettre à jour' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseClient({ request, cookies });
    const { data, error } = await supabase
      .from('appointment_slots')
      .update(allowed)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[appointment-slots PATCH]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  try {
    const denied = await requireAdmin(request, cookies);
    if (denied) return denied;

    const { id } = params;
    if (!id || !isValidUUID(id)) {
      return new Response(JSON.stringify({ error: 'ID invalide' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseClient({ request, cookies });
    const { error } = await supabase
      .from('appointment_slots')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[appointment-slots DELETE]', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
