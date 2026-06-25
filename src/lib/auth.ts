// src/lib/auth.ts
//
// Helpers d'authentification pour les pages Astro et les routes API.
// Source de vérité du rôle = table `profiles` (lecture via service_role).
//
// RÈGLE D'OR (doc officielle Supabase SSR) :
// → Côté serveur : UNIQUEMENT getUser(). Jamais getSession().
// → getSession() peut déclencher un refresh interne si l'access token
//   est expiré → cause directe de "refresh_token_not_found" sur Vercel.

import { createSupabaseClient, createSupabaseAdminClient } from './supabase';
import type { AstroGlobal, APIContext } from 'astro';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';
import type { VolunteerAppointment } from '@/types/appointments';

// AstroGlobal (contexte page .astro) et APIContext (contexte route API)
// exposent la même surface utilisée par les guards ci-dessous
// (locals, request, cookies, redirect). L'union évite les casts en
// `as any` / `as unknown as AstroGlobal` dans les 18+ call-sites.
type AuthContext = AstroGlobal | APIContext;

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'moderator' | 'admin' | 'benevole' | 'association';

export interface AuthResult {
  user: User;
  session: Session | null; // Toujours null côté serveur (pas de getSession())
  supabase: SupabaseClient;
  role: UserRole;
}

function isUserRole(value: unknown): value is UserRole {
  return (
    value === 'user' ||
    value === 'moderator' ||
    value === 'admin' ||
    value === 'benevole' ||
    value === 'association'
  );
}

// ─── Helpers Admin ────────────────────────────────────────────────────────────

/**
 * Supprime un utilisateur de Supabase Auth via l'API Admin.
 * Nécessite la clé service_role (jamais côté client).
 */
export async function deleteUserFromSupabase(userId: string): Promise<boolean> {
  try {
    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      console.error('[auth] deleteUserFromSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[auth] deleteUserFromSupabase exception:', err);
    return false;
  }
}

/**
 * Retire le rôle "benevole" à l'utilisateur (le passe à "user").
 * Utilise le client admin pour bypass les RLS.
 */
export async function stopBeingBenevole(userId: string): Promise<boolean> {
  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient
    .from('profiles')
    .update({ role: 'user' })
    .eq('id', userId);
  if (error) {
    console.error('[auth] stopBeingBenevole error:', error.message);
    return false;
  }
  return true;
}

/**
 * Crée un profil association pour l'utilisateur connecté.
 * Utilise le client admin pour bypass les RLS.
 */
export async function createAssociation(
  userId: string,
  data: {
    structure_name: string;
    siret?: string | null;
    rna_number?: string | null;
    address: string;
    phone_number: string;
    contact_email: string;
    description?: string | null;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = createSupabaseAdminClient();

    const { data: existingAssoc } = await adminClient
      .from('associations')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingAssoc) {
      return { success: false, error: 'Vous avez déjà un profil association.' };
    }

    const { error: assocError } = await adminClient.from('associations').insert({
      id: userId,
      structure_name: data.structure_name,
      siret: data.siret || null,
      rna_number: data.rna_number || null,
      address: data.address,
      phone_number: data.phone_number,
      contact_email: data.contact_email,
      description: data.description || null,
      is_verified: false,
    });

    if (assocError) {
      console.error('[auth] createAssociation error:', assocError.message);
      return { success: false, error: 'Erreur lors de la création du profil association.' };
    }

    const { error: requestError } = await adminClient.from('association_requests').insert({
      structure_name: data.structure_name,
      siret: data.siret || null,
      rna_number: data.rna_number || null,
      address: data.address,
      phone_number: data.phone_number,
      contact_email: data.contact_email,
      description: data.description || null,
      status: 'pending',
    });

    if (requestError) {
      console.error('[auth] createAssociation request error:', requestError.message);
    }

    return { success: true };
  } catch (err) {
    console.error('[auth] createAssociation exception:', err);
    return { success: false, error: 'Erreur serveur.' };
  }
}

// ─── Fetch rôle sécurisé ──────────────────────────────────────────────────────

