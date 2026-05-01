import type { APIRoute } from 'astro';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async (context) => {
  const supabase = createSupabaseClient(context);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const adminSupabase = createSupabaseAdminClient();
      const { error } = await adminSupabase
        .from('profiles')
        .update({ last_logout_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) {
        console.error('[auth/deconnexion] failed to set last_logout_at:', error.message);
      }
    }
  } catch (error) {
    console.error('[auth/deconnexion] failed to mark logout timestamp:', error);
  }

  await supabase.auth.signOut({ scope: 'global' });

  return context.redirect('/connexion');
};