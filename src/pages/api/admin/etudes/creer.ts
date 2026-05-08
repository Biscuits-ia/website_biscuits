import type { APIRoute } from 'astro';
import { createSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';

type QuestionKind = 'text' | 'textarea' | 'select' | 'checkbox' | 'number';

const ALLOWED_KINDS = new Set<QuestionKind>(['text', 'textarea', 'select', 'checkbox', 'number']);

function getFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

type ParsedQuestion = Record<string, unknown>;
type ParseResult = { error?: string; questions?: ParsedQuestion[] };

function parseQuestions(form: FormData, count: number): ParseResult {
  const questions: ParsedQuestion[] = [];

  for (let i = 0; i < count; i += 1) {
    const label = getFormString(form, `q_label_${i}`).trim();
    const kindRaw = getFormString(form, `q_kind_${i}`).trim() as QuestionKind;
    const kind: QuestionKind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : 'text';
    const isRequired = getFormString(form, `q_required_${i}`) === '1';
    const optionsRaw = getFormString(form, `q_options_${i}`).trim();
    const placeholder = getFormString(form, `q_placeholder_${i}`).trim() || null;

    if (!label) {
      return { error: `Question ${i + 1} : le libellé est obligatoire.` };
    }

    const options = optionsRaw
      ? optionsRaw.split(',').map((opt) => opt.trim()).filter(Boolean)
      : [];

    if (kind === 'select' && options.length === 0) {
      return { error: `Question ${i + 1} : un champ "liste" doit avoir des options.` };
    }

    questions.push({ label, kind, is_required: isRequired, options, placeholder, position: i });
  }

  return { questions };
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return redirect('/connexion');

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') return redirect('/dashboard/user');

  const form = await request.formData();
  const title = getFormString(form, 'title').trim();
  const description = getFormString(form, 'description').trim() || null;
  const statusRaw = getFormString(form, 'status').trim().toLowerCase();
  const status = statusRaw === 'published' ? 'published' : 'draft';
  const countRaw = Number.parseInt(getFormString(form, 'q_count'), 10);
  const count = Number.isFinite(countRaw) ? countRaw : 0;

  if (!title) {
    return redirect('/dashboard/admin/etudes?error=' + encodeURIComponent('Le titre est obligatoire.'));
  }

  if (count < 1) {
    return redirect('/dashboard/admin/etudes?error=' + encodeURIComponent('Ajoutez au moins une question.'));
  }

  if (count > 25) {
    return redirect('/dashboard/admin/etudes?error=' + encodeURIComponent('Maximum 25 questions par formulaire.'));
  }

  const { error: parseError, questions: parsedQuestions } = parseQuestions(form, count);
  if (parseError ?? !parsedQuestions) {
    return redirect('/dashboard/admin/etudes?error=' + encodeURIComponent(parseError ?? 'Erreur de parsing.'));
  }

  const admin = createSupabaseAdminClient();

  const { data: createdForm, error: formError } = await admin
    .from('study_forms')
    .insert({
      title,
      description,
      status,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (formError || !createdForm) {
    console.error('[admin/etudes/creer] form error:', formError?.message);
    return redirect('/dashboard/admin/etudes?error=' + encodeURIComponent('Erreur lors de la création du formulaire.'));
  }

  const questionsToInsert = parsedQuestions.map((q) => ({
    ...q,
    form_id: createdForm.id,
  }));

  const { error: questionsError } = await admin
    .from('study_form_questions')
    .insert(questionsToInsert);

  if (questionsError) {
    console.error('[admin/etudes/creer] questions error:', questionsError.message);
    await admin.from('study_forms').delete().eq('id', createdForm.id);
    return redirect('/dashboard/admin/etudes?error=' + encodeURIComponent('Erreur lors de la création des questions.'));
  }

  return redirect('/dashboard/admin/etudes?saved=1');
};
