-- =============================================================================
-- Biscuits IA — Migration : espace association/TPE
-- Générée le 09/05/2026
-- =============================================================================
-- Ordre : role update → tables → triggers → RLS
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ajout du rôle 'association' dans profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- Vérifier et mettre à jour les rôles existants si nécessaire
UPDATE public.profiles
SET role = 'user'
WHERE role NOT IN ('user', 'moderator', 'admin', 'benevole', 'data_analyst', 'association');

-- Supprimer l'ancienne contrainte si elle existe
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Ajouter la nouvelle contrainte avec le rôle 'association'
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'moderator', 'admin', 'benevole', 'data_analyst', 'association'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Table associations (profils des associations/TPE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.associations (
  id                uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  structure_name    text        NOT NULL,
  siret             text        NOT NULL UNIQUE,
  rna_number        text        UNIQUE,
  address           text        NOT NULL,
  phone_number      text        NOT NULL,
  contact_email     text        NOT NULL,
  description       text,
  is_verified       boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.associations IS 'Profils des associations et TPE inscrits';
COMMENT ON COLUMN public.associations.siret IS 'Numéro SIRET de la structure';
COMMENT ON COLUMN public.associations.rna_number IS 'Numéro RNA de l\'association (optionnel)';
COMMENT ON COLUMN public.associations.is_verified IS 'Vérification manuelle par l\'équipe Biscuits IA';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Table association_projects (projets spécifiques aux associations)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.association_projects (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id  uuid        NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text,
  status          text        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  priority        text        NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high')),
  deadline        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.association_projects IS 'Projets spécifiques aux associations/TPE';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Table association_requests (demandes d'inscription des associations)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.association_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_name    text        NOT NULL,
  siret             text,
  rna_number        text,
  address           text        NOT NULL,
  phone_number      text        NOT NULL,
  contact_email     text        NOT NULL,
  description       text,
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes       text,
  processed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.association_requests IS 'Demandes d\'inscription des associations/TPE';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Triggers updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_associations_updated_at ON public.associations;
CREATE TRIGGER trg_associations_updated_at
  BEFORE UPDATE ON public.associations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_association_projects_updated_at ON public.association_projects;
CREATE TRIGGER trg_association_projects_updated_at
  BEFORE UPDATE ON public.association_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Index
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_associations_siret ON public.associations (siret);
CREATE INDEX IF NOT EXISTS idx_associations_is_verified ON public.associations (is_verified);
CREATE INDEX IF NOT EXISTS idx_association_projects_status ON public.association_projects (status);
CREATE INDEX IF NOT EXISTS idx_association_requests_status ON public.association_requests (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

-- ── associations ─────────────────────────────────────────────────────────────
ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;

-- Lecture : association elle-même, admins, et bénévoles
DROP POLICY IF EXISTS "associations_self_read" ON public.associations;
CREATE POLICY "associations_self_read"
  ON public.associations FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'moderator', 'benevole')
    )
  );

-- Insertion : admin seulement (via inscription approuvée)
DROP POLICY IF EXISTS "associations_admin_insert" ON public.associations;
CREATE POLICY "associations_admin_insert"
  ON public.associations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Mise à jour : association elle-même ou admin
DROP POLICY IF EXISTS "associations_self_update" ON public.associations;
CREATE POLICY "associations_self_update"
  ON public.associations FOR UPDATE
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Suppression : admin seulement
DROP POLICY IF EXISTS "associations_admin_delete" ON public.associations;
CREATE POLICY "associations_admin_delete"
  ON public.associations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── association_projects ─────────────────────────────────────────────────────
ALTER TABLE public.association_projects ENABLE ROW LEVEL SECURITY;

-- Lecture : association propriétaire, admins, et bénévoles
DROP POLICY IF EXISTS "association_projects_read" ON public.association_projects;
CREATE POLICY "association_projects_read"
  ON public.association_projects FOR SELECT
  USING (
    association_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'moderator', 'benevole')
    )
  );

-- Insertion : association elle-même ou admins
DROP POLICY IF EXISTS "association_projects_insert" ON public.association_projects;
CREATE POLICY "association_projects_insert"
  ON public.association_projects FOR INSERT
  WITH CHECK (
    association_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Mise à jour : association elle-même ou admins
DROP POLICY IF EXISTS "association_projects_update" ON public.association_projects;
CREATE POLICY "association_projects_update"
  ON public.association_projects FOR UPDATE
  USING (
    association_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Suppression : admin seulement
DROP POLICY IF EXISTS "association_projects_admin_delete" ON public.association_projects;
CREATE POLICY "association_projects_admin_delete"
  ON public.association_projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── association_requests ─────────────────────────────────────────────────────
ALTER TABLE public.association_requests ENABLE ROW LEVEL SECURITY;

-- Lecture : tout le monde (publique pour les demandes en attente)
DROP POLICY IF EXISTS "association_requests_read" ON public.association_requests;
CREATE POLICY "association_requests_read"
  ON public.association_requests FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Insertion : publique (formulaire d'inscription)
DROP POLICY IF EXISTS "association_requests_insert" ON public.association_requests;
CREATE POLICY "association_requests_insert"
  ON public.association_requests FOR INSERT
  WITH CHECK (true);

-- Mise à jour : admin/moderator seulement
DROP POLICY IF EXISTS "association_requests_admin_update" ON public.association_requests;
CREATE POLICY "association_requests_admin_update"
  ON public.association_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Suppression : admin seulement
DROP POLICY IF EXISTS "association_requests_admin_delete" ON public.association_requests;
CREATE POLICY "association_requests_admin_delete"
  ON public.association_requests FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
