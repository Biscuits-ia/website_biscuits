-- =============================================================================
-- Migration : table newsletter_subscribers
-- Date : 2026-06-23
-- Cible l endpoint /api/newsletter (inscription mensuelle).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text        NOT NULL UNIQUE,
  subscribed_at   timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  source          text        NOT NULL DEFAULT 'site',
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_email_format_chk CHECK (
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_newsletter_active
  ON public.newsletter_subscribers(email)
  WHERE unsubscribed_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_newsletter_updated_at ON public.newsletter_subscribers;
CREATE TRIGGER trg_newsletter_updated_at
  BEFORE UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Politique : tout le monde peut s inscrire (via service_role uniquement).
DROP POLICY IF EXISTS newsletter_insert_policy ON public.newsletter_subscribers;
CREATE POLICY newsletter_insert_policy
  ON public.newsletter_subscribers FOR INSERT
  WITH CHECK (true);

-- Politique : un user ne peut lire que sa propre ligne.
DROP POLICY IF EXISTS newsletter_read_own_policy ON public.newsletter_subscribers;
CREATE POLICY newsletter_read_own_policy
  ON public.newsletter_subscribers FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

GRANT INSERT ON public.newsletter_subscribers TO anon, authenticated;
GRANT SELECT ON public.newsletter_subscribers TO authenticated;
