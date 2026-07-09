-- =============================================================================
-- Migration : fermeture de deux escalades de privileges
-- Date : 2026-07-09
-- Cf. AUDIT-back.md, sections S1 et « plan de correction » points 1 et 2.
-- =============================================================================
--
-- PRINCIPE
-- --------
-- RLS (`CREATE POLICY`) filtre des LIGNES. Elle ne filtre jamais des COLONNES.
-- Une policy `USING (id = auth.uid()) WITH CHECK (id = auth.uid())` autorise
-- donc le proprietaire d'une ligne a ecrire N'IMPORTE QUELLE colonne de cette
-- ligne -- y compris celle qui porte son propre role.
--
-- Le seul verrou colonne en Postgres est `GRANT UPDATE (col_a, col_b)`.
-- C'est ce que cette migration met en place sur les deux tables concernees.
--
-- Ces deux tables etaient jusqu'ici couvertes par les *default privileges* de
-- Supabase, qui accordent implicitement UPDATE sur toutes les colonnes au role
-- `authenticated`. Aucun GRANT explicite n'apparaissait dans les migrations :
-- l'absence de GRANT ne signifiait pas l'absence de droit.
--
-- `service_role` n'est PAS affecte : il bypasse la RLS et possede ses propres
-- privileges. Toutes les ecritures applicatives sur ces deux tables passent
-- deja par `createSupabaseAdminClient()` (verifie : middleware.ts,
-- lib/auth.ts, auth/deconnexion.ts, api/me/delete-data.ts, auth/create-association.ts).


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. public.profiles — escalade vers `role = 'admin'`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- AVANT :
--   GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
--   CREATE POLICY "profiles_update_own" ... USING (id = auth.uid())
--                                           WITH CHECK (id = auth.uid());
--
-- Tout utilisateur authentifie pouvait donc emettre, via PostgREST :
--   PATCH /rest/v1/profiles?id=eq.<son_uid>   {"role":"admin"}
-- La ligne restait la sienne : le WITH CHECK passait. La contrainte
-- `profiles_role_check` autorise la valeur 'admin'. Aucun trigger ne gardait
-- la colonne.
--
-- Consequence : `get_my_role()`, `fetchRoleSecure()`, `requireAdmin()` et
-- toutes les policies `admin` du schema retournaient `admin`.
--
-- APRES : `authenticated` ne peut plus ecrire AUCUNE colonne de profiles.
-- Le code applicatif n'en ecrit aucune via le client RLS -- seuls des SELECT.
-- INSERT est egalement revoque : les lignes sont creees par le trigger
-- `on_auth_user_created` -> `handle_new_user()`, qui est SECURITY DEFINER et
-- s'execute donc avec les droits du proprietaire, pas ceux de l'appelant.

REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
REVOKE INSERT, UPDATE ON public.profiles FROM anon;

-- Les policies restent en place (elles ne nuisent pas), mais sans GRANT
-- correspondant elles n'accordent plus rien. On documente l'intention.
COMMENT ON COLUMN public.profiles.role IS
  'Role applicatif. Ecriture reservee a service_role (cf. migration 20260709). '
  'Ne JAMAIS re-accorder UPDATE sur cette colonne au role authenticated.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. public.associations — auto-verification via `is_verified`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La migration 20260623_fix_associations_with_check.sql pretendait fermer ce
-- trou. Elle ne le fermait pas, a cause de la precedence des operateurs :
--
--   WITH CHECK (
--     id = auth.uid()
--     OR EXISTS (... admin/moderator ...)
--     AND ( is_verified inchange OR EXISTS (... admin ...) )
--   )
--
-- `AND` lie plus fort que `OR`. Postgres evalue donc :
--
--   id = auth.uid()  OR  ( EXISTS(admin) AND ( ... ) )
--
-- Une association qui met a jour sa propre ligne satisfait le premier terme.
-- La garde sur `is_verified` n'est jamais evaluee : elle pouvait passer
-- `is_verified = true` toute seule.
--
-- On applique le meme remede colonne-par-colonne. `is_verified` sort de la
-- liste : seul service_role (l'API admin) peut desormais la modifier.

REVOKE UPDATE ON public.associations FROM authenticated;
GRANT UPDATE (
  structure_name,
  siret,
  rna_number,
  address,
  phone_number,
  contact_email,
  description
) ON public.associations TO authenticated;

-- La policy conserve sa clause WITH CHECK, corrigee ici pour ne plus dependre
-- de la precedence implicite. Elle devient une defense en profondeur : le
-- GRANT ci-dessus est le verrou reel.
DROP POLICY IF EXISTS associations_self_update ON public.associations;
CREATE POLICY associations_self_update
  ON public.associations FOR UPDATE
  USING (
    id = auth.uid()
    OR public.get_my_role() IN ('admin', 'moderator')
  )
  WITH CHECK (
    id = auth.uid()
    OR public.get_my_role() IN ('admin', 'moderator')
  );

COMMENT ON COLUMN public.associations.is_verified IS
  'Verification manuelle par l equipe Biscuits IA. Ecriture reservee a '
  'service_role (cf. migration 20260709). Ne pas re-accorder UPDATE a authenticated.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verification post-migration
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Doit retourner 0 ligne. Toute ligne renvoyee = une colonne encore ecrivable
-- par `authenticated` sur une table sensible.
--
--   SELECT table_name, column_name
--   FROM information_schema.column_privileges
--   WHERE grantee = 'authenticated'
--     AND privilege_type = 'UPDATE'
--     AND (
--       (table_name = 'profiles')
--       OR (table_name = 'associations' AND column_name = 'is_verified')
--     );
--
-- Et, connecte en tant qu'utilisateur `user` lambda, ceci doit echouer :
--   PATCH /rest/v1/profiles?id=eq.<uid>        {"role":"admin"}
--   PATCH /rest/v1/associations?id=eq.<uid>    {"is_verified":true}
