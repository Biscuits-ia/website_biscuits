-- =============================================================================
-- Biscuits IA — Migration : enrichissement des projets (brief détaillé)
-- Générée le 30/04/2026
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS expected_deliverables text,
  ADD COLUMN IF NOT EXISTS tech_stack text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tools text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS repository_url text,
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS communication_channel text,
  ADD COLUMN IF NOT EXISTS estimated_hours integer,
  ADD COLUMN IF NOT EXISTS start_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_estimated_hours_check'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_estimated_hours_check
      CHECK (estimated_hours IS NULL OR estimated_hours >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.projects.objective IS 'Objectif principal du projet';
COMMENT ON COLUMN public.projects.expected_deliverables IS 'Livrables attendus';
COMMENT ON COLUMN public.projects.tech_stack IS 'Stack technique visée (array de tags)';
COMMENT ON COLUMN public.projects.tools IS 'Outils recommandés (array de tags)';
COMMENT ON COLUMN public.projects.repository_url IS 'Lien dépôt code';
COMMENT ON COLUMN public.projects.document_url IS 'Lien de documentation';
COMMENT ON COLUMN public.projects.communication_channel IS 'Canal de communication (Discord/Slack/etc.)';
COMMENT ON COLUMN public.projects.estimated_hours IS 'Charge estimée en heures';
COMMENT ON COLUMN public.projects.start_date IS 'Date de démarrage cible';