/**
 * Helper interne : fetch du rôle via le service role (bypass RLS).
 *
 * SÉCURITÉ : on utilise le client admin (service_role) pour lire le rôle.
 * Cela garantit que même si les RLS policies sur `profiles` sont mal
 * configurées, la vérification du rôle ne peut pas être contournée côté
 * client. Le client anon ne peut pas lever ses propres privilèges.
 */
export async function fetchRoleSecure(userId: string): Promise<UserRole | null> {
  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error || !data) {
    console.error('[auth] fetchRoleSecure error:', error?.message);
    return null;
  }
  const role = data.role;
  return isUserRole(role) ? role : 'user';
}

// ─── Guards ───────────────────────────────────────────────────────────────────

/**
 * Vérifie que l'utilisateur est connecté.
 * Retourne un AuthResult ou une Response de redirection.
 *
 * SÉCURITÉ :
 * - getUser() valide le JWT auprès du serveur Supabase Auth (pas de lecture
 *   locale du token) → résistant au token forgé.
 * - Le rôle est lu via le client service_role, insensible aux RLS policies.
 * - PAS de getSession() : éviterait refresh_token_not_found sur Vercel.
 *   Le client `supabase` contient déjà la session via les cookies.
 */
export async function requireAuth(Astro: AuthContext): Promise<AuthResult | Response> {
  // Réutiliser le client stocké par le middleware (même instance = même session
  // en mémoire, avec le token rafraîchi si nécessaire), sinon en créer un.
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  // ✅ RÈGLE D'OR : UNIQUEMENT getUser() côté serveur
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return Astro.redirect('/connexion');
  }

  const role = (await fetchRoleSecure(user.id)) ?? 'user';

  // ❌ PAS de getSession() ici — cause directe de refresh_token_not_found
  return { user, session: null, supabase, role };
}

/**
 * Garde générique paramétré par les rôles autorisés.
 * Source de vérité pour toutes les guards basées sur le rôle.
 *
 * @param Astro   contexte Astro (page .astro ou route API)
 * @param allowed rôles autorisés (ex : ['admin'])
 */
export async function requireRole(
  Astro: AuthContext,
  allowed: ReadonlyArray<UserRole>,
): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  // ✅ RÈGLE D'OR : UNIQUEMENT getUser() côté serveur
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id);
  if (!role || !allowed.includes(role)) {
    // Ne pas révéler l'existence du dashboard cible → redirection neutre.
    return Astro.redirect('/dashboard/user');
  }

  // ❌ PAS de getSession() ici — cause directe de refresh_token_not_found
  return { user, session: null, supabase, role };
}

/** Garde admin — équivalente à requireRole(Astro, ['admin']). */
export function requireAdmin(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['admin']);
}

/** Garde moderator — équivalente à requireRole(Astro, ['moderator', 'admin']). */
export function requireModerator(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['moderator', 'admin']);
}

/** Garde bénévole — équivalente à requireRole(Astro, ['benevole', 'moderator', 'admin']). */
export function requireBenevole(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['benevole', 'moderator', 'admin']);
}

/** Garde association — équivalente à requireRole(Astro, ['association', 'moderator', 'admin']). */
export function requireAssociation(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['association', 'moderator', 'admin']);
}

// ─── Vérification propriétaire RDV ────────────────────────────────────────────

/**
 * Vérifie que `apptId` existe et que le caller est autorisé à le manipuler :
 *   - admin / moderator → tous les RDV ;
 *   - user             → uniquement les RDV dont il est `user_id`.
 */
export async function requireAppointmentOwner(
  supabase: SupabaseClient,
  apptId: string,
  userId: string,
  isAdminOrModerator: boolean,
): Promise<
  | { ok: true; appointment: VolunteerAppointment }
  | { ok: false; status: 404 | 403 }
> {
  const { data, error } = await supabase
    .from('volunteer_appointments')
    .select('*')
    .eq('id', apptId)
    .maybeSingle();
  if (error) {
    console.error('[requireAppointmentOwner] select error:', error.message);
    return { ok: false, status: 404 };
  }
  if (!data) {
    return { ok: false, status: 404 };
  }
  if (!isAdminOrModerator && data.user_id !== userId) {
    return { ok: false, status: 403 };
  }
  return { ok: true, appointment: data as VolunteerAppointment };
}