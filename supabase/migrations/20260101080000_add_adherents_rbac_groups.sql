-- =============================================================================
-- Adherents CRM: schema + RBAC + groups + history + search foundations
-- =============================================================================

-- 1) Enum for adherent status
DO $$
BEGIN
  CREATE TYPE public.adherent_statut AS ENUM (
    'actif',
    'inactif',
    'en_attente',
    'radie'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Core table: adherents
CREATE TABLE IF NOT EXISTS public.adherents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT,
  adresse TEXT,
  date_adhesion DATE NOT NULL DEFAULT CURRENT_DATE,
  statut public.adherent_statut NOT NULL DEFAULT 'actif',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT adherents_email_unique UNIQUE (email),
  -- Practical RFC 5322-compatible pattern for production validation in SQL.
  CONSTRAINT adherents_email_format_chk CHECK (
    email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
  ),
  -- Accepts international formats like +33..., spaces, dots, dashes, parentheses.
  CONSTRAINT adherents_phone_format_chk CHECK (
    telephone IS NULL OR telephone ~ '^(\+?[0-9]{1,3}[ .-]?)?(\(?[0-9]{1,4}\)?[ .-]?)?[0-9][0-9 .()-]{5,}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_adherents_email ON public.adherents(email);
CREATE INDEX IF NOT EXISTS idx_adherents_statut ON public.adherents(statut);
CREATE INDEX IF NOT EXISTS idx_adherents_date_adhesion ON public.adherents(date_adhesion);

-- Expression GIN index for full-text search endpoint (nom, prenom, email, adresse, telephone)
CREATE INDEX IF NOT EXISTS idx_adherents_search_fts
  ON public.adherents
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(nom, '') || ' ' ||
      coalesce(prenom, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(adresse, '') || ' ' ||
      coalesce(telephone, '')
    )
  );

-- 3) Tags via link-table model (instead of array)
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adherent_tags (
  adherent_id UUID NOT NULL REFERENCES public.adherents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (adherent_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_adherent_tags_tag_id ON public.adherent_tags(tag_id);

-- 4) History table for adherent changes
CREATE TABLE IF NOT EXISTS public.adherent_historiques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adherent_id UUID NOT NULL REFERENCES public.adherents(id) ON DELETE CASCADE,
  champ_modifie TEXT NOT NULL,
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  utilisateur_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_adherent_historiques_adherent_id ON public.adherent_historiques(adherent_id);
CREATE INDEX IF NOT EXISTS idx_adherent_historiques_timestamp ON public.adherent_historiques("timestamp" DESC);

-- 5) Grouping tables
CREATE TABLE IF NOT EXISTS public.groupes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adherent_groupes (
  adherent_id UUID NOT NULL REFERENCES public.adherents(id) ON DELETE CASCADE,
  groupe_id UUID NOT NULL REFERENCES public.groupes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (adherent_id, groupe_id)
);

CREATE INDEX IF NOT EXISTS idx_adherent_groupes_groupe_id ON public.adherent_groupes(groupe_id);

-- 6) RBAC tables
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.utilisateur_roles (
  utilisateur_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (utilisateur_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_utilisateur_roles_role_id ON public.utilisateur_roles(role_id);

INSERT INTO public.roles (code, libelle)
VALUES
  ('admin', 'Administrateur'),
  ('tresorier', 'Tresorier'),
  ('lecture_seule', 'Lecture seule')
ON CONFLICT (code) DO NOTHING;

-- 7) updated_at helper trigger (shared)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_adherents_updated_at ON public.adherents;
CREATE TRIGGER set_adherents_updated_at
BEFORE UPDATE ON public.adherents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_groupes_updated_at ON public.groupes;
CREATE TRIGGER set_groupes_updated_at
BEFORE UPDATE ON public.groupes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8) Automatic audit trail for adherent updates
CREATE OR REPLACE FUNCTION public.log_adherent_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.nom IS DISTINCT FROM NEW.nom THEN
    INSERT INTO public.adherent_historiques (adherent_id, champ_modifie, ancienne_valeur, nouvelle_valeur, utilisateur_id)
    VALUES (NEW.id, 'nom', OLD.nom, NEW.nom, auth.uid());
  END IF;

  IF OLD.prenom IS DISTINCT FROM NEW.prenom THEN
    INSERT INTO public.adherent_historiques (adherent_id, champ_modifie, ancienne_valeur, nouvelle_valeur, utilisateur_id)
    VALUES (NEW.id, 'prenom', OLD.prenom, NEW.prenom, auth.uid());
  END IF;

  IF OLD.email IS DISTINCT FROM NEW.email THEN
    INSERT INTO public.adherent_historiques (adherent_id, champ_modifie, ancienne_valeur, nouvelle_valeur, utilisateur_id)
    VALUES (NEW.id, 'email', OLD.email, NEW.email, auth.uid());
  END IF;

  IF OLD.telephone IS DISTINCT FROM NEW.telephone THEN
    INSERT INTO public.adherent_historiques (adherent_id, champ_modifie, ancienne_valeur, nouvelle_valeur, utilisateur_id)
    VALUES (NEW.id, 'telephone', OLD.telephone, NEW.telephone, auth.uid());
  END IF;

  IF OLD.adresse IS DISTINCT FROM NEW.adresse THEN
    INSERT INTO public.adherent_historiques (adherent_id, champ_modifie, ancienne_valeur, nouvelle_valeur, utilisateur_id)
    VALUES (NEW.id, 'adresse', OLD.adresse, NEW.adresse, auth.uid());
  END IF;

  IF OLD.date_adhesion IS DISTINCT FROM NEW.date_adhesion THEN
    INSERT INTO public.adherent_historiques (adherent_id, champ_modifie, ancienne_valeur, nouvelle_valeur, utilisateur_id)
    VALUES (NEW.id, 'date_adhesion', OLD.date_adhesion::TEXT, NEW.date_adhesion::TEXT, auth.uid());
  END IF;

  IF OLD.statut IS DISTINCT FROM NEW.statut THEN
    INSERT INTO public.adherent_historiques (adherent_id, champ_modifie, ancienne_valeur, nouvelle_valeur, utilisateur_id)
    VALUES (NEW.id, 'statut', OLD.statut::TEXT, NEW.statut::TEXT, auth.uid());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS adherents_audit_changes ON public.adherents;
