-- ============================================================================
-- Migration : RPC get_outbox_stats()
-- Date       : 2026-06-24
-- ----------------------------------------------------------------------------
-- FIX P1 2.5 : Remplace l'agregation cote Node (getOutboxStats() ramenait
-- toute la table email_outbox en memoire pour compter par status). Avec le
-- temps, la table peut contenir plusieurs dizaines de milliers de lignes,
-- ce qui ralentit le dashboard admin et consomme inutilement de la bande
-- passante + memoire. La RPC fait le COUNT() en SQL, filtre par status
-- indexe, et ne retourne que 6 entiers.
--
-- Securite : SECURITY DEFINER + search_path verrouille, accessible uniquement
-- au service_role (les admins lisent via le code qui utilise le client admin).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_outbox_stats()
RETURNS TABLE (
  pending bigint,
  sending bigint,
  sent    bigint,
  failed  bigint,
  dead    bigint,
  total   bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE status = 'sending') AS sending,
    COUNT(*) FILTER (WHERE status = 'sent')    AS sent,
    COUNT(*) FILTER (WHERE status = 'failed')  AS failed,
    COUNT(*) FILTER (WHERE status = 'dead')    AS dead,
    COUNT(*)                                       AS total
  FROM public.email_outbox;
$$;

COMMENT ON FUNCTION public.get_outbox_stats()
  IS 'Stats agregees de la file email_outbox (compteurs par statut). FIX P1 2.5.';

REVOKE ALL ON FUNCTION public.get_outbox_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outbox_stats() TO service_role;
