// src/lib/auth.ts
import { createSupabaseClient, createSupabaseAdminClient } from './supabase';
import type { AstroGlobal, APIContext } from 'astro';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';
import type { VolunteerAppointment } from '@/types/appointments';

type AuthContext = AstroGlobal | APIContext;

export type UserRole = 'user' | 'moderator' | 'admin' | 'benevole' | 'association';

export interface AuthResult {
  user: User;
  session: Session | null; // Toujours null côté serveur
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

export async function requireAuth(Astro: AuthContext): Promise<AuthResult | Response> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return Astro.redirect('/connexion');
  }
  const role = (await fetchRoleSecure(user.id)) ?? 'user';
  
  // ✅ CORRECTION : session: null au lieu de getSession()
  return { user, session: null, supabase, role };
}

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
    return Astro.redirect('/dashboard/user');
  }
  
  // ✅ CORRECTION : session: null au lieu de getSession()
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

// --------------------------------------------------------------------------
// Variantes JSON des requireX : pour les endpoints API qui retournent du JSON
// (401/403) plutot qu'un redirect HTML 302. Les helpers ci-dessus (requireX)
// appellent Astro.redirect(), ce qui est adapte aux <form> POST navigateur
// mais casse les clients fetch() qui attendent un JSON d'erreur.
// --------------------------------------------------------------------------

type JsonAuthContext = Pick<APIContext, 'request' | 'cookies' | 'locals'>;

function jsonError(message: string, status: 401 | 403): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function requireJson(
  ctx: JsonAuthContext,
  allowed: ReadonlyArray<UserRole>,
): Promise<AuthResult | Response> {
  const supabase = ctx.locals?.supabase ?? createSupabaseClient(ctx);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return jsonError('Non authentifié', 401);
  const role = await fetchRoleSecure(user.id);
  if (!role || !allowed.includes(role)) return jsonError('Accès refusé', 403);
  return { user, session: null, supabase, role };
}

/** Variante JSON de requireAuth : 401 si pas connecte, retourne { user, role } sinon. */
export async function requireAuthJson(ctx: JsonAuthContext): Promise<AuthResult | Response> {
  return requireJson(ctx, ['user', 'moderator', 'admin', 'benevole', 'association']);
}

/** Variante JSON de requireAdmin : 401 si pas connecte, 403 si pas admin. */
export function requireAdminJson(ctx: JsonAuthContext): Promise<AuthResult | Response> {
  return requireJson(ctx, ['admin']);
}

/** Variante JSON de requireBenevole : 401/403, accepte benevole/moderator/admin. */
export function requireBenevoleJson(ctx: JsonAuthContext): Promise<AuthResult | Response> {
  return requireJson(ctx, ['benevole', 'moderator', 'admin']);
}