CREATE TRIGGER adherents_audit_changes
AFTER UPDATE ON public.adherents
FOR EACH ROW EXECUTE FUNCTION public.log_adherent_changes();

-- 9) RLS base policies (RBAC by roles table)
ALTER TABLE public.adherents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherent_historiques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groupes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherent_groupes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adherent_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utilisateur_roles ENABLE ROW LEVEL SECURITY;

-- Utility predicates are inlined in policies to keep migration self-contained.

DROP POLICY IF EXISTS adherents_read_policy ON public.adherents;
CREATE POLICY adherents_read_policy
ON public.adherents
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier', 'lecture_seule')
  )
);

DROP POLICY IF EXISTS adherents_write_policy ON public.adherents;
CREATE POLICY adherents_write_policy
ON public.adherents
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
);

DROP POLICY IF EXISTS adherent_historiques_read_policy ON public.adherent_historiques;
CREATE POLICY adherent_historiques_read_policy
ON public.adherent_historiques
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier', 'lecture_seule')
  )
);

DROP POLICY IF EXISTS adherent_historiques_write_policy ON public.adherent_historiques;
CREATE POLICY adherent_historiques_write_policy
ON public.adherent_historiques
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
);

DROP POLICY IF EXISTS groupes_read_policy ON public.groupes;
CREATE POLICY groupes_read_policy
ON public.groupes
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS groupes_write_policy ON public.groupes;
CREATE POLICY groupes_write_policy
ON public.groupes
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
);

DROP POLICY IF EXISTS adherent_groupes_read_policy ON public.adherent_groupes;
CREATE POLICY adherent_groupes_read_policy
ON public.adherent_groupes
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS adherent_groupes_write_policy ON public.adherent_groupes;
CREATE POLICY adherent_groupes_write_policy
ON public.adherent_groupes
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
);

DROP POLICY IF EXISTS tags_read_policy ON public.tags;
CREATE POLICY tags_read_policy
ON public.tags
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tags_write_policy ON public.tags;
CREATE POLICY tags_write_policy
ON public.tags
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
);

DROP POLICY IF EXISTS adherent_tags_read_policy ON public.adherent_tags;
CREATE POLICY adherent_tags_read_policy
ON public.adherent_tags
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS adherent_tags_write_policy ON public.adherent_tags;
CREATE POLICY adherent_tags_write_policy
ON public.adherent_tags
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.utilisateur_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.utilisateur_id = auth.uid()
      AND r.code IN ('admin', 'tresorier')
  )
);

-- Avoid recursive RLS dependencies on RBAC tables.
-- roles: readable by authenticated users, write operations blocked at RLS level.
DROP POLICY IF EXISTS roles_admin_only_policy ON public.roles;
DROP POLICY IF EXISTS roles_read_policy ON public.roles;
CREATE POLICY roles_read_policy
ON public.roles
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS roles_write_block_policy ON public.roles;
CREATE POLICY roles_write_block_policy
ON public.roles
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

-- utilisateur_roles: users can only read their own assignments; writes blocked.
DROP POLICY IF EXISTS utilisateur_roles_admin_only_policy ON public.utilisateur_roles;
DROP POLICY IF EXISTS utilisateur_roles_read_own_policy ON public.utilisateur_roles;
CREATE POLICY utilisateur_roles_read_own_policy
ON public.utilisateur_roles
FOR SELECT TO authenticated
USING (utilisateur_id = auth.uid());

DROP POLICY IF EXISTS utilisateur_roles_write_block_policy ON public.utilisateur_roles;
CREATE POLICY utilisateur_roles_write_block_policy
ON public.utilisateur_roles
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

-- 10) Basic grants for API usage (RLS still applies)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adherents TO authenticated;
GRANT SELECT, INSERT ON public.adherent_historiques TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groupes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adherent_groupes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adherent_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.utilisateur_roles TO authenticated;
