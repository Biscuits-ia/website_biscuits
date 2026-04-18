import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';

export const GET: APIRoute = async ({ request }) => {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('is_published', true)
      .order('display_order', { ascending: true });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    // Vérifier que l'utilisateur est authentifié et admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier le rôle admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from('partners')
      .insert([
        {
          name: body.name,
          description: body.description,
          collaboration: body.collaboration,
          logo_url: body.logo_url,
          website_url: body.website_url,
          expertise: body.expertise || [],
          display_order: body.display_order || 0,
          is_published: body.is_published !== false,
        },
      ])
      .select();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
