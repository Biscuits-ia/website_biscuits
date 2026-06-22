// ── deleteUserFromSupabase : supprime un utilisateur via Supabase Auth Admin API ─────────────
/**
 * Supprime un utilisateur de Supabase Auth (table users) via l'API Admin.
 * Nécessite la clé service_role (jamais côté client !).
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

import { createSupabaseClient, createSupabaseAdminClient } from './supabase';
import type { AstroGlobal, APIContext } from 'astro';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

// `AstroGlobal` (contexte d'une page .astro) et `APIContext` (contexte d'une
// route API) exposent la même surface utilisée par les guards ci-dessous
// (`locals`, `request`, `cookies`, `redirect`). En acceptant l'union des deux,
// on supprime le besoin de caster en `as any` / `as unknown as AstroGlobal`
// dans les 18+ call-sites.
type AuthContext = AstroGlobal | APIContext;

// ── stopBeingBenevole : enlève le rôle bénévole à un utilisateur ─────────────
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

// ── createAssociation : crée un profil association pour un utilisateur ─────────────
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
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = createSupabaseAdminClient();

    // Vérifier si l'utilisateur a déjà une association
    const { data: existingAssoc } = await adminClient
      .from('associations')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingAssoc) {
      return { success: false, error: 'Vous avez déjà un profil association.' };
    }

    // Créer l'enregistrement dans la table associations
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
        is_verified: false
      });

    if (assocError) {
      console.error('[auth] createAssociation error:', assocError.message);
      return { success: false, error: 'Erreur lors de la création du profil association.' };
    }

    // Créer la demande d'inscription
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
        status: 'pending'
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

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'moderator' | 'admin' | 'benevole' | 'association';

export interface AuthResult {
  user:     User;
  session:  Session | null;
  supabase: SupabaseClient;
  role:     UserRole;
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isUserRole(value: unknown): value is UserRole {
  return value === 'user' || value === 'moderator' || value === 'admin' || value === 'benevole' || value === 'association';
}

// ── Helper interne : fetch du rôle via le service role (bypass RLS) ───────────
//
// SÉCURITÉ : on utilise le client admin (service_role) pour lire le rôle.
// Cela garantit que même si les RLS policies sur `profiles` sont mal
// configurées, la vérification du rôle ne peut pas être contournée côté client.
// Le client anon ne peut pas élever ses propres privilèges.

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

// ── requireAuth ───────────────────────────────────────────────────────────────

/**
 * Vérifie que l'utilisateur est connecté.
 * Retourne un AuthResult ou une Response de redirection.
 *
 * SÉCURITÉ :
 * - `getUser()` valide le JWT auprès du serveur Supabase Auth (pas de lecture
 *   locale du token) — résistant au token forgé.
 * - Le rôle est lu via le client service_role, insensible aux RLS policies.
 */
export async function requireAuth(Astro: AuthContext): Promise<AuthResult | Response> {
  // Réutiliser le client stocké par le middleware (même instance = même session
  // en mémoire, avec le token rafraîchi si nécessaire), sinon en créer un.
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id) ?? 'user';

  const { data: { session } } = await supabase.auth.getSession();

  return { user, session, supabase, role };
}

// ── requireAdmin ──────────────────────────────────────────────────────────────

/**
 * Vérifie que l'utilisateur est connecté ET a le rôle `admin`.
 * Retourne un AuthResult ou une Response de redirection.
 *
 * SÉCURITÉ :
 * - Double vérification : JWT valide côté Supabase Auth + rôle en BDD.
 * - Le rôle est lu via service_role → bypass RLS → infalsifiable côté client.
 * - Pas de lecture du rôle depuis le JWT (claims) : un JWT avec un claim
 *   `role: admin` forgé ne passe pas, seule la BDD fait foi.
 */
export async function requireAdmin(Astro: AuthContext): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    console.error('[requireAdmin] auth failed — error:', error?.message ?? 'no user');
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id);

  if (role !== 'admin') {
    console.error('[requireAdmin] role check failed — userId:', user.id, '— role:', role);
    // Ne pas révéler l'existence du dashboard admin — redirection neutre
    return Astro.redirect('/dashboard/user');
  }

  const { data: { session } } = await supabase.auth.getSession();

  return { user, session, supabase, role };
}

// ── requireModerator ──────────────────────────────────────────────────────────

/**
 * Vérifie que l'utilisateur est connecté ET a le rôle `moderator` ou `admin`.
 */
export async function requireModerator(Astro: AuthContext): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id);

  if (role !== 'moderator' && role !== 'admin') {
    return Astro.redirect('/dashboard/user');
  }

  const { data: { session } } = await supabase.auth.getSession();

  return { user, session, supabase, role };
}

// ── requireBenevole ───────────────────────────────────────────────────────────

/**
 * Vérifie que l'utilisateur est connecté ET a le rôle `benevole`, `moderator` ou `admin`.
 * Retourne un AuthResult ou une Response de redirection.
 */
export async function requireBenevole(Astro: AuthContext): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id);

  if (role !== 'benevole' && role !== 'moderator' && role !== 'admin') {
    return Astro.redirect('/dashboard/user');
  }

  const { data: { session } } = await supabase.auth.getSession();

  return { user, session, supabase, role };
}

// ── requireAssociation ───────────────────────────────────────────────────────

/**
 * Vérifie que l'utilisateur est connecté ET a le rôle `association`, `admin` ou `moderator`.
 * Retourne un AuthResult ou une Response de redirection.
 */
export async function requireAssociation(Astro: AuthContext): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id);

  if (role !== 'association' && role !== 'admin' && role !== 'moderator') {
    return Astro.redirect('/dashboard/user');
  }

  const { data: { session } } = await supabase.auth.getSession();

  return { user, session, supabase, role };
}

// ── requireAppointmentOwner ───────────────────────────────────────────────────

import type { VolunteerAppointment } from '@/types/appointments';

/**
 * Vérifie que `apptId` existe et que le caller est autorisé à le manipuler :
 *   - admin / moderator → tous les RDV ;
 *   - user             → uniquement les RDV dont il est `user_id`.
 *
 * Retourne un discriminated union :
 *   - { ok: true,  appointment } → autorisé, ligne chargée ;
 *   - { ok: false, status: 404 } → RDV introuvable ;
 *   - { ok: false, status: 403 } → RDV trouvé mais caller non propriétaire.
 *
 * Pattern identique aux autres guards (`requireAuth`, `requireAdmin`).
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