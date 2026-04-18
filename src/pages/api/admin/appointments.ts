import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const GET: APIRoute = async ({ request, cookies }) => {
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

    // Récupérer toutes les réservations avec les détails des utilisateurs et créneaux
    const { data, error } = await supabase
      .from('volunteer_appointments')
      .select(`
        *,
        appointment_slots(*),
        user_profile:profiles(full_name, email)
      `)
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
