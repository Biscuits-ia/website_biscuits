-- =============================================================================
-- Biscuits IA — Migration : suppression du module trombinoscope / equipe
-- =============================================================================
-- DESTRUCTIF ET IRREVERSIBLE : la fiche de chaque benevole et sa photo sont
-- perdues. Verifier qu'une sauvegarde de la base ET du bucket storage existe
-- avant d'appliquer.
--
-- Motif : depuis la suppression de la page publique /trombinoscope, la table
-- n'alimentait plus que deux ecrans internes (le CRUD admin et la vue equipe
-- de l'espace benevole), eux-memes supprimes avec ce lot. Plus aucune surface,
-- publique ou interne, ne lit ces donnees.
--
-- A NE PAS CONFONDRE avec la gestion des comptes : les benevoles restent des
-- utilisateurs a part entiere via public.profiles et profiles.role = 'benevole'.
-- Cette table ne portait que la fiche de presentation (photo, bio, ordre
-- d'affichage) destinee au trombinoscope public.
--
-- Ordre : policies storage -> objets du bucket -> bucket -> table
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Policies du bucket storage 'benevoles'
--    Portees par storage.objects, table conservee : a supprimer explicitement,
--    aucun CASCADE ne les emporte.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "benevoles_photos_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "benevoles_photos_admin_write"  ON storage.objects;
DROP POLICY IF EXISTS "benevoles_photos_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "benevoles_photos_admin_delete" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contenu du bucket, puis le bucket lui-meme
--    storage.buckets refuse la suppression d'un bucket non vide.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM storage.objects WHERE bucket_id = 'benevoles';
DELETE FROM storage.buckets WHERE id = 'benevoles';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Table benevoles
--    Le trigger trg_benevoles_updated_at, les index et les policies RLS
--    partent avec le CASCADE.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.benevoles CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Note : la migration 20260713150000_benevoles_fix_anon_read.sql est
--    conservee malgre son nom. Elle ne touche pas a benevoles : elle execute
--    GRANT SELECT ON public.profiles TO anon, authenticated, necessaire a
--    l'evaluation des policies RLS qui traversent profiles. La supprimer
--    casserait l'authentification.
-- ─────────────────────────────────────────────────────────────────────────────
