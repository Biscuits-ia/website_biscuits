-- =============================================================================
-- Migration : Formations payantes (modele tarif conscient + parrainage)
-- Date : 2026-06-24
-- =============================================================================
-- Separe des "ateliers" (100 % gratuit, associatif pur).
-- Le systeme de "trainings" introduit :
--   1. Tarif conscient (sliding scale) : min / suggere / solidarite
--   2. Paiement HelloAsso via URL de formulaire (pas d'API)
--   3. Paiement par virement bancaire (fallback)
--   4. Systeme de parrainage (place nominative ou pool libre)
--   5. Demandes d'exoneration validees a la main par un admin
--   6. Suivi comptable pour l'asso (CA par formation/mois)
--
-- Toutes les tables ont :
--   - id uuid gen_random_uuid()
--   - created_at / updated_at
--   - RLS stricte (lecture publique uniquement sur les sessions publiees)
--   - GRANT a anon + authenticated (lecture), authenticated (ecriture restreinte)
-- =============================================================================

-- --- 0. Tables de base (idempotentes) -----------------------------------------

CREATE TABLE IF NOT EXISTS public.trainings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     text UNIQUE NOT NULL,
  title                    text NOT NULL,
  short_description        text,                                   -- 1 phrase pour les cartes
  description              text,                                   -- descriptif long (markdown)
  category                 text,                                   -- ex: "IA generative", "Cybersecurite"
  level                    text,                                   -- ex: "Debutant", "Intermediaire", "Avance"
  duration_label           text,                                   -- ex: "4 seances de 3h"
  is_paying                boolean NOT NULL DEFAULT true,          -- false => formation 100 % gratuite
  min_price_cents          integer NOT NULL DEFAULT 0,             -- plancher (0 = accessible a tous)
  suggested_price_cents    integer NOT NULL DEFAULT 0,             -- prix recommande
  solidarity_price_cents   integer NOT NULL DEFAULT 0,             -- prix "je peux donner plus"
  is_published             boolean NOT NULL DEFAULT false,
  display_order            integer NOT NULL DEFAULT 0,
  cover_image_url          text,                                   -- optionnel
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trainings_prices_order_chk
    CHECK (min_price_cents <= suggested_price_cents
       AND suggested_price_cents <= solidarity_price_cents),
  CONSTRAINT trainings_prices_positive_chk
    CHECK (min_price_cents >= 0 AND suggested_price_cents >= 0 AND solidarity_price_cents >= 0)
);
COMMENT ON TABLE public.trainings IS 'Catalogue des formations payantes (modele tarif conscient + parrainage)';

CREATE TABLE IF NOT EXISTS public.training_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id           uuid NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  starts_at             timestamptz NOT NULL,
  ends_at               timestamptz NOT NULL,
  location              text,
  online                boolean NOT NULL DEFAULT false,
  max_seats             integer NOT NULL DEFAULT 12,
  is_published          boolean NOT NULL DEFAULT false,
  allow_sliding_scale   boolean NOT NULL DEFAULT true,             -- autoriser payez-ce-que-vous-pouvez
  allow_sponsorship     boolean NOT NULL DEFAULT true,             -- autoriser les places parraines
  allow_free_request    boolean NOT NULL DEFAULT true,             -- autoriser les demandes d'exoneration
  helloasso_form_url    text,                                      -- URL du formulaire HelloAsso dedie
  bank_transfer_info    text,                                      -- RIB / instructions virement
  override_min_cents    integer,                                   -- override session du prix plancher
  override_suggested_cents integer,
  override_solidarity_cents integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_sessions_dates_chk CHECK (ends_at > starts_at),
  CONSTRAINT training_sessions_seats_chk  CHECK (max_seats > 0)
);
COMMENT ON TABLE public.training_sessions IS 'Sessions d''une formation (calque sur workshop_sessions, ajoute options tarifaires)';

