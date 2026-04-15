-- =============================================================================
-- Biscuits IA — Migration complète (BDD vierge)
-- Générée le 15/04/2026
-- =============================================================================
-- Ordre : extensions → helpers → tables → vues → fonctions/triggers → RLS → storage
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 2.1 profiles ─────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL,
  full_name       text,
  role            text NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'moderator', 'admin')),
  reports_count   integer DEFAULT 0,
  last_sign_in_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profiles IS 'Profil utilisateur — créé automatiquement via trigger on_auth_user_created';

-- ── 2.2 contact_submissions ─────────────────────────────────────────────────
CREATE TABLE public.contact_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL,
  subject     text NOT NULL,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'read', 'replied', 'archived')),
  admin_notes text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.contact_submissions IS 'Soumissions du formulaire de contact (public)';

-- ── 2.3 recruitment_submissions ─────────────────────────────────────────────
CREATE TABLE public.recruitment_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name   text NOT NULL,
  last_name    text NOT NULL,
  email        text NOT NULL,
  skills       text,
  availability text CHECK (availability IS NULL OR availability IN ('immediat', '1mois', '3mois', '6mois', 'autre')),
  motivation   text,
  status       text NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'reviewing', 'accepted', 'declined')),
  admin_notes  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.recruitment_submissions IS 'Candidatures (formulaire rejoignez-nous)';

-- ── 2.4 requests ────────────────────────────────────────────────────────────
CREATE TABLE public.requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject      text NOT NULL,
  description  text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'in_progress', 'resolved')),
  admin_reply  text,
  replied_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.requests IS 'Demandes utilisateur (support / questions)';

-- ── 2.5 workshops ───────────────────────────────────────────────────────────
CREATE TABLE public.workshops (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  category    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2.6 workshop_sessions ───────────────────────────────────────────────────
CREATE TABLE public.workshop_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  location     text,
  max_seats    integer NOT NULL DEFAULT 15,
  is_published boolean NOT NULL DEFAULT false
);

-- ── 2.7 workshop_registrations ──────────────────────────────────────────────
CREATE TABLE public.workshop_registrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.workshop_sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

