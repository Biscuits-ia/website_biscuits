import type { APIRoute } from 'astro';
import type { CorpsType } from '@/lib/types';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';
import { fetchRoleSecure } from '@/lib/auth';

type AnalyticsScope = 'overview' | 'kpis' | 'activity';
type AnalyticsWindow = 7 | 30 | 90;

const validCorps = new Set<CorpsType>(['DEV', 'DB', 'DESIGN', 'QA', 'DATA', 'PM']);
const validScopes = new Set<AnalyticsScope>(['overview', 'kpis', 'activity']);
const validWindows = new Set<AnalyticsWindow>([7, 30, 90]);

const stringifyCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${value}`;
  }
  if (typeof value === 'symbol') {
    return value.description ?? 'symbol';
  }
  return JSON.stringify(value);
};

const escapeCsvValue = (value: unknown) => {
  const normalized = stringifyCsvValue(value);
  if (!/[",\n]/.test(normalized)) return normalized;
  return `"${normalized.replaceAll('"', '""')}"`;
};

const toCsv = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return 'message\nAucune donnée disponible\n';
  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','));
  return `${headers.join(',')}\n${lines.join('\n')}\n`;
};

const getRequestedScope = (url: URL): AnalyticsScope => {
  const requestedScope = url.searchParams.get('scope');
  return requestedScope && validScopes.has(requestedScope as AnalyticsScope)
    ? requestedScope as AnalyticsScope
    : 'overview';
};

const getRequestedCorps = (url: URL) => {
  const requestedCorps = url.searchParams.get('corps');
  return requestedCorps && validCorps.has(requestedCorps as CorpsType)
    ? requestedCorps as CorpsType
    : '';
};

const getRequestedDays = (url: URL): AnalyticsWindow => {
  const requestedDays = Number(url.searchParams.get('days') ?? '30');
  return validWindows.has(requestedDays as AnalyticsWindow) ? requestedDays as AnalyticsWindow : 30;
};

const getSinceDay = (days: AnalyticsWindow) => {
  const sinceDate = new Date();
  sinceDate.setHours(0, 0, 0, 0);
  sinceDate.setDate(sinceDate.getDate() - (days - 1));
  return sinceDate.toISOString().slice(0, 10);
};

const fetchOverviewRows = async (corps: CorpsType | '') => {
  const admin = createSupabaseAdminClient();
  let query = admin.from('analytics_task_overview').select('*').order('corps');
  if (corps) query = query.eq('corps', corps);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
};

const fetchKpiRows = async (corps: CorpsType | '') => {
  const admin = createSupabaseAdminClient();
  let query = admin.from('analytics_kpi_latest').select('*').order('corps').order('metric_name');
  if (corps) query = query.eq('corps', corps);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
};

const fetchActivityRows = async (corps: CorpsType | '', sinceDay: string) => {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('analytics_daily_activity')
    .select('day, corps, created_count, completed_count, snapshot_count')
    .gte('day', sinceDay)
    .order('day', { ascending: false });
  query = corps ? query.eq('corps', corps) : query.is('corps', null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
};

const fetchRowsByScope = async (scope: AnalyticsScope, corps: CorpsType | '', sinceDay: string) => {
  if (scope === 'overview') return fetchOverviewRows(corps);
  if (scope === 'kpis') return fetchKpiRows(corps);
  return fetchActivityRows(corps, sinceDay);
};

export const GET: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseClient({ request, cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Non authentifié', { status: 401 });
  }

  const role = await fetchRoleSecure(user.id);
  if (role !== 'admin') {
    return new Response('Non autorisé', { status: 403 });
  }

  const url = new URL(request.url);
  const scope = getRequestedScope(url);
  const corps = getRequestedCorps(url);
  const days = getRequestedDays(url);
  const sinceDay = getSinceDay(days);

  let rows: Record<string, unknown>[];

  try {
    rows = await fetchRowsByScope(scope, corps, sinceDay);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur export analytics';
    return new Response(message, { status: 500 });
  }

  const csv = toCsv(rows);
  const filename = `analytics-${scope}-${corps || 'all'}-${days}d.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};