CREATE TABLE IF NOT EXISTS public.training_registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Le participant peut choisir son montant (sliding scale)
  amount_cents    integer NOT NULL DEFAULT 0,
  -- Methode de paiement choisie
  payment_method  text NOT NULL DEFAULT 'pending'
                    CHECK (payment_method IN ('pending', 'helloasso', 'transfer', 'sponsorship', 'free_request', 'free_approved')),
  -- Cycle de vie
  status          text NOT NULL DEFAULT 'pending_payment'
                    CHECK (status IN ('pending_payment', 'awaiting_sponsorship', 'awaiting_validation', 'confirmed', 'cancelled', 'attended', 'no_show')),
  -- Si un parrain finance la place (nominatif)
  sponsorship_id  uuid,                                           -- FK ajoutee plus bas (cycle)
  notes           text,                                           -- note libre du participant
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
COMMENT ON TABLE public.training_registrations IS 'Inscriptions aux sessions de formation (avec choix de prix et methode de paiement)';

CREATE TABLE IF NOT EXISTS public.training_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.training_registrations(id) ON DELETE CASCADE,
  amount_cents    integer NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'EUR',
  provider        text NOT NULL
                    CHECK (provider IN ('helloasso', 'transfer', 'sponsorship', 'manual')),
  provider_ref    text,                                           -- ex: URL HelloAsso, ref virement
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'received', 'refunded', 'failed', 'cancelled')),
  received_at     timestamptz,
  note            text,                                           -- note admin (ex: "recu le 12/06")
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.training_payments IS 'Suivi comptable des paiements recus (par inscription)';

CREATE TABLE IF NOT EXISTS public.training_sponsorships (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Un parrain peut etre connecte OU non (donateur externe)
  sponsor_user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sponsor_email               text NOT NULL,
  sponsor_name                text NOT NULL,
  amount_cents                integer NOT NULL DEFAULT 0,
  currency                    text NOT NULL DEFAULT 'EUR',
  message                     text,                                           -- message du parrain
  mode                        text NOT NULL DEFAULT 'pool'
                                CHECK (mode IN ('pool', 'nominative')),
  -- Si nominative : le parrain reserve la place pour un email precis
  beneficiary_email           text,
  -- Le parrain peut viser une formation particuliere, ou laisser ouvert
  target_training_id          uuid REFERENCES public.trainings(id) ON DELETE SET NULL,
  target_session_id           uuid REFERENCES public.training_sessions(id) ON DELETE SET NULL,
  -- Code a 8 chars que le beneficiaire saisit pour consommer la place
  redemption_code             text UNIQUE,
  is_redeemed                 boolean NOT NULL DEFAULT false,
  redeemed_at                 timestamptz,
  redeemed_registration_id    uuid,                                           -- FK ajoutee plus bas
  payment_status              text NOT NULL DEFAULT 'pending'
                                CHECK (payment_status IN ('pending', 'received', 'refunded', 'failed', 'cancelled')),
  payment_provider            text,                                           -- 'helloasso' | 'transfer' | null
  payment_ref                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_sponsorships_amount_positive_chk CHECK (amount_cents > 0),
  CONSTRAINT training_sponsorships_nominative_has_email_chk
    CHECK ((mode <> 'nominative') OR (beneficiary_email IS NOT NULL))
);
COMMENT ON TABLE public.training_sponsorships IS 'Parrainages de places (pool libre ou nominatif)';

CREATE TABLE IF NOT EXISTS public.training_free_seat_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason              text NOT NULL,                                         -- motivation (50-500 chars)
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'refused')),
  reviewed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  admin_note          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
COMMENT ON TABLE public.training_free_seat_requests IS 'Demandes d''exoneration (validees a la main par un admin)';

-- --- 1. FK cycle sur training_registrations <-> training_sponsorships ---------

ALTER TABLE public.training_registrations
  DROP CONSTRAINT IF EXISTS training_registrations_sponsorship_fk;
ALTER TABLE public.training_registrations
  ADD CONSTRAINT training_registrations_sponsorship_fk
  FOREIGN KEY (sponsorship_id) REFERENCES public.training_sponsorships(id) ON DELETE SET NULL;

ALTER TABLE public.training_sponsorships
  DROP CONSTRAINT IF EXISTS training_sponsorships_registration_fk;
