-- =============================================================================
-- Seed : Ateliers initiaux (correspondant à la page publique /ateliers)
-- Date : 2026-04-19
-- =============================================================================
--
-- Idempotence (corrige le 2026-07-13) : ce fichier portait un
-- `ON CONFLICT DO NOTHING` SANS cible. Sans contrainte unique sur laquelle
-- s'appuyer, cette clause ne se declenche jamais : `workshops.id` est un
-- gen_random_uuid() donc chaque rejeu produisait une PK differente et
-- REINSERAIT les trois ateliers en double.
--
-- On pose donc une contrainte unique sur `title` (le seul discriminant
-- naturel ici), et on cible le ON CONFLICT dessus. Le seed devient
-- reellement rejouable.
ALTER TABLE public.workshops
  DROP CONSTRAINT IF EXISTS workshops_title_key;
ALTER TABLE public.workshops
  ADD CONSTRAINT workshops_title_key UNIQUE (title);

INSERT INTO public.workshops (title, description, category, level, price_cents, price_label, is_free)
VALUES
  (
    'Découverte IA',
    'Introduction aux outils IA et bonnes pratiques responsables pour démarrer en toute confiance dans votre structure.',
    'IA générative',
    'Débutant',
    3500,
    '35 €',
    false
  ),
  (
    'Atelier Pratique IA',
    'On crée ensemble un assistant simple et on met en place une automatisation utile pour votre structure.',
    'IA générative',
    'Intermédiaire',
    7000,
    '70 €',
    false
  ),
  (
    'Créer un site web',
    'Apprenez à créer un simple site web professionnel avec les dernières technologies, adapté à vos besoins.',
    'Développement web',
    'Collaboratif',
    11000,
    '110 €',
    false
  )
ON CONFLICT (title) DO NOTHING;
