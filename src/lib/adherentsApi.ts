import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';
import { rateLimit } from '@/lib/rateLimit';

export const ADHERENT_EMAIL_REGEX = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
export const ADHERENT_PHONE_REGEX = /^\+?[\d().\s-]{6,24}$/;

export type AdherentRole = 'admin' | 'tresorier' | 'lecture_seule';

export interface ApiAuthContext {
  userId: string;
  roles: AdherentRole[];
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>;
}

export interface AdherentPayload {
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  adresse: string | null;
  date_adhesion: string;
  statut: 'actif' | 'inactif' | 'en_attente' | 'radie';
}

const ADHERENT_STATUT_VALUES = ['actif', 'inactif', 'en_attente', 'radie'] as const;

export function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function toCsvResponse(content: string, filename: string) {
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export function hasAnyRole(roles: AdherentRole[], required: AdherentRole[]) {
  return required.some((requiredRole) => roles.includes(requiredRole));
}

/**
 * Log an adherent operation to the audit trail.
 * Used by API routes to record sensitive operations.
 */
export async function logAdherentOperation(
  adminSupabase: ReturnType<typeof createSupabaseAdminClient>,
  operation: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    const oldValue = details.old ?? null;
    const newValue = {
      data: details.new ?? null,
      access: details.access ?? null,
      meta: details.meta ?? null,
      result: details.result ?? 'success',
    };

    await adminSupabase
      .from('adherent_historiques')
      .insert({
        adherent_id: null, // Operation-level log, not tied to a specific adherent
        champ_modifie: operation,
        ancienne_valeur: JSON.stringify(oldValue),
        nouvelle_valeur: JSON.stringify(newValue),
        utilisateur_id: details.utilisateur_id || null,
        timestamp: new Date().toISOString(),
      } as any);
  } catch (error) {
    console.error('[logAdherentOperation] failed to log operation:', error);
  }
}

export function buildAccessMetadata(request: Request, clientIp?: string | null) {
  let pathname = '/api/adherents';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // Keep default fallback.
  }

  return {
    ip: clientIp ?? null,
    userAgent: request.headers.get('user-agent'),
    method: request.method,
    path: pathname,
    at: new Date().toISOString(),
  };
}

export async function getAdherentsAuthContext(
  request: Request,
  cookies: any,
  clientIp?: string,
): Promise<{ ctx: ApiAuthContext; rateLimitResponse: Response | null }> {
  const sessionSupabase = createSupabaseClient({ request, cookies });
  const { data: { user }, error } = await sessionSupabase.auth.getUser();
  if (error || !user) return { ctx: null as any, rateLimitResponse: null };

  const adminSupabase = createSupabaseAdminClient();
  const { data: roleRows, error: roleError } = await adminSupabase
    .from('utilisateur_roles')
    .select('roles!inner(code)')
    .eq('utilisateur_id', user.id);

  if (roleError) {
    console.error('[adherents-api] role fetch error:', roleError.message);
    return { ctx: null as any, rateLimitResponse: null };
  }

  const roles = (roleRows ?? [])
    .map((row: any) => row.roles?.code)
    .filter((code: unknown): code is AdherentRole => (
      code === 'admin' || code === 'tresorier' || code === 'lecture_seule'
    ));

  if (roles.length === 0) return { ctx: null as any, rateLimitResponse: null };

  // Rate limiting check - applies to write operations
  let rateLimitResponse: Response | null = null;
  const method = request.method.toUpperCase();
  let pathname = '/api/adherents';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // Keep default fallback.
  }

  const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const isBulkOperation = pathname.endsWith('/import') || pathname.endsWith('/export');

  let limit = 30;
  let windowMs = 60_000;
  if (isBulkOperation) {
    limit = 5;
  } else if (isWriteOperation) {
    limit = 12;
  }

  // Key by user + endpoint to avoid cross-user throttling behind NAT and
  // cross-route starvation on busy dashboards.
  const rateKey = clientIp
    ? `${clientIp}:${user.id}:${method}:${pathname}`
    : `${user.id}:${method}:${pathname}`;
  rateLimitResponse = rateLimit(rateKey, limit, windowMs);

  return {
    ctx: {
      userId: user.id,
      roles,
      adminSupabase,
    },
    rateLimitResponse,
  };
}

export function normalizeString(value: unknown, maxLength = 255): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function shouldValidateField(body: Record<string, unknown>, field: string, isUpdate: boolean) {
  return !isUpdate || Object.hasOwn(body, field);
}

function readRequiredString(body: Record<string, unknown>, field: string, maxLength: number, error: string) {
  const value = normalizeString(body[field], maxLength);
  if (!value) return { error };
  return { value };
}

function readOptionalStringOrNull(body: Record<string, unknown>, field: string, maxLength: number) {
  const value = normalizeString(body[field], maxLength);
  return value || null;
}

export function validateAdherentPayload(body: Record<string, unknown>, isUpdate = false): { payload?: Partial<AdherentPayload>; error?: string } {
  const payload: Partial<AdherentPayload> = {};

  const validators: Array<{ field: string; validate: () => string | null }> = [
    {
      field: 'nom',
      validate: () => {
        const result = readRequiredString(body, 'nom', 120, 'Le nom est requis.');
        if (result.error) return result.error;
        payload.nom = result.value;
        return null;
      },
    },
    {
      field: 'prenom',
      validate: () => {
        const result = readRequiredString(body, 'prenom', 120, 'Le prenom est requis.');
        if (result.error) return result.error;
        payload.prenom = result.value;
        return null;
      },
    },
    {
      field: 'email',
      validate: () => {
        const email = normalizeString(body.email, 320).toLowerCase();
        if (!email) return 'L\'email est requis.';
        if (!ADHERENT_EMAIL_REGEX.test(email)) return 'Format email invalide.';
        payload.email = email;
        return null;
      },
    },
    {
      field: 'telephone',
      validate: () => {
        const telephone = normalizeString(body.telephone, 40);
        if (telephone && (!ADHERENT_PHONE_REGEX.test(telephone) || !/\d/.test(telephone))) {
          return 'Format telephone invalide.';
        }
        payload.telephone = telephone || null;
        return null;
      },
    },
    {
      field: 'adresse',
      validate: () => {
        payload.adresse = readOptionalStringOrNull(body, 'adresse', 400);
        return null;
      },
    },
    {
      field: 'date_adhesion',
      validate: () => {
        const dateAdhesion = normalizeString(body.date_adhesion, 20);
        if (!dateAdhesion) return 'La date d\'adhesion est requise.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateAdhesion)) return 'Format date_adhesion invalide (YYYY-MM-DD attendu).';
        payload.date_adhesion = dateAdhesion;
        return null;
      },
    },
    {
      field: 'statut',
      validate: () => {
        const statut = normalizeString(body.statut, 30) as AdherentPayload['statut'];
        if (!ADHERENT_STATUT_VALUES.includes(statut)) return 'Statut invalide.';
        payload.statut = statut;
        return null;
      },
    },
  ];

  for (const validator of validators) {
    if (!shouldValidateField(body, validator.field, isUpdate)) continue;
    const error = validator.validate();
    if (error) return { error };
  }

  return { payload };
}

export function parsePagination(url: URL) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

export function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

export function toCsvCell(value: string | null | undefined): string {
  const raw = String(value ?? '');
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replaceAll('"', '""')}"`;
}