ALTER TABLE public.training_sponsorships
  ADD CONSTRAINT training_sponsorships_registration_fk
  FOREIGN KEY (redeemed_registration_id) REFERENCES public.training_registrations(id) ON DELETE SET NULL;

-- --- 2. Index utiles ----------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_trainings_published
  ON public.trainings (is_published, display_order);

CREATE INDEX IF NOT EXISTS idx_training_sessions_training
  ON public.training_sessions (training_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_training_sessions_upcoming
  ON public.training_sessions (is_published, starts_at)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_training_registrations_user
  ON public.training_registrations (user_id);

CREATE INDEX IF NOT EXISTS idx_training_registrations_session_status
  ON public.training_registrations (session_id, status);

CREATE INDEX IF NOT EXISTS idx_training_payments_registration
  ON public.training_payments (registration_id);

CREATE INDEX IF NOT EXISTS idx_training_payments_status_received
  ON public.training_payments (status, received_at)
  WHERE status = 'received';

CREATE INDEX IF NOT EXISTS idx_training_sponsorships_target_session
  ON public.training_sponsorships (target_session_id, is_redeemed);

CREATE INDEX IF NOT EXISTS idx_training_sponsorships_code
  ON public.training_sponsorships (redemption_code)
  WHERE is_redeemed = false;

CREATE INDEX IF NOT EXISTS idx_training_free_requests_status
  ON public.training_free_seat_requests (status, created_at);

-- --- 3. Triggers updated_at ----------------------------------------------------
-- Reutilise la fonction set_updated_at si elle existe deja dans le schema public.
-- Sinon la cree (CREATE OR REPLACE = idempotent).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trainings_updated_at ON public.trainings;
CREATE TRIGGER trg_trainings_updated_at
  BEFORE UPDATE ON public.trainings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_training_sessions_updated_at ON public.training_sessions;
CREATE TRIGGER trg_training_sessions_updated_at
  BEFORE UPDATE ON public.training_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_training_registrations_updated_at ON public.training_registrations;
CREATE TRIGGER trg_training_registrations_updated_at
  BEFORE UPDATE ON public.training_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_training_payments_updated_at ON public.training_payments;
CREATE TRIGGER trg_training_payments_updated_at
  BEFORE UPDATE ON public.training_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_training_sponsorships_updated_at ON public.training_sponsorships;
CREATE TRIGGER trg_training_sponsorships_updated_at
  BEFORE UPDATE ON public.training_sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_training_free_requests_updated_at ON public.training_free_seat_requests;
CREATE TRIGGER trg_training_free_requests_updated_at
  BEFORE UPDATE ON public.training_free_seat_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- 4. Vue training_sessions_with_seats --------------------------------------
-- Meme esprit que workshop_sessions_with_seats, mais avec :
--   - le prix resolu (override session OU valeur formation)
--   - les compteurs de registrations par statut
--   - security_invoker = true pour ne pas contourner les RLS

DROP VIEW IF EXISTS public.training_sessions_with_seats;

CREATE OR REPLACE VIEW public.training_sessions_with_seats
WITH (security_invoker = true) AS
SELECT
  ts.id,
  ts.starts_at,
  ts.ends_at,
  ts.location,
  ts.online,
  ts.max_seats,
  ts.is_published,
  ts.allow_sliding_scale,
  ts.allow_sponsorship,
  ts.allow_free_request,
  ts.helloasso_form_url,
  ts.bank_transfer_info,
  ts.created_at,
  -- Places restantes = max_seats - (inscriptions non annulees)
  ts.max_seats - COALESCE(reg.active_count, 0) AS seats_left,
  COALESCE(reg.active_count, 0)                 AS registered_count,
  -- Champs joints de la formation
  t.id                AS training_id,
  t.slug              AS training_slug,
  t.title             AS training_title,
  t.short_description AS training_short_description,
  t.description       AS training_description,
  t.category          AS training_category,
  t.level             AS training_level,
  t.duration_label    AS training_duration_label,
  t.cover_image_url   AS training_cover_image_url,
  t.is_paying         AS training_is_paying,
  -- Prix resolu : override session OU valeur formation
  COALESCE(ts.override_min_cents,        t.min_price_cents)        AS min_price_cents,
  COALESCE(ts.override_suggested_cents,  t.suggested_price_cents)  AS suggested_price_cents,
  COALESCE(ts.override_solidarity_cents, t.solidarity_price_cents) AS solidarity_price_cents
FROM public.training_sessions ts
JOIN public.trainings t ON t.id = ts.training_id
LEFT JOIN (
  SELECT session_id, COUNT(*)::int AS active_count
  FROM public.training_registrations
  WHERE status NOT IN ('cancelled')
  GROUP BY session_id
) reg ON reg.session_id = ts.id;

ALTER VIEW public.training_sessions_with_seats
  SET (security_invoker = true);

-- --- 5. RPC : atomic_training_register -----------------------------------------
-- Idempotente, securisee cote BDD. Retourne un code texte :
--   'OK' | 'SESSION_NOT_FOUND' | 'SESSION_FULL' | 'ALREADY_REGISTERED' | 'NOT_ALLOWED'
-- Le caller (route API) traduit en redirect/message.

CREATE OR REPLACE FUNCTION public.atomic_training_register(
  p_session_id uuid,
  p_user_id    uuid,
  p_amount_cents integer,
  p_payment_method text
)
RETURNS text AS $func$
DECLARE
  v_session   public.training_sessions%ROWTYPE;
  v_count     int;
  v_pay       text;
BEGIN
  SELECT * INTO v_session FROM public.training_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN 'SESSION_NOT_FOUND';
  END IF;

  IF NOT v_session.is_published THEN
    RETURN 'NOT_ALLOWED';
  END IF;

  -- Paiement par parrainage : pas de montant personnel
  IF p_payment_method = 'sponsorship' THEN
    p_amount_cents := 0;
  END IF;

  -- Validation payment_method
  v_pay := p_payment_method;
  IF v_pay NOT IN ('pending', 'helloasso', 'transfer', 'sponsorship', 'free_request', 'free_approved') THEN
    RETURN 'NOT_ALLOWED';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.training_registrations
   WHERE session_id = p_session_id
     AND user_id    = p_user_id
     AND status NOT IN ('cancelled');
  IF v_count > 0 THEN
    RETURN 'ALREADY_REGISTERED';
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.training_registrations
   WHERE session_id = p_session_id
     AND status NOT IN ('cancelled');
  IF v_count >= v_session.max_seats THEN
    RETURN 'SESSION_FULL';
  END IF;

  INSERT INTO public.training_registrations (session_id, user_id, amount_cents, payment_method, status)
  VALUES (
    p_session_id, p_user_id,
    GREATEST(0, p_amount_cents),
    v_pay,
    CASE
      WHEN v_pay = 'sponsorship'    THEN 'awaiting_sponsorship'
      WHEN v_pay = 'free_request'   THEN 'awaiting_validation'
      WHEN v_pay = 'helloasso'      THEN 'pending_payment'
      WHEN v_pay = 'transfer'       THEN 'pending_payment'
      ELSE 'pending_payment'
    END
  );

  RETURN 'OK';
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- 6. RPC : redeem_sponsorship -----------------------------------------------
-- Le beneficiaire saisit un code de 8 chars. Si le code existe, n'a pas ete
-- utilise, et vise bien une session publiee, on lui cree une inscription
-- 'confirmed' financee par ce parrainage.

CREATE OR REPLACE FUNCTION public.redeem_sponsorship(
  p_code       text,
  p_user_id    uuid,
  p_session_id uuid
)
RETURNS text AS $func$
DECLARE
  v_sponsorship public.training_sponsorships%ROWTYPE;
  v_count int;
BEGIN
  SELECT * INTO v_sponsorship
    FROM public.training_sponsorships
   WHERE redemption_code = p_code
     AND is_redeemed = false
     AND payment_status = 'received'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'CODE_INVALID';
  END IF;

  -- Nominatif : l'email du user doit correspondre
  IF v_sponsorship.mode = 'nominative' THEN
    IF NOT EXISTS (
      SELECT 1 FROM auth.users
       WHERE id = p_user_id
         AND email = v_sponsorship.beneficiary_email
    ) THEN
      RETURN 'CODE_NOT_FOR_USER';
    END IF;
  END IF;

  -- La session doit correspondre si le parrain l'a ciblee
  IF v_sponsorship.target_session_id IS NOT NULL
     AND v_sponsorship.target_session_id <> p_session_id THEN
    RETURN 'CODE_WRONG_SESSION';
  END IF;

  -- Deja inscrit a cette session ?
  SELECT COUNT(*) INTO v_count
    FROM public.training_registrations
   WHERE session_id = p_session_id
     AND user_id    = p_user_id
     AND status NOT IN ('cancelled');
  IF v_count > 0 THEN
    RETURN 'ALREADY_REGISTERED';
  END IF;

  INSERT INTO public.training_registrations
    (session_id, user_id, amount_cents, payment_method, status, sponsorship_id)
  VALUES
    (p_session_id, p_user_id, 0, 'sponsorship', 'confirmed', v_sponsorship.id);

  UPDATE public.training_sponsorships
     SET is_redeemed              = true,
         redeemed_at              = now(),
         redeemed_registration_id = (
           SELECT id FROM public.training_registrations
            WHERE session_id = p_session_id AND user_id = p_user_id
            ORDER BY created_at DESC LIMIT 1
         ),
         updated_at = now()
   WHERE id = v_sponsorship.id;

  RETURN 'OK';
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- 7. Vue training_revenue_by_month -----------------------------------------
-- Vue agregee pour le dashboard admin (CA mensuel, par formation/methode).

CREATE OR REPLACE VIEW public.training_revenue_by_month
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', tp.received_at) AS month,
  t.id                                AS training_id,
  t.title                             AS training_title,
  tp.provider                         AS payment_provider,
  COUNT(DISTINCT tp.registration_id)  AS payments_count,
  SUM(tp.amount_cents)::bigint        AS total_cents
FROM public.training_payments tp
JOIN public.training_registrations tr ON tr.id = tp.registration_id
JOIN public.training_sessions ts      ON ts.id = tr.session_id
JOIN public.training_sessions_with_seats vs ON vs.id = ts.id
JOIN public.trainings t                ON t.id = vs.training_id
WHERE tp.status = 'received'
GROUP BY 1, 2, 3, 4;

-- --- 8. RLS : trainings -------------------------------------------------------

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainings_select_published" ON public.trainings;
CREATE POLICY "trainings_select_published"
  ON public.trainings FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "trainings_admin_all" ON public.trainings;
CREATE POLICY "trainings_admin_all"
  ON public.trainings FOR ALL
  USING (
    public.get_my_role() = 'admin'
  )
  WITH CHECK (
    public.get_my_role() = 'admin'
  );

-- --- 9. RLS : training_sessions -----------------------------------------------

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_sessions_select_published" ON public.training_sessions;
CREATE POLICY "training_sessions_select_published"
  ON public.training_sessions FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "training_sessions_admin_all" ON public.training_sessions;
CREATE POLICY "training_sessions_admin_all"
  ON public.training_sessions FOR ALL
  USING (
    public.get_my_role() = 'admin'
  )
  WITH CHECK (
    public.get_my_role() = 'admin'
  );

-- --- 10. RLS : training_registrations -----------------------------------------
-- Lecture : user voit les siennes, admin voit tout.
-- Insertion : un user peut s'inscrire (passage par la RPC SECURITY DEFINER).
-- Update/Delete : user modifie ses propres inscriptions non confirmees, admin peut tout.

ALTER TABLE public.training_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_regs_select_own" ON public.training_registrations;
CREATE POLICY "training_regs_select_own"
  ON public.training_registrations FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "training_regs_select_admin" ON public.training_registrations;
CREATE POLICY "training_regs_select_admin"
  ON public.training_registrations FOR SELECT
  USING (
    public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "training_regs_insert_self" ON public.training_registrations;
CREATE POLICY "training_regs_insert_self"
  ON public.training_registrations FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_regs_update_own_pending" ON public.training_registrations;
CREATE POLICY "training_regs_update_own_pending"
  ON public.training_registrations FOR UPDATE
  USING (user_id = auth.uid() AND status IN ('pending_payment', 'awaiting_validation'))
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_regs_admin_all" ON public.training_registrations;
CREATE POLICY "training_regs_admin_all"
  ON public.training_registrations FOR ALL
  USING (
    public.get_my_role() = 'admin'
  )
  WITH CHECK (
    public.get_my_role() = 'admin'
  );

-- --- 11. RLS : training_payments ----------------------------------------------
-- Lecture : user voit les paiements lies a ses inscriptions, admin voit tout.
-- Pas d'insertion anonyme : passe par la route API (service_role).

ALTER TABLE public.training_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_payments_select_own" ON public.training_payments;
CREATE POLICY "training_payments_select_own"
  ON public.training_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.training_registrations tr
       WHERE tr.id = training_payments.registration_id
         AND tr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "training_payments_select_admin" ON public.training_payments;
CREATE POLICY "training_payments_select_admin"
  ON public.training_payments FOR SELECT
  USING (
    public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "training_payments_admin_all" ON public.training_payments;
CREATE POLICY "training_payments_admin_all"
  ON public.training_payments FOR ALL
  USING (
    public.get_my_role() = 'admin'
  )
  WITH CHECK (
    public.get_my_role() = 'admin'
  );

-- --- 12. RLS : training_sponsorships ------------------------------------------
-- Lecture : user voit ses propres parrainages + les siens en tant que beneficiaire.
-- Pas d'insertion anonyme : route API avec service_role.

ALTER TABLE public.training_sponsorships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_sponsorships_select_own" ON public.training_sponsorships;
CREATE POLICY "training_sponsorships_select_own"
  ON public.training_sponsorships FOR SELECT
  USING (sponsor_user_id = auth.uid());

DROP POLICY IF EXISTS "training_sponsorships_select_admin" ON public.training_sponsorships;
CREATE POLICY "training_sponsorships_select_admin"
  ON public.training_sponsorships FOR SELECT
  USING (
    public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "training_sponsorships_admin_all" ON public.training_sponsorships;
CREATE POLICY "training_sponsorships_admin_all"
  ON public.training_sponsorships FOR ALL
  USING (
    public.get_my_role() = 'admin'
  )
  WITH CHECK (
    public.get_my_role() = 'admin'
  );

-- --- 13. RLS : training_free_seat_requests -------------------------------------

ALTER TABLE public.training_free_seat_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_free_req_select_own" ON public.training_free_seat_requests;
CREATE POLICY "training_free_req_select_own"
  ON public.training_free_seat_requests FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "training_free_req_insert_self" ON public.training_free_seat_requests;
CREATE POLICY "training_free_req_insert_self"
  ON public.training_free_seat_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "training_free_req_select_admin" ON public.training_free_seat_requests;
CREATE POLICY "training_free_req_select_admin"
  ON public.training_free_seat_requests FOR SELECT
  USING (
    public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "training_free_req_admin_update" ON public.training_free_seat_requests;
CREATE POLICY "training_free_req_admin_update"
  ON public.training_free_seat_requests FOR UPDATE
  USING (
    public.get_my_role() = 'admin'
  )
  WITH CHECK (
    public.get_my_role() = 'admin'
  );

-- --- 14. GRANTs ---------------------------------------------------------------

GRANT SELECT ON public.trainings                  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.trainings  TO authenticated;
GRANT SELECT ON public.training_sessions         TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.training_sessions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.training_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_payments    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_sponsorships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_free_seat_requests TO authenticated;

GRANT SELECT ON public.training_sessions_with_seats TO anon, authenticated;
GRANT SELECT ON public.training_revenue_by_month    TO authenticated;

GRANT EXECUTE ON FUNCTION public.atomic_training_register(uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_sponsorship(text, uuid, uuid)             TO authenticated;