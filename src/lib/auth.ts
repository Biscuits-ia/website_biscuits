// src/lib/auth.ts
//
// ── Contrat de retour des gardes (audit P4 #36) ─────────────────────────────
// Toutes les fonctions `requireX()` ci-dessous retournent
//   Promise<AuthResult | AuthRedirect>
// au lieu du `Promise<AuthResult | Response>` historique.
//
// `AuthRedirect` est une marque opaque (TypeScript-only) qui distingue
// une Response "refus d'auth" d'une Response utilisateur lambda. Tant que
// l'appelant n'a pas fait `if (x instanceof Response) return x;`, l'accès
// aux champs de `AuthResult` (user, supabase, role) est refusé à la compilation.
//
// Effet runtime : NUL. `AuthRedirect extends Response`, donc :
//   - `instanceof Response` reste vrai : les 68 callers existants compilent ;
//   - `__authRedirectBrand` n'existe qu'au niveau type, jamais émis en JS.
// ────────────────────────────────────────────────────────────────────────────

import { createSupabaseClient, createSupabaseAdminClient } from './supabase';
import type { AstroGlobal, APIContext } from 'astro';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

type AuthContext = AstroGlobal | APIContext;

export type UserRole = 'user' | 'moderator' | 'admin' | 'benevole' | 'association';

export interface AuthResult {
  user: User;
  session: Session | null; // Toujours null côté serveur
  supabase: SupabaseClient;
  role: UserRole;
}

/**
 * Marqueur opaque : toute Response renvoyée par un `requireX` est taggée
 * `__authRedirectBrand`. Ce champ n'existe PAS sur `AuthResult` ni sur
 * une `Response` utilisateur : TypeScript refuse donc `result.user` tant
 * que le narrowing `instanceof Response` n'a pas eu lieu.
 *
 * Etend `Response` : `instanceof Response` reste vrai, les callers existants
 * (68 fichiers) n'ont rien a changer. Voir `eslint-rules/require-auth-narrow.cjs`
 * pour la regle lint qui complete ce verrou.
 */
export interface AuthRedirect extends Response {
  readonly __authRedirectBrand: true;
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
  const { error } = await adminClient.from('profiles').update({ role: 'user' }).eq('id', userId);
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

export async function requireAuth(Astro: AuthContext): Promise<AuthResult | AuthRedirect> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return authRedirect(Astro.redirect('/connexion'));
  }
  const role = (await fetchRoleSecure(user.id)) ?? 'user';

  // ✅ CORRECTION : session: null au lieu de getSession()
  return { user, session: null, supabase, role };
}

export async function requireRole(
  Astro: AuthContext,
  allowed: ReadonlyArray<UserRole>
): Promise<AuthResult | AuthRedirect> {
  const supabase = Astro.locals.supabase ?? createSupabaseClient(Astro);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return authRedirect(Astro.redirect('/connexion'));
  }
  const role = await fetchRoleSecure(user.id);
  if (!role || !allowed.includes(role)) {
    return authRedirect(Astro.redirect('/dashboard/user'));
  }

  // ✅ CORRECTION : session: null au lieu de getSession()
  return { user, session: null, supabase, role };
}

export function requireAdmin(Astro: AuthContext): Promise<AuthResult | AuthRedirect> {
  return requireRole(Astro, ['admin']);
}

export function requireModerator(Astro: AuthContext): Promise<AuthResult | AuthRedirect> {
  return requireRole(Astro, ['moderator', 'admin']);
}

export function requireBenevole(Astro: AuthContext): Promise<AuthResult | AuthRedirect> {
  return requireRole(Astro, ['benevole', 'moderator', 'admin']);
}

export function requireAssociation(Astro: AuthContext): Promise<AuthResult | AuthRedirect> {
  return requireRole(Astro, ['association', 'moderator', 'admin']);
}

// --------------------------------------------------------------------------
// Variantes JSON des requireX : pour les endpoints API qui retournent du JSON
// (401/403) plutot qu'un redirect HTML 302. Les helpers ci-dessus (requireX)
// appellent Astro.redirect(), ce qui est adapte aux <form> POST navigateur
// mais casse les clients fetch() qui attendent un JSON d'erreur.
// --------------------------------------------------------------------------

type JsonAuthContext = Pick<APIContext, 'request' | 'cookies' | 'locals'>;

/**
 * Constructeur de tag : prend une Response arbitraire (en pratique le retour
 * d'Astro.redirect() ou un new Response(...)) et la tague `AuthRedirect` pour
 * que le systeme de types refuse l'acces aux champs d'AuthResult.
 */
function authRedirect(response: Response): AuthRedirect {
  return response as unknown as AuthRedirect;
}

function jsonError(message: string, status: 401 | 403): AuthRedirect {
  return authRedirect(
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

async function requireJson(
  ctx: JsonAuthContext,
  allowed: ReadonlyArray<UserRole>
): Promise<AuthResult | AuthRedirect> {
  const supabase = ctx.locals?.supabase ?? createSupabaseClient(ctx);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return jsonError('Non authentifié', 401);
  const role = await fetchRoleSecure(user.id);
  if (!role || !allowed.includes(role)) return jsonError('Accès refusé', 403);
  return { user, session: null, supabase, role };
}

/** Variante JSON de requireAuth : 401 si pas connecte, retourne { user, role } sinon. */
export async function requireAuthJson(ctx: JsonAuthContext): Promise<AuthResult | AuthRedirect> {
  return requireJson(ctx, ['user', 'moderator', 'admin', 'benevole', 'association']);
}

/** Variante JSON de requireAdmin : 401 si pas connecte, 403 si pas admin. */
export function requireAdminJson(ctx: JsonAuthContext): Promise<AuthResult | AuthRedirect> {
  return requireJson(ctx, ['admin']);
}

/** Variante JSON de requireBenevole : 401/403, accepte benevole/moderator/admin. */
export function requireBenevoleJson(ctx: JsonAuthContext): Promise<AuthResult | AuthRedirect> {
  return requireJson(ctx, ['benevole', 'moderator', 'admin']);
}
