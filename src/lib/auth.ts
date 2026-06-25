// src/lib/auth.ts

import { createSupabaseClient, createSupabaseAdminClient } from './supabase';
import type { AstroGlobal, APIContext } from 'astro';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { VolunteerAppointment } from '@/types/appointments';

type AuthContext = AstroGlobal | APIContext;

export type UserRole = 'user' | 'moderator' | 'admin' | 'benevole' | 'association';

export interface AuthResult {
  user: User;
  session: null; // Toujours null côté serveur
  supabase: SupabaseClient;
  role: UserRole;
}

// ─── Helper safe pour getUser() ──────────────────────────────────────────────

/**
 * Wrapper autour de getUser() qui gère proprement refresh_token_not_found.
 * 
 * Pourquoi : getUser() peut déclencher un refresh si l'access token est expiré.
 * Si le refresh_token a été révoqué (par le browser SDK ou une autre lambda),
 * on obtient refresh_token_not_found. On catch cette erreur et on retourne
 * user: null pour forcer une déconnexion propre.
 */
async function safeGetUser(supabase: SupabaseClient): Promise<{ user: User | null; error: any }> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      // Si l'erreur est refresh_token_not_found, on traite comme user: null
      if (error.code === 'refresh_token_not_found' || error.status === 400) {
        console.warn('[auth] refresh_token_not_found → déconnexion forcée');
        return { user: null, error };
      }
      return { user: null, error };
    }
    return { user, error: null };
  } catch (err: any) {
    // Catch les erreurs non gérées par le SDK
    if (err?.code === 'refresh_token_not_found' || err?.status === 400) {
      console.warn('[auth] refresh_token_not_found (catch) → déconnexion forcée');
      return { user: null, error: err };
    }
    throw err;
  }
}

// ─── Helpers Admin ────────────────────────────────────────────────────────────

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

function isUserRole(value: unknown): value is UserRole {
  return (
    value === 'user' ||
    value === 'moderator' ||
    value === 'admin' ||
    value === 'benevole' ||
    value === 'association'
  );
}

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
 * 
 * CORRECTIONS :
 * - Utilisation de safeGetUser() pour catcher refresh_token_not_found
 * - SUPPRESSION de getSession() (cause principale de l'erreur)
 * - session est toujours null côté serveur
 */
export async function requireAuth(Astro: AuthContext): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  // ✅ Utilise safeGetUser() au lieu de getUser() directement
  const { user, error } = await safeGetUser(supabase);
  if (error || !user) {
    // Si refresh_token_not_found, on force la déconnexion
    if (error?.code === 'refresh_token_not_found') {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
    }
    return Astro.redirect('/connexion');
  }

  const role = (await fetchRoleSecure(user.id)) ?? 'user';

  // ❌ PAS de getSession() ici
  return { user, session: null, supabase, role };
}

export async function requireRole(
  Astro: AuthContext,
  allowed: ReadonlyArray<UserRole>,
): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);

  // ✅ Utilise safeGetUser() au lieu de getUser() directement
  const { user, error } = await safeGetUser(supabase);
  if (error || !user) {
    if (error?.code === 'refresh_token_not_found') {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }
    }
    return Astro.redirect('/connexion');
  }

  const role = await fetchRoleSecure(user.id);
  if (!role || !allowed.includes(role)) {
    return Astro.redirect('/dashboard/user');
  }

  // ❌ PAS de getSession() ici
  return { user, session: null, supabase, role };
}

export function requireAdmin(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['admin']);
}

export function requireModerator(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['moderator', 'admin']);
}

export function requireBenevole(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['benevole', 'moderator', 'admin']);
}

export function requireAssociation(Astro: AuthContext): Promise<AuthResult | Response> {
  return requireRole(Astro, ['association', 'moderator', 'admin']);
}

// ─── Vérification propriétaire RDV ────────────────────────────────────────────

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