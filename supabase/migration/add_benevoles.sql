-- =============================================================================
-- Biscuits IA — Migration : table benevoles + storage
-- Générée le 27/04/2026
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table benevoles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.benevoles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom       text        NOT NULL,
  nom          text        NOT NULL,
  -- Rôle au sein de l'association
  role         text        NOT NULL DEFAULT 'benevole'
                 CHECK (role IN ('benevole', 'membre_ca', 'membre_bureau')),
  -- Compétences : tableau de texte libre (ex. '{"Python","Rédaction","Animation"}')
  competences  text[]      NOT NULL DEFAULT '{}',
  -- URL de la photo (stockée dans le bucket Supabase Storage "benevoles")
  photo_url    text,
  -- Texte court de présentation (facultatif)
  bio          text,
  -- Position d'affichage au sein de son groupe (ordre croissant)
  ordre        integer     NOT NULL DEFAULT 0,
  actif        boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.benevoles               IS 'Membres actifs de l''association (bénévoles, CA, bureau)';
COMMENT ON COLUMN public.benevoles.role          IS 'benevole | membre_ca | membre_bureau';
COMMENT ON COLUMN public.benevoles.competences   IS 'Liste de compétences affichées sur le trombinoscope';
COMMENT ON COLUMN public.benevoles.photo_url     IS 'URL publique Supabase Storage — image 200×200 px recommandée';
COMMENT ON COLUMN public.benevoles.ordre         IS 'Ordre d''affichage croissant dans chaque groupe';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_benevoles_updated_at ON public.benevoles;
CREATE TRIGGER trg_benevoles_updated_at
  BEFORE UPDATE ON public.benevoles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Index
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_benevoles_role_ordre
  ON public.benevoles (role, ordre);

CREATE INDEX IF NOT EXISTS idx_benevoles_actif
  ON public.benevoles (actif);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.benevoles ENABLE ROW LEVEL SECURITY;

-- Lecture publique (trombinoscope visible sans authentification)
DROP POLICY IF EXISTS "benevoles_public_read" ON public.benevoles;
CREATE POLICY "benevoles_public_read"
  ON public.benevoles
  FOR SELECT
  USING (actif = true);

-- Écriture réservée aux administrateurs authentifiés
DROP POLICY IF EXISTS "benevoles_admin_all" ON public.benevoles;
CREATE POLICY "benevoles_admin_all"
  ON public.benevoles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Storage bucket pour les photos de bénévoles
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'benevoles',
  'benevoles',
  true,                          -- bucket public (URLs accessibles sans token)
  2097152,                       -- 2 Mo max par fichier
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique des photos
DROP POLICY IF EXISTS "benevoles_photos_public_read" ON storage.objects;
CREATE POLICY "benevoles_photos_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'benevoles');

-- Upload/mise à jour réservés aux admins
DROP POLICY IF EXISTS "benevoles_photos_admin_write" ON storage.objects;
CREATE POLICY "benevoles_photos_admin_write"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'benevoles'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "benevoles_photos_admin_update" ON storage.objects;
CREATE POLICY "benevoles_photos_admin_update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'benevoles'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "benevoles_photos_admin_delete" ON storage.objects;
CREATE POLICY "benevoles_photos_admin_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'benevoles'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Données de démonstration (à supprimer en production)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.benevoles (prenom, nom, role, competences, bio, ordre) VALUES
  -- Bureau
  ('Marie',   'Dupont',    'membre_bureau', ARRAY['Direction', 'Gestion de projet', 'Communication'],       'Présidente de Biscuits IA, militante pour un numérique inclusif.', 1),
  ('Thomas',  'Bernard',   'membre_bureau', ARRAY['Finance', 'Comptabilité', 'Droit associatif'],           'Trésorier, expert en gestion associative.', 2),
  ('Leïla',   'Moussaoui', 'membre_bureau', ARRAY['Ressources humaines', 'Formation', 'Communication'],    'Secrétaire générale, coordinatrice des bénévoles.', 3),
  -- CA
  ('Julien',  'Martin',    'membre_ca',     ARRAY['IA', 'Python', 'Data science'],                          'Développeur IA bénévole depuis la création de l''asso.', 1),
  ('Amina',   'Traoré',    'membre_ca',     ARRAY['UX Design', 'Accessibilité', 'Figma'],                   'Designer engagée pour l''inclusion numérique.', 2),
  ('Pierre',  'Leblanc',   'membre_ca',     ARRAY['Droit', 'RGPD', 'Éthique du numérique'],                 'Juriste spécialisé en protection des données.', 3),
  -- Bénévoles
  ('Fatima',  'Osei',      'benevole',      ARRAY['Animation d''ateliers', 'Pédagogie', 'Médiation'],        'Animatrice d''ateliers en médiathèque.', 1),
  ('Nicolas', 'Roux',      'benevole',      ARRAY['Développement web', 'Astro', 'TypeScript'],              'Développeur web qui aide à maintenir le site.', 2),
  ('Sarah',   'Kim',       'benevole',      ARRAY['Rédaction', 'SEO', 'Réseaux sociaux'],                   'Rédactrice du blog et des ressources.', 3),
  ('Karim',   'Benali',    'benevole',      ARRAY['Support technique', 'Linux', 'Cybersécurité'],           'Expert en sécurité informatique.', 4)
ON CONFLICT DO NOTHING;
