-- ============================================================================
-- Migration : get_my_role() lit auth.jwt() au lieu de profiles (evite recursion)
-- Date       : 2026-07-09
-- ----------------------------------------------------------------------------
-- Pourquoi : `get_my_role()` (ligne 251 de 20251231_0000_initial_schema.sql)
-- fait `SELECT role FROM public.profiles WHERE id = auth.uid()`. Plusieurs
-- policies sur la table profiles (ex. profiles_self_read,
-- profiles_admin_all) appellent elles-memes get_my_role() pour determiner
-- l'acces. Resultat : recursion infinie lors de l'evaluation RLS, le user
-- recoit 0 lignes au lieu de sa propre ligne.
--
-- Solution : on lit d'abord le role directement dans le JWT via
-- auth.jwt() -> 'app_metadata' ->> 'role' (lecture O(1), pas de hit table,
-- pas de recursion). Fallback sur profiles.role uniquement si le JWT est
-- vide (dev, tests, anciens tokens emis avant synchro).
--
-- La synchro profiles.role -> auth.users.raw_app_meta_data.role est faite
-- par un trigger AFTER UPDATE sur profiles (fonction sync_profile_role_to_jwt)
-- cree plus bas. Pour les utilisateurs existants au moment de l'application
-- de cette migration, on fait un rattrapage one-shot dans un DO $$ ... $$.
--
-- Cout      : 0 (trigger BEFORE/AFTER legers sur une table a faible volume).
-- Securite  : le role reste controle par profiles (l'utilisateur ne peut pas
--             l'editer : voir 20260709_1200_fix_privilege_escalation.sql qui
--             a revoque UPDATE/INSERT sur profiles pour authenticated).
-- ============================================================================

-- 1. Reecriture de get_my_role() : JWT d'abord, profiles en fallback.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role  text;
  v_db_role   text;
BEGIN
  -- 1a. Lecture JWT (rapide, pas de hit table, pas de recursion).
  BEGIN
    v_jwt_role := auth.jwt() -> 'app_metadata' ->> 'role';
  EXCEPTION WHEN undefined_function OR others THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role IS NOT NULL AND v_jwt_role <> '' THEN
    RETURN v_jwt_role;
  END IF;

  -- 1b. Fallback : lecture directe de profiles.
  --     SECURITY DEFINER sur la fonction court-circuite la RLS, donc pas
  --     de recursion ici (la fonction est appelee dans le contexte
  --     SECURITY DEFINER, elle lit profiles sans re-evaluation de policy).
  SELECT role INTO v_db_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_db_role;
END;
$$;
COMMENT ON FUNCTION public.get_my_role()
  IS 'Lit role depuis auth.jwt() (app_metadata.role) ; fallback profiles. JWT d''abord pour eviter la recursion RLS sur profiles.';

-- 2. Fonction de synchro profiles.role -> auth.users.raw_app_meta_data.role.
--    Appelee par un trigger AFTER UPDATE sur profiles. Idempotente : on ne
--    ecrit que si la valeur change, pour eviter de polluer l'event log
--    auth.users et de penaliser les perfs.
CREATE OR REPLACE FUNCTION public.sync_profile_role_to_jwt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On ne synchronise que si le role a reellement change (TG_OP = UPDATE
  -- et IS DISTINCT FROM), ou si on est sur un INSERT (NEW).
  IF TG_OP = 'INSERT' THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', NEW.role)
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', NEW.role)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.sync_profile_role_to_jwt()
  IS 'Trigger : synchronise profiles.role vers auth.users.raw_app_meta_data.role. Appele apres INSERT/UPDATE sur profiles.';

-- 3. Trigger AFTER INSERT OR UPDATE sur profiles.
DROP TRIGGER IF EXISTS sync_profile_role_to_jwt ON public.profiles;
CREATE TRIGGER sync_profile_role_to_jwt
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_role_to_jwt();

-- 4. Rattrapage one-shot : pour chaque profil existant, on pousse le role
--    dans auth.users.raw_app_meta_data. Necessaire pour que les sessions
--    JWT emises avant cette migration voient bien le bon role au prochain
--    rafraichissement (sinon l'utilisateur doit se deconnecter/reconnecter).
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE auth.users u
  SET raw_app_meta_data =
    COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', p.role)
  FROM public.profiles p
  WHERE p.id = u.id
    AND (u.raw_app_meta_data ->> 'role') IS DISTINCT FROM p.role;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '[fix_profiles_rls_recursion] Rattrapage synchro : % profils mis a jour dans auth.users.raw_app_meta_data', v_count;
END;
$$;
