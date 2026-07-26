import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
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
    if (typeof body.title === 'string') {
      const trimmed = body.title.trim();
      if (trimmed.length > 200) {
        return new Response(JSON.stringify({ error: 'Le titre est trop long (max 200 caractères)' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      allowed.title = trimmed || null;
    }

    if (Object.keys(allowed).length === 0) {
      return new Response(JSON.stringify({ error: 'Aucun champ valide à mettre à jour' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Bypass RLS pour lire/ecrire tous les creneaux (meme is_available = false),
    // comme le fait POST /api/appointment-slots. L'admin est deja verifie.
    const adminDb = createSupabaseAdminClient();

    const { data: current, error: currentErr } = await adminDb
      .from('appointment_slots')
      .select('id, start_time, end_time')
      .eq('id', id)
      .maybeSingle();

    if (currentErr) throw currentErr;
    if (!current) {
      return new Response(JSON.stringify({ error: 'Créneau introuvable' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Meme validation que la creation : coherence temporelle + anti-chevauchement.
    if (allowed.start_time !== undefined || allowed.end_time !== undefined) {
      const nextStart = String(allowed.start_time ?? current.start_time);
      const nextEnd = String(allowed.end_time ?? current.end_time);
      const startMs = Date.parse(nextStart);
      const endMs = Date.parse(nextEnd);
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) {
        return new Response(JSON.stringify({ error: 'Plage horaire invalide (start_time < end_time requis)' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { data: overlap, error: overlapErr } = await adminDb
        .from('appointment_slots')
        .select('id')
        .neq('id', id)
        .lt('start_time', nextEnd)
        .gt('end_time', nextStart)
        .limit(1)
        .maybeSingle();

      if (overlapErr) throw overlapErr;
      if (overlap) {
        return new Response(JSON.stringify({ error: 'Ce créneau chevauche un créneau existant.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const { data, error } = await adminDb
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

    const adminDb = createSupabaseAdminClient();

    // La FK volunteer_appointments.slot_id est ON DELETE SET NULL : supprimer un
    // creneau reserve ne supprime PAS le RDV, il le rend orphelin (slot_id NULL)
    // et donc invisible dans "Mes reservations" cote user. On refuse plutot que
    // de faire disparaitre silencieusement un rendez-vous accepte.
    const { data: active, error: activeErr } = await adminDb
      .from('volunteer_appointments')
      .select('id')
      .eq('slot_id', id)
      .in('status', ['pending', 'confirmed'])
      .limit(1)
      .maybeSingle();

    if (activeErr) throw activeErr;
    if (active) {
      return new Response(
        JSON.stringify({ error: 'Ce créneau a une réservation active. Annulez d\'abord la réservation depuis la vue Tableau.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { error } = await adminDb
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
