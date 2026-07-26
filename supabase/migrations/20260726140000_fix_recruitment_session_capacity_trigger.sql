-- =============================================================================
-- Biscuits IA — Correctif : trigger de capacité des sessions de recrutement
-- Date : 2026-07-26
--
-- Bug corrigé (migration 20260724090000, fonction check_recruitment_session_capacity)
-- --------------------------------------------------------------------------
--   SELECT max_candidates, status
--   INTO v_max
--   FROM public.recruitment_sessions ...
--
-- Deux colonnes projetées, une seule variable cible. PL/pgSQL exige que le
-- nombre de colonnes corresponde exactement au nombre de cibles, sinon erreur
-- d'exécution. Le trigger étant BEFORE INSERT OR UPDATE OF session_id, TOUTE
-- affectation d'un candidat à une session échouait :
--   - candidature publique avec session choisie -> 500 "Erreur lors de l'enregistrement"
--   - POST /api/admin/recruitment-sessions/[id]/assign -> 409 "Erreur lors de l'affectation"
-- La colonne `status` était par ailleurs lue sans jamais être utilisée.
--
-- Deux autres défauts corrigés au passage :
--   1. Le commentaire d'origine annonçait une garantie « même en cas de race
--      condition ». Faux : un COUNT dans un trigger BEFORE ne voit pas les
--      lignes non committées des transactions concurrentes. En READ COMMITTED,
--      deux affectations simultanées sur la dernière place passaient toutes les
--      deux. Le SELECT ... FOR UPDATE sur la ligne de session sérialise
--      désormais réellement les affectations concurrentes.
--   2. Le statut de la session n'était pas vérifié : on pouvait rattacher un
--      candidat à une session `closed` / `cancelled` / `done` en base (les
--      routes API le refusaient, mais rien ne le garantissait côté données).
--
-- ERRCODE explicites pour que la couche applicative distingue « session pleine »
-- (23514, check_violation) d'une vraie erreur serveur.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_recruitment_session_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_max    integer;
  v_status text;
  v_count  integer;
BEGIN
  -- Retrait d'affectation : rien à contrôler.
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Affectation inchangée : rien à contrôler (permet d'éditer statut/notes
  -- d'un candidat déjà rattaché, même sur une session fermée).
  IF TG_OP = 'UPDATE' AND OLD.session_id IS NOT DISTINCT FROM NEW.session_id THEN
    RETURN NEW;
  END IF;

  -- FOR UPDATE : verrouille la ligne de session le temps de la transaction.
  -- C'est ce verrou — et non le COUNT — qui rend le contrôle atomique.
  SELECT max_candidates, status
    INTO v_max, v_status
    FROM public.recruitment_sessions
   WHERE id = NEW.session_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session introuvable'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette session n''accepte plus d''inscription (statut : %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.recruitment_submissions
   WHERE session_id = NEW.session_id
     AND status <> 'declined'
     AND id <> NEW.id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Cette session est pleine (capacité maximale atteinte)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_recruitment_session_capacity() IS
  'Contrôle capacité + statut avant rattachement d''une candidature à une session. Sérialisé par SELECT ... FOR UPDATE sur recruitment_sessions.';

-- Le trigger existant pointe déjà sur cette fonction ; on le recrée pour être
-- idempotent si la migration précédente n'avait pas été appliquée.
DROP TRIGGER IF EXISTS trg_recruitment_submissions_capacity ON public.recruitment_submissions;
CREATE TRIGGER trg_recruitment_submissions_capacity
  BEFORE INSERT OR UPDATE OF session_id ON public.recruitment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.check_recruitment_session_capacity();

-- =============================================================================
-- Vérification manuelle après application (doit renvoyer l'erreur attendue et
-- non « query returned 2 columns ») :
--
--   BEGIN;
--   INSERT INTO public.recruitment_submissions (first_name, last_name, email, session_id)
--   VALUES ('Test', 'Capacite', 'test-capacite@example.invalid',
--           (SELECT id FROM public.recruitment_sessions WHERE status = 'open' LIMIT 1));
--   ROLLBACK;
-- =============================================================================
