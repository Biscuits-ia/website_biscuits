import type { APIRoute } from 'astro';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);
}

function getTrimmedString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : undefined;
}

function applyTrimmedField(
  body: Record<string, unknown>,
  updates: Record<string, unknown>,
  key: string,
  targetKey: string,
  maxLength: number,
  message: string,
): string | undefined {
  const value = getTrimmedString(body, key);
  if (value === undefined) return undefined;
  if (value.length > maxLength) return message;
  updates[targetKey] = value || null;
  return undefined;
}

function applyEnumField(
  body: Record<string, unknown>,
  updates: Record<string, unknown>,
  key: string,
  allowed: string[],
) {
  const value = body[key];
  if (typeof value === 'string' && allowed.includes(value)) {
    updates[key] = value;
  }
}

function applyTitleUpdate(body: Record<string, unknown>, updates: Record<string, unknown>): string | undefined {
  const title = getTrimmedString(body, 'title');
  if (title === undefined) return undefined;
  if (!title) return 'Le titre est requis.';
  if (title.length > 120) return 'Le titre ne doit pas dépasser 120 caractères.';
  updates.title = title;
  return undefined;
}

function buildProjectUpdates(body: Record<string, unknown>): { updates: Record<string, unknown>; error?: string } {
  const updates: Record<string, unknown> = {};

  const titleError = applyTitleUpdate(body, updates);
  if (titleError) return { updates, error: titleError };

  const textRules: Array<{ key: string; target: string; max: number; msg: string }> = [
    { key: 'description', target: 'description', max: 800, msg: 'La description ne doit pas dépasser 800 caractères.' },
    { key: 'objective', target: 'objective', max: 2000, msg: 'L\'objectif ne doit pas dépasser 2000 caractères.' },
    { key: 'expected_deliverables', target: 'expected_deliverables', max: 2000, msg: 'Les livrables ne doivent pas dépasser 2000 caractères.' },
    { key: 'communication_channel', target: 'communication_channel', max: 200, msg: 'Le canal de communication ne doit pas dépasser 200 caractères.' },
    { key: 'repository_url', target: 'repository_url', max: 2000, msg: 'L\'URL du dépôt est trop longue.' },
    { key: 'document_url', target: 'document_url', max: 2000, msg: 'L\'URL de documentation est trop longue.' },
  ];

  for (const rule of textRules) {
    const error = applyTrimmedField(body, updates, rule.key, rule.target, rule.max, rule.msg);
    if (error) return { updates, error };
  }

  applyEnumField(body, updates, 'status', ['active', 'on_hold', 'completed', 'archived']);
  applyEnumField(body, updates, 'priority', ['low', 'medium', 'high']);

  const deadline = getTrimmedString(body, 'deadline');
  if (deadline !== undefined) updates.deadline = deadline || null;

  const leaderId = getTrimmedString(body, 'leader_id');
  if (leaderId !== undefined) updates.leader_id = leaderId || null;

  if (Array.isArray(body.tech_stack)) {
    updates.tech_stack = parseTagList(body.tech_stack);
  }

  if (Array.isArray(body.tools)) {
    updates.tools = parseTagList(body.tools);
  }

  const estimatedHours = body.estimated_hours;
  if (typeof estimatedHours === 'number') {
    if (estimatedHours < 0) return { updates, error: 'La charge estimée doit être positive.' };
    updates.estimated_hours = Math.round(estimatedHours);
  }

  const startDate = getTrimmedString(body, 'start_date');
  if (startDate !== undefined) updates.start_date = startDate || null;

  return { updates };
}

function buildProjectInsert(body: Record<string, unknown>, userId: string): { payload?: Record<string, unknown>; error?: string } {
  const title = getTrimmedString(body, 'title') ?? '';
  if (!title) return { error: 'Le titre est requis.' };
  if (title.length > 120) return { error: 'Le titre ne doit pas dépasser 120 caractères.' };

  const { updates, error } = buildProjectUpdates(body);
  if (error) return { error };

  return {
    payload: {
      title,
      description: updates.description ?? null,
      priority: updates.priority ?? 'medium',
      status: updates.status ?? 'active',
      deadline: updates.deadline ?? null,
      objective: updates.objective ?? null,
      expected_deliverables: updates.expected_deliverables ?? null,
      tech_stack: updates.tech_stack ?? [],
      tools: updates.tools ?? [],
      repository_url: updates.repository_url ?? null,
      document_url: updates.document_url ?? null,
      communication_channel: updates.communication_channel ?? null,
      estimated_hours: updates.estimated_hours ?? null,
      start_date: updates.start_date ?? null,
      created_by: userId,
      leader_id: updates.leader_id ?? userId,
    },
  };
}

export const POST: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;

  const { user } = auth;
  const adminSupabase = createSupabaseAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await Astro.request.json();
  } catch {
    return jsonError('Corps de requête JSON invalide.');
  }

  const { payload, error: validationError } = buildProjectInsert(body, user.id);
  if (validationError || !payload) return jsonError(validationError ?? 'Données invalides.');

  const { data, error } = await adminSupabase
    .from('projects')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('[api/admin/projects] insert error:', error.message);
    return jsonError('Erreur lors de la création.', 500);
  }

  return jsonOk({ id: data.id }, 201);
};

export const PATCH: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;

  const adminSupabase = createSupabaseAdminClient();
  const projectId = Astro.url.searchParams.get('id');
  if (!projectId) return jsonError('Paramètre id manquant.');

  let body: Record<string, unknown>;
  try {
    body = await Astro.request.json();
  } catch {
    return jsonError('Corps de requête JSON invalide.');
  }

  const { updates, error: validationError } = buildProjectUpdates(body);
  if (validationError) return jsonError(validationError);
  if (Object.keys(updates).length === 0) return jsonError('Aucune donnée à mettre à jour.');

  const { error } = await adminSupabase
    .from('projects')
    .update(updates)
    .eq('id', projectId);

  if (error) {
    console.error('[api/admin/projects] update error:', error.message);
    return jsonError('Erreur lors de la mise à jour.', 500);
  }

  return jsonOk({ ok: true });
};

export const DELETE: APIRoute = async (Astro) => {
  const auth = await requireAdmin(Astro);
  if (auth instanceof Response) return auth;

  const adminSupabase = createSupabaseAdminClient();
  const projectId = Astro.url.searchParams.get('id');
  if (!projectId) return jsonError('Paramètre id manquant.');

  const { error } = await adminSupabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) {
    console.error('[api/admin/projects] delete error:', error.message);
    return jsonError('Erreur lors de la suppression.', 500);
  }

  return jsonOk({ ok: true });
};
