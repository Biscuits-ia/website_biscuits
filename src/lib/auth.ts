// src/lib/auth.ts
//
// Helpers d'authentification pour les pages Astro et les routes API.
// Source de vrit du rle = table `profiles` (lecture via service_role).
//
// Historique : ce fichier contenait 4 guards quasi-identiques
// (requireAdmin / requireModerator / requireBenevole / requireAssociation).
// Refactor : tout passe dsormais par `requireRole(Astro, [...roles])`.
// Les wrappers publics restent exports pour rtrocompatibilit avec les
// call-sites existants (cf. AUDIT-FRESH.md 7.2).

import { createSupabaseClient, createSupabaseAdminClient } from './supabase';
import type { AstroGlobal, APIContext } from 'astro';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

// AstroGlobal (contexte page .astro) et APIContext (contexte route API)
// exposent la mme surface utilise par les guards ci-dessous
// (locals, request, cookies, redirect). L'union vite les casts en
// `as any` / `as unknown as AstroGlobal` dans les 18+ call-sites.
type AuthContext = AstroGlobal | APIContext;

// Supprime un utilisateur de Supabase Auth via l'API Admin.
// Ncessite la cl service_role (jamais ct client).
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

// Retire le rle "benevole"  l'utilisateur (le passe  "user").
// Utilise le client admin pour bypass les RLS.
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

// Cre un profil association pour l'utilisateur connect.
// Utilise le client admin pour bypass les RLS.
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
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = createSupabaseAdminClient();

    const { data: existingAssoc } = await adminClient
      .from('associations')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingAssoc) {
      return { success: false, error: 'Vous avez dj un profil association.' };
    }

    const { error: assocError } = await adminClient
      .from('associations')
      .insert({
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
      return { success: false, error: 'Erreur lors de la cration du profil association.' };
    }

    const { error: requestError } = await adminClient
      .from('association_requests')
      .insert({
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

// Types

export type UserRole = 'user' | 'moderator' | 'admin' | 'benevole' | 'association';

export interface AuthResult {
  user:     User;
  session:  Session | null;
  supabase: SupabaseClient;
  role:     UserRole;
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'user'
      || value === 'moderator'
      || value === 'admin'
      || value === 'benevole'
      || value === 'association';
}

// Helper interne : fetch du rle via le service role (bypass RLS).
//
// SCURIT : on utilise le client admin (service_role) pour lire le rle.
// Cela garantit que mme si les RLS policies sur `profiles` sont mal
// configures, la vrification du rle ne peut pas tre contourne ct
// client. Le client anon ne peut pas lever ses propres privilges.

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

// Guards
// ============================================================================

/**
 * Vrifie que l'utilisateur est connect.
 * Retourne un AuthResult ou une Response de redirection.
 *
 * SCURIT :
 * - getUser() valide le JWT auprs du serveur Supabase Auth (pas de lecture
 *   locale du token)  rsistant au token forg.
 * - Le rle est lu via le client service_role, insensible aux RLS policies.
 */
export async function requireAuth(Astro: AuthContext): Promise<AuthResult | Response> {
  // Rutiliser le client stock par le middleware (mme instance = mme session
  // en mmoire, avec le token rafrachi si ncessaire), sinon en crer un.
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id) ?? 'user';

  const { data: { session } } = await supabase.auth.getSession();

  return { user, session, supabase, role };
}

/**
 * Garde gnrique paramtre par les rles autoriss.
 * Source de vrit pour toutes les guards bases sur le rle.
 *
 * Rduit la duplication entre requireAdmin / requireModerator /
 * requireBenevole / requireAssociation. Tous les call-sites existants
 * continuent de fonctionner via les wrappers ci-dessous.
 *
 * @param Astro   contexte Astro (page .astro ou route API)
 * @param allowed rles autoriss (ex : ['admin'])
 */
export async function requireRole(
  Astro: AuthContext,
  allowed: ReadonlyArray<UserRole>,
): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id);

  if (!role || !allowed.includes(role)) {
    // Ne pas rvler l'existence du dashboard cible  redirection neutre.
    return Astro.redirect('/dashboard/user');
  }

  const { data: { session } } = await supabase.auth.getSession();

  return { user, session, supabase, role };
}

/** Garde admin  equivalente  requireRole(Astro, ['admin']). Conserve pour rtrocompatibilit. */
export function requireAdmin(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['admin']);
}

/** Garde moderator  equivalente  requireRole(Astro, ['moderator', 'admin']). */
export function requireModerator(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['moderator', 'admin']);
}

/** Garde bnvole  equivalente  requireRole(Astro, ['benevole', 'moderator', 'admin']). */
export function requireBenevole(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['benevole', 'moderator', 'admin']);
}

/** Garde association  equivalente  requireRole(Astro, ['association', 'moderator', 'admin']). */
export function requireAssociation(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['association', 'moderator', 'admin']);
}

// Vrifie que `apptId` existe et que le caller est autoris  le manipuler :
//   - admin / moderator ? tous les RDV ;
//   - user             ? uniquement les RDV dont il est `user_id`.
//
// Retourne un discriminated union :
//   - { ok: true,  appointment } ? autoris, ligne charge ;
//   - { ok: false, status: 404 } ? RDV introuvable ;
//   - { ok: false, status: 403 } ? RDV trouv mais caller non propritaire.
import type { VolunteerAppointment } from '@/types/appointments';

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
