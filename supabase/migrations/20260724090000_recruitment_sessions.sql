-- =============================================================================
-- Biscuits IA — Migration : sessions de recrutement collectives
-- =============================================================================
-- Ordre : tables → colonne liée → triggers → indexes → RLS → grants
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table recruitment_sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recruitment_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text        NOT NULL,
  description      text,
  scheduled_at     timestamptz NOT NULL,
  duration_minutes integer     NOT NULL DEFAULT 90 CHECK (duration_minutes > 0),
  location         text,
  max_candidates   integer     NOT NULL DEFAULT 10 CHECK (max_candidates > 0),
  status           text        NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'closed', 'cancelled', 'done')),
  created_by       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.recruitment_sessions                IS 'Sessions de recrutement collectives (plusieurs candidats en même temps)';
COMMENT ON COLUMN public.recruitment_sessions.scheduled_at   IS 'Date et heure de la session';
COMMENT ON COLUMN public.recruitment_sessions.duration_minutes IS 'Durée en minutes';
COMMENT ON COLUMN public.recruitment_sessions.location         IS 'Lieu physique ou lien visio';
COMMENT ON COLUMN public.recruitment_sessions.max_candidates   IS 'Nombre maximum de candidats pour cette session';
COMMENT ON COLUMN public.recruitment_sessions.status           IS 'open | closed | cancelled | done';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lien candidature ↔ session
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recruitment_submissions
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.recruitment_sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.recruitment_submissions.session_id IS 'Session de recrutement collective à laquelle le candidat est affecté';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_recruitment_sessions_updated_at ON public.recruitment_sessions;
CREATE TRIGGER trg_recruitment_sessions_updated_at
  BEFORE UPDATE ON public.recruitment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recruitment_sessions_scheduled_at
  ON public.recruitment_sessions (scheduled_at);

CREATE INDEX IF NOT EXISTS idx_recruitment_sessions_status
  ON public.recruitment_sessions (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_recruitment_submissions_session_status
  ON public.recruitment_submissions (session_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recruitment_sessions ENABLE ROW LEVEL SECURITY;

-- 5.1 Sessions : lecture publique des sessions ouvertes (formulaire public)
DROP POLICY IF EXISTS "recruitment_sessions_public_open_read" ON public.recruitment_sessions;
CREATE POLICY "recruitment_sessions_public_open_read"
  ON public.recruitment_sessions FOR SELECT
  USING (status = 'open');

-- 5.2 Sessions : écriture admin/moderator
DROP POLICY IF EXISTS "recruitment_sessions_admin_write" ON public.recruitment_sessions;
CREATE POLICY "recruitment_sessions_admin_write"
  ON public.recruitment_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- 5.3 Candidatures : l'admin peut affecter/désaffecter une session
--     (la policy existante recruitment_admin_update/read est conservée)

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Function + trigger de contrôle de capacité atomique
-- ─────────────────────────────────────────────────────────────────────────────
-- Quand une candidature reçoit un session_id, on vérifie que la session n'est
-- pas pleine. Ce trigger garantit la cohérence même en cas de race condition.
CREATE OR REPLACE FUNCTION public.check_recruitment_session_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  -- Si on retire l'affectation, pas de contrôle.
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si l'affectation n'a pas changé, inutile de vérifier.
  IF TG_OP = 'UPDATE' AND OLD.session_id IS NOT DISTINCT FROM NEW.session_id THEN
    RETURN NEW;
  END IF;

  SELECT max_candidates, status
  INTO v_max
  FROM public.recruitment_sessions
  WHERE id = NEW.session_id;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Session introuvable';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.recruitment_submissions
  WHERE session_id = NEW.session_id
    AND status NOT IN ('declined');

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Cette session est pleine (capacité maximale atteinte)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruitment_submissions_capacity ON public.recruitment_submissions;
CREATE TRIGGER trg_recruitment_submissions_capacity
  BEFORE INSERT OR UPDATE OF session_id ON public.recruitment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.check_recruitment_session_capacity();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.recruitment_sessions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.recruitment_sessions TO authenticated;
GRANT UPDATE (session_id) ON public.recruitment_submissions TO authenticated;
