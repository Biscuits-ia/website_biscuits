-- Track server-side logout time to invalidate stale sessions on next request.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_logout_at timestamptz;

COMMENT ON COLUMN public.profiles.last_logout_at IS 'Derniere deconnexion explicite. Utilise pour invalider les sessions emises avant cette date.';
