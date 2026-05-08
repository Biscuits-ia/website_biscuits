-- Études associations: formulaires dynamiques + réponses

CREATE TABLE IF NOT EXISTS public.study_forms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_form_questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES public.study_forms(id) ON DELETE CASCADE,
  label         text NOT NULL,
  kind          text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'textarea', 'select', 'checkbox', 'number')),
  is_required   boolean NOT NULL DEFAULT false,
  placeholder   text,
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_form_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id            uuid NOT NULL REFERENCES public.study_forms(id) ON DELETE CASCADE,
  association_name   text NOT NULL,
  contact_name       text,
  email              text,
  phone              text,
  answers            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_forms_status ON public.study_forms(status);
CREATE INDEX IF NOT EXISTS idx_study_questions_form_id ON public.study_form_questions(form_id, position);
CREATE INDEX IF NOT EXISTS idx_study_submissions_form_id ON public.study_form_submissions(form_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_study_forms_updated_at ON public.study_forms;
CREATE TRIGGER trg_study_forms_updated_at
BEFORE UPDATE ON public.study_forms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.study_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_forms_select_published" ON public.study_forms;
CREATE POLICY "study_forms_select_published"
  ON public.study_forms FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "study_forms_admin_select_all" ON public.study_forms;
CREATE POLICY "study_forms_admin_select_all"
  ON public.study_forms FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_forms_admin_insert" ON public.study_forms;
CREATE POLICY "study_forms_admin_insert"
  ON public.study_forms FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_forms_admin_update" ON public.study_forms;
CREATE POLICY "study_forms_admin_update"
  ON public.study_forms FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_forms_admin_delete" ON public.study_forms;
CREATE POLICY "study_forms_admin_delete"
  ON public.study_forms FOR DELETE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_questions_select_published" ON public.study_form_questions;
CREATE POLICY "study_questions_select_published"
  ON public.study_form_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.study_forms f
      WHERE f.id = form_id
        AND f.status = 'published'
    )
  );

DROP POLICY IF EXISTS "study_questions_admin_select_all" ON public.study_form_questions;
CREATE POLICY "study_questions_admin_select_all"
  ON public.study_form_questions FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_questions_admin_insert" ON public.study_form_questions;
CREATE POLICY "study_questions_admin_insert"
  ON public.study_form_questions FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_questions_admin_update" ON public.study_form_questions;
CREATE POLICY "study_questions_admin_update"
  ON public.study_form_questions FOR UPDATE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_questions_admin_delete" ON public.study_form_questions;
CREATE POLICY "study_questions_admin_delete"
  ON public.study_form_questions FOR DELETE
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_submissions_public_insert" ON public.study_form_submissions;
CREATE POLICY "study_submissions_public_insert"
  ON public.study_form_submissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.study_forms f
      WHERE f.id = form_id
        AND f.status = 'published'
    )
  );

DROP POLICY IF EXISTS "study_submissions_admin_select_all" ON public.study_form_submissions;
CREATE POLICY "study_submissions_admin_select_all"
  ON public.study_form_submissions FOR SELECT
  USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "study_submissions_admin_delete_all" ON public.study_form_submissions;
CREATE POLICY "study_submissions_admin_delete_all"
  ON public.study_form_submissions FOR DELETE
  USING (public.get_my_role() = 'admin');
