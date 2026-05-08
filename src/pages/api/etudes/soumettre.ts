import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { EMAIL_RE, isValidUUID } from '@/lib/validation';

type QuestionRow = {
  id: string;
  label: string;
  kind: 'text' | 'textarea' | 'select' | 'checkbox' | 'number';
  is_required: boolean;
  position?: number;
};

function getFormString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function redirectWithError(
  redirect: ({ status, path }: { status?: number; path: string }) => Response,
  message: string,
): Response {
  return redirect('/etude?error=' + encodeURIComponent(message));
}

function validateRequester(params: {
  formId: string;
  associationName: string;
  contactName: string;
  email: string;
  phone: string;
}): string | null {
  if (!isValidUUID(params.formId)) return 'Formulaire invalide.';
  if (!params.associationName) return 'Le nom de l\'association est obligatoire.';
  if (params.associationName.length > 160) return 'Le nom de l\'association est trop long.';
  if (params.contactName.length > 120) return 'Le nom du contact est trop long.';
  if (params.email && !EMAIL_RE.test(params.email)) return 'Adresse email invalide.';
  if (params.phone.length > 50) return 'Numéro de téléphone invalide.';
  return null;
}

function getQuestionValue(form: FormData, question: QuestionRow): string {
  const key = `q_${question.id}`;
  const raw = form.get(key);

  if (question.kind === 'checkbox') {
    return raw ? 'oui' : '';
  }

  return typeof raw === 'string' ? raw.trim() : '';
}

function buildAnswers(form: FormData, questions: QuestionRow[]): {
  errorMessage: string | null;
  answers: Array<Record<string, unknown>>;
} {
  const answers: Array<Record<string, unknown>> = [];

  for (const question of questions) {
    const value = getQuestionValue(form, question);

    if (question.is_required && !value) {
      return { errorMessage: `Réponse obligatoire: ${question.label}`, answers: [] };
    }

    if (value.length > 5000) {
      return { errorMessage: `Réponse trop longue: ${question.label}`, answers: [] };
    }

    answers.push({
      question_id: question.id,
      label: question.label,
      kind: question.kind,
      value,
    });
  }

  return { errorMessage: null, answers };
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const formId = getFormString(form, 'form_id');
  const associationName = getFormString(form, 'association_name');
  const contactName = getFormString(form, 'contact_name');
  const email = getFormString(form, 'email').toLowerCase();
  const phone = getFormString(form, 'phone');

  const requesterError = validateRequester({
    formId,
    associationName,
    contactName,
    email,
    phone,
  });

  if (requesterError) {
    return redirectWithError(redirect, requesterError);
  }

  const admin = createSupabaseAdminClient();

  const { data: studyForm, error: formError } = await admin
    .from('study_forms')
    .select('id, status, study_form_questions(id, label, kind, is_required, position)')
    .eq('id', formId)
    .eq('status', 'published')
    .single();

  if (formError || !studyForm) {
    return redirectWithError(redirect, 'Ce formulaire n\'est plus disponible.');
  }

  const questions = ((studyForm.study_form_questions ?? []) as QuestionRow[]).sort((a, b) => {
    const pa = typeof a.position === 'number' ? a.position : 0;
    const pb = typeof b.position === 'number' ? b.position : 0;
    return pa - pb;
  });

  const { errorMessage, answers } = buildAnswers(form, questions);
  if (errorMessage) {
    return redirectWithError(redirect, errorMessage);
  }

  const { error: submitError } = await admin
    .from('study_form_submissions')
    .insert({
      form_id: formId,
      association_name: associationName,
      contact_name: contactName || null,
      email: email || null,
      phone: phone || null,
      answers,
    });

  if (submitError) {
    console.error('[api/etudes/soumettre] error:', submitError.message);
    return redirectWithError(redirect, 'Impossible d\'envoyer votre réponse.');
  }

  return redirect('/etude?sent=1');
};
