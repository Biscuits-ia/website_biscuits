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

    // Vérifier que l'utilisateur n'a pas déjà réservé ce créneau
    const { data: existing } = await supabase
      .from('volunteer_appointments')
      .select('*')
      .eq('slot_id', slot_id)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Vous avez déjà réservé ce créneau' }),
        { status: 409 }
      );
    }

    // Créer la réservation
    const { data: appointment, error: appointmentError } = await supabase
      .from('volunteer_appointments')
      .insert([
        {
          slot_id,
          user_id: user.id,
          status: 'pending',
          notes: body.notes || null,
        },
      ])
      .select()
      .single();

    if (appointmentError) throw appointmentError;

    return new Response(JSON.stringify(appointment), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Erreur:', err);
    return new Response(JSON.stringify({ error: 'Erreur' }), { status: 500 });
  }
};
