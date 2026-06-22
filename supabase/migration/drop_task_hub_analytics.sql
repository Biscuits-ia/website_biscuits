-- =============================================================================
-- DROP : Task Hub / Seed / Kanban / Data Analyst Analytics
-- À exécuter manuellement dans Supabase SQL Editor sur la base de production.
--
-- Contexte :
--   Le module Task Hub (gestion de tâches avancée avec corps/P0-P3/sprints/KPIs)
--   et le module data_analyst (analytics) sont retirés du front. Les tables
--   `tasks`, `sprints`, `kpi_snapshots` NE sont PAS supprimées ici — elles
--   restent utilisées par l'espace bénévole pour la gestion des tâches de
--   projet (cf. `src/pages/dashboard/benevole/project/[id].astro`).
--
-- Ce script supprime uniquement :
--   - Le rôle data_analyst ajouté à la table profiles
--   - Les vues analytics (`v_*_analytics`, `v_task_*`)
--   - Les ENUMs ajoutés par le module analytics
--   - Les colonnes spécifiques à l'ancien Task Hub (reference, corps,
--     task_type, time_estimate_hours, time_spent_hours, story_points,
--     sprint_id, acceptance_criteria, deliverables, definition_of_done,
--     dod_completed, tags, blocked_reason, parent_task_id, doc_link,
--     figma_link) — ⚠️ NE PAS exécuter cette partie si l'espace bénévole
--     les utilise encore.
--
-- ⚠️  SAUVEGARDER LA BASE AVANT EXÉCUTION (Supabase → Database → Backups).
-- =============================================================================

BEGIN;

-- ── 1. Vues analytics ─────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_analytics_user_activity       CASCADE;
DROP VIEW IF EXISTS public.v_analytics_task_throughput     CASCADE;
DROP VIEW IF EXISTS public.v_analytics_task_priority       CASCADE;
DROP VIEW IF EXISTS public.v_analytics_corps_workload       CASCADE;
DROP VIEW IF EXISTS public.v_analytics_sprint_velocity     CASCADE;
DROP VIEW IF EXISTS public.v_analytics_kpi_summary         CASCADE;
DROP VIEW IF EXISTS public.v_analytics_signup_funnel       CASCADE;
DROP VIEW IF EXISTS public.v_analytics_appointment_kpis    CASCADE;
DROP VIEW IF EXISTS public.v_analytics_workshop_attendance CASCADE;
DROP VIEW IF EXISTS public.v_analytics_adherent_engagement CASCADE;
DROP VIEW IF EXISTS public.v_analytics_resource_downloads  CASCADE;

-- ── 2. Tâches de fond cron sur les analytics ─────────────────────────────────
--    (déclencheurs ou fonctions créées par add_data_analytics_views.sql)
DROP FUNCTION IF EXISTS public.refresh_analytics_views() CASCADE;

-- ── 3. Retirer 'data_analyst' de la CHECK constraint de profiles.role ────────
--    Avant : CHECK (role IN ('user','admin','moderator','benevole','association','data_analyst'))
--    Après : CHECK (role IN ('user','admin','moderator','benevole','association'))
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%data_analyst%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

-- Migrer les éventuels profils data_analyst vers 'user' (sécurité)
UPDATE public.profiles SET role = 'user' WHERE role = 'data_analyst';

-- Recréer la contrainte sans data_analyst (adapte le nom si différent chez toi)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user','admin','moderator','benevole','association'));

-- ── 4. RLS policies spécifiques au module data_analyst ──────────────────────
--    Le script add_data_analyst_role.sql peut avoir créé des policies nommées
--    "data_analyst_*". On les retire si présentes.
DROP POLICY IF EXISTS "data_analyst_select_all"   ON public.profiles;
DROP POLICY IF EXISTS "data_analyst_select_tasks" ON public.tasks;
DROP POLICY IF EXISTS "data_analyst_select_kpis"  ON public.kpi_snapshots;
DROP POLICY IF EXISTS "data_analyst_select_sprints" ON public.sprints;

-- ── 5. ENUMs ajoutés par le module Task Hub ──────────────────────────────────
--    (créés dans task_management_full.sql / add_data_analytics_views.sql)
DROP TYPE IF EXISTS public.corps_type     CASCADE;
DROP TYPE IF EXISTS public.priority_level CASCADE;
DROP TYPE IF EXISTS public.task_status    CASCADE;
DROP TYPE IF EXISTS public.task_type      CASCADE;

-- ── 6. (OPTIONNEL) Colonnes Task Hub sur la table `tasks` ────────────────────
--    ⚠️  NE décommente QUE si l'espace bénévole n'utilise pas ces colonnes.
--    Aujourd'hui, `src/pages/dashboard/benevole/project/[id].astro` lit
--    `corps` et `task_type` pour l'affichage Kanban. Donc on les GARDE.
--
-- ALTER TABLE public.tasks
--   DROP COLUMN IF EXISTS reference,
--   DROP COLUMN IF EXISTS corps,
--   DROP COLUMN IF EXISTS task_type,
--   DROP COLUMN IF EXISTS time_estimate_hours,
--   DROP COLUMN IF EXISTS time_spent_hours,
--   DROP COLUMN IF EXISTS story_points,
--   DROP COLUMN IF EXISTS sprint_id,
--   DROP COLUMN IF EXISTS acceptance_criteria,
--   DROP COLUMN IF EXISTS deliverables,
--   DROP COLUMN IF EXISTS definition_of_done,
--   DROP COLUMN IF EXISTS dod_completed,
--   DROP COLUMN IF EXISTS tags,
--   DROP COLUMN IF EXISTS blocked_reason,
--   DROP COLUMN IF EXISTS parent_task_id,
--   DROP COLUMN IF EXISTS doc_link,
--   DROP COLUMN IF EXISTS figma_link;

COMMIT;

-- ── 7. Vérifications post-exécution ──────────────────────────────────────────
-- SELECT count(*) FROM public.profiles WHERE role = 'data_analyst';   -- doit être 0
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';   -- role check propre
