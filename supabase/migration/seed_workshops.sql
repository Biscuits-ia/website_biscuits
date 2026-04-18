-- =============================================================================
-- Seed : Ateliers initiaux (correspondant à la page publique /ateliers)
-- Date : 2026-04-19
-- À exécuter UNE FOIS après add_workshop_pricing.sql
-- =============================================================================

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
ON CONFLICT DO NOTHING;
