-- Migration : ajout du titre descriptif sur les créneaux de rendez-vous.
-- Permet à l'admin de qualifier la nature du créneau (ex: "Recrutement bénévole").

ALTER TABLE public.appointment_slots
  ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN public.appointment_slots.title IS 'Nature / intitulé du créneau (ex: Recrutement bénévole, Entretien candidat).';
