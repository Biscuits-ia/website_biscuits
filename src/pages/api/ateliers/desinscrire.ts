// src/pages/api/ateliers/desinscrire.ts
import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { getFormString }        from '@/types/ateliers';
import { isValidUUID } from '@/lib/validation';
import { getRequestIp, verifyTurnstileToken } from '@/lib/turnstile';

async function validateTurnstile(request: Request, fallbackIp?: string): Promise<boolean> {
  const form = await request.formData();
  const turnstileToken = getFormString(form, 'turnstileToken') ?? '';
  const ip = getRequestIp(request, fallbackIp);

  return verifyTurnstileToken(turnstileToken, ip);
}

export const POST: APIRoute = async ({ request, cookies, redirect, clientAddress }) => {
  const supabase = createSupabaseClient({ request, cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect('/connexion');

  const isTokenValid = await validateTurnstile(request.clone(), clientAddress);
  if (!isTokenValid) {
    return redirect(
      '/dashboard/user/ateliers?error=' + encodeURIComponent('Vérification anti-bot invalide ou expirée.'),
    );
  }

  const form      = await request.formData();
  const sessionId = getFormString(form, 'session_id');

  if (!isValidUUID(sessionId)) {
    return new Response('session_id invalide', { status: 400 });
  }

  const { error } = await supabase
    .from('workshop_registrations')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[desinscrire] Supabase error:', error.message);
    return redirect(
      '/dashboard/user/ateliers?error=' + encodeURIComponent('Erreur lors de la désinscription.'),
    );
  }

  return redirect('/dashboard/user/ateliers?saved=1');
};