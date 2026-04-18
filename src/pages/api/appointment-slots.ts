import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    console.log('📋 GET /api/appointment-slots: Début');
    const supabase = createSupabaseClient({ request, cookies });

    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('❌ Non authentifié');
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }
    console.log('✅ User:', user.id);

    // Récupérer le rôle
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('❌ Erreur profil:', profileError);
      return new Response(JSON.stringify({ error: 'Profil non trouvé' }), { status: 400 });
    }
    console.log('✅ Rôle:', profile?.role);

    // Admin voit tous les créneaux, utilisateurs voient que les disponibles
    let query = supabase.from('appointment_slots').select('*');
    
    if (profile?.role !== 'admin') {
      query = query.eq('is_available', true);
    }
    
    const { data, error } = await query.order('start_time', { ascending: true });

    if (error) {
      console.error('❌ Erreur Supabase:', error);
      throw error;
    }

    console.log('✅ Créneaux trouvés:', data?.length || 0);
    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ Erreur GET:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    console.log('📝 POST /api/appointment-slots: Début');
    const supabase = createSupabaseClient({ request, cookies });
    const body = await request.json();
    const { start_time, end_time } = body;
    console.log('📝 Body:', { start_time, end_time });

    // Vérifier l'authentification
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('❌ Non authentifié');
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }
    console.log('✅ User:', user.id);

    // Vérifier le rôle
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      console.error('❌ Accès refusé: pas admin');
      return new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403 });
    }

    if (!start_time || !end_time) {
      return new Response(
        JSON.stringify({ error: 'start_time et end_time requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('appointment_slots')
      .insert([{ start_time, end_time, is_available: true }])
      .select()
      .single();

    if (error) {
      console.error('❌ Erreur insertion:', error);
      throw error;
    }

    console.log('✅ Créneau créé:', data.id);
    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ Erreur POST:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
