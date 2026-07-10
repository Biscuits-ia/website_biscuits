-- =============================================================================
-- Migration : Gestion des prix pour les ateliers
-- Date : 2026-04-18
-- =============================================================================
-- Ajout des colonnes de prix sur workshops (prix par défaut)
-- et workshop_sessions (prix de substitution par session)
-- Les montants sont stockés en centimes (integer) pour éviter les virgules flottantes.
-- Cette migration est autonome : elle crée les tables si elles n'existent pas.
-- =============================================================================

-- ── 0. Tables de base (idempotentes) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workshops (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  category    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workshop_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id  uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  location     text,
  max_seats    integer NOT NULL DEFAULT 15,
  is_published boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.workshop_registrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.workshop_sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

-- ── 1. Nouvelles colonnes sur workshops ──────────────────────────────────────

ALTER TABLE public.workshops
  ADD COLUMN IF NOT EXISTS price_cents    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_label    text,           -- ex: "Gratuit", "35 €", "Sur devis"
  ADD COLUMN IF NOT EXISTS is_free        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS level          text;           -- ex: "Débutant", "Intermédiaire", "Avancé"

-- ── 2. Nouvelles colonnes sur workshop_sessions ───────────────────────────────
-- price_cents nullable : si NULL, hérite de workshops.price_cents

ALTER TABLE public.workshop_sessions
  ADD COLUMN IF NOT EXISTS price_cents    integer,        -- override du prix pour cette session
  ADD COLUMN IF NOT EXISTS price_label    text,           -- libellé affiché (override)
  ADD COLUMN IF NOT EXISTS online         boolean NOT NULL DEFAULT false;

-- ── 3. Mise à jour de la vue workshop_sessions_with_seats ────────────────────

-- IF EXISTS : permet d'appliquer cette migration seule (la vue peut deja
-- exister via 20251231_0000_initial_schema.sql, ou pas si la migration
-- initiale n a pas ete appliquee avant).
DROP VIEW IF EXISTS public.workshop_sessions_with_seats;

CREATE OR REPLACE VIEW public.workshop_sessions_with_seats
WITH (security_invoker = true) AS
SELECT
  ws.id,
  ws.starts_at,
  ws.ends_at,
  ws.location,
  ws.online,
  ws.max_seats,
  ws.is_published,
  ws.max_seats - COALESCE(reg.cnt, 0) AS seats_left,
  w.title         AS workshop_title,
  w.description   AS workshop_description,
  w.category      AS workshop_category,
  w.level         AS workshop_level,
  -- Prix résolu : session override ou valeur atelier
  COALESCE(ws.price_cents, w.price_cents) AS price_cents,
  COALESCE(ws.price_label, w.price_label) AS price_label,
  COALESCE(ws.price_cents IS NOT NULL AND ws.price_cents = 0,
           w.price_cents = 0,
           true)                           AS is_free
FROM public.workshop_sessions ws
JOIN public.workshops w ON w.id = ws.workshop_id
LEFT JOIN (
  SELECT session_id, COUNT(*)::int AS cnt
  FROM public.workshop_registrations
  GROUP BY session_id
) reg ON reg.session_id = ws.id;
