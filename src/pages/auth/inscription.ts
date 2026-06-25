import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { EMAIL_RE, validatePassword } from '@/lib/validation';

function mapSignupError(message: string): string {
  const msg = message.toLowerCase();

  if (msg.includes('already') || msg.includes('registered')) {
    return 'Cet email est deja inscrit. Essayez de vous connecter.';
  }
  if (msg.includes('password')) {
    return 'Mot de passe invalide. Utilisez au moins 8 caracteres.';
  }
  if (msg.includes('signup') && msg.includes('disabled')) {
    return 'Les inscriptions sont actuellement desactivees.';
  }
  if (msg.includes('rate') || msg.includes('security purposes') || msg.includes('too many')) {
    return 'Trop de tentatives. Reessayez dans quelques minutes.';
  }
  if (msg.includes('redirect') || msg.includes('allow list') || msg.includes('allowlist') || msg.includes('uri')) {
    return 'Configuration de redirection invalide. Contactez l\'administrateur.';
  }

  return 'Impossible de creer le compte. Veuillez reessayer.';
}

const JSON_HDR = { 'Content-Type': 'application/json' } as const;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HDR });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) {
      return jsonError('Configuration Supabase manquante (SUPABASE_URL/SUPABASE_ANON_KEY).', 500);
    }

    const formData = await request.formData();
    const email = formData.get('email') instanceof File ? null : (formData.get('email') as string | null);
    const password = formData.get('password') instanceof File ? null : (formData.get('password') as string | null);

    if (!email || !password) {
      return jsonError('Email et mot de passe requis.', 400);
    }

    // Validation cote serveur (defense in depth : un client contourne
    // facilement la validation JS du formulaire).
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail) || trimmedEmail.length > 255) {
      return jsonError('Adresse email invalide.', 400);
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return jsonError(passwordError, 400);
    }

    const supabase = createSupabaseClient({ request, cookies });

    const signupResult = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    });

    if (signupResult.error) {
      console.error('[Auth] signUp error:', signupResult.error.message);
      return jsonError(mapSignupError(signupResult.error.message), 400);
    }

    // Supabase can mask existing accounts by returning user with empty identities.
    const identities = signupResult.data.user?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      return jsonError('Cet email est deja inscrit. Essayez de vous connecter.', 409);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Compte cree. Verifiez votre email pour recuperer le code de confirmation.' }),
      { status: 200, headers: JSON_HDR },
    );
  } catch (err) {
    console.error('[Auth] inscription route error:', err);
    return jsonError('Erreur serveur. Veuillez reessayer.', 500);
  }
};
