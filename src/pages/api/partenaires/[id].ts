import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const GET: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier que c'est publié ou que l'utilisateur est admin
    if (!data.is_published) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return new Response(
          JSON.stringify({ error: 'Not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
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

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier que l'utilisateur est authentifié et admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
      .update({
        name: body.name,
        description: body.description,
        collaboration: body.collaboration,
        logo_url: body.logo_url,
        website_url: body.website_url,
        expertise: body.expertise,
        display_order: body.display_order,
        is_published: body.is_published,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

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

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });
    const { id } = params;

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'ID requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier que l'utilisateur est authentifié et admin
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

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

    const { error } = await supabase
      .from('partners')
      .delete()
      .eq('id', id);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
