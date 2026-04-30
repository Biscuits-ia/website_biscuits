// src/lib/auth.ts
import { createSupabaseClient, createSupabaseAdminClient } from './supabase';
import type { AstroGlobal } from 'astro';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'moderator' | 'admin' | 'benevole';

export interface AuthResult {
  user:     User;
  session:  Session | null;
  supabase: SupabaseClient;
  role:     UserRole;
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isUserRole(value: unknown): value is UserRole {
  return value === 'user' || value === 'moderator' || value === 'admin' || value === 'benevole';
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
export async function requireAuth(Astro: AstroGlobal): Promise<AuthResult | Response> {
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
export async function requireAdmin(Astro: AstroGlobal): Promise<AuthResult | Response> {
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
export async function requireModerator(Astro: AstroGlobal): Promise<AuthResult | Response> {
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
export async function requireBenevole(Astro: AstroGlobal): Promise<AuthResult | Response> {
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