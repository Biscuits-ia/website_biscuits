-- ============================================================================
-- Migration : Integration HelloAsso (OAuth2 + paiements + webhooks)
-- Date : 2026-06-24
-- ============================================================================
-- Ajoute 2 tables au systeme de formations :
--   1. helloasso_oauth_tokens : cache des access_tokens OAuth2 (Client Credentials)
--   2. helloasso_payments     : trace des paiements recus via webhook IPN
-- ============================================================================

-- 1. Cache OAuth2 ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.helloasso_oauth_tokens (
  client_id     text PRIMARY KEY,
  access_token  text NOT NULL,
  expires_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.helloasso_oauth_tokens IS 'Cache des tokens OAuth2 HelloAsso (1 ligne par client_id)';

-- 2. Paiements recus via IPN -----------------------------------------------

CREATE TABLE IF NOT EXISTS public.helloasso_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id           text UNIQUE NOT NULL,        -- ID cote HelloAsso
  registration_id     uuid NOT NULL REFERENCES public.training_registrations(id) ON DELETE CASCADE,
  amount_cents        integer NOT NULL,
   currency            text NOT NULL DEFAULT 'EUR',
   status              text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'authorized', 'confirmed', 'refused', 'cancelled', 'refunded')),
  paid_at             timestamptz,
  payer_email         text,
  payer_name          text,
  raw_payload         jsonb NOT NULL,               -- body complet du webhook pour audit
  payload_hash        text UNIQUE NOT NULL,         -- SHA-256 dedup
  received_at         timestamptz NOT NULL DEFAULT now(),
  ipn_event_type      text                          -- "payment.confirmed" | "payment.refused" | etc.
);
COMMENT ON TABLE public.helloasso_payments IS 'Paiements recus via webhook IPN HelloAsso';
COMMENT ON COLUMN public.helloasso_payments.intent_id IS 'Identifiant unique cote HelloAsso';
COMMENT ON COLUMN public.helloasso_payments.payload_hash IS 'SHA-256 du body, UNIQUE pour eviter les double-traitements';

-- Index pour dedup rapide
CREATE INDEX IF NOT EXISTS idx_helloasso_payments_status
  ON public.helloasso_payments (status, received_at);

CREATE INDEX IF NOT EXISTS idx_helloasso_payments_registration
  ON public.helloasso_payments (registration_id);

-- 3. RLS : tout est en mode admin uniquement (lecture/gestion par service_role)

ALTER TABLE public.helloasso_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helloasso_payments  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "helloasso_tokens_admin_all" ON public.helloasso_oauth_tokens;
CREATE POLICY "helloasso_tokens_admin_all"
  ON public.helloasso_oauth_tokens FOR ALL
   USING (
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
   )
   WITH CHECK (
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
   );

DROP POLICY IF EXISTS "helloasso_payments_admin_select" ON public.helloasso_payments;
CREATE POLICY "helloasso_payments_admin_select"
  ON public.helloasso_payments FOR SELECT
   USING (
     EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
   );

DROP POLICY IF EXISTS "helloasso_payments_user_select_own" ON public.helloasso_payments;
-- Un user peut voir les paiements lies a ses propres inscriptions
CREATE POLICY "helloasso_payments_user_select_own"
  ON public.helloasso_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.training_registrations tr
       WHERE tr.id = helloasso_payments.registration_id
         AND tr.user_id = auth.uid()
    )
  );

-- Pas de policy INSERT/UPDATE/DELETE pour anon/authenticated :
-- tout passe par le service_role (routes API). Cela empeche tout bypass RLS.

-- 4. GRANTs ----------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.helloasso_oauth_tokens TO authenticated;
GRANT SELECT                            ON public.helloasso_payments  TO authenticated;