-- ============================================================================
-- Migration : Acceptation des CGV et conformite legale
-- Date : 2026-06-24
-- ============================================================================
-- Deux tables pour la conformite juridique liee a la vente de formations :
--   1. legal_acceptance  : trace chaque acceptation des CGV/CGU par un user
--                          (preuve juridique au moment du paiement)
--   2. legal_compliance  : etat global d'activation des documents legaux
--                          (1 ligne, mise a jour par l'admin)
-- ============================================================================

-- 1. legal_acceptance ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.legal_acceptance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id nullable : on peut accepter avant inscription (ex: depuis /formations)
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Type de document accepte : 'cgv' | 'cgu' | 'parrainage' | 'exoneration' | 'rgpd'
  document_type   text NOT NULL
                    CHECK (document_type IN ('cgv', 'cgu', 'parrainage', 'exoneration', 'rgpd')),
  -- Version exacte du document (ex: '1.0', '1.1')
  document_version text NOT NULL,
  -- Contexte de l'acceptation : 'payment' (au moment de payer) | 'registration' | 'manual'
  context         text NOT NULL DEFAULT 'manual'
                    CHECK (context IN ('payment', 'registration', 'manual')),
  -- ID optionnel de l'inscription qui a declenche l'acceptation
  registration_id uuid REFERENCES public.training_registrations(id) ON DELETE SET NULL,
  -- IP hash (pour preuve, sans stocker l'IP en clair - RGPD)
  ip_hash         text,
  -- User agent tronque (idem)
  user_agent      text,
  -- Email de l'utilisateur au moment de l'acceptation (en cas de user_id null)
  email           text,
  accepted_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.legal_acceptance IS 'Trace des acceptations CGV/CGU par les utilisateurs (preuve juridique)';
COMMENT ON COLUMN public.legal_acceptance.ip_hash IS 'Hash SHA-256 de l''IP (RGPD : on ne stocke pas l''IP en clair)';

-- Index pour la conformite : on liste toutes les acceptations par user
CREATE INDEX IF NOT EXISTS idx_legal_acceptance_user
  ON public.legal_acceptance (user_id, accepted_at DESC);

-- Index pour audit : toutes les acceptations d'un document precis
CREATE INDEX IF NOT EXISTS idx_legal_acceptance_doc
  ON public.legal_acceptance (document_type, document_version, accepted_at DESC);

-- 2. legal_compliance ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.legal_compliance (
  -- Toujours 1 ligne (id fixe), singleton
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Les CGV sont-elles activees sur le site ?
  cgv_activees          boolean NOT NULL DEFAULT false,
  cgv_version           text,
  cgv_date_activation   timestamptz,
  -- Les CGU sont-elles activees ?
  cgu_activees          boolean NOT NULL DEFAULT false,
  cgu_version           text,
  cgu_date_activation   timestamptz,
  -- RGPD / politique de confidentialite
  rgpd_active           boolean NOT NULL DEFAULT true,         -- toujours actif par defaut
  rgpd_version          text DEFAULT '1.0',
  rgpd_date_activation  timestamptz DEFAULT now(),
  -- Mediteur de la consommation (optionnel mais recommande)
  mediateur_nom         text,
  mediateur_url         text,
  -- Alertes pour l'admin
  prochain_audit        timestamptz,                          -- date du prochain audit legal
  notes_admin           text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Derniere mise a jour par
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.legal_compliance IS 'Etat d''activation des documents legaux (1 seule ligne)';

-- Insertion de la ligne singleton si elle n'existe pas
INSERT INTO public.legal_compliance (id, rgpd_active, rgpd_version)
VALUES (1, true, '1.0')
ON CONFLICT (id) DO NOTHING;

-- 3. RLS ------------------------------------------------------------------------

ALTER TABLE public.legal_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_compliance ENABLE ROW LEVEL SECURITY;

-- legal_acceptance : un user peut voir ses propres acceptations ; l'admin voit tout
DROP POLICY IF EXISTS "legal_acceptance_select_own" ON public.legal_acceptance;
CREATE POLICY "legal_acceptance_select_own"
  ON public.legal_acceptance FOR SELECT
  USING (user_id = auth.uid());

-- Note (2026-07-13) : migration du pattern EXISTS profiles -> public.get_my_role()
-- pour eviter SQLSTATE 42P01 si profiles est indisponible au moment de l'evaluation
-- de la policy, et pour supprimer la traversee de table (cf. migration
-- 20260709200000_fix_profiles_rls_recursion.sql qui introduit get_my_role() JWT-first).
DROP POLICY IF EXISTS "legal_acceptance_select_admin" ON public.legal_acceptance;
CREATE POLICY "legal_acceptance_select_admin"
  ON public.legal_acceptance FOR SELECT
  USING (public.get_my_role() = 'admin');

-- Pas d'INSERT/UPDATE/DELETE pour anon/authenticated : tout passe par le service_role
-- (route API /api/legal/accept). Cela empeche tout bypass.

-- legal_compliance : lecture publique (pour savoir si CGV activees),
-- ecriture admin uniquement
DROP POLICY IF EXISTS "legal_compliance_select_public" ON public.legal_compliance;
CREATE POLICY "legal_compliance_select_public"
  ON public.legal_compliance FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "legal_compliance_admin_all" ON public.legal_compliance;
CREATE POLICY "legal_compliance_admin_all"
  ON public.legal_compliance FOR ALL
  USING      (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 4. GRANTs --------------------------------------------------------------------

-- Lecture pour tous (les users peuvent voir leurs propres acceptations,
-- le public peut lire legal_compliance pour savoir si CGV activees)
GRANT SELECT ON public.legal_acceptance TO authenticated;
GRANT SELECT ON public.legal_compliance  TO anon, authenticated;

-- Insertion/Update pour les admins (legal_compliance) et le service_role
GRANT INSERT, UPDATE, DELETE ON public.legal_compliance  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.legal_acceptance TO authenticated;