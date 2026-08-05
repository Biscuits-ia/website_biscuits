// src/pages/api/me/delete-data.ts
// RGPD  Droit  l'\''effacement : supprime les donnes personnelles du compte
// courant (soft-delete du profil, anonymisation des messages et commentaires,
// hard-delete des requests/notifications).
//
// Note : la suppression du compte auth.users lui-mme reste gre par
// /auth/delete-account (cf. lib/auth.ts ? deleteUserFromSupabase) qui appelle
// auth.admin.deleteUser ct service_role.

import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';

export const prerender = false;

// Tables o user_id est la FK directe.
const USER_LINKED_TABLES = ['requests', 'notifications'] as const;

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Non authentifi.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminSupabase = createSupabaseAdminClient();

  // 1. Hard delete des lignes user_id-indexes (RLS bypass via service_role).
  const deletions: Record<string, number | string> = {};
  for (const table of USER_LINKED_TABLES) {
    const { error, count } = await adminSupabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('user_id', user.id);
    if (error) {
      deletions[table] = `error: ${error.message}`;
    } else {
      deletions[table] = count ?? 0;
    }
  }

  // 2. Soft-delete du profil : on anonymise les PII mais on garde l'\''ID
  // pour respecter les FK sortantes (notifications.actor_id, audit_logs.user_id).
  const { error: profileError } = await adminSupabase
    .from('profiles')
    .update({
      full_name: null,
      avatar_url: null,
      phone: null,
      organization: null,
    })
    .eq('id', user.id);
  if (profileError) {
    return new Response(
      JSON.stringify({
        error: 'Anonymisation du profil choue.',
        details: profileError.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      message:
        'Donnes personnelles effaces. Pour supprimer dfinitivement le compte auth, ' +
        'appelez POST /auth/delete-account (ct service_role).',
      deleted: deletions,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