-- ── 2.8 software ────────────────────────────────────────────────────────────
CREATE TABLE public.software (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  category     text,
  logo_url     text,
  download_url text,
  website_url  text,
  install      text,
  is_free      boolean NOT NULL DEFAULT true,
  is_visible   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 2.9 resources ───────────────────────────────────────────────────────────
CREATE TABLE public.resources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  category     text NOT NULL,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_size    bigint NOT NULL DEFAULT 0,
  file_type    text NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  downloads    integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 2.10 resource_downloads ─────────────────────────────────────────────────
CREATE TABLE public.resource_downloads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2.11 reports ────────────────────────────────────────────────────────────
CREATE TABLE public.reports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'analyzed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2.12 activity_logs ──────────────────────────────────────────────────────
CREATE TABLE public.activity_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event      text NOT NULL,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2.13 system_logs ────────────────────────────────────────────────────────
CREATE TABLE public.system_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level      text NOT NULL DEFAULT 'INFO'
               CHECK (level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
  message    text NOT NULL,
  service    text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_profiles_role            ON public.profiles (role);
CREATE INDEX idx_requests_user_id         ON public.requests (user_id);
CREATE INDEX idx_requests_status          ON public.requests (status);
CREATE INDEX idx_workshop_sessions_wid    ON public.workshop_sessions (workshop_id);
CREATE INDEX idx_workshop_regs_session    ON public.workshop_registrations (session_id);
CREATE INDEX idx_workshop_regs_user       ON public.workshop_registrations (user_id);
CREATE INDEX idx_resources_category       ON public.resources (category);
CREATE INDEX idx_resources_published      ON public.resources (is_published);
CREATE INDEX idx_resource_dl_resource     ON public.resource_downloads (resource_id);
CREATE INDEX idx_reports_user_id          ON public.reports (user_id);
CREATE INDEX idx_reports_status           ON public.reports (status);
CREATE INDEX idx_activity_logs_user       ON public.activity_logs (user_id);
CREATE INDEX idx_activity_logs_created    ON public.activity_logs (created_at DESC);
CREATE INDEX idx_system_logs_level        ON public.system_logs (level);
CREATE INDEX idx_system_logs_created      ON public.system_logs (created_at DESC);
CREATE INDEX idx_contact_submissions_st   ON public.contact_submissions (status);
CREATE INDEX idx_recruitment_submissions  ON public.recruitment_submissions (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fonction helper : get_my_role()
--    Retourne le rôle de l'utilisateur courant depuis la table profiles.
--    Utilisée dans les RLS policies.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Vue : workshop_sessions_with_seats
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.workshop_sessions_with_seats AS
SELECT
  ws.id,
  ws.starts_at,
  ws.ends_at,
  ws.location,
  ws.max_seats,
  ws.is_published,
  ws.max_seats - COALESCE(reg.cnt, 0) AS seats_left,
  w.title       AS workshop_title,
  w.description AS workshop_description,
  w.category    AS workshop_category
FROM public.workshop_sessions ws
JOIN public.workshops w ON w.id = ws.workshop_id
LEFT JOIN (
  SELECT session_id, COUNT(*)::int AS cnt
  FROM public.workshop_registrations
  GROUP BY session_id
) reg ON reg.session_id = ws.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Fonctions
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 4.1 handle_new_user : crée un profil à l'inscription ────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'user'
  );
  RETURN NEW;
END;
$$;

-- ── 4.2 update_updated_at_column : met à jour updated_at ────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 4.3 update_reports_count : met à jour profiles.reports_count ────────────
CREATE OR REPLACE FUNCTION public.update_reports_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
    SET reports_count = COALESCE(reports_count, 0) + 1
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET reports_count = GREATEST(COALESCE(reports_count, 0) - 1, 0)
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;

-- ── 4.4 atomic_workshop_register : inscription atomique à un atelier ────────
CREATE OR REPLACE FUNCTION public.atomic_workshop_register(
  p_session_id uuid,
  p_user_id    uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   int;
  v_count int;
BEGIN
  -- Vérifie que la session existe et est publiée
  SELECT max_seats INTO v_max
  FROM public.workshop_sessions
  WHERE id = p_session_id AND is_published = true;

  IF NOT FOUND THEN
    RETURN 'SESSION_NOT_FOUND';
  END IF;

  -- Vérifie si déjà inscrit
  IF EXISTS (
    SELECT 1 FROM public.workshop_registrations
    WHERE session_id = p_session_id AND user_id = p_user_id
  ) THEN
    RETURN 'ALREADY_REGISTERED';
  END IF;

  -- Compte les inscrits (avec verrou)
  SELECT COUNT(*) INTO v_count
  FROM public.workshop_registrations
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF v_count >= v_max THEN
    RETURN 'SESSION_FULL';
  END IF;

  -- Inscrit
  INSERT INTO public.workshop_registrations (session_id, user_id)
  VALUES (p_session_id, p_user_id);

  RETURN 'OK';
END;
$$;

-- ── 4.5 increment_downloads : incrémente le compteur de téléchargements ─────
CREATE OR REPLACE FUNCTION public.increment_downloads(row_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.resources
  SET downloads = downloads + 1
  WHERE id = row_id
  RETURNING downloads INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;

-- ── 4.6 log_level_counts : statistiques des logs système ────────────────────
CREATE OR REPLACE FUNCTION public.log_level_counts()
RETURNS TABLE (level text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT level, COUNT(*) AS count
  FROM public.system_logs
  GROUP BY level
  ORDER BY level;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- Crée un profil quand un utilisateur s'inscrit via Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Met à jour updated_at sur resources
CREATE TRIGGER set_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Met à jour reports_count sur profiles quand un report est ajouté/supprimé
CREATE TRIGGER on_report_inserted
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reports_count();

CREATE TRIGGER on_report_deleted
  AFTER DELETE ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reports_count();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 6.1 profiles ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_select_all"
  ON public.profiles FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "profiles_admin_update_all"
  ON public.profiles FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- ── 6.2 contact_submissions ────────────────────────────────────────────────
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_anon_insert"
  ON public.contact_submissions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "contact_admin_select"
  ON public.contact_submissions FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "contact_admin_update"
  ON public.contact_submissions FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "contact_admin_delete"
  ON public.contact_submissions FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.3 recruitment_submissions ────────────────────────────────────────────
ALTER TABLE public.recruitment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruitment_anon_insert"
  ON public.recruitment_submissions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "recruitment_admin_select"
  ON public.recruitment_submissions FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "recruitment_admin_update"
  ON public.recruitment_submissions FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "recruitment_admin_delete"
  ON public.recruitment_submissions FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.4 requests ───────────────────────────────────────────────────────────
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_insert_own"
  ON public.requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "requests_select_own"
  ON public.requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "requests_admin_select_all"
  ON public.requests FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "requests_admin_update_all"
  ON public.requests FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "requests_admin_delete_all"
  ON public.requests FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.5 workshops ──────────────────────────────────────────────────────────
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workshops_select_all"
  ON public.workshops FOR SELECT
  USING (true);

CREATE POLICY "workshops_admin_insert"
  ON public.workshops FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "workshops_admin_update"
  ON public.workshops FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "workshops_admin_delete"
  ON public.workshops FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.6 workshop_sessions ──────────────────────────────────────────────────
ALTER TABLE public.workshop_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions_select_published"
  ON public.workshop_sessions FOR SELECT
  USING (is_published = true OR public.get_my_role() = 'admin');

CREATE POLICY "sessions_admin_insert"
  ON public.workshop_sessions FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "sessions_admin_update"
  ON public.workshop_sessions FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "sessions_admin_delete"
  ON public.workshop_sessions FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.7 workshop_registrations ─────────────────────────────────────────────
ALTER TABLE public.workshop_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regs_select_own"
  ON public.workshop_registrations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "regs_insert_own"
  ON public.workshop_registrations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "regs_delete_own"
  ON public.workshop_registrations FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "regs_admin_select_all"
  ON public.workshop_registrations FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "regs_admin_delete_all"
  ON public.workshop_registrations FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.8 software ───────────────────────────────────────────────────────────
ALTER TABLE public.software ENABLE ROW LEVEL SECURITY;

CREATE POLICY "software_select_visible"
  ON public.software FOR SELECT
  USING (is_visible = true OR public.get_my_role() = 'admin');

CREATE POLICY "software_admin_insert"
  ON public.software FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "software_admin_update"
  ON public.software FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "software_admin_delete"
  ON public.software FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.9 resources ──────────────────────────────────────────────────────────
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resources_select_published"
  ON public.resources FOR SELECT
  USING (is_published = true OR public.get_my_role() = 'admin');

CREATE POLICY "resources_admin_insert"
  ON public.resources FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "resources_admin_update"
  ON public.resources FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "resources_admin_delete"
  ON public.resources FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.10 resource_downloads ────────────────────────────────────────────────
ALTER TABLE public.resource_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "downloads_insert_any"
  ON public.resource_downloads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "downloads_admin_select"
  ON public.resource_downloads FOR SELECT
  USING (public.get_my_role() = 'admin');

-- ── 6.11 reports ───────────────────────────────────────────────────────────
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_select_own"
  ON public.reports FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "reports_insert_own"
  ON public.reports FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reports_admin_select_all"
  ON public.reports FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "reports_admin_update_all"
  ON public.reports FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- ── 6.12 activity_logs ─────────────────────────────────────────────────────
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_select_own"
  ON public.activity_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "activity_logs_insert_own"
  ON public.activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "activity_logs_admin_select"
  ON public.activity_logs FOR SELECT
  USING (public.get_my_role() = 'admin');

-- ── 6.13 system_logs ───────────────────────────────────────────────────────
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_logs_admin_select"
  ON public.system_logs FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "system_logs_admin_insert"
  ON public.system_logs FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Storage — bucket "resources"
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resources',
  'resources',
  false,
  52428800, -- 50 Mo max
  ARRAY[
    'application/pdf',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm',
    'text/plain', 'text/csv', 'text/markdown'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage : admins uniquement pour upload/delete, signed URLs via service_role
CREATE POLICY "storage_resources_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'resources'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "storage_resources_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'resources'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "storage_resources_admin_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'resources'
    AND public.get_my_role() = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants (sécurité : accès minimal pour le rôle anon/authenticated)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.profiles              TO authenticated;
GRANT INSERT                 ON public.contact_submissions    TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_submissions    TO authenticated;
GRANT INSERT                 ON public.recruitment_submissions TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.recruitment_submissions TO authenticated;
GRANT SELECT, INSERT         ON public.requests               TO authenticated;
GRANT UPDATE, DELETE         ON public.requests               TO authenticated;
GRANT SELECT                 ON public.workshops              TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.workshops              TO authenticated;
GRANT SELECT                 ON public.workshop_sessions      TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.workshop_sessions      TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.workshop_registrations TO authenticated;
GRANT SELECT                 ON public.software               TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.software               TO authenticated;
GRANT SELECT                 ON public.resources              TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.resources              TO authenticated;
GRANT INSERT                 ON public.resource_downloads     TO anon, authenticated;
GRANT SELECT                 ON public.resource_downloads     TO authenticated;
GRANT SELECT, INSERT         ON public.reports                TO authenticated;
GRANT UPDATE                 ON public.reports                TO authenticated;
GRANT SELECT, INSERT         ON public.activity_logs          TO authenticated;
GRANT SELECT, INSERT         ON public.system_logs            TO authenticated;

-- Vue accessible en lecture
GRANT SELECT ON public.workshop_sessions_with_seats TO anon, authenticated;

-- Fonctions RPC
GRANT EXECUTE ON FUNCTION public.get_my_role()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_workshop_register(uuid, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_downloads(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_level_counts()                         TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN
-- ─────────────────────────────────────────────────────────────────────────────