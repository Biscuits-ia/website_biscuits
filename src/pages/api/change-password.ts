import type { APIRoute } from 'astro';
import { createSupabaseClient } from '@/lib/supabase';
import { createSupabaseAdminClient } from '@/lib/supabase';

type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: ChangePasswordBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Corps de la requête invalide.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { currentPassword, newPassword, confirmPassword } = body;

  // Validation
  if (!currentPassword || !newPassword || !confirmPassword) {
    return new Response(JSON.stringify({ message: 'Veuillez remplir tous les champs.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (newPassword !== confirmPassword) {
    return new Response(JSON.stringify({ message: 'Les nouveaux mots de passe ne correspondent pas.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (newPassword.length < 6) {
    return new Response(JSON.stringify({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Créer un client avec les cookies pour vérifier l'utilisateur
  const supabase = createSupabaseClient({ request, cookies });

  // Vérifier le mot de passe actuel
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ message: 'Utilisateur non authentifié.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Essayer de se reconnecter avec le mot de passe actuel pour le vérifier
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: currentPassword,
  });

  if (loginError) {
    return new Response(JSON.stringify({ message: 'Le mot de passe actuel est incorrect.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Changer le mot de passe avec l'API Admin
  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.auth.admin.updateUser(user.id, {
    password: newPassword,
  });

  if (error) {
    return new Response(JSON.stringify({ message: 'Erreur lors du changement de mot de passe : ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message: 'Mot de passe modifié avec succès.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
