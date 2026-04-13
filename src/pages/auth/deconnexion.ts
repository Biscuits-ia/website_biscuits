import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';

export const GET: APIRoute = async (context) => {
  const supabase = createSupabaseClient(context);
  await supabase.auth.signOut();
  return context.redirect('/connexion');
};