import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const POST: APIRoute = async (context) => {
  const supabase = createSupabaseClient(context);
  await supabase.auth.signOut();

  context.cookies.delete('sb-access-token', { path: '/' });
  context.cookies.delete('sb-refresh-token', { path: '/' });

  return context.redirect('/connexion');
};