import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;
    const body = await request.json();

    const { data, error } = await supabase
      .from('appointment_slots')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Erreur:', err);
    return new Response(JSON.stringify({ error: 'Erreur' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;

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
    console.error('Erreur:', err);
    return new Response(JSON.stringify({ error: 'Erreur' }), { status: 500 });
  }
};
