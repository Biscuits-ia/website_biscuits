import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { isValidUUID } from '@/lib/validation';

const MAX_NOTES = 1000;

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    
    // Récupérer l'utilisateur actuel
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    const { data, error } = await supabase
      .from('volunteer_appointments')
      .select('*, appointment_slots(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Erreur:', err);
    return new Response(JSON.stringify({ error: 'Erreur' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    
    // Récupérer l'utilisateur actuel
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    const body = await request.json();
    const { slot_id } = body;

    if (!isValidUUID(slot_id)) {
      return new Response(JSON.stringify({ error: 'slot_id invalide' }), { status: 400 });
    }

    if (body.notes && typeof body.notes === 'string' && body.notes.length > MAX_NOTES) {
      return new Response(JSON.stringify({ error: `Notes trop longues (max ${MAX_NOTES} caractères)` }), { status: 400 });
    }

    // Vérifier que le créneau existe et est disponible
    const { data: slot, error: slotError } = await supabase
      .from('appointment_slots')
      .select('*')
      .eq('id', slot_id)
      .eq('is_available', true)
      .single();

    if (slotError || !slot) {
      return new Response(
        JSON.stringify({ error: 'Créneau non disponible' }),
        { status: 404 }
      );
    }

    // Vérifier que l'utilisateur n'a pas déjà réservé ce créneau (pending OU confirmed)
    const { data: existing } = await supabase
      .from('volunteer_appointments')
      .select('id, status')
      .eq('slot_id', slot_id)
      .eq('user_id', user.id)
      .in('status', ['pending', 'confirmed'])
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Vous avez déjà réservé ce créneau' }),
        { status: 409 }
      );
    }

    // Anti-double-booking serveur : aucun autre user n'a un RDV actif sur ce slot
    const { data: conflict } = await supabase
      .from('volunteer_appointments')
      .select('id')
      .eq('slot_id', slot_id)
      .in('status', ['pending', 'confirmed'])
      .neq('user_id', user.id)
      .maybeSingle();

    if (conflict) {
      return new Response(
        JSON.stringify({ error: 'Ce créneau vient d\'être réservé par quelqu\'un d\'autre.' }),
        { status: 409 }
      );
    }

    // Créer la réservation. Le partial unique index `uniq_active_appointment_per_slot`
    // (cf. migration.sql) protège contre la race condition si deux POST concurrents
    // passent les deux checks ci-dessus en même temps : on récupère alors un code 23505.
    try {
      const { data: appointment, error: appointmentError } = await supabase
        .from('volunteer_appointments')
        .insert({
          slot_id,
          user_id: user.id,
          status: 'pending',
          notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
        })
        .select()
        .single();

      if (appointmentError) throw appointmentError;

      return new Response(JSON.stringify(appointment), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: unknown) {
      // Erreur Postgres "unique_violation" = 23505 (race post-checks)
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Ce créneau vient d\'être réservé par quelqu\'un d\'autre.' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error('[user-appointments POST] error:', err);
    return new Response(JSON.stringify({ error: 'Erreur' }), { status: 500 });
  }
};
