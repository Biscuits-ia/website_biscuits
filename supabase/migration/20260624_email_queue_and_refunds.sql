-- ============================================================================
-- Migration : File d'attente email + gestion des remboursements HelloAsso
-- Date : 2026-06-24
-- ============================================================================

-- 1. email_outbox : queue persistante pour les envois SMTP avec retry exponentiel
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email        text NOT NULL,
  to_name         text,
  from_email      text NOT NULL,
  from_name       text,
  reply_to_email  text,
  subject         text NOT NULL,
  text_body       text,
  html_body       text,
  headers         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error      text,
  message_id      text,
  sent_at         timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.email_outbox IS 'File d''attente des emails SMTP. Les retries sont gerees par le worker cron.';
CREATE INDEX IF NOT EXISTS idx_email_outbox_pending  ON public.email_outbox (next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_email_outbox_status   ON public.email_outbox (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_to_email ON public.email_outbox (to_email, created_at DESC);

-- 2. helloasso_refunds : trace dediee aux remboursements (full ou partial)
CREATE TABLE IF NOT EXISTS public.helloasso_refunds (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helloasso_payment_id     uuid NOT NULL REFERENCES public.helloasso_payments(id) ON DELETE CASCADE,
  amount_cents             integer NOT NULL CHECK (amount_cents > 0),
  currency                 text NOT NULL DEFAULT 'EUR',
  refund_type              text NOT NULL CHECK (refund_type IN ('full', 'partial')),
  reason                   text,
  raw_payload              jsonb NOT NULL,
  source                   text NOT NULL DEFAULT 'webhook' CHECK (source IN ('api', 'webhook', 'admin')),
  external_ref             text,
  initiated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  refunded_at              timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (helloasso_payment_id)
);
COMMENT ON TABLE public.helloasso_refunds IS 'Remboursements HelloAsso (webhook, API ou admin)';
CREATE INDEX IF NOT EXISTS idx_helloasso_refunds_payment ON public.helloasso_refunds (helloasso_payment_id);

-- 3. Champ refunded_amount_cents sur helloasso_payments
ALTER TABLE public.helloasso_payments
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.helloasso_payments
  ADD CONSTRAINT helloasso_payments_refund_positive_chk
  CHECK (refunded_amount_cents >= 0);
ALTER TABLE public.helloasso_payments
  ADD CONSTRAINT helloasso_payments_refund_le_total_chk
  CHECK (refunded_amount_cents <= amount_cents);

-- 4. RLS
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helloasso_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_outbox_admin_all" ON public.email_outbox;
CREATE POLICY "email_outbox_admin_all"
  ON public.email_outbox FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "helloasso_refunds_admin_all" ON public.helloasso_refunds;
CREATE POLICY "helloasso_refunds_admin_all"
  ON public.helloasso_refunds FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 5. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_outbox      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.helloasso_refunds TO authenticated;

-- 6. Vue training_revenue_by_month_v2 (CA net avec refunds deduits)
-- Creee separemment : la vue d'origine (training_revenue_by_month) peut etre
-- recreee a la main ulterieurement. Pour l'instant, on cree une v2 qui
-- fonctionne en parallele et qui sera promuee plus tard.

CREATE OR REPLACE VIEW public.training_revenue_by_month_v2
WITH (security_invoker = true) AS
SELECT
  pay.month,
  pay.training_id,
  pay.training_title,
  pay.provider AS payment_provider,
  pay.payments_count,
  GREATEST(0, pay.total_cents - COALESCE(ref.total_cents, 0))::bigint AS total_cents
FROM (
  SELECT
    date_trunc('month', tp.received_at) AS month,
    t.id                                 AS training_id,
    t.title                              AS training_title,
    tp.provider                          AS provider,
    COUNT(DISTINCT tp.id)                 AS payments_count,
    SUM(tp.amount_cents)                  AS total_cents
  FROM public.training_payments tp
  JOIN public.training_registrations tr ON tr.id = tp.registration_id
  JOIN public.training_sessions ts      ON ts.id = tr.session_id
  JOIN public.trainings t                ON t.id = ts.training_id
  WHERE tp.status = 'received'
  GROUP BY 1, 2, 3, 4
) pay
LEFT JOIN (
  SELECT
    date_trunc('month', hr.refunded_at) AS month,
    t2.id                                AS training_id,
    ''helloasso''::text                    AS provider,
    SUM(hr.amount_cents)                 AS total_cents
  FROM public.helloasso_refunds hr
  JOIN public.helloasso_payments hp ON hp.id = hr.helloasso_payment_id
  JOIN public.training_registrations tr2 ON tr2.id = hp.registration_id
  JOIN public.training_sessions ts2      ON ts2.id = tr2.session_id
  JOIN public.trainings t2                ON t2.id = ts2.training_id
  GROUP BY 1, 2, 3
) ref
  ON ref.month = pay.month
 AND ref.training_id = pay.training_id
 AND ref.provider = pay.provider;

-- 7. Promotion de v2 -> training_revenue_by_month (apres verification visuelle)
-- DROP VIEW IF EXISTS public.training_revenue_by_month;
-- ALTER VIEW public.training_revenue_by_month_v2 RENAME TO training_revenue_by_month;
-- (Decommentez ci-dessus apres avoir verifie que la v2 donne les bons chiffres)

GRANT SELECT ON public.training_revenue_by_month_v2 TO authenticated;