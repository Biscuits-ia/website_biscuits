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
-- 0.5 Schema Migration (handle existing tables)
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop old volunteer_appointments if it exists (to rebuild with new schema)
DROP TABLE IF EXISTS public.volunteer_appointments CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 2.1 profiles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL,
  full_name       text,
  role            text NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'moderator', 'admin', 'benevole', 'association')),
  reports_count   integer DEFAULT 0,
  last_sign_in_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profiles IS 'Profil utilisateur — créé automatiquement via trigger on_auth_user_created';

-- ── 2.2 contact_submissions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_submissions (
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
CREATE TABLE IF NOT EXISTS public.recruitment_submissions (
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
CREATE TABLE IF NOT EXISTS public.requests (
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
CREATE TABLE IF NOT EXISTS public.workshops (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  category    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2.6 workshop_sessions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workshop_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  location     text,
  max_seats    integer NOT NULL DEFAULT 15,
  is_published boolean NOT NULL DEFAULT false
);

-- ── 2.7 workshop_registrations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workshop_registrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.workshop_sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

-- ── 2.8 software ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.software (
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
CREATE TABLE IF NOT EXISTS public.resources (
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
CREATE TABLE IF NOT EXISTS public.resource_downloads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2.11 reports ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'analyzed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2.12 activity_logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event      text NOT NULL,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2.13 system_logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level      text NOT NULL DEFAULT 'INFO'
               CHECK (level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
  message    text NOT NULL,
  service    text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2.14 partners ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  collaboration   text,
  logo_url        text,
  website_url     text,
  expertise       text[] DEFAULT ARRAY[]::text[],
  display_order   integer DEFAULT 0,
  is_published    boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.partners IS 'Partenaires de confiance — entreprises avec lesquelles nous travaillons';

-- ── 2.15 appointment_slots ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time      timestamptz NOT NULL,
  end_time        timestamptz NOT NULL,
  is_available    boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.appointment_slots IS 'Créneaux de rendez-vous disponibles configurés par l''admin';

-- ── 2.16 volunteer_appointments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.volunteer_appointments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid REFERENCES public.appointment_slots(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_email text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.volunteer_appointments IS 'Réservations de rendez-vous — utilisateurs et candidats';

-- Colonne expires_at : politique de rétention (30j par défaut, mise via trigger).
-- Index fonctionnel pour le worker pg_cron `expire_pending_appointments`.
ALTER TABLE public.volunteer_appointments
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_volunteer_appt_expires_at
  ON public.volunteer_appointments (expires_at)
  WHERE status = 'pending' AND expires_at IS NOT NULL;

-- Trigger : à la création d'un RDV, pose expires_at à now() + 30 jours.
CREATE OR REPLACE FUNCTION public.set_appointment_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_volunteer_appt_expiry ON public.volunteer_appointments;
CREATE TRIGGER trg_volunteer_appt_expiry
  BEFORE INSERT ON public.volunteer_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_expiry();

-- ── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role            ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_requests_user_id         ON public.requests (user_id);
CREATE INDEX IF NOT EXISTS idx_requests_status          ON public.requests (status);
CREATE INDEX IF NOT EXISTS idx_workshop_sessions_wid    ON public.workshop_sessions (workshop_id);
CREATE INDEX IF NOT EXISTS idx_workshop_regs_session    ON public.workshop_registrations (session_id);
CREATE INDEX IF NOT EXISTS idx_workshop_regs_user       ON public.workshop_registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_resources_category       ON public.resources (category);
CREATE INDEX IF NOT EXISTS idx_resources_published      ON public.resources (is_published);
CREATE INDEX IF NOT EXISTS idx_resource_dl_resource     ON public.resource_downloads (resource_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_id          ON public.reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status           ON public.reports (status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user       ON public.activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created    ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level        ON public.system_logs (level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created      ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_st   ON public.contact_submissions (status);
CREATE INDEX IF NOT EXISTS idx_recruitment_submissions  ON public.recruitment_submissions (status);
CREATE INDEX IF NOT EXISTS idx_partners_published       ON public.partners (is_published);
CREATE INDEX IF NOT EXISTS idx_partners_display_order   ON public.partners (display_order);
CREATE INDEX IF NOT EXISTS idx_appointment_slots_available    ON public.appointment_slots (is_available);
CREATE INDEX IF NOT EXISTS idx_appointment_slots_start_time   ON public.appointment_slots (start_time);
CREATE INDEX IF NOT EXISTS idx_volunteer_appt_slot_id   ON public.volunteer_appointments (slot_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_appt_user_id   ON public.volunteer_appointments (user_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_appt_status    ON public.volunteer_appointments (status);
CREATE INDEX IF NOT EXISTS idx_volunteer_appt_email     ON public.volunteer_appointments (candidate_email);

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
CREATE OR REPLACE VIEW public.workshop_sessions_with_seats
WITH (security_invoker = true) AS
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
DROP TRIGGER IF EXISTS set_resources_updated_at ON public.resources;
CREATE TRIGGER set_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Met à jour updated_at sur appointment_slots
DROP TRIGGER IF EXISTS set_appointment_slots_updated_at ON public.appointment_slots;
CREATE TRIGGER set_appointment_slots_updated_at
  BEFORE UPDATE ON public.appointment_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Met à jour updated_at sur volunteer_appointments
DROP TRIGGER IF EXISTS set_volunteer_appointments_updated_at ON public.volunteer_appointments;
CREATE TRIGGER set_volunteer_appointments_updated_at
  BEFORE UPDATE ON public.volunteer_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Met à jour reports_count sur profiles quand un report est ajouté/supprimé
DROP TRIGGER IF EXISTS on_report_inserted ON public.reports;
CREATE TRIGGER on_report_inserted
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reports_count();

DROP TRIGGER IF EXISTS on_report_deleted ON public.reports;
CREATE TRIGGER on_report_deleted
  AFTER DELETE ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_reports_count();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Row Level Security (RLS)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 6.1 profiles ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_admin_select_all" ON public.profiles;
CREATE POLICY "profiles_admin_select_all"
  ON public.profiles FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "profiles_admin_update_all" ON public.profiles;
CREATE POLICY "profiles_admin_update_all"
  ON public.profiles FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- ── 6.2 contact_submissions ────────────────────────────────────────────────
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_anon_insert" ON public.contact_submissions;
CREATE POLICY "contact_anon_insert"
  ON public.contact_submissions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "contact_admin_select" ON public.contact_submissions;
CREATE POLICY "contact_admin_select"
  ON public.contact_submissions FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "contact_admin_update" ON public.contact_submissions;
CREATE POLICY "contact_admin_update"
  ON public.contact_submissions FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "contact_admin_delete" ON public.contact_submissions;
CREATE POLICY "contact_admin_delete"
  ON public.contact_submissions FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.3 recruitment_submissions ────────────────────────────────────────────
ALTER TABLE public.recruitment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recruitment_anon_insert" ON public.recruitment_submissions;
CREATE POLICY "recruitment_anon_insert"
  ON public.recruitment_submissions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "recruitment_admin_select" ON public.recruitment_submissions;
CREATE POLICY "recruitment_admin_select"
  ON public.recruitment_submissions FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "recruitment_admin_update" ON public.recruitment_submissions;
CREATE POLICY "recruitment_admin_update"
  ON public.recruitment_submissions FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "recruitment_admin_delete" ON public.recruitment_submissions;
CREATE POLICY "recruitment_admin_delete"
  ON public.recruitment_submissions FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.4 requests ───────────────────────────────────────────────────────────
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests_insert_own" ON public.requests;
CREATE POLICY "requests_insert_own"
  ON public.requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "requests_select_own" ON public.requests;
CREATE POLICY "requests_select_own"
  ON public.requests FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "requests_admin_select_all" ON public.requests;
CREATE POLICY "requests_admin_select_all"
  ON public.requests FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "requests_admin_update_all" ON public.requests;
CREATE POLICY "requests_admin_update_all"
  ON public.requests FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "requests_admin_delete_all" ON public.requests;
CREATE POLICY "requests_admin_delete_all"
  ON public.requests FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.5 workshops ──────────────────────────────────────────────────────────
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workshops_select_all" ON public.workshops;
CREATE POLICY "workshops_select_all"
  ON public.workshops FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "workshops_admin_insert" ON public.workshops;
CREATE POLICY "workshops_admin_insert"
  ON public.workshops FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "workshops_admin_update" ON public.workshops;
CREATE POLICY "workshops_admin_update"
  ON public.workshops FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "workshops_admin_delete" ON public.workshops;
CREATE POLICY "workshops_admin_delete"
  ON public.workshops FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.6 workshop_sessions ──────────────────────────────────────────────────
ALTER TABLE public.workshop_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_published" ON public.workshop_sessions;
CREATE POLICY "sessions_select_published"
  ON public.workshop_sessions FOR SELECT
  USING (is_published = true OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "sessions_admin_insert" ON public.workshop_sessions;
CREATE POLICY "sessions_admin_insert"
  ON public.workshop_sessions FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "sessions_admin_update" ON public.workshop_sessions;
CREATE POLICY "sessions_admin_update"
  ON public.workshop_sessions FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "sessions_admin_delete" ON public.workshop_sessions;
CREATE POLICY "sessions_admin_delete"
  ON public.workshop_sessions FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.7 workshop_registrations ─────────────────────────────────────────────
ALTER TABLE public.workshop_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regs_select_own" ON public.workshop_registrations;
CREATE POLICY "regs_select_own"
  ON public.workshop_registrations FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "regs_insert_own" ON public.workshop_registrations;
CREATE POLICY "regs_insert_own"
  ON public.workshop_registrations FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "regs_delete_own" ON public.workshop_registrations;
CREATE POLICY "regs_delete_own"
  ON public.workshop_registrations FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "regs_admin_select_all" ON public.workshop_registrations;
CREATE POLICY "regs_admin_select_all"
  ON public.workshop_registrations FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "regs_admin_delete_all" ON public.workshop_registrations;
CREATE POLICY "regs_admin_delete_all"
  ON public.workshop_registrations FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.8 software ───────────────────────────────────────────────────────────
ALTER TABLE public.software ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "software_select_visible" ON public.software;
CREATE POLICY "software_select_visible"
  ON public.software FOR SELECT
  USING (is_visible = true OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "software_admin_insert" ON public.software;
CREATE POLICY "software_admin_insert"
  ON public.software FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "software_admin_update" ON public.software;
CREATE POLICY "software_admin_update"
  ON public.software FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "software_admin_delete" ON public.software;
CREATE POLICY "software_admin_delete"
  ON public.software FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.9 resources ──────────────────────────────────────────────────────────
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resources_select_published" ON public.resources;
CREATE POLICY "resources_select_published"
  ON public.resources FOR SELECT
  USING (is_published = true OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "resources_admin_insert" ON public.resources;
CREATE POLICY "resources_admin_insert"
  ON public.resources FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "resources_admin_update" ON public.resources;
CREATE POLICY "resources_admin_update"
  ON public.resources FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "resources_admin_delete" ON public.resources;
CREATE POLICY "resources_admin_delete"
  ON public.resources FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.10 resource_downloads ────────────────────────────────────────────────
ALTER TABLE public.resource_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "downloads_insert_any" ON public.resource_downloads;
CREATE POLICY "downloads_insert_any"
  ON public.resource_downloads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "downloads_admin_select" ON public.resource_downloads;
CREATE POLICY "downloads_admin_select"
  ON public.resource_downloads FOR SELECT
  USING (public.get_my_role() = 'admin');

-- ── 6.11 reports ───────────────────────────────────────────────────────────
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
CREATE POLICY "reports_select_own"
  ON public.reports FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own"
  ON public.reports FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reports_admin_select_all" ON public.reports;
CREATE POLICY "reports_admin_select_all"
  ON public.reports FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "reports_admin_update_all" ON public.reports;
CREATE POLICY "reports_admin_update_all"
  ON public.reports FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- ── 6.12 activity_logs ─────────────────────────────────────────────────────
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select_own" ON public.activity_logs;
CREATE POLICY "activity_logs_select_own"
  ON public.activity_logs FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "activity_logs_insert_own" ON public.activity_logs;
CREATE POLICY "activity_logs_insert_own"
  ON public.activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "activity_logs_admin_select" ON public.activity_logs;
CREATE POLICY "activity_logs_admin_select"
  ON public.activity_logs FOR SELECT
  USING (public.get_my_role() = 'admin');

-- ── 6.13 system_logs ───────────────────────────────────────────────────────
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_logs_admin_select" ON public.system_logs;
CREATE POLICY "system_logs_admin_select"
  ON public.system_logs FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "system_logs_admin_insert" ON public.system_logs;
CREATE POLICY "system_logs_admin_insert"
  ON public.system_logs FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

-- ── 6.14 partners ──────────────────────────────────────────────────────────
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partners_select_published" ON public.partners;
CREATE POLICY "partners_select_published"
  ON public.partners FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "partners_admin_select_all" ON public.partners;
CREATE POLICY "partners_admin_select_all"
  ON public.partners FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "partners_admin_insert" ON public.partners;
CREATE POLICY "partners_admin_insert"
  ON public.partners FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "partners_admin_update" ON public.partners;
CREATE POLICY "partners_admin_update"
  ON public.partners FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "partners_admin_delete" ON public.partners;
CREATE POLICY "partners_admin_delete"
  ON public.partners FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.15 appointment_slots ────────────────────────────────────────────────
ALTER TABLE public.appointment_slots ENABLE ROW LEVEL SECURITY;

-- Tous peuvent voir les créneaux disponibles
DROP POLICY IF EXISTS "slots_select_available" ON public.appointment_slots;
CREATE POLICY "slots_select_available"
  ON public.appointment_slots FOR SELECT
  USING (is_available = true OR public.get_my_role() = 'admin');

-- Admin: accès complet
DROP POLICY IF EXISTS "slots_admin_select_all" ON public.appointment_slots;
CREATE POLICY "slots_admin_select_all"
  ON public.appointment_slots FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "slots_admin_insert" ON public.appointment_slots;
CREATE POLICY "slots_admin_insert"
  ON public.appointment_slots FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "slots_admin_update" ON public.appointment_slots;
CREATE POLICY "slots_admin_update"
  ON public.appointment_slots FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "slots_admin_delete" ON public.appointment_slots;
CREATE POLICY "slots_admin_delete"
  ON public.appointment_slots FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ── 6.16 volunteer_appointments ────────────────────────────────────────────
ALTER TABLE public.volunteer_appointments ENABLE ROW LEVEL SECURITY;

-- Utilisateurs peuvent voir leurs propres réservations
DROP POLICY IF EXISTS "volunteer_appt_select_own" ON public.volunteer_appointments;
CREATE POLICY "volunteer_appt_select_own"
  ON public.volunteer_appointments FOR SELECT
  USING (user_id = auth.uid());

-- Utilisateurs peuvent créer leurs propres réservations
DROP POLICY IF EXISTS "volunteer_appt_insert_own" ON public.volunteer_appointments;
CREATE POLICY "volunteer_appt_insert_own"
  ON public.volunteer_appointments FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Utilisateurs peuvent supprimer leurs propres réservations
DROP POLICY IF EXISTS "volunteer_appt_delete_own" ON public.volunteer_appointments;
CREATE POLICY "volunteer_appt_delete_own"
  ON public.volunteer_appointments FOR DELETE
  USING (user_id = auth.uid());

-- Admin: accès complet
DROP POLICY IF EXISTS "volunteer_appt_admin_select_all" ON public.volunteer_appointments;
CREATE POLICY "volunteer_appt_admin_select_all"
  ON public.volunteer_appointments FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "volunteer_appt_admin_insert" ON public.volunteer_appointments;
CREATE POLICY "volunteer_appt_admin_insert"
  ON public.volunteer_appointments FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "volunteer_appt_admin_update" ON public.volunteer_appointments;
CREATE POLICY "volunteer_appt_admin_update"
  ON public.volunteer_appointments FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "volunteer_appt_admin_delete" ON public.volunteer_appointments;
CREATE POLICY "volunteer_appt_admin_delete"
  ON public.volunteer_appointments FOR DELETE
  USING (public.get_my_role() = 'admin');

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
DROP POLICY IF EXISTS "storage_resources_admin_insert" ON storage.objects;
CREATE POLICY "storage_resources_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'resources'
    AND public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "storage_resources_admin_delete" ON storage.objects;
CREATE POLICY "storage_resources_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'resources'
    AND public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "storage_resources_admin_select" ON storage.objects;
CREATE POLICY "storage_resources_admin_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'resources'
    AND public.get_my_role() = 'admin'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.5 email_outbox — file d'attente d'emails transactionnels
--     Table nécessaire au worker pg_cron (cf. 20260624_pg_cron_email_outbox.sql).
--     Le code applicatif (src/lib/email-queue.ts) écrit via createSupabaseAdminClient
--     (service_role) qui bypasse la RLS, donc on ne GRANT INSERT/UPDATE
--     qu'au service_role. Les admins lisent via SELECT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email        text        NOT NULL,
  to_name         text,
  from_email      text        NOT NULL,
  from_name       text,
  reply_to_email  text,
  subject         text        NOT NULL,
  text_body       text,
  html_body       text,
  headers         jsonb       NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead')),
  attempts        integer     NOT NULL DEFAULT 0,
  max_attempts    integer     NOT NULL DEFAULT 8,
  last_error      text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.email_outbox IS
  'File d attente d emails transactionnels. Worker pg_cron = /api/cron/email-outbox.';

CREATE INDEX IF NOT EXISTS idx_email_outbox_pending
  ON public.email_outbox (next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_email_outbox_status
  ON public.email_outbox (status, created_at DESC);

-- Helper updated_at unique pour toutes les tables qui en ont besoin.
-- Idempotent : CREATE OR REPLACE = pas de doublon si un autre fichier l'a
-- deja declare avec le meme corps.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_outbox_updated_at ON public.email_outbox;
CREATE TRIGGER trg_email_outbox_updated_at
  BEFORE UPDATE ON public.email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

-- Lecture admin uniquement (les users ne lisent jamais directement).
DROP POLICY IF EXISTS "email_outbox_admin_select" ON public.email_outbox;
CREATE POLICY "email_outbox_admin_select"
  ON public.email_outbox FOR SELECT
  USING (public.get_my_role() = 'admin');

-- Pas de policy INSERT/UPDATE/DELETE pour authenticated : tout passe par
-- service_role (createSupabaseAdminClient dans src/lib/email-queue.ts et
-- src/pages/api/cron/email-outbox.ts).

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
GRANT SELECT                 ON public.partners               TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.partners               TO authenticated;
GRANT SELECT                 ON public.appointment_slots      TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.appointment_slots      TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.volunteer_appointments TO authenticated;

-- Vue accessible en lecture
GRANT SELECT ON public.workshop_sessions_with_seats TO anon, authenticated;

-- Fonctions RPC
GRANT EXECUTE ON FUNCTION public.get_my_role()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_workshop_register(uuid, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_downloads(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_level_counts()                         TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RDV : index perf + partial unique anti-double-booking
--   1. idx_vol_app_slot_status : accélère le filtre (slot_id, status) sur les
--      requêtes `available-slots` qui croisent appointment_slots × appointments.
--   2. uniq_active_appointment_per_slot : un seul RDV actif (pending|confirmed)
--      par slot. Les RDV annulés (cancelled) sont autorisés en multi-occupance
--      (cas légitime d'historique).
--   Niveau BDD : ferme la race condition que les checks applicatifs ne peuvent
--   pas garantir (deux POST concurrents qui passent les deux `maybeSingle`
--   avant qu'un des deux INSERT ne commit).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vol_app_slot_status
  ON public.volunteer_appointments (slot_id, status)
  WHERE status IN ('pending', 'confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_appointment_per_slot
  ON public.volunteer_appointments (slot_id)
  WHERE status IN ('pending', 'confirmed') AND slot_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIN
-- ─────────────────────────────────────────────────────────────────────────────