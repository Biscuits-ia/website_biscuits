UPDATE public.profiles
SET role = 'user'
WHERE role IS NULL OR role NOT IN ('user', 'moderator', 'admin', 'benevole', 'data_analyst');

ALTER TABLE public.profiles
ALTER COLUMN role SET DEFAULT 'user';

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('user', 'moderator', 'admin', 'benevole', 'data_analyst'));