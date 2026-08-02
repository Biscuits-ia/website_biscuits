import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';
import { validateHttpUrl } from '@/lib/validation';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const GET: APIRoute = async () => {
  try {
    const supabase = createSupabaseAdminClient();

    // Colonnes enumerees plutot que '*' : cet endpoint est public. Avec '*',
    // toute colonne ajoutee plus tard a `partners` (note interne, contact,
    // montant de convention...) serait publiee sans qu'aucune revue ne le
    // signale. `is_published` est omis : le filtre ci-dessous le fixe a true.
    const { data, error } = await supabase
      .from('partners')
      .select('id, name, description, collaboration, logo_url, website_url, expertise, display_order')
      .eq('is_published', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('[partenaires] GET error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[partenaires] GET error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const supabase = createSupabaseClient({ request, cookies });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: JSON_HEADERS });
    }

    const role = await fetchRoleSecure(user.id);
    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 403, headers: JSON_HEADERS });
    }

    const body = await request.json() as Record<string, unknown>;

    if (typeof body.name !== 'string' || !body.name.trim()) {
      return new Response(JSON.stringify({ error: 'name est requis' }), { status: 400, headers: JSON_HEADERS });
    }

    const logoUrl = body.logo_url === undefined ? undefined : validateHttpUrl(body.logo_url);
    const websiteUrl = body.website_url === undefined ? undefined : validateHttpUrl(body.website_url);

    if (body.logo_url !== undefined && logoUrl === null) {
      return new Response(JSON.stringify({ error: 'logo_url doit être une URL http(s) valide' }), { status: 400, headers: JSON_HEADERS });
    }
    if (body.website_url !== undefined && websiteUrl === null) {
      return new Response(JSON.stringify({ error: 'website_url doit être une URL http(s) valide' }), { status: 400, headers: JSON_HEADERS });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('partners')
      .insert([{
        name: String(body.name).slice(0, 200),
        description: typeof body.description === 'string' ? body.description.slice(0, 2000) : null,
        collaboration: typeof body.collaboration === 'string' ? body.collaboration.slice(0, 2000) : null,
        logo_url: logoUrl ?? null,
        website_url: websiteUrl ?? null,
        expertise: Array.isArray(body.expertise) ? body.expertise : [],
        display_order: typeof body.display_order === 'number' ? body.display_order : 0,
        is_published: body.is_published !== false,
      }])
      .select();

    if (error) {
      console.error('[partenaires] POST insert error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify(data), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[partenaires] POST error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500, headers: JSON_HEADERS });
  }
};
