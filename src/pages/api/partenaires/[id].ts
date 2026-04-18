import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { validateHttpUrl } from '@/lib/validation';

/** Construit le payload de mise à jour des partenaires avec whitelist + validation. */
function buildPartnerUpdatePayload(
  body: Record<string, unknown>,
): { payload: Record<string, unknown> | null; error: string | null } {
  const logoUrl = body.logo_url === undefined ? undefined : validateHttpUrl(body.logo_url);
  const websiteUrl = body.website_url === undefined ? undefined : validateHttpUrl(body.website_url);

  if (body.logo_url !== undefined && logoUrl === null) {
    return { payload: null, error: 'logo_url doit être une URL http(s) valide' };
  }
  if (body.website_url !== undefined && websiteUrl === null) {
    return { payload: null, error: 'website_url doit être une URL http(s) valide' };
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') payload.name = body.name.slice(0, 200);
  if (typeof body.description === 'string') payload.description = body.description.slice(0, 2000);
  if (typeof body.collaboration === 'string') payload.collaboration = body.collaboration.slice(0, 2000);
  if (logoUrl !== undefined) payload.logo_url = logoUrl;
  if (websiteUrl !== undefined) payload.website_url = websiteUrl;
  if (typeof body.expertise === 'string') payload.expertise = body.expertise.slice(0, 500);
  if (typeof body.display_order === 'number') payload.display_order = body.display_order;
  if (typeof body.is_published === 'boolean') payload.is_published = body.is_published;

  return { payload, error: null };
}

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
    console.error('[partenaires GET]', err);
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

    const body = await request.json() as Record<string, unknown>;

    const { payload: updatePayload, error: validationError } = buildPartnerUpdatePayload(body);
    if (validationError || !updatePayload) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data, error } = await supabase
      .from('partners')
      .update(updatePayload)
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
    console.error('[partenaires PUT]', err);
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
    console.error('[partenaires DELETE]', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
