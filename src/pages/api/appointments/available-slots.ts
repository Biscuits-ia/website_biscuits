import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/appointments/available-slots?date=YYYY-MM-DD
 *
 * Renvoie les créneaux (`appointment_slots`) réellement disponibles pour une date :
 *   1. Sélectionne les slots dont `is_available = true` et `start_time` ∈ [date 00:00, date 23:59] UTC.
 *   2. Exclut ceux qui ont déjà un `volunteer_appointments` actif (`pending` ou `confirmed`).
 *   3. Mappe vers `HH:mm` (en UTC pour rester aligné sur le `start_time` stocké en timestamptz).
 */
export const GET: APIRoute = async ({ url, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    const dateParam = url.searchParams.get('date');
    const timezone = url.searchParams.get('timezone') || 'Europe/Paris';

    if (!dateParam) {
      return jsonError('Paramètre "date" requis (format: YYYY-MM-DD)', 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return jsonError('Format de date invalide (utiliser YYYY-MM-DD)', 400);
    }

    // Bornes de la journée en UTC
    const dayStart = `${dateParam}T00:00:00Z`;
    const dayEnd = `${dateParam}T23:59:59.999Z`;

    // 1. Tous les slots dispos de la journée
    const { data: slots, error: slotsErr } = await supabase
      .from('appointment_slots')
      .select('id, start_time, end_time')
      .eq('is_available', true)
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .order('start_time', { ascending: true });

    if (slotsErr) {
      console.error('[available-slots] error fetching slots:', slotsErr);
      return jsonError('Erreur lors de la récupération des créneaux', 500);
    }

    if (!slots || slots.length === 0) {
      return jsonSlots(dateParam, timezone, []);
    }

    // 2. Slots déjà réservés par un RDV actif (pending|confirmed)
    const slotIds = slots.map((s) => s.id);
    const { data: taken, error: takenErr } = await supabase
      .from('volunteer_appointments')
      .select('slot_id')
      .in('status', ['pending', 'confirmed'])
      .in('slot_id', slotIds);

    if (takenErr) {
      console.error('[available-slots] error fetching taken slots:', takenErr);
      return jsonError('Erreur lors de la récupération des créneaux', 500);
    }

    const takenIds = new Set((taken ?? []).map((t) => t.slot_id).filter(Boolean));

    // 3. Formate en HH:mm (UTC, cohérent avec le timestamptz BDD)
    const availableSlots = slots
      .filter((s) => !takenIds.has(s.id))
      .map((s) => ({
        id: s.id,
        time: toHHmm(s.start_time),
        start_time: s.start_time,
        end_time: s.end_time,
        available: true as const,
      }));

    return jsonSlots(dateParam, timezone, availableSlots);
  } catch (err) {
    console.error('[available-slots] unexpected error:', err);
    return jsonError('Erreur interne du serveur', 500);
  }
};

function toHHmm(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function jsonSlots(date: string, timezone: string, slots: Array<Record<string, unknown>>) {
  return new Response(
    JSON.stringify({
      date,
      timezone,
      slots,
      available_count: slots.length,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
