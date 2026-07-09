-- ============================================================================
-- Migration : retrait de l'integration HelloAsso
-- Date       : 2026-07-09
-- ----------------------------------------------------------------------------
-- ⚠️  MIGRATION DESTRUCTIVE — LISEZ AVANT `supabase db push`
--
-- Elle supprime DEFINITIVEMENT l'historique des paiements encaisses via
-- HelloAsso (table `helloasso_payments`) et leurs remboursements
-- (`helloasso_refunds`).
--
-- OBLIGATION LEGALE : l'article L123-22 du code de commerce impose de
-- conserver les pieces comptables PENDANT 10 ANS. Avant d'appliquer cette
-- migration :
--   1. exportez les tables (Supabase > Table Editor > Export CSV), ou
--   2. remplacez les DROP par des renommages d'archivage :
--        ALTER TABLE public.helloasso_payments RENAME TO helloasso_payments_archive;
--        ALTER TABLE public.helloasso_refunds  RENAME TO helloasso_refunds_archive;
--
-- Ce qui N'EST PAS supprime, volontairement :
--   * `training_registrations.payment_method = 'helloasso'` et
--     `training_payments.provider = 'helloasso'` : ce sont des faits
--     historiques. Les reecrire en 'transfer' falsifierait la comptabilite.
--     La contrainte CHECK garde donc 'helloasso' comme valeur legale, mais
--     `paymentMethodSchema` (src/lib/formations.ts) l'a retiree cote
--     applicatif : aucune nouvelle ligne ne peut plus la porter.
--
-- NB : `helloasso_refunds` et la vue `training_revenue_by_month` n'ont jamais
-- ete creees par une migration versionnee (la migration
-- `20260624_email_queue_and_refunds.sql` citee par l'ancien code n'existe pas
-- dans ce depot). Elles ont donc ete creees a la main, ou jamais. D'ou les
-- `IF EXISTS` systematiques ci-dessous.
-- ============================================================================

-- 1. Vue de CA : depend de helloasso_payments. Recreee sans elle serait un
--    autre chantier ; on la supprime, elle n'est referencee par aucun code.
DROP VIEW IF EXISTS public.training_revenue_by_month;

-- 2. Tables de paiement HelloAsso.
--    Ordre : refunds (FK) avant payments.
DROP TABLE IF EXISTS public.helloasso_refunds;
DROP TABLE IF EXISTS public.helloasso_payments;

-- 3. Jetons OAuth2 de l'API HelloAsso. Aucun interet de conservation : ce sont
--    des secrets a duree de vie courte, pas des pieces comptables.
DROP TABLE IF EXISTS public.helloasso_oauth_tokens;

-- 4. Colonne de configuration `helloasso_form_url` (URL du formulaire dedie).
--    C'est de la configuration, pas de l'historique : rien a conserver.
--    La vue `training_sessions_with_seats` la projette -> on la recree d'abord.
DROP VIEW IF EXISTS public.training_sessions_with_seats;

ALTER TABLE public.training_sessions
  DROP COLUMN IF EXISTS helloasso_form_url;

-- 5. Recreation de la vue, identique a 20260624_add_trainings.sql mais sans
--    `ts.helloasso_form_url`. security_invoker = true : ne contourne pas les RLS.
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

COMMENT ON VIEW public.training_sessions_with_seats IS
  'Sessions de formation + places restantes + prix resolu. helloasso_form_url retiree le 2026-07-09.';
