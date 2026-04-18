import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export interface AvailableSlotsRequest {
  date: string; // YYYY-MM-DD
  timezone?: string;
  duration_minutes?: number;
  start_hour?: number;
  end_hour?: number;
}

export interface TimeSlot {
  time: string; // HH:mm
  available: boolean;
}

/**
 * GET /api/appointments/available-slots?date=YYYY-MM-DD&timezone=Europe/Paris
 * Retourne les créneaux disponibles pour une date donnée
 *
 * Configuration par défaut:
 * - Créneau: 9h - 18h
 * - Durée: 60 minutes
 * - Interval: 30 minutes
 */
export const GET: APIRoute = async ({ url, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    const dateParam = url.searchParams.get('date');
    const timezone = url.searchParams.get('timezone') || 'Europe/Paris';
    const durationMinutes = parseInt(url.searchParams.get('duration_minutes') || '60');
    const startHour = parseInt(url.searchParams.get('start_hour') || '9');
    const endHour = parseInt(url.searchParams.get('end_hour') || '18');

    if (!dateParam) {
      return new Response(
        JSON.stringify({ error: 'Paramètre "date" requis (format: YYYY-MM-DD)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Valider le format de la date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return new Response(
        JSON.stringify({ error: 'Format de date invalide (utiliser YYYY-MM-DD)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer tous les rendez-vous confirmés pour cette date
    const dateStart = `${dateParam}T00:00:00Z`;
    const dateEnd = `${dateParam}T23:59:59Z`;

    const { data: bookedSlots, error } = await supabase
      .from('volunteer_appointments')
      .select('selected_date')
      .eq('status', 'booked')
      .gte('selected_date', dateStart)
      .lte('selected_date', dateEnd);

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (normal)
      console.error('Error fetching booked slots:', error);
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la récupération des créneaux' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Convertir les rendez-vous confirmés en timestamps
    const bookedTimes = new Set(
      (bookedSlots || []).map((slot) => {
        if (!slot.selected_date) return null;
        const date = new Date(slot.selected_date);
        return date.getTime();
      })
    );
    bookedTimes.delete(null);

    // Générer les créneaux disponibles
    const slots: TimeSlot[] = [];

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        const slotDateTime = new Date(`${dateParam}T${timeStr}:00.000Z`);
        const slotTime = slotDateTime.getTime();

        // Vérifier si ce créneau est réservé
        const isBooked = bookedTimes.has(slotTime);

        slots.push({
          time: timeStr,
          available: !isBooked,
        });
      }
    }

    return new Response(
      JSON.stringify({
        date: dateParam,
        timezone,
        slots,
        available_count: slots.filter((s) => s.available).length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error fetching available slots:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
