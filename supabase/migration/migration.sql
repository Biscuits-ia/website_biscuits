-- ============================================================
-- Biscuits IA — Migration Supabase
-- À exécuter dans l'éditeur SQL de Supabase
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Table : profiles ─────────────────────────────────────────
-- Liée à auth.users via trigger (complète les données utilisateur)
CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text,
  full_name        text,
  role             text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  reports_count    int  NOT NULL DEFAULT 0,
  last_sign_in_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Trigger : crée automatiquement un profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Table : reports ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       text,
  content     text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzed', 'rejected', 'archived')),
  ai_score    int  CHECK (ai_score BETWEEN 0 AND 100),
  ai_summary  text,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_reports_user_id   ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status    ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created   ON public.reports(created_at DESC);

-- Trigger : incrémente reports_count sur profiles
CREATE OR REPLACE FUNCTION public.update_reports_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET reports_count = (
    SELECT COUNT(*) FROM public.reports WHERE user_id = NEW.user_id
  )
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_report_created ON public.reports;
CREATE TRIGGER on_report_created
  AFTER INSERT OR DELETE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_reports_count();

-- ── Table : activity_logs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event       text NOT NULL,
  event_type  text,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_user_id  ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created  ON public.activity_logs(created_at DESC);

-- ── Table : system_logs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  level       text NOT NULL DEFAULT 'INFO' CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
  service     text,
  message     text NOT NULL,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_level   ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON public.system_logs(created_at DESC);

-- ── RPC : reports_by_month ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reports_by_month(p_user_id uuid)
RETURNS TABLE(month text, count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
    COUNT(*) AS count
  FROM public.reports
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '12 months'
  GROUP BY month
  ORDER BY month;
$$;

-- ── RPC : reports_daily_trend ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.reports_daily_trend()
RETURNS TABLE(day date, count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    date_trunc('day', created_at)::date AS day,
    COUNT(*) AS count
  FROM public.reports
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY day
  ORDER BY day;
$$;

-- ── RPC : log_level_counts ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_level_counts()
RETURNS TABLE(level text, count bigint)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT level, COUNT(*) AS count
  FROM public.system_logs
  GROUP BY level;
$$;

-- ── RLS Policies ─────────────────────────────────────────────

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins can view all reports"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

CREATE POLICY "admins can update reports"
  ON public.reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own activity"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins can view all activity"
  ON public.activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "service can insert activity"
  ON public.activity_logs FOR INSERT
  WITH CHECK (true);  -- restreindre via service_role en production

-- system_logs
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins only"
  ON public.system_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "service can insert system logs"
  ON public.system_logs FOR INSERT
  WITH CHECK (true);  -- restreindre via service_role en production

-- ── Table : resources ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resources (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         text NOT NULL,
  description   text,
  category      text,
  file_url      text,
  is_free       boolean NOT NULL DEFAULT false,
  published     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_resources_category ON public.resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_published ON public.resources(published);
CREATE INDEX IF NOT EXISTS idx_resources_created   ON public.resources(created_at DESC);

-- Trigger : met à jour updated_at
CREATE OR REPLACE FUNCTION public.update_resources_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_resource_updated ON public.resources;
CREATE TRIGGER on_resource_updated
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.update_resources_timestamp();

-- RLS Policies pour resources
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can manage all resources"
  ON public.resources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "users can view published resources"
  ON public.resources FOR SELECT
  USING (published = true);

-- ============================================================
-- FIN DE LA MIGRATION
-- ============================================================
