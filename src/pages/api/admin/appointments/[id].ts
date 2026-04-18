import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    
    // Vérifier que l'utilisateur est admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 403 });
    }

    const body = await request.json() as { status: 'confirmed' | 'cancelled' };
    
    if (!body.status || !['confirmed', 'cancelled'].includes(body.status)) {
      return new Response(
        JSON.stringify({ error: 'Statut invalide' }),
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('volunteer_appointments')
      .update({ status: body.status })
      .eq('id', params.id)
      .select('*')
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
